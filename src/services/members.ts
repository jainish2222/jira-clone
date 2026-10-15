import "server-only";
import { ObjectId } from "mongodb";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors/app-error";
import { getCollections, QUERY_MAX_TIME_MS, type MemberDoc } from "@/lib/mongodb";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { readCookie, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { Member } from "@/types";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function toMember(doc: Pick<MemberDoc, "_id" | "username" | "name"> & { active?: boolean }): Member {
  return { id: doc._id.toHexString(), username: doc.username, name: doc.name, active: doc.active ?? true };
}

/** Active members, for assignee pickers and name lookups. */
/** All members, including deactivated ones so history can still show who did what. */
export async function listMembers(): Promise<Member[]> {
  const { members } = await getCollections();
  const docs = await members
    .find({}, { projection: { username: 1, name: 1, active: 1 }, maxTimeMS: QUERY_MAX_TIME_MS })
    .sort({ name: 1 })
    .toArray();
  return docs.map(toMember);
}

export async function assertActiveMember(id: ObjectId): Promise<void> {
  const { members } = await getCollections();
  const found = await members.countDocuments({ _id: id, active: true }, { limit: 1, maxTimeMS: QUERY_MAX_TIME_MS });
  if (!found) {
    throw new AppError("VALIDATION_FAILED", {
      details: { fields: [{ path: "assigneeId", message: "That team member doesn't exist" }] },
    });
  }
}

/** Resolves the session cookie to a verified member, or null. */
export async function getMemberFromCookieHeader(cookieHeader: string | null): Promise<Member | null> {
  const env = getEnv();
  const payload = verifySessionToken(readCookie(cookieHeader, SESSION_COOKIE), env.SESSION_SECRET);
  if (!payload) return null;
  const { members } = await getCollections();
  const doc = await members.findOne(
    { _id: new ObjectId(payload.m) },
    { projection: { username: 1, name: 1, active: 1, sessionVersion: 1 }, maxTimeMS: QUERY_MAX_TIME_MS },
  );
  if (!doc || !doc.active || doc.sessionVersion !== payload.v) return null;
  return toMember(doc);
}

export async function requireMember(req: Request): Promise<Member> {
  const member = await getMemberFromCookieHeader(req.headers.get("cookie"));
  if (!member) throw new AppError("UNAUTHORIZED");
  return member;
}

/**
 * Checks a username/password. Unknown users still pay for one scrypt hash so
 * timing doesn't reveal which usernames exist. Locks the account after repeated failures.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<{ member: Member; sessionVersion: number }> {
  const { members } = await getCollections();
  const doc = await members.findOne({ username }, { maxTimeMS: QUERY_MAX_TIME_MS });
  const now = new Date();

  if (!doc || !doc.active) {
    await verifyPassword(password, await getDummyHash());
    throw new AppError("INVALID_CREDENTIALS");
  }
  if (doc.lockedUntil && doc.lockedUntil > now) {
    const wait = Math.ceil((doc.lockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError("ACCOUNT_LOCKED", { headers: { "Retry-After": String(wait) } });
  }

  const valid = await verifyPassword(password, doc.passwordHash);
  if (!valid) {
    const failed = (doc.lockedUntil && doc.lockedUntil <= now ? 0 : doc.failedLogins) + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await members.updateOne(
      { _id: doc._id },
      {
        $set: {
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MS) : null,
          updatedAt: now,
        },
      },
    );
    if (lock) logger.warn("Account locked after failed sign-ins", { username });
    throw new AppError("INVALID_CREDENTIALS");
  }

  if (doc.failedLogins !== 0 || doc.lockedUntil) {
    await members.updateOne({ _id: doc._id }, { $set: { failedLogins: 0, lockedUntil: null, updatedAt: now } });
  }
  return { member: toMember(doc), sessionVersion: doc.sessionVersion };
}

/** Changes the caller's password and revokes every other session. Returns the new session version. */
export async function changePassword(memberId: string, currentPassword: string, newPassword: string): Promise<number> {
  const { members } = await getCollections();
  const doc = await members.findOne({ _id: new ObjectId(memberId), active: true }, { maxTimeMS: QUERY_MAX_TIME_MS });
  if (!doc) throw new AppError("UNAUTHORIZED");
  if (!(await verifyPassword(currentPassword, doc.passwordHash))) {
    throw new AppError("VALIDATION_FAILED", {
      details: { fields: [{ path: "currentPassword", message: "Current password is incorrect" }] },
    });
  }
  const updated = await members.findOneAndUpdate(
    { _id: doc._id },
    {
      $set: { passwordHash: await hashPassword(newPassword), updatedAt: new Date() },
      $inc: { sessionVersion: 1 },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new AppError("UNAUTHORIZED");
  return updated.sessionVersion;
}

// --- Admin operations (used by scripts/members.ts and tests) ---------------

export async function createMember(input: { username: string; name: string; password: string }): Promise<Member> {
  const { members } = await getCollections();
  const now = new Date();
  const doc: MemberDoc = {
    _id: new ObjectId(),
    username: input.username,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    sessionVersion: 1,
    active: true,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
  await members.insertOne(doc);
  return toMember(doc);
}

export async function setMemberPassword(username: string, password: string): Promise<boolean> {
  const { members } = await getCollections();
  const res = await members.updateOne(
    { username },
    {
      $set: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, updatedAt: new Date() },
      $inc: { sessionVersion: 1 },
    },
  );
  return res.matchedCount === 1;
}

export async function setMemberActive(username: string, active: boolean): Promise<boolean> {
  const { members } = await getCollections();
  const res = await members.updateOne(
    { username },
    { $set: { active, updatedAt: new Date() }, $inc: { sessionVersion: 1 } },
  );
  return res.matchedCount === 1;
}

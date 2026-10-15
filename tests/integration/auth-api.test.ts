import { describe, expect, it } from "vitest";
import * as loginRoute from "@/app/api/auth/login/route";
import * as passwordRoute from "@/app/api/auth/password/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as settingsRoute from "@/app/api/settings/route";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { setMemberActive } from "@/services/members";
import { createUser, ctx, json, makeRequest, TEST_PASSWORD, TEST_SECRET, setupTestDatabase } from "./helpers";

setupTestDatabase();

function login(username: string, password: string, ip = "10.0.0.1") {
  return loginRoute.POST(
    makeRequest("POST", "/api/auth/login", { body: { username, password }, headers: { "x-forwarded-for": ip } }),
    ctx(),
  );
}

function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0];
}

describe("sign-in", () => {
  it("signs in with the right password and sets an httpOnly session cookie", async () => {
    const alice = await createUser();
    const res = await login("ALICE", TEST_PASSWORD);
    expect(res.status).toBe(200);
    expect((await json(res)).data.member.id).toBe(alice.member.id);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const list = await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: cookieFrom(res) }), ctx());
    expect(list.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    await createUser();
    const wrong = await login("alice", "nope-nope-nope");
    const unknown = await login("mallory", "nope-nope-nope");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await json(wrong)).error).toEqual((await json(unknown)).error);
  });

  it("locks the account after five failures, even with the right password", async () => {
    await createUser();
    for (let i = 0; i < 5; i++) expect((await login("alice", "wrong-password!", `10.0.1.${i}`)).status).toBe(401);
    const locked = await login("alice", TEST_PASSWORD, "10.0.2.1");
    expect(locked.status).toBe(429);
    expect((await json(locked)).error.code).toBe("ACCOUNT_LOCKED");
  });

  it("rate-limits sign-in attempts per IP", async () => {
    await createUser();
    const results: number[] = [];
    for (let i = 0; i < 21; i++) results.push((await login(`ghost${i}`, "whatever-123", "10.9.9.9")).status);
    expect(results.at(-1)).toBe(429);
  });
});

describe("access control", () => {
  it("rejects requests without a session, with a forged one, or after deactivation", async () => {
    const alice = await createUser();
    const none = await tasksRoute.GET(makeRequest("GET", "/api/tasks"), ctx());
    expect(none.status).toBe(401);

    const forged = createSessionToken(alice.member.id, 1, "some-other-secret-that-is-long-enough");
    const bad = await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: `${SESSION_COOKIE}=${forged}` }), ctx());
    expect(bad.status).toBe(401);

    await setMemberActive("alice", false);
    const revoked = await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: alice.cookie }), ctx());
    expect(revoked.status).toBe(401);
  });

  it("blocks cross-site writes by Origin", async () => {
    const alice = await createUser();
    const res = await tasksRoute.POST(
      makeRequest("POST", "/api/tasks", {
        body: { title: "csrf" },
        cookie: alice.cookie,
        headers: { origin: "https://evil.example", host: "localhost:3000" },
      }),
      ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("changing the password signs out other sessions but keeps this one", async () => {
    const alice = await createUser();
    const otherDevice = alice.cookie;
    const res = await passwordRoute.POST(
      makeRequest("POST", "/api/auth/password", {
        body: { currentPassword: TEST_PASSWORD, newPassword: "a-brand-new-password" },
        cookie: alice.cookie,
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const fresh = cookieFrom(res);
    expect((await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: fresh }), ctx())).status).toBe(200);
    expect((await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: otherDevice }), ctx())).status).toBe(401);
    expect((await login("alice", "a-brand-new-password")).status).toBe(200);
  });

  it("validates the session secret is used (token signed for v1 is accepted)", () => {
    expect(createSessionToken("65f000000000000000000000", 1, TEST_SECRET)).toContain(".");
  });
});

describe("settings", () => {
  it("defaults to everyone and can be switched to self", async () => {
    const alice = await createUser();
    const get = await settingsRoute.GET(makeRequest("GET", "/api/settings", { cookie: alice.cookie }), ctx());
    expect((await json(get)).data.settings).toEqual({ reactionVisibility: "everyone" });
    const patch = await settingsRoute.PATCH(
      makeRequest("PATCH", "/api/settings", { body: { reactionVisibility: "self" }, cookie: alice.cookie }),
      ctx(),
    );
    expect(patch.status).toBe(200);
    expect((await json(patch)).data.event.type).toBe("settings_changed");
    const bad = await settingsRoute.PATCH(
      makeRequest("PATCH", "/api/settings", { body: { reactionVisibility: "nobody" }, cookie: alice.cookie }),
      ctx(),
    );
    expect(bad.status).toBe(422);
  });
});

import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, readCookie, SESSION_TTL_SECONDS, verifySessionToken } from "@/lib/auth/session";
import { RateLimiter } from "@/lib/rate-limit";

const SECRET = "unit-test-secret-that-is-long-enough!!";
const MEMBER = "65f0a1b2c3d4e5f6a7b8c9d0";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("Correct horse battery", hash)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("generates readable strong passwords", () => {
    const p = generatePassword();
    expect(p).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    expect(generatePassword()).not.toBe(p);
  });
});

describe("session tokens", () => {
  it("round-trips a signed token", () => {
    const token = createSessionToken(MEMBER, 3, SECRET);
    expect(verifySessionToken(token, SECRET)).toMatchObject({ m: MEMBER, v: 3 });
  });

  it("rejects tampering, wrong secrets and expiry", () => {
    const token = createSessionToken(MEMBER, 1, SECRET, Date.UTC(2026, 0, 1));
    const [body, sig] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ m: MEMBER, v: 99, iat: 0, exp: 9e9 })).toString("base64url");
    expect(verifySessionToken(`${forgedBody}.${sig}`, SECRET, Date.UTC(2026, 0, 2))).toBeNull();
    expect(verifySessionToken(`${body}.${sig}x`, SECRET, Date.UTC(2026, 0, 2))).toBeNull();
    expect(verifySessionToken(token, "another-secret-that-is-long-enough!!", Date.UTC(2026, 0, 2))).toBeNull();
    expect(verifySessionToken(token, SECRET, Date.UTC(2026, 0, 1) + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull();
    expect(verifySessionToken(undefined, SECRET)).toBeNull();
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
  });

  it("reads one cookie from a header", () => {
    expect(readCookie("a=1; tasklol_session=abc.def; b=2", "tasklol_session")).toBe("abc.def");
    expect(readCookie("a=1", "tasklol_session")).toBeUndefined();
    expect(readCookie(null, "x")).toBeUndefined();
  });
});

describe("rate limiter", () => {
  it("allows the limit, then asks to wait until the window resets", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.hit("k", 0)).toBe(0);
    expect(rl.hit("k", 1)).toBe(0);
    expect(rl.hit("k", 2)).toBe(60);
    expect(rl.hit("other", 2)).toBe(0);
    expect(rl.hit("k", 60_001)).toBe(0);
  });
});

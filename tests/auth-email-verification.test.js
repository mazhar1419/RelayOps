import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import session from "express-session";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { createAuthRouter } from "../src/modules/auth/auth.routes.js";

const password = "RelayOps-Email-Test-Password-2026!";
const baseUser = { id: 73, email: "verify@example.com", created_at: "2026-10-20T00:00:00.000Z", email_verified_at: null };

async function setup(repository, sendVerificationEmail) {
  const app = createApp({
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    authRouter: createAuthRouter(repository, { sendVerificationEmail }),
    sessionMiddleware: session({ secret: "test-session-secret-that-is-long-enough-123", resave: false, saveUninitialized: false }),
  });
  const agent = request.agent(app);
  const csrf = await agent.get("/api/v1/auth/csrf");
  return { agent, csrf: csrf.body.csrfToken };
}

describe("email verification flow", () => {
  it("registers without creating a login session, sends OTP, then verifies the address", async () => {
    let user = { ...baseUser };
    let storedHash;
    let sentCode;
    const repository = {
      createUser: vi.fn(async (email, passwordHash) => {
        user = { ...baseUser, email, password_hash: passwordHash };
        return { id: user.id, email: user.email, created_at: user.created_at, email_verified_at: null };
      }),
      saveVerificationCode: vi.fn(async (_id, hash, expiresAt) => { storedHash = hash; expect(expiresAt.getTime()).toBeGreaterThan(Date.now()); }),
      verifyEmailCode: vi.fn(async (_email, hash) => {
        if (hash !== storedHash) return false;
        user.email_verified_at = new Date().toISOString();
        return true;
      }),
      findByEmail: vi.fn(async () => user),
      findPublicUserById: vi.fn(async () => user),
      findUnverifiedUser: vi.fn(async () => user.email_verified_at ? null : user),
    };
    const mailer = vi.fn(async (_email, code) => { sentCode = code; });
    const { agent, csrf } = await setup(repository, mailer);

    const registration = await agent.post("/api/v1/auth/register").set("x-csrf-token", csrf).send({ email: user.email, password });
    expect(registration.status).toBe(201);
    expect(mailer).toHaveBeenCalledOnce();
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(storedHash).not.toBe(sentCode);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);

    const verification = await agent.post("/api/v1/auth/verify-email").set("x-csrf-token", csrf).send({ email: user.email, code: sentCode });
    expect(verification.status).toBe(200);
    expect(verification.body.data.verified).toBe(true);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);

    user.password_hash = await argon2.hash(password, { type: argon2.argon2id });
    const login = await agent.post("/api/v1/auth/login").set("x-csrf-token", csrf).send({ email: user.email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.email).toBe(user.email);
  });

  it("does not allow an unverified account to log in", async () => {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const repository = {
      createUser: vi.fn(), saveVerificationCode: vi.fn(), verifyEmailCode: vi.fn(), findPublicUserById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue({ ...baseUser, password_hash: hash, email_verified_at: null }),
    };
    const { agent, csrf } = await setup(repository, vi.fn());
    const response = await agent.post("/api/v1/auth/login").set("x-csrf-token", csrf).send({ email: baseUser.email, password });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

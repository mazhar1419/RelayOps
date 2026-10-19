import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import session from "express-session";
import argon2 from "argon2";

import { createApp } from "../src/app.js";
import { createAuthRouter } from "../src/modules/auth/auth.routes.js";

const testPassword = "RelayOps-Test-Password-2026!";

const publicUser = {
  id: 42,
  email: "developer@example.com",
  created_at: "2026-01-01T00:00:00.000Z",
};

async function createTestContext(repository) {
  const app = createApp({
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    authRouter: createAuthRouter(repository),
    sessionMiddleware: session({
      secret: "test-only-session-secret-that-is-long-enough",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      },
    }),
  });

  return request.agent(app);
}

async function getCsrfToken(agent) {
  const response = await agent.get("/api/v1/auth/csrf");

  expect(response.status).toBe(200);
  expect(response.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);

  return response.body.csrfToken;
}

describe("RelayOps authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a user and stores a password hash, not the plain password", async () => {
    let savedEmail;
    let savedPasswordHash;

    const repository = {
      createUser: vi.fn(async (email, passwordHash) => {
        savedEmail = email;
        savedPasswordHash = passwordHash;
        return publicUser;
      }),
      findByEmail: vi.fn(),
      findPublicUserById: vi.fn(),
    };

    const agent = await createTestContext(repository);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        email: " Developer@Example.com ",
        password: testPassword,
      });

    expect(response.status).toBe(201);
    expect(savedEmail).toBe("developer@example.com");
    expect(savedPasswordHash).not.toBe(testPassword);
    expect(
      await argon2.verify(savedPasswordHash, testPassword),
    ).toBe(true);

    expect(response.body.data.email).toBe(publicUser.email);
    expect(response.body.data.password_hash).toBeUndefined();
  });

  it("rejects registration when the CSRF token is missing", async () => {
    const repository = {
      createUser: vi.fn(),
      findByEmail: vi.fn(),
      findPublicUserById: vi.fn(),
    };

    const agent = await createTestContext(repository);

    const response = await agent
      .post("/api/v1/auth/register")
      .send({
        email: "developer@example.com",
        password: testPassword,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_VALIDATION_FAILED");
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it("rejects invalid registration input", async () => {
    const repository = {
      createUser: vi.fn(),
      findByEmail: vi.fn(),
      findPublicUserById: vi.fn(),
    };

    const agent = await createTestContext(repository);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "not-an-email",
        password: "short",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it("logs in with valid credentials and exposes the current user", async () => {
    const passwordHash = await argon2.hash(testPassword, {
      type: argon2.argon2id,
    });

    const repository = {
      createUser: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue({
        ...publicUser,
        password_hash: passwordHash,
      }),
      findPublicUserById: vi.fn().mockResolvedValue(publicUser),
    };

    const agent = await createTestContext(repository);
    const csrfToken = await getCsrfToken(agent);

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "DEVELOPER@EXAMPLE.COM",
        password: testPassword,
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.user.email).toBe(publicUser.email);
    expect(loginResponse.body.data.user.password_hash).toBeUndefined();

    const meResponse = await agent.get("/api/v1/auth/me");

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.id).toBe(publicUser.id);
    expect(repository.findPublicUserById).toHaveBeenCalledWith("42");
  });

  it("rejects incorrect login credentials", async () => {
    const repository = {
      createUser: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      findPublicUserById: vi.fn(),
    };

    const agent = await createTestContext(repository);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "unknown@example.com",
        password: testPassword,
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("requires authentication for /me and logs out an authenticated user", async () => {
    const passwordHash = await argon2.hash(testPassword, {
      type: argon2.argon2id,
    });

    const repository = {
      createUser: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue({
        ...publicUser,
        password_hash: passwordHash,
      }),
      findPublicUserById: vi.fn().mockResolvedValue(publicUser),
    };

    const agent = await createTestContext(repository);

    const unauthenticatedResponse = await agent.get("/api/v1/auth/me");
    expect(unauthenticatedResponse.status).toBe(401);

    const loginToken = await getCsrfToken(agent);

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("x-csrf-token", loginToken)
      .send({
        email: publicUser.email,
        password: testPassword,
      });

    expect(loginResponse.status).toBe(200);

    // Login regenerates the session, so fetch a token for the new session.
    const logoutToken = await getCsrfToken(agent);

    const logoutResponse = await agent
      .post("/api/v1/auth/logout")
      .set("x-csrf-token", logoutToken);

    expect(logoutResponse.status).toBe(204);

    const afterLogoutResponse = await agent.get("/api/v1/auth/me");
    expect(afterLogoutResponse.status).toBe(401);
  });
});
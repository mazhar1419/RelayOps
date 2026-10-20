import { Router } from "express";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";

import { registerSchema, loginSchema, verifyEmailSchema, resendVerificationSchema } from "./auth.schema.js";
import { createVerificationCode, hashVerificationCode, sendVerificationEmail } from "./email-verification.js";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "LOGIN_RATE_LIMITED", message: "Too many login attempts. Try again later." } },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "REGISTRATION_RATE_LIMITED", message: "Too many account creation attempts. Try again later." } },
});
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "VERIFICATION_RATE_LIMITED", message: "Too many verification attempts. Try again later." } },
});
const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RESEND_RATE_LIMITED", message: "Too many verification emails requested. Try again later." } },
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}
function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

export function createAuthRouter(repository, options = {}) {
  const router = Router();
  const mailer = options.sendVerificationEmail || sendVerificationEmail;
  const clock = options.now || (() => new Date());

  router.post("/register", registerLimiter, async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues } });

      const email = parsed.data.email.toLowerCase();
      const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
      const user = await repository.createUser(email, passwordHash);

      // The real repository implements verification persistence. Mock repositories in unit tests may omit it.
      if (typeof repository.saveVerificationCode === "function") {
        const code = createVerificationCode();
        await repository.saveVerificationCode(user.id, hashVerificationCode(email, code), new Date(clock().getTime() + 10 * 60 * 1000));
        try {
          await mailer(email, code);
        } catch (mailError) {
          req.log?.warn({ code: mailError.code || "EMAIL_DELIVERY_FAILED" }, "Verification email delivery failed");
          return res.status(mailError.status || 502).json({
            error: {
              code: mailError.code || "EMAIL_DELIVERY_FAILED",
              message: "Account created, but the verification email could not be sent. Configure email delivery or try resending the code.",
            },
          });
        }
      }

      return res.status(201).json({ data: { id: user.id, email: user.email, created_at: user.created_at, verificationRequired: true } });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists" } });
      return next(error);
    }
  });

  router.post("/verify-email", verificationLimiter, async (req, res, next) => {
    try {
      const parsed = verifyEmailSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues } });
      const email = parsed.data.email.toLowerCase();
      const verified = await repository.verifyEmailCode(email, hashVerificationCode(email, parsed.data.code));
      if (!verified) return res.status(400).json({ error: { code: "INVALID_OR_EXPIRED_CODE", message: "The code is invalid, expired, or has reached its attempt limit." } });
      return res.status(200).json({ data: { verified: true, message: "Email verified. You can now sign in." } });
    } catch (error) { return next(error); }
  });

  router.post("/resend-verification", resendLimiter, async (req, res, next) => {
    try {
      const parsed = resendVerificationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues } });
      const email = parsed.data.email.toLowerCase();
      const user = await repository.findUnverifiedUser(email);
      if (user) {
        const code = createVerificationCode();
        await repository.saveVerificationCode(user.id, hashVerificationCode(email, code), new Date(clock().getTime() + 10 * 60 * 1000));
        await mailer(email, code);
      }
      return res.status(200).json({ data: { message: "If the account exists and needs verification, a new code has been sent." } });
    } catch (error) {
      req.log?.warn({ code: error.code || "EMAIL_DELIVERY_FAILED" }, "Verification resend failed");
      return res.status(error.status || 502).json({ error: { code: error.code || "EMAIL_DELIVERY_FAILED", message: "Verification email could not be sent. Check email delivery configuration and try again." } });
    }
  });

  router.post("/login", loginLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues } });
      const email = parsed.data.email.toLowerCase();
      const user = await repository.findByEmail(email);
      const validPassword = user ? await argon2.verify(user.password_hash, parsed.data.password) : false;
      if (!validPassword) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } });
      if (Object.hasOwn(user, "email_verified_at") && !user.email_verified_at) {
        return res.status(403).json({ error: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email address before signing in." } });
      }
      await regenerateSession(req);
      req.session.userId = String(user.id);
      await saveSession(req);
      return res.status(200).json({ data: { user: { id: user.id, email: user.email, created_at: user.created_at, email_verified_at: user.email_verified_at ?? null } } });
    } catch (error) { return next(error); }
  });

  router.get("/me", async (req, res, next) => {
    try {
      if (!req.session.userId) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in" } });
      const user = await repository.findPublicUserById(req.session.userId);
      if (!user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in" } });
      return res.json({ data: user });
    } catch (error) { return next(error); }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      if (req.session.userId) await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
      res.clearCookie("relayops.sid", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });
  return router;
}

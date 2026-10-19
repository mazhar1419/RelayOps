import { Router } from "express";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";

import { registerSchema, loginSchema } from "./auth.schema.js";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function createAuthRouter(repository) {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        });
      }

      const email = parsed.data.email.toLowerCase();
      const passwordHash = await argon2.hash(parsed.data.password, {
        type: argon2.argon2id,
      });

      const user = await repository.createUser(email, passwordHash);

      return res.status(201).json({ data: user });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: {
            code: "EMAIL_ALREADY_EXISTS",
            message: "An account with this email already exists",
          },
        });
      }

      return next(error);
    }
  });

  router.post("/login", loginLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        });
      }

      const email = parsed.data.email.toLowerCase();
      const user = await repository.findByEmail(email);

      const validPassword = user
        ? await argon2.verify(user.password_hash, parsed.data.password)
        : false;

      if (!validPassword) {
        return res.status(401).json({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email or password is incorrect",
          },
        });
      }

      // Prevent session fixation after successful login.
      await regenerateSession(req);
      req.session.userId = String(user.id);

      await saveSession(req);

      return res.status(200).json({
        data: {
          user: {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
          },
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/me", async (req, res, next) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "Please log in",
          },
        });
      }

      const user = await repository.findPublicUserById(
        req.session.userId,
      );

      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "Please log in",
          },
        });
      }

      return res.json({ data: user });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      if (!req.session.userId) {
        return res.status(204).end();
      }

      await new Promise((resolve, reject) => {
        req.session.destroy((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      res.clearCookie("relayops.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
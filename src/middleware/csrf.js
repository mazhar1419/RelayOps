import { randomBytes, timingSafeEqual } from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfTokenHandler(req, res) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }

  res.setHeader("Cache-Control", "no-store");
  return res.json({ csrfToken: req.session.csrfToken });
}

export function requireCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const expected = req.session?.csrfToken;
  const received = req.get("x-csrf-token");

  if (
    typeof expected !== "string" ||
    typeof received !== "string" ||
    !/^[a-f0-9]{64}$/.test(received) ||
    !/^[a-f0-9]{64}$/.test(expected)
  ) {
    return res.status(403).json({
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: "CSRF token missing or invalid",
      },
    });
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return res.status(403).json({
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: "CSRF token missing or invalid",
      },
    });
  }

  return next();
}
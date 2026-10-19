import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import { env } from "./env.js";
import { pool } from "../db/pool.js";

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  name: "relayops.sid",
  secret: env.sessionSecret,

  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
    path: "/",
  },
});
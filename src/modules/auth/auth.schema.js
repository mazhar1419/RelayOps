import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});
export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});
export const verifyEmailSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});
export const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(254),
});

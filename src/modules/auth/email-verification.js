import { createHash, randomInt } from "node:crypto";
import { Resend } from "resend";
import { env } from "../../config/env.js";

export function createVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashVerificationCode(email, code) {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${env.sessionSecret}`)
    .digest("hex");
}

function createEmailError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getResendClient() {
  if (!env.resendApiKey) {
    throw createEmailError(
      "Email delivery is not configured. Set RESEND_API_KEY.",
      "EMAIL_DELIVERY_NOT_CONFIGURED",
      503,
    );
  }

  return new Resend(env.resendApiKey);
}

async function sendEmail({
  to,
  subject,
  text,
  html,
  errorCode,
}) {
  try {
    const resend = getResendClient();

    const { data, error } = await resend.emails.send({
      from: env.mailFrom || "RelayOps <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
      html,
    });

    if (error) {
      console.error("Resend email delivery failed:", {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        errorCode,
      });

      throw createEmailError(
        "Email provider could not deliver the message. Check Resend configuration and provider logs.",
        errorCode,
        502,
      );
    }

    if (!data?.id) {
      throw createEmailError(
        "Email provider did not confirm the email request.",
        errorCode,
        502,
      );
    }
  } catch (error) {
    if (error?.code === errorCode) {
      throw error;
    }

    console.error("Resend request failed:", {
      name: error?.name,
      message: error?.message,
      statusCode: error?.statusCode,
      errorCode,
    });

    throw createEmailError(
      "Email provider request failed. Check Resend configuration and provider logs.",
      errorCode,
      502,
    );
  }
}

export async function sendVerificationEmail(email, code) {
  const safeCode = escapeHtml(code);

  await sendEmail({
    to: email,
    subject: "Verify your RelayOps account",
    text: [
      `Your RelayOps verification code is ${code}.`,
      "It expires in 10 minutes.",
      "If you did not create this account, ignore this email.",
    ].join("\n\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
        <h1>Verify your RelayOps account</h1>
        <p>Enter this code to verify your email address:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:700">${safeCode}</p>
        <p>This code expires in 10 minutes.</p>
        <p>If you did not create this account, ignore this email.</p>
      </div>
    `,
    errorCode: "EMAIL_DELIVERY_FAILED",
  });
}

export async function sendTeamInvitationEmail(email, teamName, role) {
  const safeTeamName = escapeHtml(teamName);
  const safeRole = escapeHtml(role);
  const safeOrigin = escapeHtml(env.frontendOrigin);

  await sendEmail({
    to: email,
    subject: `You're invited to ${teamName} on RelayOps`,
    text: [
      `You have been invited to the ${teamName} workspace on RelayOps as ${role}.`,
      "Create a RelayOps account using this email address, then verify your email.",
      "Your workspace invitation will be accepted automatically after verification.",
      `Open RelayOps: ${env.frontendOrigin}`,
    ].join("\n\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
        <h1>Workspace invitation</h1>
        <p>You have been invited to <strong>${safeTeamName}</strong> on RelayOps as <strong>${safeRole}</strong>.</p>
        <p>Create a RelayOps account using this email address, then verify your email. Your workspace invitation will be accepted automatically after verification.</p>
        <p><a href="${safeOrigin}">Open RelayOps</a></p>
      </div>
    `,
    errorCode: "INVITATION_EMAIL_FAILED",
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

import nodemailer from "nodemailer";
import { APP_NAME } from "@/lib/brand";

function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

export function getAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function getMailFrom() {
  return process.env.MAIL_FROM || "noreply@zero-trust-security.org";
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!mailConfigured()) {
    throw new Error(
      "Email is not configured. Set SMTP_HOST and MAIL_FROM (and SMTP credentials) in .env",
    );
  }

  const port = Number(process.env.SMTP_PORT || "587");
  const secure =
    process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1" || port === 465;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  await transporter.sendMail({
    from: `"${APP_NAME}" <${getMailFrom()}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? input.text.replace(/\n/g, "<br/>"),
  });
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  tempPassword: string;
}) {
  const loginUrl = `${getAppUrl()}/login`;
  const subject = `You're invited to ${APP_NAME}`;
  const text = [
    `Hi ${input.name},`,
    "",
    `You have been invited to ${APP_NAME}.`,
    "",
    `Login: ${loginUrl}`,
    `Email: ${input.to}`,
    `Temporary password: ${input.tempPassword}`,
    "",
    "Sign in and change your password immediately. You will be asked to set a new password before using the app.",
    "",
    `— ${APP_NAME}`,
    `This message was sent from ${getMailFrom()}`,
  ].join("\n");

  await sendMail({ to: input.to, subject, text });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const subject = `Reset your ${APP_NAME} password`;
  const text = [
    `Hi ${input.name},`,
    "",
    "We received a request to reset your password.",
    `Open this link (expires in 1 hour): ${input.resetUrl}`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    `— ${APP_NAME}`,
  ].join("\n");

  await sendMail({ to: input.to, subject, text });
}

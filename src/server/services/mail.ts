import nodemailer from "nodemailer";
import { APP_NAME } from "@/lib/brand";

const BRAND_TEAL = "#0d9488";
const BRAND_TEAL_DARK = "#0f766e";
const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const SURFACE = "#f8fafc";

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailShell(options: {
  preheader: string;
  title: string;
  bodyHtml: string;
}) {
  const from = escapeHtml(getMailFrom());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(options.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND_TEAL};padding:22px 28px;">
              <p style="margin:0;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">
                ${escapeHtml(APP_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;color:${TEXT};font-size:15px;line-height:1.55;">
              ${options.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;color:${MUTED};font-size:12px;line-height:1.5;border-top:1px solid ${BORDER};">
              <p style="margin:16px 0 0;">
                This message was sent from <a href="mailto:${from}" style="color:${BRAND_TEAL_DARK};text-decoration:none;">${from}</a>
                on behalf of ${escapeHtml(APP_NAME)}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${BRAND_TEAL}" style="border-radius:8px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
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

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${getMailFrom()}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, "<br/>"),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      typeof err === "object" && err && "responseCode" in err
        ? Number((err as { responseCode?: number }).responseCode)
        : undefined;
    if (
      code === 530 ||
      /530\s+Authentication required/i.test(msg) ||
      /Authentication required/i.test(msg)
    ) {
      throw new Error(
        "SMTP username/password invalid or missing. Set SMTP_USER and SMTP_PASS in .env (IONOS mailbox credentials).",
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  tempPassword: string;
}) {
  const loginUrl = `${getAppUrl()}/login`;
  const subject = `You're invited to ${APP_NAME}`;
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.to);
  const safePassword = escapeHtml(input.tempPassword);

  const text = [
    `Hi ${input.name},`,
    "",
    `Welcome to ${APP_NAME} — you've been invited to join the team.`,
    "",
    `Sign in: ${loginUrl}`,
    `Email: ${input.to}`,
    `Temporary password: ${input.tempPassword}`,
    "",
    "Getting started:",
    "1) Sign in with the email and temporary password above",
    "2) Change your password when prompted on first login",
    "3) Start using tasks with your team",
    "",
    "Security: Do not share this temporary password. It stops working once you set a new password.",
    "",
    `— ${APP_NAME}`,
    `This message was sent from ${getMailFrom()}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;">Hi ${safeName},</p>
    <p style="margin:0 0 8px;">
      Welcome to <strong>${escapeHtml(APP_NAME)}</strong> — you've been invited to join the team.
      Use the credentials below to get started.
    </p>
    ${ctaButton(loginUrl, `Sign in to ${APP_NAME}`)}
    <p style="margin:0 0 8px;font-size:13px;color:${MUTED};">
      Or open this link:<br/>
      <a href="${escapeHtml(loginUrl)}" style="color:${BRAND_TEAL_DARK};word-break:break-all;">${escapeHtml(loginUrl)}</a>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;">
      <tr>
        <td style="padding:16px 18px;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;line-height:1.55;color:${TEXT};">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">
            Your login details
          </p>
          <p style="margin:0 0 8px;">
            <span style="display:inline-block;min-width:140px;color:${MUTED};">Email</span><br/>
            <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;font-weight:600;word-break:break-all;">${safeEmail}</span>
          </p>
          <p style="margin:0;">
            <span style="display:inline-block;min-width:140px;color:${MUTED};">Temporary password</span><br/>
            <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;font-weight:600;letter-spacing:0.02em;word-break:break-all;">${safePassword}</span>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-weight:600;">Getting started</p>
    <ol style="margin:0 0 18px;padding-left:20px;color:${TEXT};">
      <li style="margin-bottom:6px;">Sign in with the email and temporary password above</li>
      <li style="margin-bottom:6px;">Change your password when prompted on first login</li>
      <li style="margin-bottom:0;">Start using tasks with your team</li>
    </ol>
    <p style="margin:0 0 4px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;color:#9a3412;line-height:1.5;">
      <strong style="color:#9a3412;">Security note:</strong>
      Do not share this temporary password. It is only for your first sign-in and stops working once you set a new password.
    </p>
  `;

  const html = emailShell({
    preheader: `You're invited to ${APP_NAME}. Sign in and set your password to get started.`,
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: input.to, subject, text, html });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const subject = `Reset your ${APP_NAME} password`;
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.resetUrl);

  const text = [
    `Hi ${input.name},`,
    "",
    `We received a request to reset your ${APP_NAME} password.`,
    "",
    `Open this link to choose a new password (expires in 1 hour):`,
    input.resetUrl,
    "",
    "If you did not request this, you can ignore this email. Your password will stay the same.",
    "",
    `— ${APP_NAME}`,
    `This message was sent from ${getMailFrom()}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;">Hi ${safeName},</p>
    <p style="margin:0 0 8px;">
      We received a request to reset your <strong>${escapeHtml(APP_NAME)}</strong> password.
      Use the button below to choose a new one. This link expires in <strong>1 hour</strong>.
    </p>
    ${ctaButton(input.resetUrl, "Reset your password")}
    <p style="margin:0 0 16px;font-size:13px;color:${MUTED};">
      Or copy this link:<br/>
      <a href="${safeUrl}" style="color:${BRAND_TEAL_DARK};word-break:break-all;">${safeUrl}</a>
    </p>
    <p style="margin:0;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;color:#9a3412;line-height:1.5;">
      If you did not request a password reset, you can ignore this email. Your password will stay the same.
    </p>
  `;

  const html = emailShell({
    preheader: `Reset your ${APP_NAME} password. This link expires in 1 hour.`,
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: input.to, subject, text, html });
}

export async function sendPasswordChangedEmail(input: {
  to: string;
  name: string;
  changedAt?: Date;
}) {
  const changedAt = input.changedAt ?? new Date();
  const timestamp = changedAt.toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "UTC",
  });
  const loginUrl = `${getAppUrl()}/login`;
  const subject = `Your password was changed`;
  const safeName = escapeHtml(input.name);
  const safeTs = escapeHtml(timestamp);

  const text = [
    `Hi ${input.name},`,
    "",
    `Your ${APP_NAME} password was changed on ${timestamp} (UTC).`,
    "",
    `Sign in: ${loginUrl}`,
    "",
    "If you did not make this change, contact your administrator immediately.",
    "",
    `— ${APP_NAME}`,
    `This message was sent from ${getMailFrom()}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;">Hi ${safeName},</p>
    <p style="margin:0 0 8px;">
      Your <strong>${escapeHtml(APP_NAME)}</strong> password was changed successfully.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;">
      <tr>
        <td style="padding:16px 18px;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:14px;line-height:1.55;color:${TEXT};">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">
            Change details
          </p>
          <p style="margin:0;">
            <span style="display:inline-block;min-width:140px;color:${MUTED};">When</span><br/>
            <span style="font-weight:600;">${safeTs} (UTC)</span>
          </p>
        </td>
      </tr>
    </table>
    ${ctaButton(loginUrl, `Sign in to ${APP_NAME}`)}
    <p style="margin:0 0 16px;font-size:13px;color:${MUTED};">
      Or open this link:<br/>
      <a href="${escapeHtml(loginUrl)}" style="color:${BRAND_TEAL_DARK};word-break:break-all;">${escapeHtml(loginUrl)}</a>
    </p>
    <p style="margin:0;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;color:#9a3412;line-height:1.5;">
      <strong style="color:#9a3412;">Security note:</strong>
      If you did not change your password, contact your administrator immediately.
    </p>
  `;

  const html = emailShell({
    preheader: `Your ${APP_NAME} password was changed on ${timestamp} (UTC).`,
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: input.to, subject, text, html });
}

export type DigestTaskLine = {
  title: string;
  priority?: string | null;
  projectName?: string | null;
  status?: string | null;
  dueTime?: string | null;
};

function taskLinesHtml(lines: DigestTaskLine[]) {
  if (!lines.length) {
    return `<p style="margin:0;color:${MUTED};">No tasks in this list.</p>`;
  }
  const rows = lines
    .map((t, i) => {
      const meta = [
        t.projectName ? escapeHtml(t.projectName) : null,
        t.priority ? escapeHtml(t.priority) : null,
        t.dueTime ? `due ${escapeHtml(t.dueTime)}` : null,
        t.status ? escapeHtml(t.status.replaceAll("_", " ")) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};vertical-align:top;width:28px;color:${MUTED};">${i + 1}.</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};">
          <div style="font-weight:600;color:${TEXT};">${escapeHtml(t.title)}</div>
          ${meta ? `<div style="margin-top:2px;font-size:12px;color:${MUTED};">${meta}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">${rows}</table>`;
}

function taskLinesText(lines: DigestTaskLine[]) {
  if (!lines.length) return "None.";
  return lines
    .map((t, i) => {
      const meta = [
        t.projectName,
        t.priority,
        t.dueTime ? `due ${t.dueTime}` : null,
        t.status,
      ]
        .filter(Boolean)
        .join(" · ");
      return `${i + 1}. ${t.title}${meta ? ` (${meta})` : ""}`;
    })
    .join("\n");
}

/** Morning digest: today's project / daily tasks — please complete on time. */
export async function sendMorningTaskEmail(input: {
  to: string;
  name: string;
  date: string;
  tasks: DigestTaskLine[];
}) {
  if (!mailConfigured()) return { skipped: true as const, reason: "smtp_not_configured" };
  const loginUrl = `${getAppUrl()}/planner`;
  const subject = `Morning tasks · ${input.date} — please complete on time`;
  const safeName = escapeHtml(input.name);
  const count = input.tasks.length;

  const text = [
    `Hi ${input.name},`,
    "",
    `Good morning — here are your ${count} task${count === 1 ? "" : "s"} for ${input.date}.`,
    "Please complete them on time.",
    "",
    taskLinesText(input.tasks),
    "",
    `Open planner: ${loginUrl}`,
    "",
    `— ${APP_NAME}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;">Hi ${safeName},</p>
    <p style="margin:0 0 8px;">
      Good morning — your <strong>${count}</strong> task${count === 1 ? "" : "s"} for
      <strong>${escapeHtml(input.date)}</strong> are ready.
      Please complete them on time.
    </p>
    ${taskLinesHtml(input.tasks)}
    ${ctaButton(loginUrl, "Open today's planner")}
  `;

  const html = emailShell({
    preheader: `${count} tasks for ${input.date}. Please complete them on time.`,
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: input.to, subject, text, html });
  return { ok: true as const };
}

/** 5pm digest: pending / incomplete tasks for today. */
export async function sendPendingTasksEmail(input: {
  to: string;
  name: string;
  date: string;
  pending: DigestTaskLine[];
  completedCount: number;
  totalCount: number;
}) {
  if (!mailConfigured()) return { skipped: true as const, reason: "smtp_not_configured" };
  const loginUrl = `${getAppUrl()}/dashboard`;
  const pendingCount = input.pending.length;
  const subject =
    pendingCount > 0
      ? `Pending tasks · ${input.date} (${pendingCount} still open)`
      : `End of day · ${input.date} — all caught up`;
  const safeName = escapeHtml(input.name);

  const text = [
    `Hi ${input.name},`,
    "",
    `End of day summary for ${input.date}: ${input.completedCount}/${input.totalCount} completed.`,
    "",
    pendingCount
      ? `Your pending tasks:\n${taskLinesText(input.pending)}`
      : "You have no pending tasks — nice work.",
    "",
    `Open dashboard: ${loginUrl}`,
    "",
    `— ${APP_NAME}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;">Hi ${safeName},</p>
    <p style="margin:0 0 8px;">
      End of day · <strong>${escapeHtml(input.date)}</strong>:
      <strong>${input.completedCount}</strong> of <strong>${input.totalCount}</strong> completed.
    </p>
    <p style="margin:16px 0 8px;font-weight:600;">
      ${pendingCount ? `Your pending tasks (${pendingCount})` : "No pending tasks"}
    </p>
    ${taskLinesHtml(input.pending)}
    ${ctaButton(loginUrl, "Open dashboard")}
  `;

  const html = emailShell({
    preheader:
      pendingCount > 0
        ? `${pendingCount} pending task${pendingCount === 1 ? "" : "s"} for ${input.date}.`
        : `All tasks complete for ${input.date}.`,
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: input.to, subject, text, html });
  return { ok: true as const };
}

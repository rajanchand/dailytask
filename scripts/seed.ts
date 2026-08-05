import "dotenv/config";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { users, teams, teamMembers, discordIntegrations } from "../src/server/db/schema";

function id() {
  return crypto.randomUUID();
}

const DEFAULT_DEV_PASSWORD = "password123";
const DEFAULT_SEED_EMAIL = "rajanchand@zero-trust-security.org";

/**
 * Wipe app data and seed a single super admin.
 * Additional members are created only via Team → Invite (DB + email).
 *
 * Production safeguards:
 * - Refuse the default weak password unless ALLOW_INSECURE_SEED=true
 * - Prefer SEED_PASSWORD / SEED_ADMIN_EMAIL from env
 * - Force mustChangePassword=true in production (or SEED_FORCE_PASSWORD_CHANGE=true)
 * - Does NOT truncate system_health_credentials (ops gate survives reseed)
 */
async function seed() {
  const isProd = process.env.NODE_ENV === "production";
  const seedPassword = (process.env.SEED_PASSWORD || DEFAULT_DEV_PASSWORD).trim();
  const seedEmail = (
    process.env.SEED_ADMIN_EMAIL ||
    process.env.SEED_EMAIL ||
    DEFAULT_SEED_EMAIL
  )
    .trim()
    .toLowerCase();
  const seedName = (process.env.SEED_ADMIN_NAME || "Rajanchand").trim() || "Rajanchand";
  const allowInsecure = process.env.ALLOW_INSECURE_SEED === "true";
  const forceChange =
    process.env.SEED_FORCE_PASSWORD_CHANGE === "true" ||
    (isProd && process.env.SEED_FORCE_PASSWORD_CHANGE !== "false");

  if (isProd && seedPassword === DEFAULT_DEV_PASSWORD && !allowInsecure) {
    console.error(
      "[seed] Refusing to seed production with the default password.\n" +
        "Set SEED_PASSWORD to a strong secret, or ALLOW_INSECURE_SEED=true (not recommended).",
    );
    process.exit(1);
  }

  if (seedPassword.length < 12 && isProd && !allowInsecure) {
    console.error("[seed] SEED_PASSWORD must be at least 12 characters in production.");
    process.exit(1);
  }

  console.log("Resetting database to a clean single-admin workspace...");
  if (forceChange) {
    console.warn("[seed] mustChangePassword=true — admin must change password on first login.");
  }
  if (seedPassword === DEFAULT_DEV_PASSWORD) {
    console.warn(
      "[seed] WARNING: using default demo password. Change it immediately after login.",
    );
  }

  // Preserve Discord webhook across reseed (Send Report depends on it).
  const [savedDiscord] = await db.select().from(discordIntegrations).limit(1);

  // Clear app tables (FK-safe). Keep system_health_credentials intact.
  // discord_integrations cascades off teams — restore after.
  await db.execute(sql`
    TRUNCATE TABLE
      activity_logs,
      notifications,
      comments,
      attachments,
      reminders,
      daily_summaries,
      task_tags,
      tasks,
      tags,
      categories,
      projects,
      calendar_entries,
      user_sessions,
      team_members,
      teams,
      users
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await hash(seedPassword, 12);
  const rajanId = id();
  const teamId = id();

  await db.insert(users).values({
    id: rajanId,
    name: seedName,
    email: seedEmail,
    passwordHash,
    role: "super_admin",
    timezone: process.env.SEED_TIMEZONE?.trim() || "Europe/London",
    mustChangePassword: forceChange,
    image: null,
  });

  await db.insert(teams).values({
    id: teamId,
    name: "Dailytask Team",
    description: "Default workspace — invite members from the Team page",
    createdById: rajanId,
  });

  await db.insert(teamMembers).values({
    id: id(),
    teamId,
    userId: rajanId,
    role: "super_admin",
    joinedAt: new Date(),
  });

  if (savedDiscord?.webhookUrl) {
    await db.insert(discordIntegrations).values({
      id: id(),
      teamId,
      webhookUrl: savedDiscord.webhookUrl,
      serverName: savedDiscord.serverName,
      channelName: savedDiscord.channelName,
      enabled: savedDiscord.enabled ?? true,
      eventTypes: savedDiscord.eventTypes ?? {
        taskCreated: true,
        taskAssigned: true,
        statusChanged: true,
        taskCompleted: true,
        taskOverdue: true,
        morningReminder: true,
        dailySummary: true,
      },
    });
    console.log("Restored Discord webhook integration.");
  } else {
    const envWebhook = process.env.DISCORD_WEBHOOK_URL?.trim();
    if (envWebhook?.startsWith("https://discord.com/api/webhooks/")) {
      await db.insert(discordIntegrations).values({
        id: id(),
        teamId,
        webhookUrl: envWebhook,
        serverName: process.env.DISCORD_SERVER_NAME || null,
        channelName: process.env.DISCORD_CHANNEL_NAME || "#dailyflow",
        enabled: true,
        eventTypes: {
          taskCreated: true,
          taskAssigned: true,
          statusChanged: true,
          taskCompleted: true,
          taskOverdue: true,
          morningReminder: true,
          dailySummary: true,
        },
      });
      console.log("Installed Discord webhook from DISCORD_WEBHOOK_URL.");
    }
  }

  console.log("Seed complete — fresh workspace.");
  console.log("Super admin login:");
  console.log(`  Email:    ${seedEmail}`);
  console.log(
    forceChange || seedPassword !== DEFAULT_DEV_PASSWORD
      ? "  Password: (from SEED_PASSWORD / env — not printed)"
      : `  Password: ${DEFAULT_DEV_PASSWORD}  ← CHANGE IMMEDIATELY`,
  );
  console.log("Invite teammates from /team — they are saved to the DB and emailed automatically.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

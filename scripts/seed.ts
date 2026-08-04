import "dotenv/config";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { users, teams, teamMembers } from "../src/server/db/schema";

function id() {
  return crypto.randomUUID();
}

/**
 * Wipe app data and seed a single super admin: Rajanchand.
 * Additional members are created only via Team → Invite (DB + email).
 */
async function seed() {
  console.log("Resetting database to a clean Rajanchand-only workspace...");

  // Clear all app tables (FK-safe)
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
      discord_integrations,
      team_members,
      teams,
      users
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await hash("password123", 12);
  const rajanId = id();
  const teamId = id();

  await db.insert(users).values({
    id: rajanId,
    name: "Rajanchand",
    email: "rajanchand@zero-trust-security.org",
    passwordHash,
    role: "super_admin",
    timezone: "Europe/London",
    mustChangePassword: false,
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

  console.log("Seed complete — fresh workspace.");
  console.log("Super admin login:");
  console.log("  Email:    rajanchand@zero-trust-security.org");
  console.log("  Password: password123");
  console.log("Invite teammates from /team — they are saved to the DB and emailed automatically.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

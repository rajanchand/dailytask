import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { discordIntegrations } from "@/server/db/schema";

export type DiscordEvent =
  | "taskCreated"
  | "taskAssigned"
  | "statusChanged"
  | "taskCompleted"
  | "taskOverdue"
  | "morningReminder"
  | "dailySummary";

export async function sendDiscordWebhook(
  teamId: string | null | undefined,
  event: DiscordEvent,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  let integration;

  if (teamId) {
    [integration] = await db
      .select()
      .from(discordIntegrations)
      .where(eq(discordIntegrations.teamId, teamId))
      .limit(1);
  } else {
    // Fall back to the first enabled workspace integration
    [integration] = await db
      .select()
      .from(discordIntegrations)
      .where(eq(discordIntegrations.enabled, true))
      .limit(1);
  }

  if (!integration?.enabled || !integration.webhookUrl) {
    return { ok: false, error: "Discord webhook is not configured or disabled." };
  }
  if (!integration.eventTypes?.[event]) {
    return { ok: false, error: "This Discord event type is disabled in settings." };
  }

  try {
    const res = await fetch(integration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      return { ok: false, error: `Discord returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("Discord webhook failed", err);
    return { ok: false, error: "Failed to reach Discord webhook." };
  }
}

export async function testDiscordWebhook(webhookUrl: string) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "Dailytask Manager connected — Discord sync is working.",
    }),
  });
  if (!res.ok) {
    throw new Error(`Discord returned ${res.status}`);
  }
}

export function formatDailySummaryDiscord(input: {
  userName: string;
  date: string;
  completed: number;
  inProgress: number;
  pending: number;
  remaining: string[];
}) {
  const remaining =
    input.remaining.length > 0
      ? input.remaining.map((t) => `- ${t}`).join("\n")
      : "- none";

  return [
    `Summary · ${input.userName} · ${input.date}`,
    `done ${input.completed}  ·  active ${input.inProgress}  ·  pending ${input.pending}`,
    "",
    "Left",
    remaining,
  ].join("\n");
}

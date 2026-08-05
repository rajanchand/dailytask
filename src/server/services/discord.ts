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

export type SendDiscordOptions = {
  /** Manual /reports sends always post when a destination exists, even if Daily Summary is unchecked. */
  ignoreEventFilter?: boolean;
};

const DISCORD_CONTENT_LIMIT = 1900;

function chunkContent(content: string): string[] {
  if (content.length <= DISCORD_CONTENT_LIMIT) return [content];
  return content.match(/[\s\S]{1,1800}/g) ?? [content.slice(0, DISCORD_CONTENT_LIMIT)];
}

async function postWebhook(webhookUrl: string, content: string): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const chunk of chunkContent(content)) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chunk }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `Discord returned ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`,
        };
      }
    }
    return { ok: true };
  } catch (err) {
    console.error("Discord webhook failed", err);
    return { ok: false, error: "Failed to reach Discord webhook." };
  }
}

/** Fallback when no webhook is saved: post via the Discord bot into DISCORD_CHANNEL_ID. */
async function postViaBot(content: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const channelId = process.env.DISCORD_CHANNEL_ID?.trim();
  if (!token || !channelId) {
    return {
      ok: false,
      error:
        "Discord webhook is not configured. Open Discord settings, paste a webhook URL, and Save — or set DISCORD_CHANNEL_ID with the bot token.",
    };
  }

  try {
    for (const chunk of chunkContent(content)) {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: chunk }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `Discord bot send failed (${res.status})${body ? `: ${body.slice(0, 120)}` : ""}`,
        };
      }
    }
    return { ok: true };
  } catch (err) {
    console.error("Discord bot send failed", err);
    return { ok: false, error: "Failed to reach Discord via bot." };
  }
}

async function resolveWebhookUrl(
  teamId: string | null | undefined,
): Promise<{
  url: string | null;
  enabled: boolean;
  eventTypes: Record<string, boolean> | null;
  error?: string;
}> {
  let integration;

  if (teamId) {
    [integration] = await db
      .select()
      .from(discordIntegrations)
      .where(eq(discordIntegrations.teamId, teamId))
      .limit(1);
  } else {
    [integration] = await db.select().from(discordIntegrations).limit(1);
  }

  if (integration?.webhookUrl) {
    return {
      url: integration.webhookUrl,
      enabled: integration.enabled,
      eventTypes: integration.eventTypes ?? null,
    };
  }

  const envUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (envUrl?.startsWith("https://discord.com/api/webhooks/")) {
    return { url: envUrl, enabled: true, eventTypes: null };
  }

  return {
    url: null,
    enabled: false,
    eventTypes: null,
    error:
      "Discord webhook is not configured. Open Discord settings, paste a webhook URL for #dailyflow, and Save.",
  };
}

export async function sendDiscordWebhook(
  teamId: string | null | undefined,
  event: DiscordEvent,
  content: string,
  options: SendDiscordOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveWebhookUrl(teamId);

  if (resolved.url) {
    if (!resolved.enabled) {
      return { ok: false, error: "Discord integration is disabled in settings." };
    }
    if (!options.ignoreEventFilter && resolved.eventTypes) {
      if (resolved.eventTypes[event] === false) {
        return { ok: false, error: "This Discord event type is disabled in settings." };
      }
    }
    return postWebhook(resolved.url, content);
  }

  // No webhook row — still allow report/automation delivery via bot channel.
  if (
    options.ignoreEventFilter ||
    event === "dailySummary" ||
    event === "morningReminder"
  ) {
    return postViaBot(content);
  }

  return {
    ok: false,
    error: resolved.error || "Discord webhook is not configured.",
  };
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

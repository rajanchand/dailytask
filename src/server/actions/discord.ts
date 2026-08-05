"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { discordIntegrations, teams } from "@/server/db/schema";
import { newId } from "@/lib/utils";
import { requireUserPermission } from "@/server/session";
import { logActivity } from "@/server/services/activity";
import { testDiscordWebhook } from "@/server/services/discord";

export async function getDiscordIntegration() {
  await requireUserPermission("discord.manage");
  const [team] = await db.select().from(teams).limit(1);
  if (!team) return null;

  const [integration] = await db
    .select()
    .from(discordIntegrations)
    .where(eq(discordIntegrations.teamId, team.id))
    .limit(1);

  return integration
    ? { ...integration, teamId: team.id, teamName: team.name }
    : { teamId: team.id, teamName: team.name };
}

export async function saveDiscordIntegrationAction(formData: FormData) {
  const session = await requireUserPermission("discord.manage");
  const teamId = String(formData.get("teamId") ?? "");
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  const serverName = String(formData.get("serverName") ?? "") || null;
  const channelName = String(formData.get("channelName") ?? "") || null;
  const enabled = formData.get("enabled") === "on";

  const eventTypes = {
    taskCreated: formData.get("taskCreated") === "on",
    taskAssigned: formData.get("taskAssigned") === "on",
    statusChanged: formData.get("statusChanged") === "on",
    taskCompleted: formData.get("taskCompleted") === "on",
    taskOverdue: formData.get("taskOverdue") === "on",
    morningReminder: formData.get("morningReminder") === "on",
    dailySummary: formData.get("dailySummary") === "on",
  };

  if (!teamId || !webhookUrl) return { error: "Team and webhook URL required" };
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return { error: "Webhook URL must start with https://discord.com/api/webhooks/" };
  }

  const [existing] = await db
    .select()
    .from(discordIntegrations)
    .where(eq(discordIntegrations.teamId, teamId))
    .limit(1);

  if (existing) {
    await db
      .update(discordIntegrations)
      .set({
        webhookUrl,
        serverName,
        channelName,
        enabled,
        eventTypes,
        updatedAt: new Date(),
      })
      .where(eq(discordIntegrations.id, existing.id));
  } else {
    await db.insert(discordIntegrations).values({
      id: newId(),
      teamId,
      webhookUrl,
      serverName,
      channelName,
      enabled,
      eventTypes,
    });
  }

  await logActivity({
    userId: session.user.id,
    action: "discord.updated",
    entityType: "discord_integration",
    entityId: teamId,
  });

  revalidatePath("/discord");
  return { ok: true };
}

export async function testDiscordIntegrationAction() {
  await requireUserPermission("discord.manage");
  const [team] = await db.select().from(teams).limit(1);
  if (!team) return { error: "No team found" };

  const [integration] = await db
    .select()
    .from(discordIntegrations)
    .where(eq(discordIntegrations.teamId, team.id))
    .limit(1);

  if (integration?.webhookUrl) {
    try {
      await testDiscordWebhook(integration.webhookUrl);
      return { ok: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Test failed" };
    }
  }

  // Fall back to bot channel send (same path as Send Report without webhook)
  const { sendDiscordWebhook } = await import("@/server/services/discord");
  const sent = await sendDiscordWebhook(null, "dailySummary", "Dailytask Manager connected — Discord sync is working.", {
    ignoreEventFilter: true,
  });
  if (!sent.ok) {
    return { error: sent.error || "Save a webhook URL first (or set DISCORD_CHANNEL_ID)." };
  }
  return { ok: true };
}

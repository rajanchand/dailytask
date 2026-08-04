import "dotenv/config";
import { db } from "../src/server/db";
import { discordIntegrations, teams } from "../src/server/db/schema";
import { testDiscordWebhook } from "../src/server/services/discord";

async function main() {
  const rows = await db.select().from(discordIntegrations);
  const teamRows = await db.select().from(teams).limit(5);

  console.log(
    JSON.stringify(
      {
        teams: teamRows.map((t) => ({ id: t.id, name: t.name })),
        integrations: rows.map((r) => ({
          id: r.id,
          teamId: r.teamId,
          serverName: r.serverName,
          channelName: r.channelName,
          enabled: r.enabled,
          hasWebhook: !!r.webhookUrl,
          webhookPrefix: r.webhookUrl ? `${r.webhookUrl.slice(0, 42)}...` : null,
        })),
      },
      null,
      2,
    ),
  );

  if (!rows.length || !rows[0].webhookUrl) {
    console.error("NO_WEBHOOK_CONFIGURED");
    process.exit(2);
  }

  const integration = rows[0];
  console.log(`Testing webhook for channel=${integration.channelName ?? "(unset)"} server=${integration.serverName ?? "(unset)"}...`);

  try {
    await testDiscordWebhook(integration.webhookUrl);
    console.log("TEST_OK");
    process.exit(0);
  } catch (err) {
    console.error("TEST_FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();

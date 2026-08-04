import "dotenv/config";
import { db } from "../src/server/db";
import { discordIntegrations } from "../src/server/db/schema";
import { parseDiscordCommand, runDiscordCommand } from "../src/server/services/discord-commands";

async function post(webhookUrl: string, content: string) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  const [integration] = await db.select().from(discordIntegrations).limit(1);
  if (!integration?.webhookUrl) {
    console.error("No Discord webhook configured. Save one on /discord first.");
    process.exit(2);
  }

  const samples = [
    "help",
    "today task",
    "today total task update",
    "today complete task",
    "report",
    "weekly report",
  ];

  console.log("Sending keyword demo reports to your Discord channel...\n");

  for (const phrase of samples) {
    const command = parseDiscordCommand(phrase);
    const body = await runDiscordCommand(command);
    if (!body) {
      console.log(`SKIP: "${phrase}"`);
      continue;
    }

    const message = [`💬 **Keyword test:** \`${phrase}\``, "", body].join("\n");
    await post(integration.webhookUrl, message);
    console.log(`OK → "${phrase}"`);
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\nTEST_OK — check your Discord channel.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChannelType,
} from "discord.js";
import { parseDiscordCommand, runDiscordCommand } from "../src/server/services/discord-commands";
import { ensureRedisConnected, getRedisClient } from "../src/server/security/redis";

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error(
    "[discord-bot] Missing DISCORD_BOT_TOKEN in .env\n" +
      "Create a bot at https://discord.com/developers/applications → Bot → Reset Token\n" +
      "Enable MESSAGE CONTENT INTENT, invite bot to your server, then set DISCORD_BOT_TOKEN.",
  );
  process.exit(1);
}

const claimedLocally = new Set<string>();
const isProd = process.env.NODE_ENV === "production";

/**
 * Claim a message so only one bot process replies (guards dual Gateway sessions).
 * Production requires Redis for cross-process dedupe — without it, run a single bot replica only.
 */
async function claimMessage(messageId: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    if (isProd) {
      console.warn(
        "[discord-bot] REDIS_URL missing — duplicate replies possible if multiple bot processes run. Run exactly one bot replica.",
      );
    }
    if (claimedLocally.has(messageId)) return false;
    claimedLocally.add(messageId);
    setTimeout(() => claimedLocally.delete(messageId), 120_000).unref?.();
    return true;
  }
  try {
    await ensureRedisConnected(client);
    if (client.status !== "ready") {
      if (claimedLocally.has(messageId)) return false;
      claimedLocally.add(messageId);
      setTimeout(() => claimedLocally.delete(messageId), 120_000).unref?.();
      return true;
    }
    const result = await client.set(`discord:msg:${messageId}`, "1", "EX", 120, "NX");
    return result === "OK";
  } catch (err) {
    console.warn("[discord-bot] claimMessage redis error — falling back to in-process claim", err);
    if (claimedLocally.has(messageId)) return false;
    claimedLocally.add(messageId);
    setTimeout(() => claimedLocally.delete(messageId), 120_000).unref?.();
    return true;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[discord-bot] Logged in as ${c.user.tag}`);
  console.log(
    "[discord-bot] Listening for: today task | report | weekly report | help",
  );
  if (!process.env.REDIS_URL) {
    console.warn(
      "[discord-bot] Tip: set REDIS_URL so only one instance replies when multiple bots are online.",
    );
  }
});

function shutdown(signal: string) {
  console.log(`[discord-bot] ${signal} received — shutting down`);
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.GuildText && message.channel.type !== ChannelType.PublicThread) {
      return;
    }

    const command = parseDiscordCommand(message.content);
    if (!command) return;

    if (!(await claimMessage(message.id))) {
      console.log(`[discord-bot] skip duplicate handler for ${message.id}`);
      return;
    }

    await message.channel.sendTyping();
    const reply = await runDiscordCommand(command);
    if (!reply) return;

    // Discord message limit ~2000 chars
    if (reply.length <= 1900) {
      await message.reply({ content: reply });
    } else {
      const chunks = reply.match(/[\s\S]{1,1800}/g) ?? [reply];
      for (const chunk of chunks) {
        await message.channel.send({ content: chunk });
      }
    }
  } catch (err) {
    console.error("[discord-bot] message handler error", err);
    try {
      await message.reply("Something went wrong fetching tasks. Try again.");
    } catch {
      /* ignore */
    }
  }
});

client.login(token).catch((err) => {
  console.error("[discord-bot] login failed", err);
  process.exit(1);
});

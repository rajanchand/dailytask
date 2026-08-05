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
import { logger } from "../src/server/logger";

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  logger.error("discord_bot.missing_token");
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
      logger.warn("discord_bot.redis_missing");
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
    logger.warn("discord_bot.claim_redis_error", { err: String(err) });
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
  logger.info("discord_bot.ready", { user: c.user.tag });
  if (!process.env.REDIS_URL) {
    logger.warn("discord_bot.redis_url_unset");
  }
});

function shutdown(signal: string) {
  logger.info("discord_bot.shutdown", { signal });
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
      logger.info("discord_bot.skip_duplicate", { messageId: message.id });
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
    logger.info("discord_bot.replied", { command, messageId: message.id });
  } catch (err) {
    logger.error("discord_bot.message_handler_error", { err });
    try {
      await message.reply("Something went wrong fetching tasks. Try again.");
    } catch {
      /* ignore */
    }
  }
});

client.login(token).catch((err) => {
  logger.error("discord_bot.login_failed", { err });
  process.exit(1);
});

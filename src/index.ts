import { webhookCallback } from "grammy";
import { createServer } from "node:http";
import { env } from "./env.js";
import { createBot } from "./bot.js";
import { testConnection, closeConnection } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { restoreSchedules } from "./services/scheduler.service.js";
import { logger, createChildLogger } from "./utils/logger.js";

const log = createChildLogger("main");

async function main(): Promise<void> {
  log.info("🚀 Starting SitotaBot...");

  // ─── 1. Test database connection ───
  await testConnection();

  // ─── 2. Run migrations ───
  try {
    await runMigrations();
  } catch (error) {
    log.warn(
      { error },
      "Migration failed (may already be applied, or no migrations exist yet)"
    );
  }

  // ─── 3. Create bot ───
  const bot = createBot();

  // ─── 4. Restore scheduled giveaway endings ───
  await restoreSchedules(bot.api);

  // ─── 5. Start bot ───
  if (env.WEBHOOK_URL) {
    // Webhook mode
    log.info(
      { url: env.WEBHOOK_URL, port: env.WEBHOOK_PORT },
      "Starting in webhook mode"
    );

    const handleUpdate = webhookCallback(bot, "http", {
      secretToken: env.WEBHOOK_SECRET || undefined,
    });

    const server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/webhook") {
        try {
          await handleUpdate(req, res);
        } catch (error) {
          log.error({ error }, "Webhook handler error");
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.listen(env.WEBHOOK_PORT, () => {
      log.info(`Webhook server listening on port ${env.WEBHOOK_PORT}`);
    });

    // Set webhook with Telegram
    await bot.api.setWebhook(`${env.WEBHOOK_URL}/webhook`, {
      secret_token: env.WEBHOOK_SECRET || undefined,
      allowed_updates: [
        "message",
        "callback_query",
        "chat_member",
        "my_chat_member",
      ],
    });

    log.info("✅ Webhook set successfully");

    // Graceful shutdown
    const shutdown = async () => {
      log.info("Shutting down...");
      server.close();
      await bot.api.deleteWebhook();
      await closeConnection();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    // Long-polling mode
    log.info("Starting in long-polling mode");

    await bot.api.deleteWebhook();

    bot.start({
      allowed_updates: [
        "message",
        "callback_query",
        "chat_member",
        "my_chat_member",
      ],
      onStart: (info) => {
        log.info(
          { username: info.username, id: info.id },
          `✅ Bot @${info.username} is running!`
        );
      },
    });

    // Graceful shutdown
    const shutdown = async () => {
      log.info("Shutting down...");
      await bot.stop();
      await closeConnection();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main().catch((error) => {
  logger.fatal({ error }, "Fatal error during startup");
  process.exit(1);
});

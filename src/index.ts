import app from "./app";
import { logger } from "./lib/logger";
import { initBot } from "./bot/bot";
import { pool } from "./db";
import { readFileSync } from "node:fs";
import path from "node:path";
import TelegramBot from "node-telegram-bot-api";

async function runMigrations() {
  const sql = readFileSync(path.resolve(process.cwd(), "init.sql"), "utf-8");
  await pool.query(sql);
  logger.info("Tabelas criadas/verificadas com sucesso");
}

async function clearWebhook() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const tmp = new TelegramBot(token, { polling: false });
    await tmp.deleteWebhook();
    logger.info("Webhook removido, iniciando polling...");
  } catch (err: any) {
    logger.warn({ error: err.message }, "Nao foi possivel remover webhook, continuando mesmo assim...");
  }
}

const port = Number(process.env.PORT || 3000);

async function main() {
  await runMigrations();
  await clearWebhook();

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
    try {
      initBot();
      logger.info("Orbita Pix Bot iniciado!");
    } catch (botErr) {
      logger.error({ err: botErr }, "Falha ao iniciar o bot Telegram");
    }
  });
}

main().catch((err) => {
  logger.error({ err }, "Erro critico ao iniciar, encerrando");
  process.exit(1);
});

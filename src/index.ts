import app from "./app";
import { logger } from "./lib/logger";
import { initBot } from "./bot/bot";
import { pool } from "./db";
import { readFileSync } from "node:fs";
import path from "node:path";

async function runMigrations() {
  const sql = readFileSync(path.resolve(process.cwd(), "init.sql"), "utf-8");
  await pool.query(sql);
  logger.info("Tabelas criadas/verificadas com sucesso");
}

const port = Number(process.env.PORT || 3000);

async function main() {
  await runMigrations();

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

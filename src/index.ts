import app from "./app";
import { logger } from "./lib/logger";
import { initBot } from "./bot/bot";

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  logger.info({ port }, "Server listening");

  try {
    initBot();
    logger.info("Orbita Pix Bot iniciado!");
  } catch (botErr) {
    logger.error({ err: botErr }, "Falha ao iniciar o bot Telegram");
  }
});

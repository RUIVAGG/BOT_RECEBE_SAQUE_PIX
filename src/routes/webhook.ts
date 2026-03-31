import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { confirmPayment, getPendingPayment } from "../bot/paymentTracker";

const webhookRouter = Router();

webhookRouter.post("/webhook/vizzionpay", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    logger.info({ event: body.event, transactionId: body.transaction?.id, status: body.transaction?.status }, "Webhook VizzionPay recebido");

    if (!body.transaction) {
      res.status(200).json({ ok: true });
      return;
    }

    const txId = body.transaction.id;
    const clientId = body.transaction.identifier;
    const status = body.transaction.status;

    if (status === "COMPLETED" || status === "completed" || status === "PAID" || status === "paid") {
      let confirmed = false;
      if (txId) confirmed = await confirmPayment(txId);
      if (!confirmed && clientId) confirmed = await confirmPayment(clientId);

      if (confirmed) {
        logger.info({ txId, clientId }, "Pagamento confirmado via webhook");
      } else {
        logger.warn({ txId, clientId }, "Webhook recebido mas pagamento não encontrado no tracker");
      }
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    logger.error({ error: err.message }, "Erro ao processar webhook");
    res.status(200).json({ ok: true });
  }
});

export default webhookRouter;

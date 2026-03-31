import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import {
  getUserById,
  updateTransactionStatus,
  updateUserBalance,
  getAllSettings,
} from "./db";
import { formatCurrency } from "./messages";
import { mainMenuKeyboard } from "./keyboards";
import { sendRealNotification, notifyPixRecebido, buildPixFees } from "./notifications";

interface PendingPayment {
  txId: number;
  userId: number;
  netAmount: number;
  grossAmount: number;
  telegramId: string;
  externalId: string;
  createdAt: number;
}

const pendingPayments = new Map<string, PendingPayment>();

let botInstance: TelegramBot | null = null;

export function setBotInstance(bot: TelegramBot) {
  botInstance = bot;
}

export function getBotInstance(): TelegramBot | null {
  return botInstance;
}

export function trackPayment(transactionId: string, payment: PendingPayment) {
  pendingPayments.set(transactionId, payment);
  logger.info({ transactionId, txId: payment.txId }, "Pagamento rastreado para confirmação");
}

export function getPendingPayment(transactionId: string): PendingPayment | undefined {
  return pendingPayments.get(transactionId);
}

export function removePendingPayment(transactionId: string) {
  pendingPayments.delete(transactionId);
}

export function getAllPendingPayments(): Map<string, PendingPayment> {
  return pendingPayments;
}

export async function confirmPayment(transactionId: string): Promise<boolean> {
  const payment = pendingPayments.get(transactionId);
  if (!payment) {
    logger.warn({ transactionId }, "Pagamento não encontrado no tracker");
    return false;
  }

  const bot = botInstance;
  if (!bot) {
    logger.error("Bot não inicializado para confirmar pagamento");
    return false;
  }

  try {
    await updateTransactionStatus(payment.txId, "completed");
    const u = await getUserById(payment.userId);
    if (u) {
      const newBalance = (parseFloat(u.balance || "0") + payment.netAmount).toFixed(2);
      await updateUserBalance(payment.userId, newBalance);
      await bot.sendMessage(payment.telegramId,
        `🎉 *Pix Recebido com Sucesso!*\n\n✅ Valor creditado: *${formatCurrency(payment.netAmount)}*\n💼 Novo saldo: *${formatCurrency(newBalance)}*`,
        { parse_mode: "Markdown", reply_markup: mainMenuKeyboard() }
      );
      const pixRecFees = buildPixFees(payment.grossAmount, await getAllSettings());
      sendRealNotification(bot, notifyPixRecebido(pixRecFees));
    }
    pendingPayments.delete(transactionId);
    logger.info({ transactionId, txId: payment.txId }, "Pagamento confirmado via webhook");
    return true;
  } catch (err: any) {
    logger.error({ error: err.message, transactionId }, "Erro ao confirmar pagamento");
    return false;
  }
}

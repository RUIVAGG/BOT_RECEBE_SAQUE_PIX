import TelegramBot from "node-telegram-bot-api";
import { getAllSettings } from "./db";
import { logger } from "../lib/logger";

function now() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const data = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return { hora, data };
}

function fmt(amount: number): string {
  return `R$ ${amount.toFixed(2)}`;
}

export interface PixFees {
  gross: number;
  gatewayFee: number;
  gatewayPct: string;
  platformFee: number;
  platformPct: string;
  net: number;
}

export interface SaqueFees {
  gross: number;
  gatewayFee: number;
  withdrawalFee: number;
  withdrawalPct: string;
  net: number;
}

export function notifySolicitacaoRecebimento(fees: PixFees): string {
  const { hora, data } = now();
  return (
    `💰 𝗦𝗢𝗟𝗜𝗖𝗜𝗧𝗔𝗖̧𝗔̃𝗢 𝗗𝗘 𝗥𝗘𝗖𝗘𝗕𝗜𝗠𝗘𝗡𝗧𝗢 𝗣𝗜𝗫\n\n` +
    `💲 Valor solicitado: ${fmt(fees.gross)}\n` +
    `📉 Taxa gateway (fixa): -${fmt(fees.gatewayFee)}\n` +
    `📉 Taxa plataforma (${fees.platformPct}%): -${fmt(fees.platformFee)}\n` +
    `✅ Valor líquido: ${fmt(fees.net)}\n\n` +
    `🕐 ${hora}  📅 ${data}\n\n` +
    `⏳ Aguardando pagamento...`
  );
}

export function notifyPixRecebido(fees: PixFees): string {
  const { hora, data } = now();
  return (
    `✅ 𝗣𝗜𝗫 𝗥𝗘𝗖𝗘𝗕𝗜𝗗𝗢 𝗖𝗢𝗠 𝗦𝗨𝗖𝗘𝗦𝗦𝗢\n\n` +
    `💲 Valor pago: ${fmt(fees.gross)}\n` +
    `📉 Taxa gateway (fixa): -${fmt(fees.gatewayFee)}\n` +
    `📉 Taxa plataforma (${fees.platformPct}%): -${fmt(fees.platformFee)}\n` +
    `💰 Creditado em saldo: ${fmt(fees.net)}\n\n` +
    `🕐 ${hora}  📅 ${data}\n\n` +
    `🎉 Obrigado pela preferência!`
  );
}

export function notifySolicitacaoSaque(fees: SaqueFees): string {
  const { hora, data } = now();
  return (
    `📤 𝗦𝗢𝗟𝗜𝗖𝗜𝗧𝗔𝗖̧𝗔̃𝗢 𝗗𝗘 𝗦𝗔𝗤𝗨𝗘 𝗩𝗜𝗔 𝗣𝗜𝗫\n\n` +
    `💲 Valor do saque: ${fmt(fees.gross)}\n` +
    `📉 Taxa gateway (fixa): -${fmt(fees.gatewayFee)}\n` +
    `📉 Taxa de saque (${fees.withdrawalPct}%): -${fmt(fees.withdrawalFee)}\n` +
    `💰 Valor a receber: ${fmt(fees.net)}\n\n` +
    `🕐 ${hora}  📅 ${data}\n\n` +
    `⏳ Processando saque...`
  );
}

export function notifySaqueConcluido(fees: SaqueFees): string {
  const { hora, data } = now();
  return (
    `✅ 𝗦𝗔𝗤𝗨𝗘 𝗥𝗘𝗔𝗟𝗜𝗭𝗔𝗗𝗢 𝗖𝗢𝗠 𝗦𝗨𝗖𝗘𝗦𝗦𝗢\n\n` +
    `💲 Valor do saque: ${fmt(fees.gross)}\n` +
    `📉 Taxa gateway (fixa): -${fmt(fees.gatewayFee)}\n` +
    `📉 Taxa de saque (${fees.withdrawalPct}%): -${fmt(fees.withdrawalFee)}\n` +
    `💰 Valor recebido: ${fmt(fees.net)}\n\n` +
    `🕐 ${hora}  📅 ${data}\n\n` +
    `💸 Pix enviado com sucesso! Aproveite!`
  );
}

export function notifyNovoInscrito(): string {
  const { hora, data } = now();
  return (
    `🆕 𝗡𝗢𝗩𝗢 𝗜𝗡𝗦𝗖𝗥𝗜𝗧𝗢 𝗡𝗔 𝗣𝗟𝗔𝗧𝗔𝗙𝗢𝗥𝗠𝗔\n\n` +
    `🕐 ${hora}  📅 ${data}\n\n` +
    `🎉 Bem-vindo à Orbita Pix!`
  );
}

export function buildPixFees(gross: number, settings: Record<string, string>): PixFees {
  const gatewayFee = parseFloat(settings.gatewayFeeFixed || "1");
  const platformPctNum = parseFloat(settings.platformFeePercent || "5");
  const platformFee = parseFloat(((gross - gatewayFee) * (platformPctNum / 100)).toFixed(2));
  const net = parseFloat((gross - gatewayFee - platformFee).toFixed(2));
  return {
    gross,
    gatewayFee,
    gatewayPct: String(gatewayFee),
    platformFee,
    platformPct: String(platformPctNum),
    net,
  };
}

export function buildSaqueFees(gross: number, settings: Record<string, string>): SaqueFees {
  const gatewayFee = parseFloat(settings.withdrawalGatewayFeeFixed || "1");
  const withdrawalPctNum = parseFloat(settings.withdrawalFeePercent || "5");
  const withdrawalFee = parseFloat((gross * (withdrawalPctNum / 100)).toFixed(2));
  const net = parseFloat((gross - gatewayFee - withdrawalFee).toFixed(2));
  return {
    gross,
    gatewayFee,
    withdrawalFee,
    withdrawalPct: String(withdrawalPctNum),
    net,
  };
}

export async function sendRealNotification(bot: TelegramBot, message: string) {
  const settings = await getAllSettings();
  if (settings.realNotificationsEnabled !== "true") return;

  const adminId = process.env.ADMIN_TELEGRAM_ID!;
  const groupId = settings.notifyGroupId || "";

  try { await bot.sendMessage(adminId, message); } catch (err: any) {
    logger.error({ error: err.message }, "Erro ao enviar notificação ao admin");
  }

  if (groupId) {
    try { await bot.sendMessage(groupId, message); } catch (err: any) {
      logger.error({ error: err.message, groupId }, "Erro ao enviar notificação ao grupo");
    }
  }
}

let fakeRunning = false;
const fakeTimers: ReturnType<typeof setTimeout>[] = [];
let sessionSpawner: ReturnType<typeof setTimeout> | null = null;

const fakeAmounts = [
  15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  110, 120, 130, 140, 150, 175, 200, 250, 300, 350, 400, 450, 500, 600, 700,
  800, 900, 1000, 1200, 1500, 2000, 2500, 3000, 5000,
];

function randomAmount(): number {
  return fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function minutesToMs(min: number, max: number): number {
  const jitter = 0.2;
  const base = randomBetween(min, max);
  const variation = base * jitter;
  const final = base + (Math.random() * variation * 2 - variation);
  return Math.max(5000, Math.round(final * 60 * 1000));
}

function scheduleTimer(fn: () => void, delayMs: number) {
  const timer = setTimeout(() => {
    const idx = fakeTimers.indexOf(timer);
    if (idx >= 0) fakeTimers.splice(idx, 1);
    if (fakeRunning) fn();
  }, delayMs);
  fakeTimers.push(timer);
}

async function sendToGroup(bot: TelegramBot, message: string): Promise<boolean> {
  if (!fakeRunning) return false;
  const settings = await getAllSettings();
  const groupId = settings.notifyGroupId;
  if (!groupId) return false;
  try {
    await bot.sendMessage(groupId, message);
    return true;
  } catch (err: any) {
    logger.error({ error: err.message }, "Erro ao enviar fake ao grupo");
    return false;
  }
}

async function runFakeSession(bot: TelegramBot) {
  if (!fakeRunning) return;

  const settings = await getAllSettings();
  const grossAmount = randomAmount();

  const pixFees = buildPixFees(grossAmount, settings);
  const saqueFees = buildSaqueFees(pixFees.net, settings);

  const delay1Min = parseInt(settings.fakeDelay1Min || "10");
  const delay1Max = parseInt(settings.fakeDelay1Max || "15");
  const delay2Min = parseInt(settings.fakeDelay2Min || "3");
  const delay2Max = parseInt(settings.fakeDelay2Max || "7");
  const delay3Min = parseInt(settings.fakeDelay3Min || "15");
  const delay3Max = parseInt(settings.fakeDelay3Max || "25");

  const sent = await sendToGroup(bot, notifySolicitacaoRecebimento(pixFees));
  if (!sent) return;

  const d1 = minutesToMs(delay1Min, delay1Max);
  scheduleTimer(async () => {
    const sent2 = await sendToGroup(bot, notifyPixRecebido(pixFees));
    if (!sent2) return;

    const d2 = minutesToMs(delay2Min, delay2Max);
    scheduleTimer(async () => {
      const sent3 = await sendToGroup(bot, notifySolicitacaoSaque(saqueFees));
      if (!sent3) return;

      const d3 = minutesToMs(delay3Min, delay3Max);
      scheduleTimer(async () => {
        await sendToGroup(bot, notifySaqueConcluido(saqueFees));
      }, d3);
    }, d2);
  }, d1);
}

async function spawnNewSessions(bot: TelegramBot) {
  if (!fakeRunning) return;

  const settings = await getAllSettings();
  if (settings.fakeNotificationsEnabled !== "true") {
    fakeRunning = false;
    return;
  }

  await runFakeSession(bot);

  const minMin = parseInt(settings.fakeNewSessionMin || "2");
  const maxMin = parseInt(settings.fakeNewSessionMax || "6");
  const nextDelay = minutesToMs(minMin, maxMin);

  sessionSpawner = setTimeout(() => {
    if (fakeRunning) spawnNewSessions(bot);
  }, nextDelay);
}

export function startFakeNotifications(bot: TelegramBot) {
  if (fakeRunning) return;
  fakeRunning = true;
  logger.info("Notificações fake INICIADAS — sistema orgânico");

  const initialDelay = randomBetween(3, 10) * 1000;
  sessionSpawner = setTimeout(() => {
    if (fakeRunning) spawnNewSessions(bot);
  }, initialDelay);
}

export function stopFakeNotifications() {
  fakeRunning = false;
  for (const t of fakeTimers) clearTimeout(t);
  fakeTimers.length = 0;
  if (sessionSpawner) {
    clearTimeout(sessionSpawner);
    sessionSpawner = null;
  }
  logger.info("Notificações fake PARADAS — todos os timers cancelados");
}

export function pauseFakeNotifications() {
  fakeRunning = false;
  if (sessionSpawner) {
    clearTimeout(sessionSpawner);
    sessionSpawner = null;
  }
  logger.info("Notificações fake PAUSADAS — sessões pendentes continuam, mas novas não iniciam");
}

export function isFakeRunning(): boolean {
  return fakeRunning;
}

export function getActiveTimersCount(): number {
  return fakeTimers.length;
}

export async function autoStartFakeIfEnabled(bot: TelegramBot) {
  const settings = await getAllSettings();
  if (settings.fakeNotificationsEnabled === "true" && settings.notifyGroupId) {
    startFakeNotifications(bot);
  }
}

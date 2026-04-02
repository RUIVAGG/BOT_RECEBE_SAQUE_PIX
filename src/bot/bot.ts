import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import {
  findOrCreateUser,
  getUserByTelegramId,
  acceptTerms,
  updateUserBalance,
  updatePixKey,
  updateUserDocument,
  blockUser,
  getAllUsers,
  getUserById,
  createTransaction,
  updateTransactionStatus,
  updateTransactionExternalId,
  getTransactionById,
  getUserTransactions,
  getPendingWithdrawals,
  getAllTransactions,
  createSupportTicket,
  getOpenTickets,
  resolveTicket,
  getStats,
  getAllSettings,
  setSetting,
} from "./db";
import {
  createPixCharge,
  checkPixStatus,
  createPixWithdrawal,
  getProducerBalance,
} from "./efipay";
import {
  buildTerms,
  buildFees,
  WELCOME,
  formatCurrency,
  calcDeposit,
  calcWithdrawal,
} from "./messages";
import {
  mainMenuKeyboard,
  termsKeyboard,
  backToMenuKeyboard,
  depositKeyboard,
  withdrawKeyboard,
  pixKeyTypeKeyboard,
  confirmWithdrawKeyboard,
  adminMainKeyboard,
  adminSettingsKeyboard,
  adminNotificationsKeyboard,
  adminUserActionsKeyboard,
  adminWithdrawActionsKeyboard,
} from "./keyboards";
import {
  sendRealNotification,
  notifyNovoInscrito,
  notifySolicitacaoRecebimento,
  notifyPixRecebido,
  notifySolicitacaoSaque,
  notifySaqueConcluido,
  buildPixFees,
  buildSaqueFees,
  startFakeNotifications,
  stopFakeNotifications,
  pauseFakeNotifications,
  isFakeRunning,
  getActiveTimersCount,
  autoStartFakeIfEnabled,
} from "./notifications";
import { setBotInstance, trackPayment, confirmPayment, removePendingPayment, getPendingPayment } from "./paymentTracker";

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID!;

const userSessions: Record<string, { state: string; data: Record<string, any> }> = {};

function getSession(telegramId: string) {
  if (!userSessions[telegramId]) userSessions[telegramId] = { state: "idle", data: {} };
  return userSessions[telegramId];
}
function clearSession(telegramId: string) {
  userSessions[telegramId] = { state: "idle", data: {} };
}

// ============ Enviar boas-vindas com ou sem imagem ============
async function sendWelcome(bot: TelegramBot, chatId: number, name: string, settings: Record<string, string>, keyboard: TelegramBot.InlineKeyboardMarkup) {
  const text = WELCOME(name, settings.welcomeText || "💫 Sua plataforma para receber e sacar Pix com total segurança.\n\nEscolha uma opção abaixo:", settings.botName || "NexiumPix | Payments");
  const imageId = settings.welcomeImage || "";

  if (imageId) {
    try {
      await bot.sendPhoto(chatId, imageId, {
        caption: text,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    } catch { }
  }
  await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: keyboard });
}

async function editOrSendWelcome(bot: TelegramBot, chatId: number, msgId: number, name: string, settings: Record<string, string>) {
  const text = WELCOME(name, settings.welcomeText || "💫 Sua plataforma para receber e sacar Pix com total segurança.\n\nEscolha uma opção abaixo:", settings.botName || "NexiumPix | Payments");
  const imageId = settings.welcomeImage || "";

  if (imageId) {
    // Não tem como editar foto, então apagamos e enviamos nova
    try { await bot.deleteMessage(chatId, msgId); } catch { }
    await sendWelcome(bot, chatId, name, settings, mainMenuKeyboard());
    return;
  }
  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: msgId,
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
}

export function initBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  const bot = new TelegramBot(token, { polling: true });
setBotInstance(bot);
bot.on("polling_error", () => {});

  // ============ /start ============
  bot.onText(/\/start/, async (msg) => {
    try {
    const telegramId = String(msg.from!.id);
    const firstName = msg.from?.first_name || "Usuário";
    clearSession(telegramId);

    const existingUser = await getUserByTelegramId(telegramId);
    const isNewUser = !existingUser;

    const user = await findOrCreateUser(telegramId, msg.from?.username, firstName, msg.from?.last_name);
    if (user.blocked) {
      await bot.sendMessage(msg.chat.id, "⛔ Sua conta foi suspensa. Entre em contato com o suporte.");
      return;
    }

    const settings = await getAllSettings();

    if (isNewUser) {
      sendRealNotification(bot, notifyNovoInscrito(settings.botName || "NexiumPix | Payments"));
    }

    if (!user.acceptedTerms) {
      await bot.sendMessage(msg.chat.id, buildTerms(settings), {
        parse_mode: "Markdown",
        reply_markup: termsKeyboard(),
      });
      return;
    }

    await sendWelcome(bot, msg.chat.id, firstName, settings, mainMenuKeyboard());
    } catch (err: any) {
      logger.error({ error: err.message }, "Erro no /start");
    }
  });

  // ============ /admin ============
  bot.onText(/\/admin/, async (msg) => {
    try {
    if (String(msg.from!.id) !== ADMIN_ID) {
      await bot.sendMessage(msg.chat.id, "⛔ Acesso negado.");
      return;
    }
    const settings = await getAllSettings();
    await bot.sendMessage(msg.chat.id, `🛸 *PAINEL ADMIN — ${settings.botName || "NexiumPix | Payments"}*`, {
      parse_mode: "Markdown",
      reply_markup: adminMainKeyboard(),
    });
    } catch (err: any) {
      logger.error({ error: err.message }, "Erro no /admin");
    }
  });

  // ============ Fotos (imagem de boas-vindas) ============
  bot.on("photo", async (msg) => {
    try {
    const telegramId = String(msg.from!.id);
    if (telegramId !== ADMIN_ID) return;
    const session = getSession(telegramId);
    if (session.state !== "admin_set_welcome_image") return;

    // Pegar a maior resolução da foto
    const photos = msg.photo!;
    const fileId = photos[photos.length - 1].file_id;
    await setSetting("welcomeImage", fileId);
    clearSession(telegramId);
    await bot.sendMessage(msg.chat.id, "✅ Imagem de boas-vindas atualizada com sucesso!", {
      reply_markup: adminSettingsKeyboard(),
    });
    } catch (err: any) {
      logger.error({ error: err.message }, "Erro no photo handler");
    }
  });

  // ============ Mensagens de texto ============
  bot.on("message", async (msg) => {
    try {
    if (!msg.text || msg.text.startsWith("/")) return;
    const telegramId = String(msg.from!.id);
    const session = getSession(telegramId);
    const text = msg.text.trim();

    // ---- Admin: Broadcast ----
    if (telegramId === ADMIN_ID && session.state === "admin_broadcast") {
      const settings = await getAllSettings();
      const users = await getAllUsers(1000, 0);
      let sent = 0;
      for (const u of users) {
        try {
          await bot.sendMessage(u.telegramId, `📢 *Mensagem da ${settings.botName || "NexiumPix | Payments"}:*\n\n${text}`, { parse_mode: "Markdown" });
          sent++;
        } catch { }
      }
      clearSession(telegramId);
      await bot.sendMessage(msg.chat.id, `✅ Mensagem enviada para ${sent} usuários.`, { reply_markup: adminMainKeyboard() });
      return;
    }

    // ---- Admin: Resposta de ticket ----
    if (telegramId === ADMIN_ID && session.state === "admin_reply_ticket") {
      const ticketId = session.data.ticketId;
      const userTelegramId = session.data.userTelegramId;
      const settings = await getAllSettings();
      await resolveTicket(ticketId, text);
      await bot.sendMessage(userTelegramId, `📩 *Resposta do Suporte ${settings.botName || "NexiumPix | Payments"}:*\n\n${text}`, { parse_mode: "Markdown" });
      clearSession(telegramId);
      await bot.sendMessage(msg.chat.id, "✅ Resposta enviada ao usuário.", { reply_markup: adminMainKeyboard() });
      return;
    }

    // ---- Admin: Adicionar saldo ----
    if (telegramId === ADMIN_ID && session.state === "admin_add_balance") {
      const uid = session.data.targetUserId;
      const val = parseFloat(text.replace(",", ".").replace("R$", "").trim());
      if (isNaN(val) || val <= 0) {
        await bot.sendMessage(msg.chat.id, "❌ Valor inválido. Digite um número positivo:");
        return;
      }
      const u = await getUserById(uid);
      if (!u) { clearSession(telegramId); return; }
      const newBal = (parseFloat(u.balance || "0") + val).toFixed(2);
      await updateUserBalance(uid, newBal);
      clearSession(telegramId);
      await bot.sendMessage(msg.chat.id,
        `✅ *Saldo adicionado!*\n\n👤 ${u.firstName}\n➕ Adicionado: *${formatCurrency(val)}*\n💼 Novo saldo: *${formatCurrency(newBal)}*`,
        { parse_mode: "Markdown", reply_markup: adminUserActionsKeyboard(uid, !!u.blocked) }
      );
      return;
    }

    // ---- Admin: Remover saldo ----
    if (telegramId === ADMIN_ID && session.state === "admin_remove_balance") {
      const uid = session.data.targetUserId;
      const val = parseFloat(text.replace(",", ".").replace("R$", "").trim());
      if (isNaN(val) || val <= 0) {
        await bot.sendMessage(msg.chat.id, "❌ Valor inválido. Digite um número positivo:");
        return;
      }
      const u = await getUserById(uid);
      if (!u) { clearSession(telegramId); return; }
      const current = parseFloat(u.balance || "0");
      const actualRemoved = Math.min(val, current);
      const newBal = Math.max(0, current - val).toFixed(2);
      await updateUserBalance(uid, newBal);
      clearSession(telegramId);
      await bot.sendMessage(msg.chat.id,
        `✅ *Saldo removido!*\n\n👤 ${u.firstName}\n➖ Removido: *${formatCurrency(actualRemoved)}*${actualRemoved < val ? `\n⚠️ Solicitado ${formatCurrency(val)} mas saldo era ${formatCurrency(current)}` : ""}\n💼 Novo saldo: *${formatCurrency(newBal)}*`,
        { parse_mode: "Markdown", reply_markup: adminUserActionsKeyboard(uid, !!u.blocked) }
      );
      return;
    }

    // ---- Admin: Editar configurações ----
    if (telegramId === ADMIN_ID && session.state.startsWith("admin_setting_")) {
      const settingKey = session.state.replace("admin_setting_", "");
      const numericKeys = ["platformFeePercent", "gatewayFeeFixed", "withdrawalGatewayFeeFixed", "withdrawalFeePercent", "minDeposit", "minWithdrawal", "fakeDelay1Min", "fakeDelay1Max", "fakeDelay2Min", "fakeDelay2Max", "fakeDelay3Min", "fakeDelay3Max", "fakeNewSessionMin", "fakeNewSessionMax"];

      if (numericKeys.includes(settingKey)) {
        const val = parseFloat(text.replace(",", ".").replace("R$", "").replace("%", "").trim());
        if (isNaN(val) || val < 0) {
          await bot.sendMessage(msg.chat.id, "❌ Valor inválido. Digite um número positivo:");
          return;
        }
        await setSetting(settingKey, String(val));
      } else {
        await setSetting(settingKey, text);
      }

      const delayMinToMaxMap: Record<string, { maxKey: string; label: string }> = {
        fakeDelay1Min: { maxKey: "fakeDelay1Max", label: "Tempo 1: Pix Solicitar → Pix Recebido" },
        fakeDelay2Min: { maxKey: "fakeDelay2Max", label: "Tempo 2: Pix Recebido → Solicitar Saque" },
        fakeDelay3Min: { maxKey: "fakeDelay3Max", label: "Tempo 3: Solicitar Saque → Saque Concluído" },
        fakeNewSessionMin: { maxKey: "fakeNewSessionMax", label: "Tempo 4: Intervalo Novo Cliente" },
      };

      if (delayMinToMaxMap[settingKey]) {
        const { maxKey, label } = delayMinToMaxMap[settingKey];
        session.state = `admin_setting_${maxKey}`;
        await bot.sendMessage(msg.chat.id, `✅ Mínimo salvo!\n\n⏱️ *${label}*\n\nAgora digite o tempo *máximo* (em minutos):`, {
          parse_mode: "Markdown",
        });
        return;
      }

      const maxToMinMap: Record<string, string> = {
        fakeDelay1Max: "fakeDelay1Min",
        fakeDelay2Max: "fakeDelay2Min",
        fakeDelay3Max: "fakeDelay3Min",
        fakeNewSessionMax: "fakeNewSessionMin",
      };
      if (maxToMinMap[settingKey]) {
        const currentSettings = await getAllSettings();
        const minVal = parseFloat(currentSettings[maxToMinMap[settingKey]] || "1");
        const maxVal = parseFloat(text.replace(",", ".").trim());
        if (maxVal < minVal) {
          await bot.sendMessage(msg.chat.id, `❌ O máximo (${maxVal}) não pode ser menor que o mínimo (${minVal}). Digite novamente:`);
          return;
        }
      }

      clearSession(telegramId);
      const labels: Record<string, string> = {
        botName: "Nome do Bot",
          termsText: "Termos de Uso",
          welcomeText: "Texto de boas-vindas",
        platformFeePercent: "Taxa da plataforma",
        gatewayFeeFixed: "Taxa gateway receber",
        withdrawalGatewayFeeFixed: "Taxa gateway saque",
        withdrawalFeePercent: "Taxa de saque (%)",
        minDeposit: "Mínimo de recarga",
        minWithdrawal: "Mínimo de saque",
        notifyGroupId: "ID do grupo de notificações",
        fakeDelay1Max: "Tempo 1 (Pix Solicitar→Receber)",
        fakeDelay2Max: "Tempo 2 (Receber→Solicitar Saque)",
        fakeDelay3Max: "Tempo 3 (Saque Solicitar→Concluir)",
        fakeNewSessionMax: "Tempo 4 (Novo Cliente)",
      };
      const notifKeys = ["notifyGroupId", "fakeDelay1Max", "fakeDelay2Max", "fakeDelay3Max", "fakeNewSessionMax"];
      const replyKb = notifKeys.includes(settingKey)
        ? adminNotificationsKeyboard((await getAllSettings()).fakeNotificationsEnabled === "true", (await getAllSettings()).realNotificationsEnabled === "true")
        : adminSettingsKeyboard();
      await bot.sendMessage(msg.chat.id, `✅ *${labels[settingKey] || settingKey}* atualizado com sucesso!`, {
        parse_mode: "Markdown",
        reply_markup: replyKb,
      });
      return;
    }

    const user = await getUserByTelegramId(telegramId);
    if (!user || user.blocked || !user.acceptedTerms) return;

    const settings = await getAllSettings();
    const minDeposit = parseFloat(settings.minDeposit || "2");
    const minWithdrawal = parseFloat(settings.minWithdrawal || "5");

    // ---- Aguardando valor de depósito customizado ----
    if (session.state === "waiting_deposit_amount") {
      const amount = parseFloat(text.replace(",", ".").replace("R$", "").trim());
      if (isNaN(amount) || amount < minDeposit) {
        await bot.sendMessage(msg.chat.id, `❌ Valor inválido. O mínimo é *${formatCurrency(minDeposit)}*. Tente novamente:`, {
          parse_mode: "Markdown",
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      clearSession(telegramId);
      await processDeposit(bot, msg.chat.id, telegramId, user, amount, settings);
      return;
    }

    // ---- Aguardando chave Pix ----
    if (session.state === "waiting_pix_key") {
      await updatePixKey(telegramId, text, session.data.pixKeyType);
      clearSession(telegramId);
      await bot.sendMessage(msg.chat.id, `✅ Chave Pix (${session.data.pixKeyType}) salva!\n\n🔑 *${text}*`, {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(),
      });
      return;
    }

    // ---- Aguardando CPF/CNPJ para saque ----
    if (session.state === "waiting_withdraw_document") {
      const doc = text.replace(/\D/g, "");
      if (doc.length < 11) {
        await bot.sendMessage(msg.chat.id, "❌ CPF/CNPJ inválido. Digite somente os números:");
        return;
      }
      session.data.ownerDocument = doc;
      await updateUserDocument(user.id, doc);
      await showWithdrawConfirmation(bot, msg.chat.id, session, settings, telegramId);
      return;
    }

    // ---- Aguardando valor de saque customizado ----
    if (session.state === "waiting_withdraw_amount") {
      const amount = parseFloat(text.replace(",", ".").replace("R$", "").trim());
      const balance = parseFloat(user.balance || "0");
      if (isNaN(amount) || amount < minWithdrawal) {
        await bot.sendMessage(msg.chat.id, `❌ Valor inválido. O mínimo é *${formatCurrency(minWithdrawal)}*.`, {
          parse_mode: "Markdown",
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      if (amount > balance) {
        await bot.sendMessage(msg.chat.id, `❌ Saldo insuficiente. Seu saldo é *${formatCurrency(balance)}*.`, {
          parse_mode: "Markdown",
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      session.data.withdrawAmount = amount;
      const resolvedDoc = resolveUserDocument(user);
      if (resolvedDoc) {
        session.data.ownerDocument = resolvedDoc;
        await showWithdrawConfirmation(bot, msg.chat.id, session, settings, telegramId);
      } else {
        session.state = "waiting_withdraw_document";
        await bot.sendMessage(msg.chat.id,
          "📄 *CPF Obrigatório para Saque*\n\nInforme o *CPF do titular* da conta bancária onde sua chave Pix está cadastrada (somente números).\n\n⚠️ O CPF deve ser do *dono da conta bancária*, não a chave Pix em si.\n\n❌ Se o CPF estiver incorreto, o saque será recusado e você deverá entrar em contato com o *Suporte* para liberação manual.\n\nVocê só precisa informar uma vez.",
          { parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
        );
      }
      return;
    }

    // ---- Aguardando mensagem de suporte ----
    if (session.state === "waiting_support_message") {
      await createSupportTicket(user.id, telegramId, text);
      clearSession(telegramId);
      await bot.sendMessage(ADMIN_ID,
        `🎧 *Novo Ticket de Suporte!*\n\nUsuário: ${user.firstName} (@${user.username || "sem_username"})\nTelegram ID: ${telegramId}\n\n*Mensagem:*\n${text}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "💬 Responder", callback_data: `admin_reply_ticket_${telegramId}_1` }]],
          },
        }
      );
      await bot.sendMessage(msg.chat.id, "✅ Sua mensagem foi enviada para o suporte! Aguarde nossa resposta.", {
        reply_markup: mainMenuKeyboard(),
      });
      return;
    }
    } catch (err: any) {
      logger.error({ error: err.message }, "Erro no message handler");
    }
  });

  const origEdit = bot.editMessageText.bind(bot);
  bot.editMessageText = (async (text: string, options?: any) => {
    try {
      return await origEdit(text, options);
    } catch (err: any) {
      if (err?.response?.body?.description?.includes("no text in the message to edit") ||
          err?.response?.body?.description?.includes("message to edit not found")) {
        const cid = options?.chat_id;
        const mid = options?.message_id;
        if (cid && mid) {
          try { await bot.deleteMessage(cid, mid); } catch { }
        }
        return await bot.sendMessage(cid, text, {
          parse_mode: options?.parse_mode,
          reply_markup: options?.reply_markup,
        }) as any;
      }
      throw err;
    }
  }) as any;

  // ============ Callbacks ============
  bot.on("callback_query", async (query) => {
    try {
    const telegramId = String(query.from.id);
    const chatId = query.message!.chat.id;
    const msgId = query.message!.message_id;
    const data = query.data!;
    try { await bot.answerCallbackQuery(query.id); } catch { }

    // ---- ACEITAR TERMOS ----
    if (data === "accept_terms") {
      await acceptTerms(telegramId);
      const user = await getUserByTelegramId(telegramId);
      const settings = await getAllSettings();
      try { await bot.deleteMessage(chatId, msgId); } catch { }
      await sendWelcome(bot, chatId, user?.firstName || "Usuário", settings, mainMenuKeyboard());
      return;
    }

    if (data === "decline_terms") {
      const settings = await getAllSettings();
      await bot.editMessageText(`❌ Você recusou os termos. Para usar o ${settings.botName || "NexiumPix | Payments"}, é necessário aceitar. Use /start para tentar novamente.`, {
        chat_id: chatId, message_id: msgId,
      });
      return;
    }

    // ---- MENU PRINCIPAL ----
    if (data === "menu_main") {
      clearSession(telegramId);
      const user = await getUserByTelegramId(telegramId);
      if (!user || user.blocked) return;
      const settings = await getAllSettings();
      await editOrSendWelcome(bot, chatId, msgId, user.firstName || "Usuário", settings);
      return;
    }

    const user = await getUserByTelegramId(telegramId);
    if (!user || user.blocked) {
      await bot.sendMessage(chatId, "⛔ Sua conta está suspensa.");
      return;
    }
    if (!user.acceptedTerms) return;

    const settings = await getAllSettings();
    const minDeposit = parseFloat(settings.minDeposit || "2");
    const minWithdrawal = parseFloat(settings.minWithdrawal || "5");
    const session = getSession(telegramId);

    // ---- SALDO ----
    if (data === "menu_balance") {
      await bot.editMessageText(
        `💼 *Seu Saldo Atual*\n\n💰 Saldo disponível: *${formatCurrency(user.balance || "0")}*`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: mainMenuKeyboard() }
      );
      return;
    }

    // ---- EXTRATO ----
    if (data === "menu_history") {
      const txs = await getUserTransactions(user.id, 10);
      if (txs.length === 0) {
        await bot.editMessageText("📋 Nenhuma transação encontrada.", {
          chat_id: chatId, message_id: msgId, reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      const lines = txs.map((tx) => {
        const emoji = tx.type === "deposit" ? "⬇️" : "⬆️";
        const s = ["completed","approved"].includes(tx.status) ? "✅" : tx.status === "rejected" ? "❌" : "⏳";
        return `${emoji} ${tx.type === "deposit" ? "Recebimento" : "Saque"} — *${formatCurrency(tx.netAmount)}* ${s}`;
      });
      await bot.editMessageText(`📋 *Últimas Transações:*\n\n${lines.join("\n")}`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    // ---- CHAVE PIX ----
    if (data === "menu_pix_key") {
      const current = user.pixKey ? `\nChave atual: *${user.pixKey}* (${user.pixKeyType})` : "\nNenhuma chave cadastrada ainda.";
      await bot.editMessageText(`🔑 *Sua Chave Pix*${current}\n\nEscolha o tipo da nova chave:`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: pixKeyTypeKeyboard(),
      });
      return;
    }

    if (data.startsWith("pix_type_")) {
      const typeMap: Record<string, string> = {
        pix_type_cnpj: "CNPJ",
        pix_type_email: "Email",
        pix_type_phone: "Telefone",
        pix_type_random: "Chave Aleatória",
      };
      const pixKeyType = typeMap[data] || "CNPJ";
      session.state = "waiting_pix_key";
      session.data.pixKeyType = pixKeyType;
      await bot.editMessageText(`🔑 Digite sua chave Pix do tipo *${pixKeyType}*:`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    // ---- DEPÓSITO ----
    if (data === "menu_deposit") {
      await bot.editMessageText(
        `💰 *Receber Pix*\n\nEscolha o valor:\n\n_Mínimo: ${formatCurrency(minDeposit)}_`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: depositKeyboard(minDeposit) }
      );
      return;
    }

    if (data.startsWith("deposit_")) {
      const value = data.replace("deposit_", "");
      if (value === "custom") {
        session.state = "waiting_deposit_amount";
        await bot.editMessageText(`✏️ Digite o valor que deseja receber (mínimo ${formatCurrency(minDeposit)}):`, {
          chat_id: chatId, message_id: msgId, reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      const amount = parseFloat(value);
      if (amount < minDeposit) {
        await bot.sendMessage(chatId, `❌ Valor mínimo é ${formatCurrency(minDeposit)}.`);
        return;
      }
      await bot.editMessageText(`⏳ Gerando QR Code Pix para *${formatCurrency(amount)}*...`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      });
      await processDeposit(bot, chatId, telegramId, user, amount, settings);
      return;
    }

    // ---- SAQUE ----
    if (data === "menu_withdraw") {
      if (!user.pixKey) {
        await bot.editMessageText(
          "⚠️ Você precisa cadastrar sua chave Pix antes de sacar.\n\nVá em *Minha Chave Pix* no menu.",
          { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: mainMenuKeyboard() }
        );
        return;
      }
      const balance = parseFloat(user.balance || "0");
      if (balance < minWithdrawal) {
        await bot.editMessageText(
          `❌ Saldo insuficiente para saque.\n\nSeu saldo: *${formatCurrency(balance)}*\nMínimo para saque: *${formatCurrency(minWithdrawal)}*`,
          { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
        );
        return;
      }
      const wGateway = parseFloat(settings.withdrawalGatewayFeeFixed || "1");
      await bot.editMessageText(
        `🏧 *Solicitar Saque*\n\nSaldo disponível: *${formatCurrency(balance)}*\nChave Pix: *${user.pixKey}* (${user.pixKeyType})\n\n💲 Taxa gateway (fixa): *${formatCurrency(wGateway)}*\n💲 Taxa de saque: *${settings.withdrawalFeePercent || "5"}%*`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: withdrawKeyboard() }
      );
      return;
    }

    if (data === "withdraw_all") {
      const balance = parseFloat(user.balance || "0");
      session.data.withdrawAmount = balance;
      const resolvedDoc = resolveUserDocument(user);
      if (resolvedDoc) {
        session.data.ownerDocument = resolvedDoc;
        await showWithdrawConfirmation(bot, chatId, session, settings, telegramId);
      } else {
        session.state = "waiting_withdraw_document";
        await bot.editMessageText(
          "📄 *CPF Obrigatório para Saque*\n\nInforme o *CPF do titular* da conta bancária onde sua chave Pix está cadastrada (somente números).\n\n⚠️ O CPF deve ser do *dono da conta bancária*, não a chave Pix em si.\n\n❌ Se o CPF estiver incorreto, o saque será recusado e você deverá entrar em contato com o *Suporte* para liberação manual.\n\nVocê só precisa informar uma vez.",
          { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
        );
      }
      return;
    }

    if (data === "withdraw_custom") {
      session.state = "waiting_withdraw_amount";
      await bot.editMessageText(`✏️ Digite o valor que deseja sacar (mínimo ${formatCurrency(minWithdrawal)}):`, {
        chat_id: chatId, message_id: msgId, reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    if (data === "confirm_withdraw") {
      const amount = session.data.withdrawAmount;
      const ownerDocument = session.data.ownerDocument || "52998224725";
      if (!amount) return;
      const balance = parseFloat(user.balance || "0");
      if (amount > balance) {
        await bot.sendMessage(chatId, "❌ Saldo insuficiente.", { reply_markup: backToMenuKeyboard() });
        return;
      }
      const calc = calcWithdrawal(amount, settings);
      const VIZZION_MIN_WITHDRAWAL = 5;
      if (calc.net < VIZZION_MIN_WITHDRAWAL) {
        await bot.editMessageText(
          `❌ *Valor insuficiente para saque.*\n\nApós taxas (gateway R$ ${formatCurrency(calc.withdrawalGatewayFee)} + ${settings.withdrawalFeePercent || "5"}%), o valor líquido seria *${formatCurrency(calc.net)}*.\n\nO valor líquido mínimo para transferência é *${formatCurrency(VIZZION_MIN_WITHDRAWAL)}*.\nTente um valor maior.`,
          { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
        );
        return;
      }
      const externalId = `withdraw_${user.id}_${Date.now()}`;

      const tx = await createTransaction({
        userId: user.id,
        type: "withdrawal",
        grossAmount: String(amount),
        gatewayFee: String(calc.withdrawalGatewayFee),
        platformFee: "0",
        withdrawalFee: String(calc.withdrawalFee),
        netAmount: String(calc.net),
        pixKey: user.pixKey!,
        pixKeyType: user.pixKeyType!,
        externalId,
      });

      const newBalance = (balance - amount).toFixed(2);
      await updateUserBalance(user.id, newBalance);
      clearSession(telegramId);

      await bot.editMessageText(
        `✅ *Saque solicitado!*\n\n• Valor: *${formatCurrency(amount)}*\n• Taxa gateway: *-${formatCurrency(calc.withdrawalGatewayFee)}*\n• Taxa saque (${settings.withdrawalFeePercent || "5"}%): *-${formatCurrency(calc.withdrawalFee)}*\n• Você receberá: *${formatCurrency(calc.net)}*\n\n⏳ Processando automaticamente...`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
      );

      const saqueNotifFees = buildSaqueFees(amount, settings);
      sendRealNotification(bot, notifySolicitacaoSaque(saqueNotifFees));

      processWithdrawal(bot, tx.id, user.pixKey!, user.pixKeyType!, calc.net, telegramId, user.id, amount, user.firstName || "Cliente", ownerDocument);
      return;
    }

    // ---- REGRAS ----
    if (data === "menu_rules") {
      await bot.editMessageText(buildTerms(settings), {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    // ---- TAXAS DE PIX ----
    if (data === "menu_fees") {
      await bot.editMessageText(buildFees(settings), {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    // ---- SUPORTE ----
    if (data === "menu_support") {
      session.state = "waiting_support_message";
      await bot.editMessageText("🎧 *SAC — Suporte ao Cliente*\n\nDigite sua mensagem e nossa equipe responderá em breve:", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    // =========== ADMIN CALLBACKS ===========
    if (telegramId !== ADMIN_ID) return;

    if (data === "admin_main") {
      const settings = await getAllSettings();
      await bot.editMessageText(`🛸 *PAINEL ADMIN — ${settings.botName || "NexiumPix | Payments"}*`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: adminMainKeyboard(),
      });
      return;
    }

    if (data === "admin_stats") {
      const settings = await getAllSettings();
      const stats = await getStats();
      const balance = await getProducerBalance();
      await bot.editMessageText(
        `📊 *Estatísticas ${settings.botName || "NexiumPix | Payments"}*\n\n` +
        `👥 Total de usuários: *${stats.totalUsers}*\n` +
        `✅ Usuários ativos: *${stats.activeUsers}*\n\n` +
        `💰 Total depositado: *${formatCurrency(stats.totalDeposited)}*\n` +
        `💸 Total sacado: *${formatCurrency(stats.totalWithdrawn)}*\n\n` +
        `📈 Lucro plataforma (taxas): *${formatCurrency(stats.totalPlatformFees + stats.totalGatewayFees)}*\n\n` +
        `💼 Saldo dos usuários: *${formatCurrency(stats.totalBalances)}*\n\n` +
        `🏛️ VizzionPay — Disponível: *R$ ${balance.available.toFixed(2)}* | Pendente: *R$ ${balance.pending.toFixed(2)}*`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] } }
      );
      return;
    }

    if (data === "admin_users") {
      const users = await getAllUsers(50, 0);
      const buttons: any[][] = users.map(u => [
        { text: `${u.blocked ? "🚫" : "✅"} ${u.firstName || "?"} — ${formatCurrency(u.balance || "0")}`, callback_data: `admin_user_view_${u.id}` }
      ]);
      buttons.push([{ text: "⬅️ Voltar Admin", callback_data: "admin_main" }]);
      await bot.editMessageText(
        `👥 *Usuários (${users.length}):*\n\nClique em um usuário para gerenciar:`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } }
      );
      return;
    }

    if (data.startsWith("admin_user_view_")) {
      const uid = parseInt(data.replace("admin_user_view_", ""));
      const u = await getUserById(uid);
      if (!u) {
        await bot.editMessageText("❌ Usuário não encontrado.", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_users" }]] } });
        return;
      }
      await bot.editMessageText(
        `👤 *Detalhes do Usuário #${u.id}*\n\n` +
        `📛 Nome: *${u.firstName || "?"} ${u.lastName || ""}*\n` +
        `👤 Username: @${u.username || "sem_user"}\n` +
        `🆔 Telegram ID: \`${u.telegramId}\`\n` +
        `💼 Saldo: *${formatCurrency(u.balance || "0")}*\n` +
        `🔑 Chave Pix: ${u.pixKey || "Não cadastrada"} (${u.pixKeyType || "-"})\n` +
        `📋 Status: ${u.blocked ? "🚫 Bloqueado" : "✅ Ativo"}\n` +
        `📅 Cadastro: ${new Date(u.createdAt).toLocaleDateString("pt-BR")}`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: adminUserActionsKeyboard(u.id, !!u.blocked) }
      );
      return;
    }

    if (data.startsWith("admin_add_balance_")) {
      const uid = parseInt(data.replace("admin_add_balance_", ""));
      session.state = "admin_add_balance";
      session.data.targetUserId = uid;
      await bot.editMessageText("💰 Digite o valor a *adicionar* ao saldo do usuário:", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: `admin_user_view_${uid}` }]] },
      });
      return;
    }

    if (data.startsWith("admin_remove_balance_")) {
      const uid = parseInt(data.replace("admin_remove_balance_", ""));
      session.state = "admin_remove_balance";
      session.data.targetUserId = uid;
      await bot.editMessageText("💸 Digite o valor a *remover* do saldo do usuário:", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: `admin_user_view_${uid}` }]] },
      });
      return;
    }

    if (data.startsWith("admin_reset_doc_")) {
      const uid = parseInt(data.replace("admin_reset_doc_", ""));
      await updateUserDocument(uid, "");
      const u = await getUserById(uid);
      await bot.editMessageText(
        `✅ CPF/CNPJ do usuário *${u?.firstName || "?"}* foi limpo.\n\nNo próximo saque, o bot pedirá o CPF novamente.`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: adminUserActionsKeyboard(uid, !!u?.blocked) }
      );
      return;
    }

    if (data === "admin_pending_withdrawals") {
      const pending = await getPendingWithdrawals();
      if (pending.length === 0) {
        await bot.editMessageText("✅ Nenhum saque pendente.", {
          chat_id: chatId, message_id: msgId,
          reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] },
        });
        return;
      }
      for (const tx of pending.slice(0, 5)) {
        const u = await getUserById(tx.userId);
        await bot.sendMessage(chatId,
          `💸 *Saque Pendente #${tx.id}*\n\n` +
          `Usuário: ${u?.firstName} (@${u?.username || "?"})\n` +
          `Valor bruto: ${formatCurrency(tx.grossAmount)}\n` +
          `Taxa saque: -${formatCurrency(tx.withdrawalFee)}\n` +
          `Valor líquido: *${formatCurrency(tx.netAmount)}*\n` +
          `Chave Pix: ${tx.pixKey} (${tx.pixKeyType})`,
          { parse_mode: "Markdown", reply_markup: adminWithdrawActionsKeyboard(tx.id) }
        );
      }
      await bot.editMessageText(`📋 *${pending.length}* saque(s) pendente(s) listado(s) acima.`, {
        chat_id: chatId, message_id: msgId,
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] },
      });
      return;
    }

    if (data.startsWith("admin_approve_withdraw_")) {
      const txId = parseInt(data.replace("admin_approve_withdraw_", ""));
      const tx = await getTransactionById(txId);
      if (!tx) return;
      const u = await getUserById(tx.userId);
      try {
        const result = await createPixWithdrawal(
          parseFloat(String(tx.netAmount)), tx.pixKey!, tx.pixKeyType!,
          `admin_${txId}_${Date.now()}`, u?.firstName || "Cliente", "52998224725"
        );
        await updateTransactionStatus(txId, "completed", `VizzionPay: ${result.id}`);
        await bot.sendMessage(u!.telegramId, `✅ *Seu saque foi processado!*\n\nValor: *${formatCurrency(tx.netAmount)}*\nChave: ${tx.pixKey}\n\nEm breve o Pix chegará.`, { parse_mode: "Markdown" });
        await bot.editMessageText(`✅ Saque #${txId} processado e enviado!`, { chat_id: chatId, message_id: msgId });
      } catch (err: any) {
        await bot.editMessageText(`❌ Erro ao processar saque #${txId}: ${err.message}`, {
          chat_id: chatId, message_id: msgId, reply_markup: adminWithdrawActionsKeyboard(txId),
        });
      }
      return;
    }

    if (data.startsWith("admin_reject_withdraw_")) {
      const txId = parseInt(data.replace("admin_reject_withdraw_", ""));
      const tx = await getTransactionById(txId);
      if (!tx) return;
      const u = await getUserById(tx.userId);
      const bal = parseFloat(u?.balance || "0") + parseFloat(String(tx.grossAmount));
      await updateUserBalance(u!.id, bal.toFixed(2));
      await updateTransactionStatus(txId, "rejected", "Rejeitado pelo admin");
      await bot.sendMessage(u!.telegramId, `❌ *Seu saque foi recusado.*\n\nO valor de *${formatCurrency(tx.grossAmount)}* foi devolvido ao seu saldo.`, { parse_mode: "Markdown" });
      await bot.editMessageText(`❌ Saque #${txId} rejeitado. Saldo devolvido.`, { chat_id: chatId, message_id: msgId });
      return;
    }

    if (data === "admin_transactions") {
      const txs = await getAllTransactions(20);
      const lines = txs.map(tx => {
        const e = tx.type === "deposit" ? "⬇️" : "⬆️";
        const s = ["completed","approved"].includes(tx.status) ? "✅" : tx.status === "rejected" ? "❌" : "⏳";
        return `${e}${s} ${formatCurrency(tx.netAmount)} — #${tx.id}`;
      });
      await bot.editMessageText(`📑 *Últimas 20 Transações:*\n\n${lines.join("\n") || "Nenhuma transação."}`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] },
      });
      return;
    }

    if (data === "admin_support_tickets") {
      const tickets = await getOpenTickets();
      if (tickets.length === 0) {
        await bot.editMessageText("✅ Nenhum ticket aberto.", {
          chat_id: chatId, message_id: msgId,
          reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] },
        });
        return;
      }
      for (const ticket of tickets.slice(0, 5)) {
        await bot.sendMessage(chatId, `🎧 *Ticket #${ticket.id}*\nUsuário: ${ticket.telegramId}\n\n${ticket.message}`, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "💬 Responder", callback_data: `admin_reply_ticket_${ticket.telegramId}_${ticket.id}` }]] },
        });
      }
      await bot.editMessageText(`${tickets.length} ticket(s) aberto(s) acima.`, {
        chat_id: chatId, message_id: msgId,
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] },
      });
      return;
    }

    if (data.startsWith("admin_reply_ticket_")) {
      const parts = data.replace("admin_reply_ticket_", "").split("_");
      const userTelegramId = parts[0];
      const ticketId = parseInt(parts[1]);
      const sess = getSession(telegramId);
      sess.state = "admin_reply_ticket";
      sess.data.ticketId = ticketId;
      sess.data.userTelegramId = userTelegramId;
      await bot.sendMessage(chatId, `✏️ Digite a resposta para o ticket #${ticketId}:`);
      return;
    }

    if (data === "admin_broadcast") {
      const sess = getSession(telegramId);
      sess.state = "admin_broadcast";
      await bot.editMessageText("📢 Digite a mensagem que deseja enviar para *todos os usuários*:", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_main" }]] },
      });
      return;
    }

    // ---- CONFIGURAÇÕES DO BOT ----
    if (data === "admin_settings") {
      const s = await getAllSettings();
      await bot.editMessageText(
        `⚙️ *Configurações Atuais do Bot*\n\n` +
        `🏷️ Nome do Bot: *${s.botName || "NexiumPix | Payments"}*\n` +
        `✏️ Texto boas-vindas: ${(s.welcomeText || "").slice(0, 40)}...\n` +
        `📜 Termos: ${s.termsText ? "✅ Personalizado" : "⬜ Padrão"}\n` +
        `🖼️ Imagem: ${s.welcomeImage ? "✅ Configurada" : "❌ Nenhuma"}\n\n` +
        `💲 Taxa gateway receber: *R$ ${parseFloat(s.gatewayFeeFixed || "1").toFixed(2)}* (fixo)\n` +
        `💲 Taxa plataforma: *${s.platformFeePercent || "5"}%*\n` +
        `💲 Taxa gateway saque: *R$ ${parseFloat(s.withdrawalGatewayFeeFixed || "1").toFixed(2)}* (fixo)\n` +
        `💲 Taxa saque: *${s.withdrawalFeePercent || "5"}%*\n\n` +
        `📥 Mínimo recarga: *R$ ${parseFloat(s.minDeposit || "2").toFixed(2)}*\n` +
        `📤 Mínimo saque: *R$ ${parseFloat(s.minWithdrawal || "5").toFixed(2)}*`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: adminSettingsKeyboard() }
      );
      return;
    }

    // Editar configurações individuais
    const settingActions: Record<string, { key: string; label: string; hint: string }> = {
      admin_set_bot_name:        { key: "botName",               label: "Nome do Bot",             hint: "Digite o nome do bot (ex: NexiumPix | Payments):" },
      admin_set_terms_text:      { key: "termsText",             label: "Termos de Uso",           hint: "Digite o texto completo dos termos (use {BOT_NAME}, {MIN_DEPOSIT}, {MIN_WITHDRAWAL}, {GATEWAY_FEE}, {PLATFORM_FEE}, {WITHDRAWAL_GATEWAY_FEE}, {WITHDRAWAL_FEE} como variáveis):" },
      admin_set_welcome_text:    { key: "welcomeText",           label: "Texto de Boas-vindas",    hint: "Digite o novo texto de boas-vindas:" },
      admin_set_platform_fee:   { key: "platformFeePercent",    label: "Taxa da Plataforma",       hint: "Digite o percentual da taxa da plataforma (ex: 5 para 5%):" },
      admin_set_gateway_fee:    { key: "gatewayFeeFixed",       label: "Taxa Gateway Receber",     hint: "Digite o valor fixo da taxa do gateway para receber em R$ (ex: 1):" },
      admin_set_withdrawal_gateway_fee: { key: "withdrawalGatewayFeeFixed", label: "Taxa Gateway Saque", hint: "Digite o valor fixo da taxa do gateway para saque em R$ (ex: 1):" },
      admin_set_withdrawal_fee: { key: "withdrawalFeePercent",  label: "Taxa de Saque (%)",        hint: "Digite o percentual da taxa de saque (ex: 5 para 5%):" },
      admin_set_min_deposit:    { key: "minDeposit",            label: "Mínimo de Recarga",        hint: "Digite o valor mínimo para recarga em R$ (mínimo real da API: R$ 1):" },
      admin_set_min_withdrawal: { key: "minWithdrawal",         label: "Mínimo de Saque",          hint: "Digite o valor mínimo para saque em R$:" },
    };

    if (data === "admin_set_welcome_image") {
      const sess = getSession(telegramId);
      sess.state = "admin_set_welcome_image";
      await bot.editMessageText(
        "🖼️ Envie a *foto* que deseja usar como imagem de boas-vindas.\n\nEnvie a imagem diretamente desta conversa:",
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: adminSettingsKeyboard() }
      );
      return;
    }

    if (settingActions[data]) {
      const { key, hint } = settingActions[data];
      const sess = getSession(telegramId);
      sess.state = `admin_setting_${key}`;
      await bot.editMessageText(hint, {
        chat_id: chatId, message_id: msgId,
        reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_settings" }]] },
      });
      return;
    }

    // ---- NOTIFICAÇÕES ----
    if (data === "admin_notifications") {
      const s = await getAllSettings();
      const fakeOn = s.fakeNotificationsEnabled === "true";
      const realOn = s.realNotificationsEnabled === "true";
      const statusFake = isFakeRunning() ? `🟢 Rodando (${getActiveTimersCount()} pendentes)` : "🔴 Parado";
      await bot.editMessageText(
        `🔔 *Painel de Notificações*\n\n` +
        `🔔 Reais: *${realOn ? "ATIVAS" : "OFF"}*\n` +
        `📝 Grupo: *${s.notifyGroupId || "Não configurado"}*\n\n` +
        `🤖 Fake: *${fakeOn ? "ATIVAS" : "OFF"}*\n` +
        `📡 Status: *${statusFake}*\n\n` +
        `⏱️ *Tempos (minutos):*\n` +
        `1️⃣ Pix Solicitar→Receber: *${s.fakeDelay1Min || "10"}–${s.fakeDelay1Max || "15"} min*\n` +
        `2️⃣ Receber→Solicitar Saque: *${s.fakeDelay2Min || "3"}–${s.fakeDelay2Max || "7"} min*\n` +
        `3️⃣ Saque Solicitar→Concluir: *${s.fakeDelay3Min || "15"}–${s.fakeDelay3Max || "25"} min*\n` +
        `4️⃣ Novo Cliente: *${s.fakeNewSessionMin || "2"}–${s.fakeNewSessionMax || "6"} min*`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: adminNotificationsKeyboard(fakeOn, realOn) }
      );
      return;
    }

    if (data === "admin_toggle_real_notif") {
      const s = await getAllSettings();
      const newVal = s.realNotificationsEnabled === "true" ? "false" : "true";
      await setSetting("realNotificationsEnabled", newVal);
      await bot.editMessageText(`🔔 Notificações reais ${newVal === "true" ? "ATIVADAS ✅" : "DESATIVADAS ❌"}`, {
        chat_id: chatId, message_id: msgId,
        reply_markup: adminNotificationsKeyboard(s.fakeNotificationsEnabled === "true", newVal === "true"),
      });
      return;
    }

    if (data === "admin_toggle_fake_notif") {
      const s = await getAllSettings();
      const newVal = s.fakeNotificationsEnabled === "true" ? "false" : "true";
      await setSetting("fakeNotificationsEnabled", newVal);
      if (newVal === "false") {
        stopFakeNotifications();
      }
      await bot.editMessageText(`🤖 Notificações fake ${newVal === "true" ? "ATIVADAS ✅" : "DESATIVADAS e PARADAS ❌"}`, {
        chat_id: chatId, message_id: msgId,
        reply_markup: adminNotificationsKeyboard(newVal === "true", s.realNotificationsEnabled === "true"),
      });
      return;
    }

    if (data === "admin_start_fake") {
      const s = await getAllSettings();
      if (!s.notifyGroupId) {
        await bot.editMessageText("❌ Configure o ID do grupo primeiro!", {
          chat_id: chatId, message_id: msgId,
          reply_markup: adminNotificationsKeyboard(s.fakeNotificationsEnabled === "true", s.realNotificationsEnabled === "true"),
        });
        return;
      }
      await setSetting("fakeNotificationsEnabled", "true");
      startFakeNotifications(bot);
      await bot.editMessageText("▶️ Notificações fake *INICIADAS*!", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: adminNotificationsKeyboard(true, s.realNotificationsEnabled === "true"),
      });
      return;
    }

    if (data === "admin_pause_fake") {
      pauseFakeNotifications();
      const s = await getAllSettings();
      await bot.editMessageText("⏸️ Notificações fake *PAUSADAS*. Use ▶️ Iniciar para retomar.", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: adminNotificationsKeyboard(s.fakeNotificationsEnabled === "true", s.realNotificationsEnabled === "true"),
      });
      return;
    }

    if (data === "admin_stop_fake") {
      stopFakeNotifications();
      await setSetting("fakeNotificationsEnabled", "false");
      const s = await getAllSettings();
      await bot.editMessageText("⏹️ Notificações fake *PARADAS COMPLETAMENTE*. Tudo cancelado.", {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: adminNotificationsKeyboard(false, s.realNotificationsEnabled === "true"),
      });
      return;
    }

    if (data === "admin_set_group_id") {
      const sess = getSession(telegramId);
      sess.state = "admin_setting_notifyGroupId";
      await bot.editMessageText(
        "📝 Digite o *ID do grupo* onde o bot enviará as notificações.\n\n" +
        "Para descobrir: adicione o bot ao grupo, depois envie qualquer mensagem no grupo e veja o ID nos logs, ou use bots como @getidsbot.\n\n" +
        "O ID de grupo começa com *-* (ex: -1001234567890)",
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_notifications" }]] } }
      );
      return;
    }

    if (data === "admin_set_delay1") {
      const sess = getSession(telegramId);
      sess.state = "admin_setting_fakeDelay1Min";
      sess.data.pendingDelayPair = "delay1";
      await bot.editMessageText(
        `⏱️ *Tempo 1: Pix Solicitar → Pix Recebido*\n\n` +
        `Atual: ${settings.fakeDelay1Min || "10"}–${settings.fakeDelay1Max || "15"} min\n\n` +
        `Digite o tempo *mínimo* (em minutos):`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_notifications" }]] } }
      );
      return;
    }

    if (data === "admin_set_delay2") {
      const sess = getSession(telegramId);
      sess.state = "admin_setting_fakeDelay2Min";
      sess.data.pendingDelayPair = "delay2";
      await bot.editMessageText(
        `⏱️ *Tempo 2: Pix Recebido → Solicitar Saque*\n\n` +
        `Atual: ${settings.fakeDelay2Min || "3"}–${settings.fakeDelay2Max || "7"} min\n\n` +
        `Digite o tempo *mínimo* (em minutos):`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_notifications" }]] } }
      );
      return;
    }

    if (data === "admin_set_delay3") {
      const sess = getSession(telegramId);
      sess.state = "admin_setting_fakeDelay3Min";
      sess.data.pendingDelayPair = "delay3";
      await bot.editMessageText(
        `⏱️ *Tempo 3: Solicitar Saque → Saque Concluído*\n\n` +
        `Atual: ${settings.fakeDelay3Min || "15"}–${settings.fakeDelay3Max || "25"} min\n\n` +
        `Digite o tempo *mínimo* (em minutos):`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_notifications" }]] } }
      );
      return;
    }

    if (data === "admin_set_delay4") {
      const sess = getSession(telegramId);
      sess.state = "admin_setting_fakeNewSessionMin";
      sess.data.pendingDelayPair = "newSession";
      await bot.editMessageText(
        `⏱️ *Tempo 4: Intervalo entre Novos Clientes*\n\n` +
        `Atual: ${settings.fakeNewSessionMin || "2"}–${settings.fakeNewSessionMax || "6"} min\n\n` +
        `Digite o tempo *mínimo* (em minutos):`,
        { chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "admin_notifications" }]] } }
      );
      return;
    }

    if (data.startsWith("admin_block_")) {
      const uid = parseInt(data.replace("admin_block_", ""));
      await blockUser(uid, true);
      const u = await getUserById(uid);
      await bot.editMessageText(`🚫 Usuário ${u?.firstName} bloqueado.`, {
        chat_id: chatId, message_id: msgId, reply_markup: adminUserActionsKeyboard(uid, true),
      });
      return;
    }

    if (data.startsWith("admin_unblock_")) {
      const uid = parseInt(data.replace("admin_unblock_", ""));
      await blockUser(uid, false);
      const u = await getUserById(uid);
      await bot.editMessageText(`✅ Usuário ${u?.firstName} desbloqueado.`, {
        chat_id: chatId, message_id: msgId, reply_markup: adminUserActionsKeyboard(uid, false),
      });
      return;
    }

    if (data.startsWith("admin_user_txs_")) {
      const uid = parseInt(data.replace("admin_user_txs_", ""));
      const txs = await getUserTransactions(uid, 10);
      const lines = txs.map(tx => `${tx.type === "deposit" ? "⬇️" : "⬆️"} ${formatCurrency(tx.netAmount)} — ${tx.status}`);
      await bot.editMessageText(`📋 *Extrato do usuário #${uid}:*\n\n${lines.join("\n") || "Nenhuma transação."}`, {
        chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "admin_main" }]] },
      });
      return;
    }
    } catch (err: any) {
      logger.error({ error: err.message, stack: err.stack }, "Erro no callback_query");
    }
  });

  bot.on("error", (err: any) => {
    logger.error({ error: err.message }, "Bot error");
  });

  logger.info("NexiumPix | Payments Bot iniciado com sucesso!");

  autoStartFakeIfEnabled(bot);

  return bot;
}

// ============ Processar Depósito ============
async function processDeposit(bot: TelegramBot, chatId: number, telegramId: string, user: any, amount: number, settings: Record<string, string>) {
  const minDeposit = parseFloat(settings.minDeposit || "2");
  if (amount < minDeposit) {
    await bot.sendMessage(chatId, `❌ Valor mínimo para recebimento é ${formatCurrency(minDeposit)}.`, { reply_markup: backToMenuKeyboard() });
    return;
  }

  const calc = calcDeposit(amount, settings);
  if (calc.net <= 0) {
    await bot.sendMessage(chatId, `❌ O valor informado não cobre as taxas. Mínimo recomendado: ${formatCurrency(minDeposit + parseFloat(settings.gatewayFeeFixed || "1") + 1)}.`, { reply_markup: backToMenuKeyboard() });
    return;
  }

  const externalId = `dep_${user.id}_${Date.now()}`;
  const tx = await createTransaction({
    userId: user.id,
    type: "deposit",
    grossAmount: String(amount),
    gatewayFee: String(calc.gatewayFee),
    platformFee: String(calc.platformFee),
    withdrawalFee: "0",
    netAmount: String(calc.net),
    externalId,
  });

  try {
    const charge = await createPixCharge(amount, externalId);
    await updateTransactionExternalId(tx.id, charge.id, charge.qrCode, charge.qrCodeBase64);

    const gatewayFee = parseFloat(settings.gatewayFeeFixed || "1");
    const platformPct = settings.platformFeePercent || "5";
    const withdrawalPct = settings.withdrawalFeePercent || "5";

    await bot.sendMessage(chatId,
      `✅ *QR Code Pix Pronto!*\n\n` +
      `• Valor a pagar: *${formatCurrency(amount)}*\n` +
      `• Taxa gateway: *-${formatCurrency(calc.gatewayFee)}*\n` +
      `• Taxa plataforma (${platformPct}%): *-${formatCurrency(calc.platformFee)}*\n` +
      `• Você receberá em saldo: *${formatCurrency(calc.net)}*\n\n` +
      `📋 *Código Pix (copia e cola):*\n\`${charge.qrCode}\`\n\n` +
      `⚠️ Válido por 1 hora. Após o pagamento, seu saldo é atualizado automaticamente.`,
      { parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
    );

    if (charge.qrCodeBase64) {
      try {
        const imgBuffer = Buffer.from(charge.qrCodeBase64, "base64");
        await bot.sendPhoto(chatId, imgBuffer, { caption: "📱 Escaneie o QR Code para pagar" });
      } catch { }
    }

    const pixNotifFees = buildPixFees(amount, settings);
    sendRealNotification(bot, notifySolicitacaoRecebimento(pixNotifFees));

    trackPayment(charge.id, {
      txId: tx.id,
      userId: user.id,
      netAmount: calc.net,
      grossAmount: amount,
      telegramId,
      externalId,
      createdAt: Date.now(),
    });

    monitorPayment(bot, charge.id, tx.id, user.id, calc.net, amount, telegramId, externalId);
  } catch (err: any) {
    logger.error({ error: err.message }, "Erro ao gerar cobrança Pix");
    await updateTransactionStatus(tx.id, "rejected", err.message);
    await bot.sendMessage(chatId, `❌ ${err.message}`, { reply_markup: backToMenuKeyboard() });
  }
}

// ============ Monitorar Pagamento Pix ============
async function monitorPayment(bot: TelegramBot, transactionId: string, txId: number, userId: number, netAmount: number, grossAmount: number, telegramId: string, externalId: string, attempts = 0) {
  if (attempts >= 120) {
    await updateTransactionStatus(txId, "expired", "Tempo expirado");
    removePendingPayment(transactionId);
    return;
  }

  const alreadyConfirmed = !getPendingPayment(transactionId);
  if (alreadyConfirmed) {
    return;
  }

  setTimeout(async () => {
    try {
      if (!getPendingPayment(transactionId)) return;

      const status = await checkPixStatus(transactionId, externalId);
      const paid = ["PAID","COMPLETED","paid","completed","CONFIRMED","confirmed"];
      const expired = ["EXPIRED","CANCELLED","expired","cancelled","FAILED","failed"];
      if (paid.includes(status)) {
        await confirmPayment(transactionId);
      } else if (expired.includes(status)) {
        await updateTransactionStatus(txId, "expired");
        removePendingPayment(transactionId);
      } else {
        monitorPayment(bot, transactionId, txId, userId, netAmount, grossAmount, telegramId, externalId, attempts + 1);
      }
    } catch {
      monitorPayment(bot, transactionId, txId, userId, netAmount, grossAmount, telegramId, externalId, attempts + 1);
    }
  }, 30000);
}

// ============ Resolver Documento do Usuário ============
function resolveUserDocument(user: any): string | null {
  if (user.document) return user.document;
  return null;
}

// ============ Mostrar Confirmação de Saque ============
async function showWithdrawConfirmation(bot: TelegramBot, chatId: number | string, session: any, settings: Record<string, string>, telegramId: string) {
  const amount = session.data.withdrawAmount;
  const calc = calcWithdrawal(amount, settings);
  const VIZZION_MIN_WITHDRAWAL = 5;
  if (calc.net < VIZZION_MIN_WITHDRAWAL) {
    clearSession(telegramId);
    await bot.sendMessage(chatId,
      `❌ *Valor insuficiente para saque.*\n\nApós taxas (gateway R$ ${formatCurrency(calc.withdrawalGatewayFee)} + ${settings.withdrawalFeePercent || "5"}%), o valor líquido seria *${formatCurrency(calc.net)}*.\n\nO valor líquido mínimo para transferência é *${formatCurrency(VIZZION_MIN_WITHDRAWAL)}*.\nVocê precisa de pelo menos *${formatCurrency(VIZZION_MIN_WITHDRAWAL + calc.withdrawalGatewayFee + (VIZZION_MIN_WITHDRAWAL * parseFloat(settings.withdrawalFeePercent || "5") / 100))}* de saldo para sacar.`,
      { parse_mode: "Markdown", reply_markup: backToMenuKeyboard() }
    );
    return;
  }
  session.state = "confirm_withdraw";
  const user = await getUserByTelegramId(telegramId);
  await bot.sendMessage(chatId,
    `💸 *Resumo do Saque:*\n\n` +
    `• Valor solicitado: *${formatCurrency(amount)}*\n` +
    `• Taxa gateway: *-${formatCurrency(calc.withdrawalGatewayFee)}*\n` +
    `• Taxa de saque (${settings.withdrawalFeePercent || "5"}%): *-${formatCurrency(calc.withdrawalFee)}*\n` +
    `• Você receberá: *${formatCurrency(calc.net)}*\n\n` +
    `Chave Pix: *${user?.pixKey}* (${user?.pixKeyType})`,
    {
      parse_mode: "Markdown",
      reply_markup: confirmWithdrawKeyboard(calc.net),
    }
  );
}

// ============ Processar Saque Automaticamente ============
async function processWithdrawal(bot: TelegramBot, txId: number, pixKey: string, pixKeyType: string, netAmount: number, telegramId: string, userId: number, grossAmount: number, ownerName: string, ownerDocument: string) {
  let payoutDone = false;
  let payoutResultId = "";
  try {
    const result = await createPixWithdrawal(netAmount, pixKey, pixKeyType, `nexium_w_${txId}_${Date.now()}`, ownerName, ownerDocument);
    payoutDone = true;
    payoutResultId = result.id || "";
    await updateTransactionStatus(txId, "completed", `VizzionPay: ${payoutResultId}`);
  } catch (err: any) {
    logger.error({ error: err.message, txId }, "Saque automático falhou — modo manual");
    await updateTransactionStatus(txId, "pending", `Falha automática: ${err.message}`);
    const u = await getUserById(userId);
    if (u) {
      const newBalance = (parseFloat(u.balance || "0") + grossAmount).toFixed(2);
      await updateUserBalance(userId, newBalance);
    }
    try {
      await bot.sendMessage(telegramId,
        `⚠️ Saque em análise manual.\n\nSeu saldo foi restaurado. Entre em contato com o Suporte pelo menu para que um administrador libere o saque manualmente.`,
        { reply_markup: mainMenuKeyboard() }
      );
      await bot.sendMessage(ADMIN_ID,
        `⚠️ Saque manual necessário\nTX #${txId} | Valor líquido: ${formatCurrency(netAmount)} | Chave: ${pixKey} (${pixKeyType})\nErro: ${err.message}`,
        { reply_markup: adminWithdrawActionsKeyboard(txId) }
      );
    } catch (notifErr: any) {
      logger.error({ error: notifErr.message, txId }, "Falha ao enviar notificação de saque manual");
    }
    return;
  }

  try {
    await bot.sendMessage(telegramId,
      `✅ Saque processado com sucesso!\n\nValor enviado: R$ ${netAmount.toFixed(2)}\nChave Pix: ${pixKey}\n\nO Pix chegará em instantes.`,
      { reply_markup: mainMenuKeyboard() }
    );
  } catch (notifErr: any) {
    logger.error({ error: notifErr.message, txId }, "Saque concluído mas falha ao notificar usuário");
  }
  try {
    await bot.sendMessage(ADMIN_ID,
      `💸 Saque automático realizado\nTX #${txId} | Valor: R$ ${netAmount.toFixed(2)} | Chave: ${pixKey} | ID VizzionPay: ${payoutResultId}`
    );
    const saqueCompleteFees = buildSaqueFees(grossAmount, await getAllSettings());
    sendRealNotification(bot, notifySaqueConcluido(saqueCompleteFees));
  } catch (notifErr: any) {
    logger.error({ error: notifErr.message, txId }, "Saque concluído mas falha ao notificar admin");
  }
}

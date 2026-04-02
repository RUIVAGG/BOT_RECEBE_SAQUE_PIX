import TelegramBot from "node-telegram-bot-api";

export const mainMenuKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "💰 Receber Pix", callback_data: "menu_deposit" },
      { text: "🏧 Sacar", callback_data: "menu_withdraw" },
    ],
    [
      { text: "💼 Meu Saldo", callback_data: "menu_balance" },
      { text: "📋 Extrato", callback_data: "menu_history" },
    ],
    [
      { text: "🔑 Minha Chave Pix", callback_data: "menu_pix_key" },
      { text: "🎧 SAC / Suporte", callback_data: "menu_support" },
    ],
  ],
});

export const termsKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: "✅ Aceitar Termos e Continuar", callback_data: "accept_terms" }],
    [{ text: "❌ Recusar", callback_data: "decline_terms" }],
  ],
});

export const backToMenuKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: "🏠 Menu Principal", callback_data: "menu_main" }],
  ],
});

export const depositKeyboard = (minDeposit: number): TelegramBot.InlineKeyboardMarkup => {
  const presets = [10, 20, 50, 100, 200, 500].filter(v => v >= minDeposit);
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < presets.length; i += 3) {
    rows.push(
      presets.slice(i, i + 3).map(v => ({
        text: `R$ ${v},00`,
        callback_data: `deposit_${v}`,
      }))
    );
  }
  rows.push([{ text: "✏️ Outro Valor", callback_data: "deposit_custom" }]);
  rows.push([{ text: "🏠 Menu Principal", callback_data: "menu_main" }]);
  return { inline_keyboard: rows };
};

export const withdrawKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: "💰 Sacar Tudo", callback_data: "withdraw_all" }],
    [{ text: "✏️ Outro Valor", callback_data: "withdraw_custom" }],
    [{ text: "🏠 Menu Principal", callback_data: "menu_main" }],
  ],
});

export const pixKeyTypeKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "🏢 CNPJ", callback_data: "pix_type_cnpj" },
      { text: "📧 E-mail", callback_data: "pix_type_email" },
    ],
    [
      { text: "📞 Telefone", callback_data: "pix_type_phone" },
      { text: "🔑 Chave Aleatória", callback_data: "pix_type_random" },
    ],
    [{ text: "🏠 Menu Principal", callback_data: "menu_main" }],
  ],
});

export const confirmWithdrawKeyboard = (net: number): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: `✅ Confirmar Saque de R$ ${net.toFixed(2).replace(".", ",")}`, callback_data: "confirm_withdraw" }],
    [{ text: "❌ Cancelar", callback_data: "menu_main" }],
  ],
});

export const adminMainKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "📊 Estatísticas", callback_data: "admin_stats" },
      { text: "👥 Usuários", callback_data: "admin_users" },
    ],
    [
      { text: "💸 Saques Pendentes", callback_data: "admin_pending_withdrawals" },
      { text: "📑 Transações", callback_data: "admin_transactions" },
    ],
    [
      { text: "🎧 Tickets Suporte", callback_data: "admin_support_tickets" },
      { text: "📢 Broadcast", callback_data: "admin_broadcast" },
    ],
    [
      { text: "⚙️ Configurações", callback_data: "admin_settings" },
      { text: "🔔 Notificações", callback_data: "admin_notifications" },
    ],
  ],
});

export const adminSettingsKeyboard = (): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: "🏷️ Nome do Bot", callback_data: "admin_set_bot_name" }],
    [{ text: "✏️ Texto de Boas-vindas", callback_data: "admin_set_welcome_text" }],
    [{ text: "📜 Termos de Uso", callback_data: "admin_set_terms_text" }],
    [{ text: "🖼️ Imagem de Boas-vindas", callback_data: "admin_set_welcome_image" }],
    [
      { text: "💲 Taxa Gateway Receber", callback_data: "admin_set_gateway_fee" },
      { text: "💲 Taxa Plataforma %", callback_data: "admin_set_platform_fee" },
    ],
    [
      { text: "💲 Taxa Gateway Saque", callback_data: "admin_set_withdrawal_gateway_fee" },
      { text: "💲 Taxa Saque %", callback_data: "admin_set_withdrawal_fee" },
    ],
    [
      { text: "📥 Mínimo Recarga", callback_data: "admin_set_min_deposit" },
      { text: "📤 Mínimo Saque", callback_data: "admin_set_min_withdrawal" },
    ],
    [{ text: "⬅️ Voltar Admin", callback_data: "admin_main" }],
  ],
});

export const adminNotificationsKeyboard = (fakeOn: boolean, realOn: boolean): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: `🔔 Reais: ${realOn ? "ON ✅" : "OFF ❌"}`, callback_data: "admin_toggle_real_notif" }],
    [{ text: `🤖 Fake: ${fakeOn ? "ON ✅" : "OFF ❌"}`, callback_data: "admin_toggle_fake_notif" }],
    [
      { text: "▶️ Iniciar", callback_data: "admin_start_fake" },
      { text: "⏸️ Pausar", callback_data: "admin_pause_fake" },
      { text: "⏹️ Parar", callback_data: "admin_stop_fake" },
    ],
    [{ text: "📝 ID do Grupo", callback_data: "admin_set_group_id" }],
    [
      { text: "1️⃣ Tempo 1", callback_data: "admin_set_delay1" },
      { text: "2️⃣ Tempo 2", callback_data: "admin_set_delay2" },
    ],
    [
      { text: "3️⃣ Tempo 3", callback_data: "admin_set_delay3" },
      { text: "4️⃣ Tempo 4", callback_data: "admin_set_delay4" },
    ],
    [{ text: "⬅️ Voltar Admin", callback_data: "admin_main" }],
  ],
});

export const adminUserActionsKeyboard = (userId: number, blocked: boolean): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "➕ Adicionar Saldo", callback_data: `admin_add_balance_${userId}` },
      { text: "➖ Remover Saldo", callback_data: `admin_remove_balance_${userId}` },
    ],
    [
      blocked
        ? { text: "✅ Desbloquear", callback_data: `admin_unblock_${userId}` }
        : { text: "🚫 Bloquear", callback_data: `admin_block_${userId}` },
      { text: "🔄 Limpar CPF", callback_data: `admin_reset_doc_${userId}` },
    ],
    [{ text: "💰 Ver Extrato", callback_data: `admin_user_txs_${userId}` }],
    [{ text: "👥 Voltar Usuários", callback_data: "admin_users" }],
    [{ text: "⬅️ Voltar Admin", callback_data: "admin_main" }],
  ],
});

export const adminWithdrawActionsKeyboard = (txId: number): TelegramBot.InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "✅ Aprovar e Enviar", callback_data: `admin_approve_withdraw_${txId}` },
      { text: "❌ Rejeitar (devolver saldo)", callback_data: `admin_reject_withdraw_${txId}` },
    ],
  ],
});

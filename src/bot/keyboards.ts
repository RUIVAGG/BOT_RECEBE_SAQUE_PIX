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

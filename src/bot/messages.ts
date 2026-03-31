export const TERMS_STATIC = `
🌟 *ORBITA PIX — TERMOS DE USO* 🌟

Bem-vindo ao *Orbita Pix*! Antes de começar, leia e aceite os termos:

📋 *Regras Gerais:*
• Valor mínimo para receber Pix: *R${'{MIN_DEPOSIT}'}*
• Valor mínimo para saque: *R${'{MIN_WITHDRAWAL}'}*

💰 *Taxas de Recebimento:*
• Taxa fixa gateway: *R${'{GATEWAY_FEE}'}* por recebimento
• Taxa da plataforma: *{PLATFORM_FEE}%* sobre o valor recebido

💸 *Taxas de Saque:*
• Taxa fixa gateway: *R${'{WITHDRAWAL_GATEWAY_FEE}'}* por saque
• Taxa de saque: *{WITHDRAWAL_FEE}%* sobre o saldo a sacar

📄 *CPF Obrigatório para Saque:*
• Para sacar, é *obrigatório* informar o CPF do titular da chave Pix
• O CPF deve ser o do *dono da conta bancária* onde a chave Pix está cadastrada
• Serve para confirmar a legitimidade da chave Pix junto ao banco
• Caso o CPF esteja incorreto, o saque será recusado e você deverá entrar em contato com o *suporte* para liberação manual

🔑 *Chave Pix:*
• Cadastre sua chave Pix antes de solicitar saques
• Tipos aceitos: CNPJ, E-mail, Telefone ou Chave Aleatória

⚠️ *Avisos Importantes:*
• Ao aceitar, você concorda com todas as taxas e regras acima
• O Orbita Pix *não se responsabiliza* por dados incorretos informados pelo usuário
• Saques podem levar até 24h para serem processados
• Em caso de erro no saque, entre em contato com o *suporte* pelo menu

🔒 Seus dados são protegidos e não serão compartilhados.
`;

export function buildTerms(settings: Record<string, string>): string {
  return TERMS_STATIC
    .replace(/{MIN_DEPOSIT}/g, parseFloat(settings.minDeposit || "2").toFixed(2))
    .replace(/{MIN_WITHDRAWAL}/g, parseFloat(settings.minWithdrawal || "5").toFixed(2))
    .replace(/{GATEWAY_FEE}/g, parseFloat(settings.gatewayFeeFixed || "1").toFixed(2))
    .replace(/{WITHDRAWAL_GATEWAY_FEE}/g, parseFloat(settings.withdrawalGatewayFeeFixed || "1").toFixed(2))
    .replace(/{PLATFORM_FEE}/g, settings.platformFeePercent || "5")
    .replace(/{WITHDRAWAL_FEE}/g, settings.withdrawalFeePercent || "5");
}

export const WELCOME = (name: string, welcomeText: string) =>
  `✨ *Bem-vindo ao ORBITA PIX, ${name}!* ✨\n\n${welcomeText}`;

export const formatCurrency = (value: number | string) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
};

export const calcDeposit = (gross: number, settings: Record<string, string>) => {
  const gatewayFee = parseFloat(settings.gatewayFeeFixed || "1");
  const platformPct = parseFloat(settings.platformFeePercent || "5") / 100;
  const platformFee = parseFloat(((gross - gatewayFee) * platformPct).toFixed(2));
  const net = parseFloat((gross - gatewayFee - platformFee).toFixed(2));
  return { gross, gatewayFee, platformFee, net };
};

export const calcWithdrawal = (balance: number, settings: Record<string, string>) => {
  const withdrawalGatewayFee = parseFloat(settings.withdrawalGatewayFeeFixed || "1");
  const withdrawalPct = parseFloat(settings.withdrawalFeePercent || "5") / 100;
  const withdrawalFee = parseFloat((balance * withdrawalPct).toFixed(2));
  const net = parseFloat((balance - withdrawalGatewayFee - withdrawalFee).toFixed(2));
  return { balance, withdrawalGatewayFee, withdrawalFee, net };
};

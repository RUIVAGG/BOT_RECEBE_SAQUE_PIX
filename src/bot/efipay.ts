import axios from "axios";
  import https from "https";
  import { logger } from "../lib/logger";

  const EFI_BASE_URL = "https://pix.api.efipay.com.br";

  function getCertAgent(): https.Agent {
    const certBase64 = process.env.EFI_CERT_BASE64 || "";
    if (!certBase64) {
      logger.warn("EFI_CERT_BASE64 não configurado!");
      return new https.Agent({ rejectUnauthorized: false });
    }
    return new https.Agent({
      pfx: Buffer.from(certBase64, "base64"),
      passphrase: "",
      rejectUnauthorized: false,
    });
  }

  let cachedToken: { token: string; expiresAt: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
    const agent = getCertAgent();
    const credentials = Buffer.from(
      `${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`
    ).toString("base64");
    const { data } = await axios.post(
      `${EFI_BASE_URL}/oauth/token`,
      { grant_type: "client_credentials" },
      {
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        httpsAgent: agent,
        timeout: 15000,
      }
    );
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    logger.info("Token EFI Bank obtido com sucesso");
    return data.access_token;
  }

  async function apiRequest(method: string, path: string, body?: any): Promise<any> {
    const token = await getAccessToken();
    const { data } = await axios({
      method,
      url: `${EFI_BASE_URL}${path}`,
      data: body,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      httpsAgent: getCertAgent(),
      timeout: 20000,
    });
    return data;
  }

  // Gera txid alfanumérico 26-35 chars (padrão EFI Bank)
  function sanitizeTxid(raw: string): string {
    const clean = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 35);
    return clean.padEnd(26, "0");
  }

  function mapStatus(efiStatus: string): string {
    const map: Record<string, string> = {
      ATIVA: "PENDING",
      CONCLUIDA: "APPROVED",
      REMOVIDA_PELO_USUARIO_RECEBEDOR: "REJECTED",
      REMOVIDA_PELO_PSP: "REJECTED",
    };
    return map[efiStatus] || "PENDING";
  }

  export function getWebhookUrl(): string {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "";
    return `https://${domain}/api/webhook/efipay`;
  }

  export async function createPixCharge(
    amount: number,
    externalId: string
  ): Promise<{ id: string; qrCode: string; qrCodeBase64: string; status: string; webhookToken: string }> {
    const pixKey = process.env.EFI_PIX_KEY!;
    const txid = sanitizeTxid(externalId);
    const valor = amount.toFixed(2);

    logger.info({ amount, txid, pixKey }, "Criando cobrança EFI Bank");

    try {
      // Cria cobrança dinâmica
      const cob = await apiRequest("put", `/v2/cob/${txid}`, {
        calendario: { expiracao: 3600 },
        valor: { original: valor },
        chave: pixKey,
        infoAdicionais: [{ nome: "Plataforma", valor: process.env.BOT_NAME || "NexiumPix" }],
      });

      const locId = cob.loc?.id;
      let qrCodeBase64 = "";
      let qrCode = cob.pixCopiaECola || "";

      // Buscar QR code imagem
      if (locId) {
        try {
          const qr = await apiRequest("get", `/v2/loc/${locId}/qrcode`);
          qrCode = qr.qrcode || qrCode;
          qrCodeBase64 = qr.imagemQrcode?.replace(/^data:image\/png;base64,/, "") || "";
        } catch (e: any) {
          logger.warn({ error: e.message }, "Não foi possível obter imagem do QR Code");
        }
      }

      logger.info({ txid, status: cob.status }, "Cobrança EFI criada");

      return {
        id: txid,
        qrCode,
        qrCodeBase64,
        status: mapStatus(cob.status),
        webhookToken: "",
      };
    } catch (error: any) {
      const msg = error.response?.data?.mensagem || error.response?.data?.message || error.message;
      logger.error({ error: msg, details: error.response?.data }, "Erro ao criar cobrança EFI");
      throw new Error(`Falha ao gerar QR Code Pix: ${msg}`);
    }
  }

  export async function checkPixStatus(txid: string): Promise<string> {
    try {
      const cleanTxid = sanitizeTxid(txid);
      const cob = await apiRequest("get", `/v2/cob/${cleanTxid}`);
      const status = mapStatus(cob.status);
      logger.debug({ txid: cleanTxid, efiStatus: cob.status, mapped: status }, "Status EFI verificado");
      return status;
    } catch (error: any) {
      logger.error({ error: error.message, txid }, "Erro ao verificar status EFI");
      return "PENDING";
    }
  }

  export async function createPixWithdrawal(
    amount: number,
    pixKey: string,
    pixKeyType: string,
    externalId: string,
    ownerName: string,
    ownerDocument: string
  ): Promise<{ id: string; status: string }> {
    const typeMap: Record<string, string> = {
      "CPF/CNPJ": "cpf",
      "CPF":      "cpf",
      "CNPJ":     "cnpj",
      "Email":    "email",
      "EMAIL":    "email",
      "Telefone": "telefone",
      "TELEFONE": "telefone",
      "Chave Aleatória": "evp",
      "RANDOM":   "evp",
    };
    const tipoChave = typeMap[pixKeyType] || "evp";
    const valor = amount.toFixed(2);

    logger.info({ amount, pixKey, tipoChave, externalId }, "Iniciando saque EFI Bank");

    try {
      const result = await apiRequest("post", "/v2/pix", {
        valor,
        chave: pixKey,
        infoPagador: `Saque ${ownerName}`,
      });

      logger.info({ endToEndId: result.endToEndId, status: result.status }, "Saque EFI enviado");

      return {
        id: result.endToEndId || externalId,
        status: result.status || "PENDING",
      };
    } catch (error: any) {
      const msg = error.response?.data?.mensagem || error.response?.data?.message || error.message;
      logger.error({ error: msg, details: error.response?.data }, "Erro ao realizar saque EFI");
      throw new Error(`Falha ao processar saque Pix: ${msg}`);
    }
  }

  export async function getProducerBalance(): Promise<{ available: number; pending: number }> {
    try {
      // EFI Bank não tem endpoint de saldo na PIX API — retorna saldo via extrato
      const hoje = new Date().toISOString().split("T")[0];
      const inicio = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const data = await apiRequest("get", `/v2/pix?inicio=${inicio}T00:00:00Z&fim=${hoje}T23:59:59Z`);
      const total = (data.pix || []).reduce((acc: number, p: any) => acc + parseFloat(p.valor || "0"), 0);
      return { available: total, pending: 0 };
    } catch (error: any) {
      logger.error({ error: error.message }, "Erro ao consultar saldo EFI");
      return { available: 0, pending: 0 };
    }
  }
  
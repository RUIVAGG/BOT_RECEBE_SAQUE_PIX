import axios from "axios";
import { logger } from "../lib/logger";

const BASE_URL = "https://app.vizzionpay.com.br/api/v1";

function getHeaders() {
  return {
    "x-public-key": process.env.VIZZIONPAY_CLIENT_ID!,
    "x-secret-key": process.env.VIZZIONPAY_CLIENT_SECRET!,
    "Content-Type": "application/json",
  };
}

let cachedServerIp: string | null = null;

async function getServerIp(): Promise<string> {
  if (cachedServerIp) return cachedServerIp;
  try {
    const res = await axios.get("https://api.ipify.org?format=json", { timeout: 5000 });
    cachedServerIp = res.data.ip;
    return cachedServerIp!;
  } catch {
    return "0.0.0.0";
  }
}

export function getWebhookUrl(): string {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS || "";
  return `https://${domain}/api/webhook/vizzionpay`;
}

export async function createPixCharge(
  amount: number,
  externalId: string
): Promise<{ id: string; qrCode: string; qrCodeBase64: string; status: string; webhookToken: string }> {
  const callbackUrl = getWebhookUrl();
  try {
    const payload: any = {
      amount,
      identifier: externalId,
      client: {
        name: "Cliente Orbita Pix",
        email: "cliente@orbitapix.com",
        document: "52998224725",
        phone: "11999999999",
      },
      callbackUrl,
    };

    logger.info({ amount, externalId, callbackUrl }, "Criando cobrança Pix");

    const response = await axios.post(
      `${BASE_URL}/gateway/pix/receive`,
      payload,
      {
        headers: getHeaders(),
        timeout: 20000,
      }
    );

    const data = response.data;
    logger.info({ transactionId: data.transactionId, status: data.status, hasQr: !!data.pix?.code }, "Cobrança Pix criada");

    return {
      id: data.transactionId,
      qrCode: data.pix?.code || "",
      qrCodeBase64: data.pix?.base64 || "",
      status: data.status || "PENDING",
      webhookToken: data.webhookToken || "",
    };
  } catch (error: any) {
    const msg = error.response?.data?.message || error.message;
    logger.error({ error: msg, details: error.response?.data?.details, status: error.response?.status }, "Erro ao criar cobrança Pix");
    throw new Error(`Falha ao gerar QR Code Pix: ${msg}`);
  }
}

export async function checkPixStatus(transactionId: string, clientIdentifier?: string): Promise<string> {
  try {
    const params: any = {};
    if (transactionId) params.id = transactionId;
    if (clientIdentifier) params.clientIdentifier = clientIdentifier;

    const response = await axios.get(
      `${BASE_URL}/gateway/transactions`,
      {
        headers: getHeaders(),
        params,
        timeout: 10000,
      }
    );
    const status = response.data.status || "PENDING";
    logger.debug({ transactionId, status }, "Status Pix verificado");
    return status;
  } catch (error: any) {
    logger.error({ error: error.message, status: error.response?.status, transactionId }, "Erro ao verificar status Pix");
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
  const serverIp = await getServerIp();

  const typeMap: Record<string, string> = {
    "CPF/CNPJ": "cpf",
    "CPF": "cpf",
    "CNPJ": "cnpj",
    "Email": "email",
    "EMAIL": "email",
    "Telefone": "phone",
    "TELEFONE": "phone",
    "Chave Aleatória": "random",
    "RANDOM": "random",
  };
  const mappedType = typeMap[pixKeyType] || "email";

  const docOnlyNumbers = ownerDocument.replace(/\D/g, "");
  const docType = docOnlyNumbers.length <= 11 ? "cpf" : "cnpj";

  try {
    const response = await axios.post(
      `${BASE_URL}/gateway/transfers`,
      {
        identifier: externalId,
        amount,
        pix: {
          key: pixKey,
          type: mappedType,
        },
        owner: {
          name: ownerName || "Cliente Orbita Pix",
          ip: serverIp,
          document: {
            number: docOnlyNumbers || "11111111111",
            type: docType,
          },
        },
      },
      {
        headers: getHeaders(),
        timeout: 20000,
      }
    );

    return {
      id: response.data.id || response.data.transactionId || externalId,
      status: response.data.status || "PENDING",
    };
  } catch (error: any) {
    const msg = error.response?.data?.message || error.message;
    const details = error.response?.data?.details;
    logger.error({ error: msg, details }, "Erro ao realizar saque Pix");
    throw new Error(`Falha ao processar saque Pix: ${msg}`);
  }
}

export async function getProducerBalance(): Promise<{ available: number; pending: number }> {
  try {
    const response = await axios.get(`${BASE_URL}/gateway/producer/balance`, {
      headers: getHeaders(),
      timeout: 10000,
    });
    return {
      available: response.data.available || 0,
      pending: response.data.pending || 0,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, "Erro ao consultar saldo");
    return { available: 0, pending: 0 };
  }
}

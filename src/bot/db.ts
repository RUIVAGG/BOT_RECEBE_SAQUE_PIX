import { db, usersTable, transactionsTable, supportTicketsTable, botSettingsTable } from "../db";
import { eq, desc, sum, count } from "drizzle-orm";
import { logger } from "../lib/logger";

const settingsCache: Record<string, string> = {};

export async function getSetting(key: string, fallback: string = ""): Promise<string> {
  if (settingsCache[key] !== undefined) return settingsCache[key];
  const rows = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, key)).limit(1);
  const val = rows[0]?.value ?? fallback;
  settingsCache[key] = val;
  return val;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(botSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value, updatedAt: new Date() } });
  settingsCache[key] = value;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(botSettingsTable);
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r.key] = r.value;
    settingsCache[r.key] = r.value;
  }
  return result;
}

export async function findOrCreateUser(telegramId: string, username?: string, firstName?: string, lastName?: string) {
  let user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);

  if (user.length === 0) {
    await db.insert(usersTable).values({
      telegramId,
      username: username || null,
      firstName: firstName || null,
      lastName: lastName || null,
      balance: "0",
      acceptedTerms: false,
      blocked: false,
    });
    user = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
    logger.info({ telegramId }, "Novo usuário criado");
  }

  return user[0];
}

export async function getUserByTelegramId(telegramId: string) {
  const users = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return users[0] || null;
}

export async function acceptTerms(telegramId: string) {
  await db.update(usersTable).set({ acceptedTerms: true, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
}

export async function updateUserBalance(userId: number, newBalance: string) {
  await db.update(usersTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(usersTable.id, userId));
}

export async function updatePixKey(telegramId: string, pixKey: string, pixKeyType: string) {
  await db.update(usersTable).set({ pixKey, pixKeyType, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
}

export async function updateUserDocument(userId: number, document: string) {
  await db.update(usersTable).set({ document: document || null, updatedAt: new Date() }).where(eq(usersTable.id, userId));
}

export async function blockUser(userId: number, blocked: boolean) {
  await db.update(usersTable).set({ blocked, updatedAt: new Date() }).where(eq(usersTable.id, userId));
}

export async function getAllUsers(limit = 50, offset = 0) {
  return await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);
}

export async function getUserById(id: number) {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return users[0] || null;
}

export async function createTransaction(data: {
  userId: number;
  type: string;
  grossAmount: string;
  gatewayFee: string;
  platformFee: string;
  withdrawalFee: string;
  netAmount: string;
  pixKey?: string;
  pixKeyType?: string;
  externalId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
}) {
  const result = await db.insert(transactionsTable).values({
    ...data,
    status: "pending",
  }).returning();
  return result[0];
}

export async function updateTransactionStatus(id: number, status: string, notes?: string) {
  await db.update(transactionsTable).set({ status, notes: notes || null, updatedAt: new Date() }).where(eq(transactionsTable.id, id));
}

export async function updateTransactionExternalId(id: number, externalId: string, qrCode?: string, qrCodeBase64?: string) {
  await db.update(transactionsTable).set({
    externalId,
    qrCode: qrCode || null,
    qrCodeBase64: qrCodeBase64 || null,
    updatedAt: new Date()
  }).where(eq(transactionsTable.id, id));
}

export async function getTransactionById(id: number) {
  const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id)).limit(1);
  return txs[0] || null;
}

export async function getUserTransactions(userId: number, limit = 10) {
  return await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);
}

export async function getPendingWithdrawals() {
  const { and } = await import("drizzle-orm");
  return await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending")))
    .orderBy(desc(transactionsTable.createdAt));
}

export async function getAllTransactions(limit = 50) {
  return await db.select().from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);
}

export async function getPendingDeposits() {
  const { and } = await import("drizzle-orm");
  return await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "pending")))
    .orderBy(desc(transactionsTable.createdAt));
}

export async function createSupportTicket(userId: number, telegramId: string, message: string) {
  const result = await db.insert(supportTicketsTable).values({ userId, telegramId, message, status: "open" }).returning();
  return result[0];
}

export async function getOpenTickets() {
  return await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.status, "open"))
    .orderBy(desc(supportTicketsTable.createdAt));
}

export async function resolveTicket(id: number, adminReply: string) {
  await db.update(supportTicketsTable).set({ status: "resolved", adminReply, updatedAt: new Date() }).where(eq(supportTicketsTable.id, id));
}

export async function getStats() {
  const totalUsers = await db.select({ count: count() }).from(usersTable);
  const activeUsers = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.blocked, false));
  const totalDeposited = await db.select({ sum: sum(transactionsTable.grossAmount) }).from(transactionsTable)
    .where(eq(transactionsTable.type, "deposit"));
  const totalWithdrawn = await db.select({ sum: sum(transactionsTable.grossAmount) }).from(transactionsTable)
    .where(eq(transactionsTable.type, "withdrawal"));
  const totalPlatformFees = await db.select({ sum: sum(transactionsTable.platformFee) }).from(transactionsTable);
  const totalGatewayFees = await db.select({ sum: sum(transactionsTable.gatewayFee) }).from(transactionsTable);
  const totalBalances = await db.select({ sum: sum(usersTable.balance) }).from(usersTable);

  return {
    totalUsers: totalUsers[0]?.count || 0,
    activeUsers: activeUsers[0]?.count || 0,
    totalDeposited: parseFloat(totalDeposited[0]?.sum || "0"),
    totalWithdrawn: parseFloat(totalWithdrawn[0]?.sum || "0"),
    totalPlatformFees: parseFloat(totalPlatformFees[0]?.sum || "0"),
    totalGatewayFees: parseFloat(totalGatewayFees[0]?.sum || "0"),
    totalBalances: parseFloat(totalBalances[0]?.sum || "0"),
  };
}

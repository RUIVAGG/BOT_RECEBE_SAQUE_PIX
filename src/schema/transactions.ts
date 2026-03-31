import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  grossAmount: numeric("gross_amount", { precision: 10, scale: 2 }).notNull(),
  gatewayFee: numeric("gateway_fee", { precision: 10, scale: 2 }).notNull().default("1"),
  platformFee: numeric("platform_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  withdrawalFee: numeric("withdrawal_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull(),
  pixKey: text("pix_key"),
  pixKeyType: text("pix_key_type"),
  externalId: text("external_id"),
  qrCode: text("qr_code"),
  qrCodeBase64: text("qr_code_base64"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

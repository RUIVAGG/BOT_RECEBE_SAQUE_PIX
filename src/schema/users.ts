import { pgTable, serial, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  acceptedTerms: boolean("accepted_terms").notNull().default(false),
  pixKey: text("pix_key"),
  pixKeyType: text("pix_key_type"),
  document: text("document"),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

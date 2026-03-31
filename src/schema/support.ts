import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  adminReply: text("admin_reply"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

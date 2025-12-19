import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  companyName: varchar("company_name"),
  businessNumber: varchar("business_number"),
  phone: varchar("phone"),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  stripeCustomerId: varchar("stripe_customer_id"),
  isVerified: boolean("is_verified").default(false),
  isMaster: boolean("is_master").default(false),
  masterResetAt: timestamp("master_reset_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  templateId: varchar("template_id"),
  name: varchar("name", { length: 200 }).notNull(),
  tgtCompanyName: varchar("tgt_company_name", { length: 100 }),
  statusCode: integer("status_code").default(0).notNull(),
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar("message_type", { length: 10 }).notNull(),
  rcvType: integer("rcv_type").default(0),
  billingType: integer("billing_type").default(0),
  rcsType: integer("rcs_type"),
  sndNum: varchar("snd_num", { length: 20 }),
  sndGoalCnt: integer("snd_goal_cnt"),
  sndMosu: integer("snd_mosu"),
  sndMosuQuery: text("snd_mosu_query"),
  sndMosuDesc: text("snd_mosu_desc"),
  settleCnt: integer("settle_cnt").default(0),
  mdnFileId: varchar("mdn_file_id", { length: 50 }),
  atsSndStartDate: timestamp("ats_snd_start_date"),
  collStartDate: timestamp("coll_start_date"),
  collEndDate: timestamp("coll_end_date"),
  collSndDate: timestamp("coll_snd_date"),
  sndGeofenceId: integer("snd_geofence_id"),
  rtStartHhmm: varchar("rt_start_hhmm", { length: 4 }),
  rtEndHhmm: varchar("rt_end_hhmm", { length: 4 }),
  sndDayDiv: integer("snd_day_div").default(0),
  targetCount: integer("target_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0),
  successCount: integer("success_count").default(0),
  clickCount: integer("click_count").default(0),
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
  costPerMessage: decimal("cost_per_message", { precision: 10, scale: 0 }).default("100"),
  bizchatCampaignId: varchar("bizchat_campaign_id", { length: 100 }),
  rejectionReason: text("rejection_reason"),
  testSentAt: timestamp("test_sent_at"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }),
  description: text("description"),
  campaignId: varchar("campaign_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin users table
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin activity logs
export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Campaign status constants
export const CAMPAIGN_STATUS = {
  DRAFT: { code: 0, status: 'draft', label: '초안' },
  APPROVAL_REQUESTED: { code: 10, status: 'approval_requested', label: '검수 중' },
  APPROVED: { code: 11, status: 'approved', label: '발송 대기' },
  REJECTED: { code: 17, status: 'rejected', label: '반려' },
  SEND_READY: { code: 20, status: 'send_ready', label: '발송 준비중' },
  CANCELLED: { code: 25, status: 'cancelled', label: '취소' },
  RUNNING: { code: 30, status: 'running', label: '발송 중' },
  STOPPED: { code: 35, status: 'stopped', label: '발송 중단' },
  COMPLETED: { code: 40, status: 'completed', label: '발송 완료' },
} as const;

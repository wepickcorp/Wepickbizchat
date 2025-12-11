import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 메시지 유형별 단가 (원)
export const MESSAGE_PRICES = {
  LMS: 100,
  MMS: 120,
  RCS: 100, // RCS는 LMS와 동일
} as const;

export type MessageType = keyof typeof MESSAGE_PRICES;

// 메시지 유형에 따른 단가 반환 함수
export function getMessagePrice(messageType: string): number {
  return MESSAGE_PRICES[messageType as MessageType] || MESSAGE_PRICES.LMS;
}

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table for Replit Auth
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Message Templates table (검수용 템플릿)
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  messageType: varchar("message_type", { length: 10 }).notNull(), // LMS, MMS, RCS
  rcsType: integer("rcs_type"), // 0=스탠다드, 1=LMS, 2=슬라이드, 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
  title: varchar("title", { length: 60 }),
  content: text("content").notNull(),
  imageUrl: text("image_url"), // 미리보기용 URL (base64 또는 외부 URL)
  imageFileId: varchar("image_file_id", { length: 100 }), // BizChat 파일 업로드 후 반환된 ID
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft, pending, approved, rejected
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Files table (업로드된 파일 관리)
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fileType: varchar("file_type", { length: 20 }).notNull(), // image, mdn, coupon
  originalName: varchar("original_name", { length: 255 }).notNull(),
  storagePath: text("storage_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Campaigns table
// Status codes based on BizChat API state diagram:
// 0: 임시등록 (temp_registered) - BizChat에 등록됨
// 1: 검수요청 (inspection_requested)
// 2: 검수완료 (inspection_completed)
// 10: 승인요청 (approval_requested)
// 11: 승인완료 (approved)
// 17: 반려 (rejected)
// 20: 발송준비 (send_ready)
// 30: 발송중 (running)
// 40: 발송완료 (completed)
// 90: 취소 (cancelled)
// 91: 발송중단 (stopped)
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  templateId: varchar("template_id").references(() => templates.id),
  
  // 기본 정보
  name: varchar("name", { length: 200 }).notNull(),
  tgtCompanyName: varchar("tgt_company_name", { length: 100 }), // 고객사명
  statusCode: integer("status_code").default(0).notNull(), // 0=temp_registered, 10=approval_requested, etc
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar("message_type", { length: 10 }).notNull(), // LMS, MMS, RCS
  
  // BizChat API 필수 필드
  rcvType: integer("rcv_type").default(0), // 0=ATS, 1=Maptics실시간, 2=Maptics모아서, 10=직접지정
  billingType: integer("billing_type").default(0), // 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  rcsType: integer("rcs_type"), // 0=스탠다드, 1=LMS, 2=슬라이드, 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
  sndNum: varchar("snd_num", { length: 20 }), // 발신번호 코드
  sndGoalCnt: integer("snd_goal_cnt"), // 발송 목표 건수
  sndMosu: integer("snd_mosu"), // ATS 발송 모수
  sndMosuQuery: text("snd_mosu_query"), // ATS 발송 모수 쿼리
  sndMosuDesc: text("snd_mosu_desc"), // ATS 발송 모수 설명
  settleCnt: integer("settle_cnt").default(0), // 정산 건수
  mdnFileId: varchar("mdn_file_id", { length: 50 }), // MDN 파일 ID
  
  // 발송 일정
  atsSndStartDate: timestamp("ats_snd_start_date"), // ATS 발송 시작 일시 (rcvType=0,10)
  
  // Maptics 지오펜스 발송 일정 (rcvType=1,2)
  collStartDate: timestamp("coll_start_date"), // 수집 시작 일시
  collEndDate: timestamp("coll_end_date"), // 수집 종료 일시
  collSndDate: timestamp("coll_snd_date"), // 발송 시작 일시 (rcvType=2 모아서 보내기)
  sndGeofenceId: integer("snd_geofence_id"), // 지오펜스 ID
  
  // Maptics 실시간 보내기 전용 (rcvType=1)
  rtStartHhmm: varchar("rt_start_hhmm", { length: 4 }), // 발송 시작 시간 (HHMM, 0900~1950)
  rtEndHhmm: varchar("rt_end_hhmm", { length: 4 }), // 발송 종료 시간 (HHMM, 0910~2000)
  sndDayDiv: integer("snd_day_div").default(0), // 일 균등 분할 (0: 미분할, 1: 분할)
  
  // 통계
  targetCount: integer("target_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0),
  successCount: integer("success_count").default(0),
  clickCount: integer("click_count").default(0),
  
  // 예산
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
  costPerMessage: decimal("cost_per_message", { precision: 10, scale: 0 }).default("100"),
  
  // BizChat 연동
  bizchatCampaignId: varchar("bizchat_campaign_id", { length: 100 }),
  
  // 기타
  rejectionReason: text("rejection_reason"),
  testSentAt: timestamp("test_sent_at"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table (캠페인에 연결된 메시지 - 템플릿 복사본)
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id).notNull(),
  title: varchar("title", { length: 60 }),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Targeting table - BizChat ATS 기반 고도화
export const targeting = pgTable("targeting", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id).notNull(),
  
  // 기본 인구통계 필터 (/ats/meta/filter)
  gender: varchar("gender", { length: 10 }).default("all"), // all, male, female
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  regions: text("regions").array(), // 시/도
  districts: text("districts").array(), // 시/군/구
  
  // 회선 정보 필터 (/ats/meta/filter)
  carrierTypes: text("carrier_types").array(), // 통신사 유형: lte, 5g 등
  deviceTypes: text("device_types").array(), // 기기 유형: android, ios 등
  
  // 11번가 쇼핑 행동 (/ats/meta/11st)
  shopping11stCategories: text("shopping_11st_categories").array(), // 11번가 카테고리 코드
  
  // 웹앱 사용 행동 (/ats/meta/webapp)
  webappCategories: text("webapp_categories").array(), // 웹앱 카테고리 코드
  
  // 통화 Usage 패턴 (/ats/meta/call)
  callUsageTypes: text("call_usage_types").array(), // 통화 사용 패턴 코드
  
  // 위치/이동 특성 (/ats/meta/loc)
  locationTypes: text("location_types").array(), // 위치 특성 코드
  mobilityPatterns: text("mobility_patterns").array(), // 이동 패턴 코드
  
  // Maptics 지오펜스 (/maptics/*)
  geofenceIds: text("geofence_ids").array(), // 지오펜스 ID 목록
  
  // ATS 쿼리 결과 (발송 모수 조회 결과 저장)
  atsQuery: text("ats_query"), // ATS 쿼리 JSON
  estimatedCount: integer("estimated_count"), // 예상 타겟 수
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Maptics 지오펜스 테이블
export const geofences = pgTable("geofences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  // 지오펜스 좌표 정보
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  radius: integer("radius").default(500), // 반경 (미터)
  
  // POI 정보
  poiId: varchar("poi_id", { length: 100 }), // Maptics POI ID
  poiName: varchar("poi_name", { length: 200 }),
  poiCategory: varchar("poi_category", { length: 100 }),
  
  // BizChat 연동
  bizchatGeofenceId: varchar("bizchat_geofence_id", { length: 100 }),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ATS 메타데이터 캐시 테이블 (API 응답 캐싱)
export const atsMetaCache = pgTable("ats_meta_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metaType: varchar("meta_type", { length: 50 }).notNull(), // 11st, webapp, call, loc, filter
  categoryCode: varchar("category_code", { length: 50 }),
  categoryName: varchar("category_name", { length: 200 }),
  parentCode: varchar("parent_code", { length: 50 }),
  level: integer("level").default(1),
  metadata: jsonb("metadata"), // 추가 메타데이터
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // charge, usage, refund
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }).notNull(),
  description: text("description"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reports table
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id).notNull(),
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  clickCount: integer("click_count").default(0),
  optOutCount: integer("opt_out_count").default(0),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  campaigns: many(campaigns),
  templates: many(templates),
  transactions: many(transactions),
  files: many(files),
  geofences: many(geofences),
}));

export const filesRelations = relations(files, ({ one }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
  campaigns: many(campaigns),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [campaigns.templateId],
    references: [templates.id],
  }),
  messages: many(messages),
  targeting: one(targeting),
  reports: many(reports),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [messages.campaignId],
    references: [campaigns.id],
  }),
}));

export const targetingRelations = relations(targeting, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [targeting.campaignId],
    references: [campaigns.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [reports.campaignId],
    references: [campaigns.id],
  }),
}));

export const geofencesRelations = relations(geofences, ({ one }) => ({
  user: one(users, {
    fields: [geofences.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentCount: true,
  successCount: true,
  clickCount: true,
  settleCnt: true,
  completedAt: true,
  testSentAt: true,
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertTargetingSchema = createInsertSchema(targeting).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGeofenceSchema = createInsertSchema(geofences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAtsMetaCacheSchema = createInsertSchema(atsMetaCache).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Targeting = typeof targeting.$inferSelect;
export type InsertTargeting = z.infer<typeof insertTargetingSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type Geofence = typeof geofences.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;

export type AtsMetaCache = typeof atsMetaCache.$inferSelect;
export type InsertAtsMetaCache = z.infer<typeof insertAtsMetaCacheSchema>;

// Campaign with related data
export type CampaignWithDetails = Campaign & {
  template?: Template;
  messages?: Message[];
  targeting?: Targeting;
  reports?: Report[];
};

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

// Template status constants
export const TEMPLATE_STATUS = {
  DRAFT: { status: 'draft', label: '작성중' },
  PENDING: { status: 'pending', label: '검수요청' },
  APPROVED: { status: 'approved', label: '승인됨' },
  REJECTED: { status: 'rejected', label: '반려됨' },
} as const;

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

// Agencies table (대행사 계정)
export const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // 대행사 계정의 user ID
  name: varchar("name", { length: 200 }).notNull(), // 대행사명
  contactName: varchar("contact_name", { length: 100 }), // 담당자명
  contactPhone: varchar("contact_phone", { length: 20 }), // 담당자 연락처
  contactEmail: varchar("contact_email", { length: 200 }), // 담당자 이메일
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  companyName: varchar("company_name"),
  businessNumber: varchar("business_number"),
  representativeName: varchar("representative_name"),
  phone: varchar("phone"),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  stripeCustomerId: varchar("stripe_customer_id"),
  isVerified: boolean("is_verified").default(false),
  isMaster: boolean("is_master").default(false),
  masterResetAt: timestamp("master_reset_at"),
  isAgency: boolean("is_agency").default(false), // 대행사 계정 여부
  agencyId: varchar("agency_id"), // 소속 대행사 ID (하위 광고주 계정에 설정)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// RCS 버튼 타입
export interface RcsButton {
  type: "0" | "1" | "2"; // 0: URL연결, 1: 전화걸기, 2: 지도보여주기
  name: string; // 버튼 텍스트
  val1: string; // URL/전화번호/위치명
  val2?: string; // 지도일 때 fallback URL
  reward?: "1"; // 리워드 적용 여부
}

// URL 링크 구조
export interface UrlLinkConfig {
  list: string[]; // URL 목록 (최대 3개)
  reward?: number; // 리워드 적용 URL index (0부터)
}

// RCS 버튼 구조
export interface RcsButtonsConfig {
  list: RcsButton[]; // 버튼 목록 (최대 2개)
}

// 추천 메시지 업종 분류
export const RECOMMENDED_CATEGORIES = [
  { value: 'commerce', label: '커머스/쇼핑' },
  { value: 'cafe_food', label: '카페/외식/프랜차이즈' },
  { value: 'travel_culture', label: '여행/문화' },
  { value: 'sports_health', label: '스포츠/건강' },
  { value: 'education_life', label: '교육/라이프' },
  { value: 'medical', label: '병의원' },
] as const;

// 추천 메시지 목적 분류
export const RECOMMENDED_PURPOSES = [
  { value: 'signup', label: '회원가입 유도' },
  { value: 'review_event', label: '리뷰 이벤트' },
  { value: 'holiday_discount', label: '명절 특별 할인' },
  { value: 'product_discount', label: '상품 할인 안내' },
  { value: 'new_product', label: '신규 상품 안내' },
  { value: 'new_product_discount', label: '신제품 할인 안내' },
  { value: 'app_download', label: '앱 다운로드 이벤트' },
  { value: 'offline_product_discount', label: '오프라인 행사 상품 할인 안내' },
  { value: 'offline_event', label: '오프라인 행사 안내' },
  { value: 'event', label: '이벤트 안내' },
  { value: 'timedeal', label: '타임딜 이벤트' },
  { value: 'special_product', label: '특가상품 안내' },
  { value: 'consultation', label: '상담신청유도' },
] as const;

export type RecommendedCategory = typeof RECOMMENDED_CATEGORIES[number]['value'];
export type RecommendedPurpose = typeof RECOMMENDED_PURPOSES[number]['value'];

// 변수 스키마 타입
export interface VariableSchemaItem {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dateRange' | 'tel' | 'url';
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

// 선택된 카테고리 (ATS mosu 형식)
// cat1/cat2/cat3에는 cateid 코드를 저장, *Name에는 표시명을 저장
export interface SelectedCategory {
  cat1: string;       // cateid 코드 (예: "01")
  cat1Name?: string;  // 표시명 (예: "가구/인테리어")
  cat2?: string;      // cateid 코드 (예: "0101")
  cat2Name?: string;  // 표시명
  cat3?: string;      // cateid 코드 (예: "010101")
  cat3Name?: string;  // 표시명
}

// 지오펜스 타겟 정보
export interface GeofenceTarget {
  gender: number; // 0: 전체, 1: 남자, 2: 여자
  minAge: number; // 19-90
  maxAge: number; // 19-90
  stayMin: number; // 5-30분
  radius: number; // 50-2000m
  address: string; // POI 주소
  lat?: string; // 위도
  lon?: string; // 경도
}

// 저장된 지오펜스 정보
export interface SavedGeofence {
  id: number; // BizChat에서 반환된 지오펜스 ID
  name: string;
  targets: GeofenceTarget[];
}

// 추천 템플릿용 타겟팅 설정 타입
// 3가지 모드: 'ats-general' (일반 ATS), 'ats-advanced' (고급 ATS), 'maptics' (지오펜스)
export interface RecommendedTargetingConfig {
  mode: 'ats-general' | 'ats-advanced' | 'maptics';
  
  // ATS 일반/고급 공통
  targetGender?: 'all' | 'male' | 'female';
  targetAgeStart?: number;
  targetAgeEnd?: number;
  
  // ATS 고급 타겟팅 옵션
  advancedOptions?: {
    sndMosu?: number;
    areas?: string[];
    locations?: {
      code: string;
      type: "home" | "work";
      name: string;
    }[];
    interests?: string[];
    shopping11stCategories?: SelectedCategory[];
    webappCategories?: SelectedCategory[];
    callCategories?: SelectedCategory[];
  };
  // 지오펜스 타겟팅 옵션
  mapticsOptions?: {
    radius?: number;
    geofences?: SavedGeofence[];
    rcvType?: 1 | 2;
    rtStartHhmm?: string;
    rtEndHhmm?: string;
    sndDayDiv?: number;
  };
}

// Recommended Templates table (추천 메시지 템플릿)
export const recommendedTemplates = pgTable("recommended_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // 업종
  purpose: varchar("purpose", { length: 50 }).notNull(), // 목적
  version: varchar("version", { length: 20 }), // 버전 (v1, v1.1 등)
  
  // 메시지 내용 (변수 포함)
  titleTemplate: varchar("title_template", { length: 60 }),
  lmsTitleTemplate: varchar("lms_title_template", { length: 60 }),
  contentTemplate: text("content_template").notNull(),
  lmsContentTemplate: text("lms_content_template"), // RCS 메시지의 안드로이드용 LMS 대체 텍스트 템플릿
  variableSchema: jsonb("variable_schema").$type<VariableSchemaItem[]>(),
  
  // 이미지 및 메시지 타입
  defaultImageUrl: text("default_image_url"),
  messageType: varchar("message_type", { length: 10 }).default("RCS"),
  rcsType: integer("rcs_type").default(4), // 이미지강조B가 기본
  
  // URL 및 버튼
  urlLinks: jsonb("url_links").$type<UrlLinkConfig>(),
  buttons: jsonb("buttons").$type<RcsButtonsConfig>(),
  
  // 상태
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  // 원본 템플릿 참조 (선택적)
  sourceTemplateId: varchar("source_template_id"),
  
  // 타겟팅 설정 (추천 모드에서 자동 적용)
  targetingConfig: jsonb("targeting_config").$type<RecommendedTargetingConfig>(),
  
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
  lmsTitle: varchar("lms_title", { length: 60 }),
  content: text("content").notNull(), // RCS 메시지 내용
  lmsContent: text("lms_content"), // LMS fallback 메시지 내용
  imageUrl: text("image_url"), // RCS용 미리보기 이미지 URL
  imageFileId: varchar("image_file_id", { length: 100 }), // RCS용 BizChat 파일 업로드 ID
  lmsImageUrl: text("lms_image_url"), // LMS용 미리보기 이미지 URL
  lmsImageFileId: varchar("lms_image_file_id", { length: 100 }), // LMS용 BizChat 파일 업로드 ID
  urlLinks: jsonb("url_links").$type<UrlLinkConfig>(), // RCS URL 링크 설정
  lmsUrlLinks: jsonb("lms_url_links").$type<UrlLinkConfig>(), // LMS URL 링크 설정
  buttons: jsonb("buttons").$type<RcsButtonsConfig>(), // RCS 버튼 설정
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
  
  // 추천 메시지 관련
  creationMode: varchar("creation_mode", { length: 20 }), // 'recommended' | 'self'
  recommendedTemplateId: varchar("recommended_template_id"), // 추천 템플릿 ID
  variableValues: jsonb("variable_values"), // 변수 입력값 저장
  
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
  lmsTitle: varchar("lms_title", { length: 60 }),
  content: text("content").notNull(), // RCS 메시지 내용
  lmsContent: text("lms_content"), // LMS fallback 메시지 내용
  imageUrl: text("image_url"), // RCS용 이미지 URL
  imageFileId: varchar("image_file_id", { length: 100 }), // RCS용 BizChat 파일 업로드 ID
  lmsImageUrl: text("lms_image_url"), // LMS용 이미지 URL
  lmsImageFileId: varchar("lms_image_file_id", { length: 100 }), // LMS용 BizChat 파일 업로드 ID
  
  // RCS URL 링크 및 버튼 (템플릿에서 복사)
  urlLinks: jsonb("url_links"), // RCS용 { list: string[], reward?: number }
  lmsUrlLinks: jsonb("lms_url_links"), // LMS용 { list: string[], reward?: number }
  buttons: jsonb("buttons"), // RCS 버튼 { list: [{ type: '0'|'1'|'2', name: string, val1: string, val2?: string }] }
  
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

export const agenciesRelations = relations(agencies, ({ one, many }) => ({
  user: one(users, {
    fields: [agencies.userId],
    references: [users.id],
  }),
}));

// Monthly Agency Stats (대행사 월별 정산 통계)
export const monthlyAgencyStats = pgTable("monthly_agency_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  yearMonth: varchar("year_month", { length: 7 }).notNull(), // YYYY-MM 형식
  totalSpend: decimal("total_spend", { precision: 14, scale: 0 }).default("0"), // 하위 계정 총 소진액
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }), // 수수료율 (10%, 15%, 20%)
  commissionAmount: decimal("commission_amount", { precision: 14, scale: 0 }).default("0"), // 대행 수수료
  settlementDate: timestamp("settlement_date"), // 정산 예정일 (익월 30일)
  status: varchar("status", { length: 20 }).default("pending"), // pending, settled
  settledAt: timestamp("settled_at"), // 실제 정산일
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

export const insertRecommendedTemplateSchema = createInsertSchema(recommendedTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertAgencySchema = createInsertSchema(agencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMonthlyAgencyStatsSchema = createInsertSchema(monthlyAgencyStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

export type RecommendedTemplate = typeof recommendedTemplates.$inferSelect;
export type InsertRecommendedTemplate = z.infer<typeof insertRecommendedTemplateSchema>;

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

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = z.infer<typeof insertAgencySchema>;

export type MonthlyAgencyStats = typeof monthlyAgencyStats.$inferSelect;
export type InsertMonthlyAgencyStats = z.infer<typeof insertMonthlyAgencyStatsSchema>;

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

// ============ Admin System Tables ============

// Admin roles
export const ADMIN_ROLES = {
  SUPER: { role: 'super', label: '슈퍼 어드민', permissions: ['*'] },
  CS: { role: 'cs', label: 'CS 어드민', permissions: ['users:read', 'users:update', 'campaigns:read', 'transactions:read', 'logs:read'] },
  FINANCE: { role: 'finance', label: '재무 어드민', permissions: ['users:read', 'transactions:*', 'logs:read'] },
} as const;

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
  adminId: varchar("admin_id").references(() => admins.id).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin relations
export const adminsRelations = relations(admins, ({ many }) => ({
  logs: many(adminLogs),
}));

export const adminLogsRelations = relations(adminLogs, ({ one }) => ({
  admin: one(admins, {
    fields: [adminLogs.adminId],
    references: [admins.id],
  }),
}));

// Admin insert schemas
export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({
  id: true,
  createdAt: true,
});

// Admin types
export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;

// ============ Admin 2차 기능 Tables ============

// 공지사항 테이블
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(), // general, update, maintenance, event
  priority: integer("priority").default(0), // 0=일반, 1=중요, 2=긴급
  isPublished: boolean("is_published").default(false),
  isPinned: boolean("is_pinned").default(false),
  authorId: varchar("author_id").references(() => admins.id).notNull(),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 환불 요청 테이블
export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  transactionId: varchar("transaction_id").references(() => transactions.id),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, approved, rejected, completed
  adminId: varchar("admin_id").references(() => admins.id),
  adminNote: text("admin_note"),
  bankName: varchar("bank_name", { length: 50 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountHolder: varchar("account_holder", { length: 50 }),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 세금계산서 테이블
export const taxInvoices = pgTable("tax_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  transactionId: varchar("transaction_id").references(() => transactions.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).unique(),
  issueDate: timestamp("issue_date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 0 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 0 }).notNull(),
  buyerBusinessNumber: varchar("buyer_business_number", { length: 20 }),
  buyerCompanyName: varchar("buyer_company_name", { length: 100 }),
  buyerEmail: varchar("buyer_email", { length: 100 }),
  status: varchar("status", { length: 20 }).default("issued").notNull(), // issued, sent, cancelled
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for new tables
export const announcementsRelations = relations(announcements, ({ one }) => ({
  author: one(admins, {
    fields: [announcements.authorId],
    references: [admins.id],
  }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  user: one(users, {
    fields: [refunds.userId],
    references: [users.id],
  }),
  transaction: one(transactions, {
    fields: [refunds.transactionId],
    references: [transactions.id],
  }),
  admin: one(admins, {
    fields: [refunds.adminId],
    references: [admins.id],
  }),
}));

export const taxInvoicesRelations = relations(taxInvoices, ({ one }) => ({
  user: one(users, {
    fields: [taxInvoices.userId],
    references: [users.id],
  }),
  transaction: one(transactions, {
    fields: [taxInvoices.transactionId],
    references: [transactions.id],
  }),
}));

// Insert schemas for new tables
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  processedAt: true,
});

export const insertTaxInvoiceSchema = createInsertSchema(taxInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for new tables
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type TaxInvoice = typeof taxInvoices.$inferSelect;
export type InsertTaxInvoice = z.infer<typeof insertTaxInvoiceSchema>;

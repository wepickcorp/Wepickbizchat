import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// Callback URL (Vercel 배포 도메인)
const CALLBACK_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://wepickbizchat-new.vercel.app';

// Database tables
const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  tgtCompanyName: text('tgt_company_name'),
  templateId: text('template_id'),
  messageType: text('message_type'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  sndNum: text('snd_num'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  settleCnt: integer('settle_cnt').default(0),
  targetCount: integer('target_count').default(0),
  budget: text('budget'),
  atsSndStartDate: timestamp('ats_snd_start_date'),
  scheduledAt: timestamp('scheduled_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageFileId: text('image_file_id'),
  urlLinks: jsonb('url_links'),
  buttons: jsonb('buttons'),
  lmsContent: text('lms_content'),
  lmsImageUrl: text('lms_image_url'),
  lmsImageFileId: text('lms_image_file_id'),
  lmsUrlLinks: jsonb('lms_url_links'),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function verifyImpersonateToken(token: string): { userId: string; adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== 'impersonate') return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAuth(req: VercelRequest) {
  const impersonateToken = req.headers['x-impersonate-token'] as string;
  const impersonateUserId = req.headers['x-impersonate-user-id'] as string;
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: '' };
    }
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

// 빈 객체/배열/문자열 필드 제거 유틸리티
function cleanEmptyFields(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // null, undefined는 제외
    if (value === null || value === undefined) continue;
    
    // 빈 문자열은 제외 (urlFile 등)
    if (typeof value === 'string' && value === '') continue;
    
    // 빈 배열은 제외
    if (Array.isArray(value) && value.length === 0) continue;
    
    // 빈 객체는 제외 (fileInfo: {}, urlLink: {} 등)
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    
    // 중첩 객체도 정리
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleanedNested = cleanEmptyFields(value as Record<string, unknown>);
      // 정리 후에도 필드가 있으면 포함
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
    } else if (Array.isArray(value)) {
      // 배열 내 객체도 정리
      const cleanedArray = value.map(item => 
        typeof item === 'object' && item !== null 
          ? cleanEmptyFields(item as Record<string, unknown>)
          : item
      ).filter(item => {
        if (typeof item === 'object' && !Array.isArray(item)) {
          return Object.keys(item as object).length > 0;
        }
        return true;
      });
      if (cleanedArray.length > 0) {
        cleaned[key] = cleanedArray;
      }
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Transaction ID 생성 (밀리초 타임스탬프)
function generateTid(): string {
  return Date.now().toString();
}

// 날짜를 Unix Timestamp (초 단위)로 변환
function toUnixTimestamp(date: Date | string | null): number | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor(d.getTime() / 1000);
}

// 한국 시간대(KST, UTC+9) 기준으로 시간 정보 추출
function getKSTTimeComponents(date: Date): { hours: number; minutes: number; date: Date } {
  // KST는 UTC+9
  const kstOffset = 9 * 60; // 분 단위
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
  const kstTime = new Date(utcTime + (kstOffset * 60 * 1000));
  return {
    hours: kstTime.getHours(),
    minutes: kstTime.getMinutes(),
    date: kstTime,
  };
}

// 발송 시간 유효성 검증 (09:00~20:00 KST, 1시간 전 승인 요청 필요, 10분 단위)
function validateSendTime(sendDate: Date | string | null): { valid: boolean; error?: string; adjustedDate?: Date } {
  if (!sendDate) {
    return { valid: true };
  }
  
  const targetDate = typeof sendDate === 'string' ? new Date(sendDate) : sendDate;
  const now = new Date();
  
  // KST 기준 시간 추출
  const kstTarget = getKSTTimeComponents(targetDate);
  
  // 1. 발송 시간대 체크 (09:00~20:00 KST)
  if (kstTarget.hours < 9 || kstTarget.hours >= 20) {
    return { 
      valid: false, 
      error: `발송 시간은 09:00~19:00 사이여야 합니다 (현재: ${kstTarget.hours}:${kstTarget.minutes.toString().padStart(2, '0')} KST)` 
    };
  }
  
  // 2. 최소 1시간 여유 체크
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  if (targetDate < oneHourFromNow) {
    return { 
      valid: false, 
      error: '발송 시간은 현재 시간으로부터 최소 1시간 이후여야 합니다' 
    };
  }
  
  // 3. 10분 단위 체크 (BizChat 규격: 10분 단위로만 시작 가능)
  // 예: 10:11에 11:15 시작 → 실패, 11:20 → 성공
  const targetMinutes = kstTarget.minutes;
  if (targetMinutes % 10 !== 0) {
    const roundedUp = Math.ceil(targetMinutes / 10) * 10;
    const suggestedTime = new Date(targetDate);
    if (roundedUp >= 60) {
      suggestedTime.setHours(suggestedTime.getHours() + 1);
      suggestedTime.setMinutes(0);
    } else {
      suggestedTime.setMinutes(roundedUp);
    }
    return { 
      valid: false, 
      error: `발송 시간은 10분 단위여야 합니다 (예: ${suggestedTime.getHours()}:${String(suggestedTime.getMinutes()).padStart(2, '0')})` 
    };
  }
  
  return { valid: true };
}

// BizChat API 호출 (v0.29.0 규격)
async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const envKeyName = useProduction ? 'BIZCHAT_PROD_API_KEY' : 'BIZCHAT_DEV_API_KEY';
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  console.log(`[BizChat API] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[BizChat API] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat API] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);

  if (!apiKey) {
    console.error(`[BizChat API] ⚠️ Missing ${envKeyName}. Available: DEV=${!!process.env.BIZCHAT_DEV_API_KEY}, PROD=${!!process.env.BIZCHAT_PROD_API_KEY}`);
    throw new Error(`BizChat API key not configured (${envKeyName})`);
  }

  const tid = generateTid();
  
  // tid는 항상 Query Parameter로 전달
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  
  console.log(`[BizChat] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    // 전체 Request body 로깅 (truncation 없이)
    console.log(`[BizChat] Request body:`, JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat] Response: ${response.status} - ${responseText.substring(0, 500)}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }

  return { status: response.status, data };
}

// RCS 버튼 타입: 0=URL, 1=전화, 2=지도
interface RcsButton {
  type: string;     // '0'=URL, '1'=전화, '2'=지도
  name: string;     // 버튼 텍스트
  val1: string;     // URL/전화번호/위치이름
  val2?: string;    // 지도 fallback URL
  reward?: string;  // 리워드 버튼 여부 ('1'=리워드)
}

// RCS 타입별 제한 사항 (BizChat API v0.29.0 규격)
const RCS_TYPE_LIMITS: Record<number, {
  name: string;
  maxMsgLength: number;
  maxButtonTextLength: number;
  maxUrlCount: number;
  requiresImage: boolean;
  imageMaxSize: string;
  imageResolution: string;
}> = {
  0: { // 스탠다드
    name: '스탠다드',
    maxMsgLength: 1100,
    maxButtonTextLength: 17,
    maxUrlCount: 3,
    requiresImage: false,
    imageMaxSize: '0.3MB',
    imageResolution: '400x240, 500x300',
  },
  1: { // LMS
    name: 'LMS',
    maxMsgLength: 1100,
    maxButtonTextLength: 17,
    maxUrlCount: 3,
    requiresImage: false,
    imageMaxSize: '',
    imageResolution: '',
  },
  2: { // 슬라이드
    name: '슬라이드',
    maxMsgLength: 300, // 슬라이드당 300자, 모든 슬라이드 합산 1300자
    maxButtonTextLength: 13,
    maxUrlCount: 1, // 슬라이드당 1개
    requiresImage: true,
    imageMaxSize: '1MB (장당 300KB)',
    imageResolution: '464x336',
  },
  3: { // 이미지 강조 A (3:4)
    name: '이미지 강조 A (3:4)',
    maxMsgLength: 1100,
    maxButtonTextLength: 16,
    maxUrlCount: 3,
    requiresImage: true,
    imageMaxSize: '1MB',
    imageResolution: '900x1200',
  },
  4: { // 이미지 강조 B (1:1)
    name: '이미지 강조 B (1:1)',
    maxMsgLength: 1100,
    maxButtonTextLength: 16,
    maxUrlCount: 3,
    requiresImage: true,
    imageMaxSize: '1MB',
    imageResolution: '900x900',
  },
  5: { // 상품 소개 세로
    name: '상품 소개 세로',
    maxMsgLength: 1100,
    maxButtonTextLength: 16,
    maxUrlCount: 3,
    requiresImage: true,
    imageMaxSize: '1MB',
    imageResolution: '900x560',
  },
};

// BizChat 파일 ID 형식 검증 (38자리)
function isBizChatFileId(id: string | undefined | null): boolean {
  if (!id) return false;
  // BizChat 파일 ID: 38자리 영숫자 (예: 19ca34b180394f15a9c66f798b65df95404202)
  return /^[a-f0-9]{38}$/i.test(id);
}

// RCS 메시지 검증
interface RcsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateRcsMessage(
  rcsType: number,
  slides: Array<{
    msg?: string;
    imgOrigId?: string;
    buttons?: Array<{ name: string }>;
    urls?: string[];
  }>,
  slideCnt?: number
): RcsValidationResult {
  const result: RcsValidationResult = { valid: true, errors: [], warnings: [] };
  const limits = RCS_TYPE_LIMITS[rcsType];
  
  if (!limits) {
    result.errors.push(`지원되지 않는 RCS 타입입니다: ${rcsType}`);
    result.valid = false;
    return result;
  }

  // 슬라이드 템플릿 검증
  if (rcsType === 2) {
    const actualSlideCnt = slideCnt || slides.length;
    if (actualSlideCnt < 1 || actualSlideCnt > 6) {
      result.errors.push(`슬라이드 개수는 1~6개여야 합니다 (현재: ${actualSlideCnt}개)`);
      result.valid = false;
    }
    
    // 전체 메시지 길이 합산 (최대 1300자)
    const totalMsgLength = slides.reduce((sum, s) => sum + (s.msg?.length || 0), 0);
    if (totalMsgLength > 1300) {
      result.errors.push(`슬라이드 전체 메시지 길이가 1300자를 초과합니다 (현재: ${totalMsgLength}자)`);
      result.valid = false;
    }
  }

  // 각 슬라이드/메시지 검증
  slides.forEach((slide, idx) => {
    const slidePrefix = slides.length > 1 ? `슬라이드 ${idx + 1}: ` : '';
    
    // 메시지 길이 검증
    const msgLength = slide.msg?.length || 0;
    if (msgLength > limits.maxMsgLength) {
      result.errors.push(
        `${slidePrefix}메시지 길이가 ${limits.maxMsgLength}자를 초과합니다 (현재: ${msgLength}자)`
      );
      result.valid = false;
    }

    // 이미지 필수 여부 검증 (경고만)
    if (limits.requiresImage && !slide.imgOrigId) {
      result.warnings.push(
        `${slidePrefix}${limits.name} 템플릿은 이미지가 필요합니다 (권장 해상도: ${limits.imageResolution})`
      );
    }

    // 이미지 파일 ID 형식 검증 (URL 사용 시 경고)
    if (slide.imgOrigId && !isBizChatFileId(slide.imgOrigId)) {
      result.warnings.push(
        `${slidePrefix}이미지는 BizChat 파일 ID(38자리) 형식이어야 합니다. URL 직접 사용 시 오류가 발생할 수 있습니다.`
      );
    }

    // URL 개수 검증
    const urlCount = slide.urls?.length || 0;
    if (urlCount > limits.maxUrlCount) {
      result.errors.push(
        `${slidePrefix}URL 개수가 ${limits.maxUrlCount}개를 초과합니다 (현재: ${urlCount}개)`
      );
      result.valid = false;
    }

    // 버튼 텍스트 길이 검증
    slide.buttons?.forEach((btn, btnIdx) => {
      if (btn.name && btn.name.length > limits.maxButtonTextLength) {
        result.errors.push(
          `${slidePrefix}버튼 ${btnIdx + 1} 텍스트가 ${limits.maxButtonTextLength}자를 초과합니다 (현재: ${btn.name.length}자)`
        );
        result.valid = false;
      }
    });
  });

  return result;
}

// BizChat 캠페인 생성 (POST /api/v1/cmpn/create) - 문서 v0.29.0 규격
async function createCampaignInBizChat(campaign: any, message: any, useProduction: boolean = false) {
  // billingType: 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  let billingType = 0;
  if (campaign.messageType === 'RCS') {
    billingType = campaign.rcsType === 2 ? 1 : 3;
  } else if (campaign.messageType === 'MMS') {
    billingType = 2;
  }

  // 발송 모수: sndGoalCnt의 150% 이상, 최대 400,000
  const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
  const sndMosu = campaign.sndMosu || Math.min(Math.ceil(sndGoalCnt * 1.5), 400000);

  // rcvType에 따라 ATS vs Maptics 분기
  // rcvType=0,10: ATS 일반 (sndMosu, sndMosuQuery, sndMosuDesc, atsSndStartDate 필요)
  // rcvType=1,2: Maptics 지오펜스 (collStartDate, collEndDate, collSndDate, sndGeofenceId 필요, ATS 필드 제외)
  const isMaptics = campaign.rcvType === 1 || campaign.rcvType === 2;
  
  const payload: Record<string, unknown> = {
    // 필수 파라미터
    tgtCompanyName: campaign.tgtCompanyName || '위픽',
    name: campaign.name,
    sndNum: campaign.sndNum,
    rcvType: campaign.rcvType ?? 0,
    sndGoalCnt: sndGoalCnt,
    billingType: billingType,
    isTmp: campaign.isTmp ?? 0,
    settleCnt: campaign.settleCnt ?? sndGoalCnt,
    
    // 무료 수신거부 번호
    adverDeny: campaign.adverDeny || '1504',
    
    // Callback URL 등록
    cb: {
      state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
    },
  };

  // ATS 전용 필드 (rcvType=0,10일 때만 포함)
  if (!isMaptics) {
    payload.sndMosu = sndMosu;
    payload.sndMosuFlag = campaign.sndMosuFlag ?? 0;
    
    // 발송 시작일 (unix timestamp, 초단위)
    if (campaign.atsSndStartDate || campaign.scheduledAt) {
      payload.atsSndStartDate = toUnixTimestamp(campaign.atsSndStartDate || campaign.scheduledAt);
    }
    
    // 발송 모수 필터 설명 (HTML 형식)
    if (campaign.sndMosuDesc) {
      const desc = campaign.sndMosuDesc;
      const isHtml = typeof desc === 'string' && (desc.startsWith('<html>') || desc.includes('<body>'));
      payload.sndMosuDesc = isHtml 
        ? desc 
        : `<html><body><p>${desc}</p></body></html>`;
    }
    
    // 발송 모수 쿼리 (SQL 문자열)
    if (campaign.sndMosuQuery) {
      const query = campaign.sndMosuQuery;
      payload.sndMosuQuery = typeof query === 'string' ? query : JSON.stringify(query);
    }
  }

  // Maptics 전용 필드 (rcvType=1,2일 때만 포함)
  if (isMaptics) {
    // 지오펜스 ID (필수)
    if (campaign.sndGeofenceId) {
      payload.sndGeofenceId = campaign.sndGeofenceId;
    }
    // 수집 시작일시 (필수)
    if (campaign.collStartDate) {
      payload.collStartDate = toUnixTimestamp(campaign.collStartDate);
    }
    // 수집 종료일시 (필수)
    if (campaign.collEndDate) {
      payload.collEndDate = toUnixTimestamp(campaign.collEndDate);
    }
    // 발송 시작일시 (필수)
    if (campaign.collSndDate) {
      payload.collSndDate = toUnixTimestamp(campaign.collSndDate);
    }
    // 실시간 발송 옵션 (rcvType=1일 때)
    if (campaign.rcvType === 1) {
      if (campaign.sndDayDiv !== undefined) payload.sndDayDiv = campaign.sndDayDiv;
      if (campaign.rtStartHhmm) payload.rtStartHhmm = campaign.rtStartHhmm;
      if (campaign.rtEndHhmm) payload.rtEndHhmm = campaign.rtEndHhmm;
    }
  }

  // MDN 직접 지정 (rcvType=10일 때)
  if (campaign.rcvType === 10 && campaign.mdnFileId) {
    payload.mdnFileId = campaign.mdnFileId;
  }

  // RCS 타입 (200 = RCS 아님)
  if (campaign.messageType === 'RCS' && campaign.rcsType !== undefined) {
    payload.rcsType = campaign.rcsType;
    // 슬라이드 개수 (rcsType=2일 때)
    if (campaign.rcsType === 2 && campaign.slideCnt) {
      payload.slideCnt = campaign.slideCnt;
    }
  }

  // 쿠폰 기능
  if (campaign.useCoupon) {
    payload.useCoupon = campaign.useCoupon;
    if (campaign.coupon) {
      payload.coupon = campaign.coupon; // 쿠폰 파일 ID
    }
  }

  // 리워드 지급 제한 기간
  if (campaign.rewardEndDate) {
    payload.rewardEndDate = toUnixTimestamp(campaign.rewardEndDate);
  }

  // 리타겟팅 (이전 캠페인 수신자 제외, 최대 10개)
  if (campaign.retarget && Array.isArray(campaign.retarget) && campaign.retarget.length > 0) {
    payload.retarget = campaign.retarget.slice(0, 10).map((r: any) => ({
      id: r.id,
      recv: r.recv ?? true,
      react: r.react ?? false,
    }));
  }

  // MMS 메시지 객체 (BizChat API 규격 v0.29.0)
  // billingType별 파일 규칙:
  // - LMS(0): 파일 없음 → fileInfo 필드 생략
  // - MMS(2): 파일 필수 → fileInfo.list 포함
  // - RCS MMS(1): RCS에서 처리
  // - RCS LMS(3): RCS에서 처리
  const needsFileForBilling = payload.billingType === 2; // MMS만 mms.fileInfo 필요
  
  // RCS 메시지의 경우: LMS fallback에 전용 필드 사용 (lmsUrlLinks, lmsImageUrl)
  // RCS가 아닌 경우: 일반 필드 사용 (urlLinks, imageUrl)
  const isRcsMessage = campaign.messageType === 'RCS';
  
  // URL 링크 정규화 - 배열 또는 {list: []} 형식 모두 지원
  const normalizeUrlList = (urls: unknown): string[] => {
    if (!urls) return [];
    if (Array.isArray(urls)) return urls;
    if (typeof urls === 'object' && urls !== null && 'list' in urls) {
      const list = (urls as { list?: unknown }).list;
      return Array.isArray(list) ? list : [];
    }
    return [];
  };
  
  const lmsUrlLinks = normalizeUrlList(message?.lmsUrlLinks);
  const rcsUrlLinks = normalizeUrlList(message?.urlLinks);
  const mmsUrlList: string[] = isRcsMessage && lmsUrlLinks.length > 0 
    ? lmsUrlLinks 
    : (rcsUrlLinks.length > 0 ? rcsUrlLinks : (message?.urls || []));
  const mmsUrlLink = mmsUrlList.length > 0 
    ? { list: mmsUrlList.slice(0, 3), reward: message?.urlLinkReward }
    : {}; // 링크가 없으면 빈 객체 {} (문서 규격)
    
  // MMS 이미지 첨부 (MMS billingType=2일 때만)
  // RCS의 경우 LMS fallback 전용 이미지 사용
  const lmsImageUrl = message?.lmsImageUrl;
  const mmsImageUrl = isRcsMessage && lmsImageUrl ? lmsImageUrl : message?.imageUrl;
  const hasImage = !!mmsImageUrl;
  
  // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
  // mms 객체 구성 - 조건부 필드 포함 (빈 객체 생략)
  // RCS 메시지의 경우 lmsContent가 있으면 fallback 메시지로 사용 (RCS 미지원 기기용)
  const fallbackMsg = message?.lmsContent || message?.content || '';
  const mmsObj: Record<string, unknown> = {
    title: message?.title || '',
    msg: fallbackMsg,
    ...(message?.urlFile && { urlFile: message.urlFile }),
    ...(mmsUrlList.length > 0 && { urlLink: { list: mmsUrlList.slice(0, 3), reward: message?.urlLinkReward } }),
    ...(needsFileForBilling && hasImage && { fileInfo: { list: [{ origId: mmsImageUrl }] } }),
  };
  
  payload.mms = mmsObj;

  // MMS 개별 URL 파일 리워드 (urlFile 사용 시)
  if (message?.urlFile && message?.urlFileReward !== undefined) {
    payload.mms = {
      ...payload.mms as object,
      urlFileReward: message.urlFileReward,
    };
  }

  // RCS 메시지 배열 (BizChat API 규격 v0.29.0)
  // - billingType이 RCS(1 또는 3)인 경우 필수
  // - rcs[].urlLink: 링크가 없으면 empty object
  // - rcs[].buttons: 버튼이 없으면 empty object
  // - buttons.list[].type: 문자열이어야 함 ('0', '1', '2')
  const isRcsBilling = payload.billingType === 1 || payload.billingType === 3;
  
  // BizChat API 규격 v0.29.0: rcs 필드는 항상 포함 (문서 예제: "rcs": [])
  if (campaign.messageType === 'RCS' || isRcsBilling) {
    const rcsSlides = message?.rcsSlides || [{ slideNum: 1 }];
    // RCS 전용 URL 사용 (urlLinks - RCS 탭에서 입력된 URL) - 이미 위에서 rcsUrlLinks로 정규화됨
    const rcsUrlList: string[] = message?.rcsUrls || rcsUrlLinks;

    // RCS 메시지 검증 (경고 로깅, 에러는 API에서 반환)
    const rcsValidation = validateRcsMessage(
      campaign.rcsType ?? 0,
      rcsSlides.map((s: any) => ({
        msg: s.msg || s.content || message?.content,
        imgOrigId: s.imgOrigId || s.imageUrl,
        buttons: s.buttons || message?.rcsButtons,
        urls: s.urls || rcsUrlList,
      })),
      campaign.slideCnt
    );
    
    if (rcsValidation.warnings.length > 0) {
      console.log('[BizChat RCS] Warnings:', rcsValidation.warnings.join(', '));
    }
    if (!rcsValidation.valid) {
      console.error('[BizChat RCS] Validation errors:', rcsValidation.errors.join(', '));
      // 에러가 있어도 BizChat API에서 최종 검증하므로 계속 진행
      // 클라이언트에서 미리 검증하도록 안내 필요
    }
    const rcsButtons: RcsButton[] = message?.rcsButtons || [];
    
    payload.rcs = rcsSlides.map((slide: any, idx: number) => {
      // URL 링크 객체 구성 (없으면 빈 객체 {})
      const slideUrls = slide.urls || rcsUrlList.slice(0, 3);
      const urlLink = slideUrls.length > 0 
        ? { list: slideUrls, reward: slide.urlLinkReward || message?.rcsUrlLinkReward }
        : {}; // 링크가 없으면 빈 객체 {} (문서 규격)
      
      // 버튼 객체 구성 (없으면 빈 객체 {})
      // BizChat API 규격: button.type은 문자열이어야 함 ('0'=URL, '1'=앱실행, '2'=전화)
      // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
      const buttonList = (slide.buttons || rcsButtons.slice(0, 2)).map((btn: any) => ({
        ...btn,
        type: String(btn.type), // 숫자를 문자열로 변환
      }));
      
      // RCS 슬라이드 객체 - 조건부 필드 포함 (빈 객체 생략)
      const rcsSlideObj: Record<string, unknown> = {
        slideNum: slide.slideNum || idx + 1,
        title: slide.title || message?.title || '',
        msg: slide.msg || slide.content || message?.content || '',
        ...(slide.imgOrigId || slide.imageUrl ? { imgOrigId: slide.imgOrigId || slide.imageUrl } : {}),
        ...(slide.urlFile ? { urlFile: slide.urlFile } : {}),
        // 조건부: 빈 객체 생략
        ...(slideUrls.length > 0 && { urlLink: { list: slideUrls, reward: slide.urlLinkReward || message?.rcsUrlLinkReward } }),
        ...(buttonList.length > 0 && { buttons: { list: buttonList } }),
        ...(slide.opts?.list?.length > 0 && { opts: slide.opts }),
      };
        
      return rcsSlideObj;
    });
  }
  // LMS/MMS일 때는 rcs 필드 자체를 생략 (빈 배열도 포함하지 않음)
  // 위에서 조건부로 payload.rcs를 설정하므로 LMS/MMS에서는 rcs가 없음

  console.log('[BizChat Create] Payload keys:', Object.keys(payload));
  console.log('[BizChat Create] Has rcs field:', 'rcs' in payload);
  console.log('[BizChat Create] Has fileInfo in mms:', 'fileInfo' in (payload.mms as Record<string, unknown> || {}));
  
  return callBizChatAPI('/api/v1/cmpn/create', 'POST', payload, useProduction);
}

// BizChat 캠페인 수정 (POST /api/v1/cmpn/update)
async function updateCampaignInBizChat(bizchatCampaignId: string, updateData: Record<string, unknown>, useProduction: boolean = false) {
  // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
  const cleanedData = { ...updateData };
  
  // mms 내부 빈 필드 정리
  if (cleanedData.mms && typeof cleanedData.mms === 'object') {
    const mms = { ...cleanedData.mms as Record<string, unknown> };
    
    // 빈 객체 필드 제거: fileInfo, urlLink
    if (mms.fileInfo && typeof mms.fileInfo === 'object' && Object.keys(mms.fileInfo as object).length === 0) {
      delete mms.fileInfo;
    }
    if (mms.urlLink && typeof mms.urlLink === 'object') {
      const urlLink = mms.urlLink as { list?: unknown[] };
      if (!urlLink.list || urlLink.list.length === 0) {
        delete mms.urlLink;
      }
    }
    // 빈 문자열 urlFile 제거
    if (mms.urlFile === '' || mms.urlFile === null || mms.urlFile === undefined) {
      delete mms.urlFile;
    }
    cleanedData.mms = mms;
  }
  
  // rcs 배열 정리
  if (Array.isArray(cleanedData.rcs)) {
    if (cleanedData.rcs.length === 0) {
      // 빈 배열이면 완전히 제거
      delete cleanedData.rcs;
    } else {
      // 각 슬라이드 내 빈 필드 정리
      cleanedData.rcs = (cleanedData.rcs as Record<string, unknown>[]).map(slide => {
        const cleanedSlide = { ...slide };
        
        // 빈 객체 필드 제거: urlLink, buttons, opts
        if (cleanedSlide.urlLink && typeof cleanedSlide.urlLink === 'object') {
          const urlLink = cleanedSlide.urlLink as { list?: unknown[] };
          if (!urlLink.list || urlLink.list.length === 0) {
            delete cleanedSlide.urlLink;
          }
        }
        if (cleanedSlide.buttons && typeof cleanedSlide.buttons === 'object') {
          const buttons = cleanedSlide.buttons as { list?: unknown[] };
          if (!buttons.list || buttons.list.length === 0) {
            delete cleanedSlide.buttons;
          }
        }
        if (cleanedSlide.opts && typeof cleanedSlide.opts === 'object') {
          const opts = cleanedSlide.opts as { list?: unknown[] };
          if (!opts.list || opts.list.length === 0) {
            delete cleanedSlide.opts;
          }
        }
        // 빈 문자열/undefined 필드 제거
        if (cleanedSlide.urlFile === '' || cleanedSlide.urlFile === null || cleanedSlide.urlFile === undefined) {
          delete cleanedSlide.urlFile;
        }
        if (cleanedSlide.imgOrigId === '' || cleanedSlide.imgOrigId === null || cleanedSlide.imgOrigId === undefined) {
          delete cleanedSlide.imgOrigId;
        }
        
        return cleanedSlide;
      });
    }
  }
  
  // cb가 빈 객체면 제거
  if (cleanedData.cb && typeof cleanedData.cb === 'object' && Object.keys(cleanedData.cb as object).length === 0) {
    delete cleanedData.cb;
  }
  
  console.log('[BizChat Update] Payload keys:', Object.keys(cleanedData));
  console.log('[BizChat Update] MMS keys:', Object.keys((cleanedData.mms as object) || {}));
  
  // Query Parameter로 id 전달
  return callBizChatAPI(`/api/v1/cmpn/update?id=${bizchatCampaignId}`, 'POST', cleanedData, useProduction);
}

// BizChat 캠페인 승인 요청 (POST /api/v1/cmpn/appr/req)
async function requestCampaignApproval(bizchatCampaignId: string, useProduction: boolean = false) {
  // Query Parameter로 id 전달 (문서 규격)
  return callBizChatAPI(`/api/v1/cmpn/appr/req?id=${bizchatCampaignId}`, 'POST', {}, useProduction);
}

// BizChat 캠페인 조회 (GET /api/v1/cmpn)
async function getCampaignFromBizChat(bizchatCampaignId: string, useProduction: boolean = false) {
  // Query Parameter로 id 전달 (문서 규격)
  return callBizChatAPI(`/api/v1/cmpn?id=${bizchatCampaignId}`, 'GET', undefined, useProduction);
}

// BizChat 캠페인 테스트 발송 (POST /api/v1/cmpn/test/send)
async function testSendCampaign(bizchatCampaignId: string, mdnList: string[], sendTime?: number, useProduction: boolean = false) {
  // Query Parameter로 id 전달
  const payload: Record<string, unknown> = {
    mdn: mdnList,
  };
  if (sendTime) {
    payload.sendTime = sendTime;
  }
  return callBizChatAPI(`/api/v1/cmpn/test/send?id=${bizchatCampaignId}`, 'POST', payload, useProduction);
}

// BizChat 캠페인 통계 조회 (GET /api/v1/cmpn/stat/read)
async function getCampaignStats(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/stat/read?id=${bizchatCampaignId}`, 'GET', undefined, useProduction);
}

// BizChat 캠페인 취소 (POST /api/v1/cmpn/cancel)
async function cancelCampaign(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/cancel?id=${bizchatCampaignId}`, 'POST', {}, useProduction);
}

// BizChat 캠페인 중단 (POST /api/v1/cmpn/stop)
async function stopCampaign(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/stop?id=${bizchatCampaignId}`, 'POST', {}, useProduction);
}

// BizChat 캠페인 MDN 목록 조회 (GET /api/v1/cmpn/mdn)
async function getCampaignMdnList(bizchatCampaignId: string, pageNumber: number = 1, pageSize: number = 100, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/mdn?id=${bizchatCampaignId}&pageNumber=${pageNumber}&pageSize=${pageSize}`, 'GET', undefined, useProduction);
}

// BizChat 캠페인 결과 조회 (GET /api/v1/cmpn/result)
async function getCampaignResult(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/result?id=${bizchatCampaignId}`, 'GET', undefined, useProduction);
}

// BizChat 캠페인 삭제 (POST /api/v1/cmpn/delete)
// 임시 저장(isTmp=1) 또는 임시 등록(state=0) 캠페인만 삭제 가능, 최대 10개
async function deleteCampaignsInBizChat(campaignIds: string[], useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/cmpn/delete', 'POST', { ids: campaignIds }, useProduction);
}

// BizChat 캠페인 테스트 발송 취소 (POST /api/v1/cmpn/test/send/cancel)
async function cancelTestSend(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/test/send/cancel?id=${bizchatCampaignId}`, 'POST', {}, useProduction);
}

// BizChat 캠페인 테스트 발송 조회 (GET /api/v1/cmpn/test)
async function getTestResults(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/test?id=${bizchatCampaignId}`, 'GET', undefined, useProduction);
}

// BizChat 캠페인 대상 검증 (POST /api/v1/cmpn/verify/mdn)
// rcvType=10(직접 지정)일 때 MDN 파일과 발송 목표 건수 비교
async function verifyMdn(bizchatCampaignId: string, useProduction: boolean = false) {
  return callBizChatAPI(`/api/v1/cmpn/verify/mdn?id=${bizchatCampaignId}`, 'POST', {}, useProduction);
}

// BizChat 캠페인 목록 조회 (POST /api/v1/cmpn/list)
async function getCampaignList(
  pageNumber: number = 0, 
  pageSize: number = 10, 
  filters: { tgtCompanyName?: string; name?: string; states?: number[]; isTmp?: number } = {},
  useProduction: boolean = false
) {
  return callBizChatAPI('/api/v1/cmpn/list', 'POST', {
    pageNumber,
    pageSize,
    ...filters,
  }, useProduction);
}

// 환경 감지 함수: 개발 완료 전까지 항상 개발 API 사용
// SK 담당자 요청: 개발 완료될 때까지 상용 URL이 아닌 개발 URL(gw-dev.bizchat1.co.kr:8443)로 요청
function detectProductionEnvironment(req: VercelRequest): boolean {
  // ⚠️ 개발 완료 전까지 항상 개발 API 사용 (BIZCHAT_USE_PROD=true 설정 시에만 운영 API 사용)
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
  if (forceDevMode) {
    console.log('[BizChat] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
    return false;
  }
  
  // 명시적으로 환경 지정된 경우
  if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
  if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
  
  // Vercel 환경 변수로 자동 감지
  // VERCEL_ENV: 'production', 'preview', 'development'
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') return true;
  
  // NODE_ENV 확인
  if (process.env.NODE_ENV === 'production') return true;
  
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const useProduction = detectProductionEnvironment(req);
  
  // 환경 로깅
  console.log(`[BizChat] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'} (VERCEL_ENV=${process.env.VERCEL_ENV}, NODE_ENV=${process.env.NODE_ENV})`);

  // POST: 캠페인 액션 처리
  if (req.method === 'POST') {
    try {
      const { campaignId, action, mdnList, sendTime } = req.body;

      // delete 액션은 campaignIds (BizChat IDs) 배열을 사용하므로 별도 처리
      if (action === 'delete') {
        if (!req.body.campaignIds || !Array.isArray(req.body.campaignIds)) {
          return res.status(400).json({ error: 'campaignIds array is required' });
        }

        const bizchatIds: string[] = req.body.campaignIds;
        
        // 모든 BizChat ID에 대해 소유자 확인
        for (const bizchatId of bizchatIds) {
          const campaignCheck = await db.select()
            .from(campaigns)
            .where(eq(campaigns.bizchatCampaignId, bizchatId));
          
          if (campaignCheck.length === 0) {
            return res.status(404).json({ 
              error: `Campaign with BizChat ID ${bizchatId} not found` 
            });
          }
          
          if (campaignCheck[0].userId !== auth.userId) {
            return res.status(403).json({ 
              error: 'Access denied: You do not own this campaign' 
            });
          }
        }

        const result = await deleteCampaignsInBizChat(bizchatIds, useProduction);
        
        if (result.data.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            action: 'delete',
            error: 'Failed to delete campaign in BizChat',
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data,
          });
        }

        return res.status(200).json({
          success: true,
          action: 'delete',
          result: result.data,
        });
      }

      // list 액션은 campaignId 없이 BizChat 전체 캠페인 목록 조회 (연동규격서 7.6)
      // URL: /api/v1/cmpn/list
      // Method: POST
      // Query Parameter: tid (Y)
      // Body: pageNumber (Y), pageSize (Y), tgtCompanyName (N), name (N), states (N), isTmp (N)
      if (action === 'list') {
        const pageNumber = typeof req.body.pageNumber === 'number' ? req.body.pageNumber : 0;
        let pageSize = typeof req.body.pageSize === 'number' ? req.body.pageSize : 10;
        
        // pageSize 검증: 0보다 크고 20보다 작은 정수
        if (pageSize <= 0 || pageSize >= 20) {
          console.warn(`[BizChat List] Invalid pageSize ${pageSize}, adjusting to 10`);
          pageSize = 10;
        }
        
        // 선택적 필터 파라미터 구성
        const filters: { tgtCompanyName?: string; name?: string; states?: number[]; isTmp?: number } = {};
        
        if (req.body.tgtCompanyName && typeof req.body.tgtCompanyName === 'string') {
          filters.tgtCompanyName = req.body.tgtCompanyName;
        }
        if (req.body.name && typeof req.body.name === 'string') {
          filters.name = req.body.name;
        }
        if (req.body.states && Array.isArray(req.body.states)) {
          filters.states = req.body.states.filter((s: unknown) => typeof s === 'number');
        }
        if (typeof req.body.isTmp === 'number' && (req.body.isTmp === 0 || req.body.isTmp === 1)) {
          filters.isTmp = req.body.isTmp;
        }
        
        console.log(`[BizChat List] pageNumber=${pageNumber}, pageSize=${pageSize}, filters=`, JSON.stringify(filters));
        
        const result = await getCampaignList(pageNumber, pageSize, filters, useProduction);
        
        if (result.data.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            action: 'list',
            error: 'Failed to get campaign list from BizChat',
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data,
          });
        }

        // 응답 구조 (연동규격서):
        // data.pageNumber, data.pageSize, data.totalPage, data.totalAmount, data.list
        return res.status(200).json({
          success: true,
          action: 'list',
          tid: result.data.tid,
          pageNumber: result.data.data?.pageNumber ?? pageNumber,
          pageSize: result.data.data?.pageSize ?? pageSize,
          totalPage: result.data.data?.totalPage ?? 0,
          totalAmount: result.data.data?.totalAmount ?? 0,
          campaigns: result.data.data?.list ?? [],
          result: result.data,
        });
      }

      if (!campaignId) {
        return res.status(400).json({ error: 'campaignId is required' });
      }

      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campaignResult[0];

      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const messageResult = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
      const message = messageResult[0];

      switch (action) {
        case 'create': {
          if (campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign already registered to BizChat' });
          }

          const sendTimeValidation = validateSendTime(campaign.atsSndStartDate || campaign.scheduledAt);
          if (!sendTimeValidation.valid) {
            return res.status(400).json({ error: sendTimeValidation.error });
          }

          const result = await createCampaignInBizChat(campaign, message, useProduction);
          
          // 성공 코드: S000001
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              error: 'Failed to create campaign in BizChat',
              bizchatError: result.data,
            });
          }

          const bizchatCampaignId = result.data.data?.id;
          if (bizchatCampaignId) {
            await db.update(campaigns)
              .set({ 
                bizchatCampaignId,
                statusCode: 0, // 임시등록
                status: 'temp_registered',
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaignId));
          }

          return res.status(200).json({
            success: true,
            action: 'create',
            bizchatCampaignId,
            result: result.data,
          });
        }

        case 'update': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          // 수정 가능 상태 체크: 임시등록(0), 검수완료(2), 반려(17)만 수정 가능
          const editableStates = [0, 2, 17];
          if (!editableStates.includes(campaign.statusCode || 0)) {
            return res.status(400).json({ 
              error: 'Campaign cannot be modified in current state',
              currentState: campaign.statusCode,
              editableStates,
            });
          }

          const updateData = req.body.updateData || {};
          
          // 발송 시간이 변경되는 경우 검증
          if (updateData.atsSndStartDate) {
            const newSendDate = typeof updateData.atsSndStartDate === 'number' 
              ? new Date(updateData.atsSndStartDate * 1000) 
              : new Date(updateData.atsSndStartDate);
            const updateTimeValidation = validateSendTime(newSendDate);
            if (!updateTimeValidation.valid) {
              return res.status(400).json({ error: updateTimeValidation.error });
            }
          }

          const result = await updateCampaignInBizChat(campaign.bizchatCampaignId, updateData, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              error: 'Failed to update campaign in BizChat',
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data,
            });
          }

          await db.update(campaigns)
            .set({ updatedAt: new Date() })
            .where(eq(campaigns.id, campaignId));

          return res.status(200).json({
            success: true,
            action: 'update',
            result: result.data,
          });
        }

        case 'approve': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const approvalTimeValidation = validateSendTime(campaign.atsSndStartDate || campaign.scheduledAt);
          if (!approvalTimeValidation.valid) {
            return res.status(400).json({ error: approvalTimeValidation.error });
          }

          const result = await requestCampaignApproval(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              error: 'Failed to request approval',
              bizchatError: result.data,
            });
          }

          await db.update(campaigns)
            .set({ 
              statusCode: 10, // 승인요청
              status: 'approval_requested',
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, campaignId));

          return res.status(200).json({
            success: true,
            action: 'approve',
            result: result.data,
          });
        }

        case 'test': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          // 레거시 SIM_ ID 검출 (이전 버전에서 생성된 시뮬레이션 캠페인)
          if (campaign.bizchatCampaignId.startsWith('SIM_')) {
            return res.status(400).json({ 
              success: false,
              error: '이 캠페인은 유효한 BizChat 캠페인 ID가 없어요. 캠페인을 다시 생성해주세요.',
              bizchatCode: 'INVALID_CAMPAIGN_ID',
            });
          }

          if (!mdnList || !Array.isArray(mdnList) || mdnList.length === 0) {
            return res.status(400).json({ 
              error: 'mdn array is required for test send',
              example: { mdnList: ['01012345678', '01087654321'] },
            });
          }

          if (mdnList.length > 20) {
            return res.status(400).json({ 
              error: 'Maximum 20 numbers for test send',
              maxMdnCount: 20,
              providedCount: mdnList.length,
            });
          }

          // MDN 형식 검증 (숫자만 허용)
          const invalidMdns = mdnList.filter((mdn: string) => !/^\d{10,11}$/.test(mdn.replace(/[^0-9]/g, '')));
          if (invalidMdns.length > 0) {
            return res.status(400).json({
              error: 'Invalid phone number format',
              invalidNumbers: invalidMdns,
              format: '10-11 digits without dashes (e.g., 01012345678)',
            });
          }

          if (sendTime) {
            const testTimeValidation = validateSendTime(new Date(sendTime * 1000));
            if (!testTimeValidation.valid) {
              return res.status(400).json({ error: testTimeValidation.error });
            }
          }

          // MDN 정규화 (하이픈 제거)
          const normalizedMdnList = mdnList.map((mdn: string) => mdn.replace(/[^0-9]/g, ''));
          const result = await testSendCampaign(campaign.bizchatCampaignId, normalizedMdnList, sendTime, useProduction);
          
          if (result.data.code !== 'S000001') {
            // E000005: Resource not exists - 캠페인이 BizChat에 존재하지 않음
            if (result.data.code === 'E000005') {
              return res.status(400).json({
                success: false,
                action: 'test',
                error: '캠페인이 BizChat 서버에 존재하지 않아요. 캠페인을 다시 생성해주세요.',
                bizchatCode: result.data.code,
                bizchatMessage: result.data.msg,
                hint: '개발 환경에서 생성된 캠페인은 운영 환경에서 사용할 수 없어요.',
                environment: useProduction ? 'production' : 'development',
              });
            }
            
            return res.status(400).json({
              success: false,
              action: 'test',
              error: 'Failed to send test message',
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data,
            });
          }

          return res.status(200).json({
            success: true,
            action: 'test',
            message: `테스트 발송이 요청되었습니다 (${normalizedMdnList.length}건)`,
            mdnCount: normalizedMdnList.length,
            result: result.data,
          });
        }

        case 'stats': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await getCampaignStats(campaign.bizchatCampaignId, useProduction);
          
          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'stats',
            result: result.data,
          });
        }

        case 'cancel': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await cancelCampaign(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code === 'S000001') {
            await db.update(campaigns)
              .set({ 
                statusCode: 25,
                status: 'cancelled',
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaignId));
          }

          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'cancel',
            result: result.data,
          });
        }

        case 'stop': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await stopCampaign(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code === 'S000001') {
            await db.update(campaigns)
              .set({ 
                statusCode: 35,
                status: 'stopped',
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaignId));
          }

          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'stop',
            result: result.data,
          });
        }

        case 'mdn': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const pageNumber = req.body.pageNumber || 1;
          const pageSize = req.body.pageSize || 100;
          const result = await getCampaignMdnList(campaign.bizchatCampaignId, pageNumber, pageSize, useProduction);
          
          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'mdn',
            pageNumber,
            pageSize,
            result: result.data,
          });
        }

        case 'result': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await getCampaignResult(campaign.bizchatCampaignId, useProduction);
          
          return res.status(200).json({
            success: result.data.code === 'S000001',
            action: 'result',
            result: result.data,
          });
        }

        case 'testCancel': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          if (campaign.bizchatCampaignId.startsWith('SIM_')) {
            return res.status(400).json({ 
              success: false,
              error: '이 캠페인은 유효한 BizChat 캠페인 ID가 없어요. 캠페인을 다시 생성해주세요.',
              bizchatCode: 'INVALID_CAMPAIGN_ID',
            });
          }

          const result = await cancelTestSend(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              success: false,
              action: 'testCancel',
              error: 'Failed to cancel test send',
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data,
            });
          }

          return res.status(200).json({
            success: true,
            action: 'testCancel',
            result: result.data,
          });
        }

        case 'testResult': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          if (campaign.bizchatCampaignId.startsWith('SIM_')) {
            return res.status(400).json({ 
              success: false,
              error: '이 캠페인은 유효한 BizChat 캠페인 ID가 없어요. 캠페인을 다시 생성해주세요.',
              bizchatCode: 'INVALID_CAMPAIGN_ID',
            });
          }

          const result = await getTestResults(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              success: false,
              action: 'testResult',
              error: 'Failed to get test results',
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data,
            });
          }

          return res.status(200).json({
            success: true,
            action: 'testResult',
            result: result.data,
          });
        }

        case 'verifyMdn': {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          // MDN 검증은 rcvType=10(직접 지정)일 때만 의미 있음
          if (campaign.rcvType !== 10) {
            return res.status(400).json({ 
              error: 'MDN verification is only available for rcvType=10 (direct MDN)',
              currentRcvType: campaign.rcvType,
            });
          }

          const result = await verifyMdn(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              success: false,
              action: 'verifyMdn',
              error: 'Failed to verify MDN',
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data,
            });
          }

          return res.status(200).json({
            success: true,
            action: 'verifyMdn',
            result: result.data,
          });
        }

        case 'read': {
          // 캠페인 조회 (GET /api/v1/cmpn) - 7.2 규격
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: 'Campaign not registered to BizChat' });
          }

          const result = await getCampaignFromBizChat(campaign.bizchatCampaignId, useProduction);
          
          if (result.data.code !== 'S000001') {
            return res.status(400).json({
              success: false,
              action: 'read',
              error: 'Failed to read campaign from BizChat',
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data,
            });
          }

          return res.status(200).json({
            success: true,
            action: 'read',
            bizchatCampaignId: campaign.bizchatCampaignId,
            campaign: result.data.data,
            result: result.data,
          });
        }

        default:
          return res.status(400).json({ 
            error: 'Invalid action',
            validActions: ['create', 'read', 'update', 'approve', 'test', 'testCancel', 'testResult', 'stats', 'cancel', 'stop', 'delete', 'mdn', 'result', 'verifyMdn', 'list'],
          });
      }

    } catch (error) {
      console.error('[BizChat Campaigns] Error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  // GET: BizChat 캠페인 상태 조회
  if (req.method === 'GET') {
    try {
      const { campaignId } = req.query;

      if (!campaignId || typeof campaignId !== 'string') {
        return res.status(400).json({ error: 'campaignId query parameter is required' });
      }

      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campaignResult[0];

      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!campaign.bizchatCampaignId) {
        return res.status(200).json({
          registered: false,
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            statusCode: campaign.statusCode,
          },
        });
      }

      const result = await getCampaignFromBizChat(campaign.bizchatCampaignId, useProduction);

      return res.status(200).json({
        registered: true,
        bizchatCampaignId: campaign.bizchatCampaignId,
        localStatus: {
          status: campaign.status,
          statusCode: campaign.statusCode,
        },
        bizchatStatus: result.data,
      });

    } catch (error) {
      console.error('[BizChat Campaigns] Error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

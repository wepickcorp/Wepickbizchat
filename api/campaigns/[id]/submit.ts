import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';
const CALLBACK_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://wepickbizchat-new.vercel.app';

// 지역명 → hcode 매핑 (BizChat API 규격 v0.29.0)
const REGION_HCODE_MAP: Record<string, string> = {
  '서울': '11', '경기': '41', '인천': '28', '부산': '26', '대구': '27',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36', '강원': '51',
  '충북': '43', '충남': '44', '전북': '52', '전남': '46', '경북': '47',
  '경남': '48', '제주': '50',
};

// BizChat API 규격 v0.31.0에 맞는 ATS 필터 조건 인터페이스
interface ATSFilterCondition {
  data: unknown;
  dataType: 'number' | 'code' | 'boolean' | 'cate';
  metaType: 'svc' | 'loc' | 'pro' | 'app' | 'tel' | 'STREET';
  code: string;
  desc: string;
  not: boolean;
}

// BizChat ATS 규격에 맞는 카테고리 데이터 인터페이스
interface CategoryData {
  cat1: string;
  cat2?: string;
  cat3?: string;
}

// 앱/웹 카테고리 코드 → 카테고리 구조 매핑
const APP_CATEGORY_MAP: Record<string, CategoryData> = {
  '11ST_002': { cat1: '가구/인테리어', cat2: '침대/소파' },
  'APP_002': { cat1: '게임', cat2: '보드게임' },
  'GAME_001': { cat1: '게임' },
  'EDU_001': { cat1: '교육/학습' },
  'ENT_001': { cat1: '엔터테인먼트' },
  'SHOP_001': { cat1: '쇼핑' },
  'FINANCE_001': { cat1: '금융' },
  'TRAVEL_001': { cat1: '여행/교통' },
  'FOOD_001': { cat1: '음식/배달' },
  'HEALTH_001': { cat1: '건강/의료' },
};

// 예측 모델(pro) 코드 매핑 - 규격서 기준
const PROFILING_CODE_MAP: Record<string, { code: string; dataType: 'boolean' | 'number' | 'code'; desc: string }> = {
  'CALL_002': { code: 'cpm12', dataType: 'number', desc: 'MMS스코어' },
  'LOC_001': { code: 'cpm04', dataType: 'number', desc: '이사 확률' },
  'GOLF': { code: 'cpm06', dataType: 'boolean', desc: '레저 관련 방문(골프)' },
  'CAMPING': { code: 'cpm07', dataType: 'boolean', desc: '레저 관련 방문(캠핑)' },
  'HIKING': { code: 'cpm08', dataType: 'boolean', desc: '레저 관련 방문(등산)' },
  'SKI': { code: 'cpm09', dataType: 'boolean', desc: '레저 관련 방문(스키장)' },
  'THEME_PARK': { code: 'cpm10', dataType: 'boolean', desc: '레저 관련 방문(워터파크/놀이공원)' },
  'LIFE_STAGE': { code: 'life_stage_seg', dataType: 'code', desc: 'Life Stage Seg.' },
  'SELF_EMPLOYED': { code: 'self_employed_yn', dataType: 'boolean', desc: '자영업자 추정' },
  'OFFICE_WORKER': { code: 'PF00003-s01', dataType: 'boolean', desc: '직장인 추정' },
};

// 구형 sndMosuQuery 형식을 BizChat API 규격에 맞게 변환
function convertLegacySndMosuQuery(queryStr: string): { query: string; desc: string; isLegacySql?: boolean } {
  // 레거시 SQL 형식 감지 (괄호로 시작하는 경우)
  const trimmed = queryStr.trim();
  if (trimmed.startsWith('(') || trimmed.startsWith('SELECT') || trimmed.includes('cust_age_cd')) {
    console.log('[Submit] Detected legacy SQL format in sndMosuQuery, returning as-is');
    return { query: trimmed, desc: '레거시 SQL 형식', isLegacySql: true };
  }
  
  try {
    const parsed = JSON.parse(queryStr);
    
    // 이미 올바른 형식인지 확인
    // Case 1: $and/$or 컨테이너가 있는 경우 - 내부 조건 검증 후 반환
    if (parsed['$and'] || parsed['$or']) {
      console.log('[Submit] sndMosuQuery has $and/$or container, validating conditions...');
      const container = parsed['$and'] || parsed['$or'];
      const operator = parsed['$and'] ? '$and' : '$or';
      
      // 각 조건 검증 및 변환
      const validatedConditions: ATSFilterCondition[] = [];
      const descParts: string[] = [];
      
      for (const cond of container) {
        const validated = validateAndConvertCondition(cond);
        if (validated) {
          validatedConditions.push(validated);
          if (validated.desc) descParts.push(validated.desc);
        }
      }
      
      const newQuery = { [operator]: validatedConditions };
      console.log('[Submit] Validated sndMosuQuery:', JSON.stringify(newQuery));
      return { query: JSON.stringify(newQuery), desc: descParts.join(', ') };
    }
    
    // Case 2: 단일 조건 객체 (metaType/code/dataType 필드가 있는 경우)
    if (parsed.metaType && parsed.dataType) {
      console.log('[Submit] sndMosuQuery is single condition, validating and wrapping in $and');
      const validated = validateAndConvertCondition(parsed);
      if (validated) {
        const wrapped = { '$and': [validated] };
        return { query: JSON.stringify(wrapped), desc: validated.desc || '' };
      }
      return { query: JSON.stringify({ '$and': [] }), desc: '' };
    }

    // 구형 형식: { age: { min, max }, gender, region: [...], interest: [...], behavior: [...] }
    const conditions: ATSFilterCondition[] = [];
    const descParts: string[] = [];

    // 연령 변환 (BizChat 규격: gt/lt 사용)
    if (parsed.age && (parsed.age.min !== undefined || parsed.age.max !== undefined)) {
      const min = parsed.age.min ?? 0;
      const max = parsed.age.max ?? 100;
      conditions.push({
        data: { gt: min, lt: max },
        dataType: 'number',
        metaType: 'svc',
        code: 'cust_age_cd',
        desc: `연령: ${min}세 ~ ${max}세`,
        not: false,
      });
      descParts.push(`연령: ${min}세 ~ ${max}세`);
    }

    // 성별 변환 (BizChat API 규격: code는 'sex_cd', data는 ['1'] 또는 ['2'])
    if (parsed.gender && parsed.gender !== 'all') {
      const genderValue = parsed.gender === 'male' || parsed.gender === 'M' ? '1' : '2';
      const genderName = genderValue === '1' ? '남자' : '여자';
      conditions.push({
        data: [genderValue],
        dataType: 'code',
        metaType: 'svc',
        code: 'sex_cd',
        desc: `성별: ${genderName}`,
        not: false,
      });
      descParts.push(`성별: ${genderName}`);
    }

    // 지역 변환 (region 또는 regions 둘 다 지원)
    const regions = parsed.region || parsed.regions;
    if (regions && Array.isArray(regions) && regions.length > 0) {
      const hcodes: string[] = [];
      const regionNames: string[] = [];
      for (const region of regions) {
        const hcode = REGION_HCODE_MAP[region];
        if (hcode) {
          hcodes.push(hcode);
          regionNames.push(region);
        }
      }
      if (hcodes.length > 0) {
        conditions.push({
          data: hcodes,
          dataType: 'code',
          metaType: 'loc',
          code: 'home_location',
          desc: `추정 집주소: ${regionNames.join(', ')}`,
          not: false,
        });
        descParts.push(`지역: ${regionNames.join(', ')}`);
      }
    }

    // 관심사(interests) - BizChat ATS에서 실제 지원하는 카테고리가 아닌 경우 스킵
    // 현재 UI에서 선택하는 관심사 코드(11ST_002, APP_002 등)는 내부 코드이며,
    // BizChat ATS는 실제 카테고리명(예: "게임", "VR/AR게임")만 지원
    // 정확한 카테고리 매핑이 완료되기 전까지는 app 필터를 제외
    const interests = parsed.interest || parsed.interests;
    if (interests && Array.isArray(interests) && interests.length > 0) {
      console.log('[Submit] Skipping app filter until proper category mapping is implemented:', interests);
      // TODO: BizChat /api/v1/ats/meta/webapp API로 실제 카테고리 조회 후 매핑 필요
    }

    // 행동(behaviors) - BizChat ATS에서 실제 지원하는 pro 코드만 허용
    // 현재 UI에서 선택하는 행동 코드(LOC_001, CALL_002 등)는 내부 코드이며,
    // 정확한 매핑이 완료되기 전까지는 pro 필터를 제외
    const behaviors = parsed.behavior || parsed.behaviors;
    if (behaviors && Array.isArray(behaviors) && behaviors.length > 0) {
      console.log('[Submit] Skipping pro filter until proper code mapping is verified:', behaviors);
      // TODO: BizChat /api/v1/ats/meta/filter?type=pro API로 실제 코드 확인 후 매핑 필요
    }

    // 통신사(carrier) - BizChat 규격에 없음, 스킵
    const carrier = parsed.carrier || parsed.carrierTypes;
    if (carrier && Array.isArray(carrier) && carrier.length > 0) {
      console.log('[Submit] Skipping carrier filter (not in BizChat spec):', carrier);
    }

    // 기기(device) - BizChat 규격에 없음, 스킵
    const device = parsed.device || parsed.deviceTypes;
    if (device && Array.isArray(device) && device.length > 0) {
      console.log('[Submit] Skipping device filter (not in BizChat spec):', device);
    }

    // BizChat API 규격: 루트 객체는 항상 $and 컨테이너여야 함
    const newQuery = { '$and': conditions };
    const result = JSON.stringify(newQuery);
    console.log('[Submit] Converted legacy sndMosuQuery:', result);
    return { query: result, desc: descParts.join(', ') };
  } catch (e) {
    console.error('[Submit] Failed to convert sndMosuQuery:', e);
    return { query: JSON.stringify({ '$and': [] }), desc: '' };
  }
}

// 개별 조건 검증 및 변환
function validateAndConvertCondition(cond: Record<string, unknown>): ATSFilterCondition | null {
  if (!cond.metaType || !cond.dataType) {
    console.log('[Submit] Invalid condition (missing metaType/dataType):', cond);
    return null;
  }

  const metaType = cond.metaType as string;
  const dataType = cond.dataType as string;
  const code = cond.code as string || '';
  const desc = cond.desc as string || '';
  const not = cond.not as boolean || false;
  let data = cond.data;

  // svc 메타타입 검증
  if (metaType === 'svc') {
    const validSvcCodes = ['cust_age_cd', 'sex_cd', 'ad_agr_yn', 'sms_rejt_yn', 'smile_yn', 'prod_scrb', 'mbr_card_gr_cd'];
    if (!validSvcCodes.includes(code)) {
      console.log(`[Submit] Invalid svc code "${code}", skipping`);
      return null;
    }
  }

  // app/tel 메타타입 - 정확한 카테고리 매핑이 완료되기 전까지 스킵
  // BizChat ATS는 실제 카테고리명(예: "게임", "VR/AR게임")만 지원하며,
  // 현재 UI에서 사용하는 코드(11ST_002 등)와 매핑되지 않음
  if (metaType === 'app' || metaType === 'tel') {
    console.log(`[Submit] Skipping ${metaType} filter until proper category mapping is implemented`);
    return null;
  }

  // pro 메타타입 - 정확한 코드 매핑이 완료되기 전까지 스킵
  // 현재 UI에서 사용하는 코드(LOC_001, CALL_002 등)가 BizChat ATS 코드와 매핑되지 않음
  if (metaType === 'pro') {
    console.log(`[Submit] Skipping pro filter until proper code mapping is verified`);
    return null;
  }

  // loc 메타타입 검증
  if (metaType === 'loc') {
    const validLocCodes = ['home_location', 'work_location'];
    if (!validLocCodes.includes(code)) {
      console.log(`[Submit] Invalid loc code "${code}", skipping`);
      return null;
    }
  }

  return {
    data,
    dataType: dataType as 'number' | 'code' | 'boolean' | 'cate',
    metaType: metaType as 'svc' | 'loc' | 'pro' | 'app' | 'tel',
    code,
    desc,
    not,
  };
}

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  templateId: text('template_id'),
  messageType: text('message_type'),
  sndNum: text('snd_num'),
  tgtCompanyName: text('tgt_company_name'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  sndMosuQuery: text('snd_mosu_query'),
  sndMosuDesc: text('snd_mosu_desc'),
  settleCnt: integer('settle_cnt').default(0),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  targetCount: integer('target_count'),
  budget: text('budget'),
  atsSndStartDate: timestamp('ats_snd_start_date'),
  scheduledAt: timestamp('scheduled_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  urlLinks: jsonb('url_links'), // { list: string[], reward?: number }
  buttons: jsonb('buttons'), // { list: [{ type, name, val1, val2? }] }
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type'),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  urlLinks: jsonb('url_links'), // { list: string[], reward?: number }
  buttons: jsonb('buttons'), // { list: [{ type, name, val1, val2? }] }
  status: text('status').default('draft'),
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

function generateTid(): string {
  return Date.now().toString();
}

function toUnixTimestamp(date: Date | string | null): number | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor(d.getTime() / 1000);
}

// 한국 시간대(KST, UTC+9) 기준으로 시간 정보 추출
function getKSTTimeComponents(date: Date): { hours: number; minutes: number; date: Date } {
  // UTC 기준 시간에 9시간을 더해 KST로 변환
  // getUTCHours()를 사용하여 서버 로컬 시간대와 무관하게 정확한 시간 계산
  let hours = date.getUTCHours() + 9;
  if (hours >= 24) hours -= 24;
  const minutes = date.getUTCMinutes();
  
  // KST 기준 Date 객체도 생성 (디버깅 용도)
  const kstTime = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  
  return {
    hours,
    minutes,
    date: kstTime,
  };
}

// 발송 시간 유효성 검증 (BizChat API 규격 v0.29.0)
// 1. 현재 시간 대비 1시간 이후여야 함
// 2. 9시부터 19시(19시 미포함) 사이여야 함 (KST 기준)
// 3. 10분 단위로 시간 체크
function validateSendTime(sendDate: Date | string | null): { valid: boolean; error?: string; adjustedDate?: Date } {
  if (!sendDate) return { valid: true };
  
  const targetDate = typeof sendDate === 'string' ? new Date(sendDate) : new Date(sendDate);
  const now = new Date();
  
  // KST 기준 시간 추출
  const kstTarget = getKSTTimeComponents(targetDate);
  
  // 1. 발송 시간대 체크 (09:00~19:00, 19시 미포함) - KST 기준
  if (kstTarget.hours < 9 || kstTarget.hours >= 19) {
    return { 
      valid: false, 
      error: `발송 시간은 09:00~19:00 사이여야 합니다 (현재: ${kstTarget.hours}:${kstTarget.minutes.toString().padStart(2, '0')} KST)` 
    };
  }
  
  // 2. 최소 1시간 여유 체크
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  if (targetDate < oneHourFromNow) {
    return { valid: false, error: '발송 시간은 현재 시간으로부터 최소 1시간 이후여야 합니다' };
  }
  
  // 3. 10분 단위 체크 (자동 올림 처리)
  const adjustedDate = new Date(targetDate);
  adjustedDate.setSeconds(0);
  adjustedDate.setMilliseconds(0);
  const minutes = adjustedDate.getMinutes();
  const remainder = minutes % 10;
  if (remainder !== 0) {
    adjustedDate.setMinutes(minutes + (10 - remainder));
  }
  
  // 조정 후 KST 기준으로 다시 체크
  const kstAdjusted = getKSTTimeComponents(adjustedDate);
  if (kstAdjusted.hours >= 19) {
    return { valid: false, error: '발송 시간은 19:00 이전이어야 합니다 (KST)' };
  }
  
  return { valid: true, adjustedDate };
}

// 문자열 길이 검증 (BizChat API 규격 v0.29.0)
function validateStringLengths(data: {
  name?: string;
  tgtCompanyName?: string;
  title?: string;
  msg?: string;
}): { valid: boolean; error?: string } {
  if (data.name && data.name.length > 40) {
    return { valid: false, error: `캠페인명은 최대 40자까지 입력 가능합니다 (현재: ${data.name.length}자)` };
  }
  if (data.tgtCompanyName && data.tgtCompanyName.length > 100) {
    return { valid: false, error: `고객사명은 최대 100자까지 입력 가능합니다 (현재: ${data.tgtCompanyName.length}자)` };
  }
  if (data.title && data.title.length > 30) {
    return { valid: false, error: `메시지 제목은 최대 30자까지 입력 가능합니다 (현재: ${data.title.length}자)` };
  }
  if (data.msg && data.msg.length > 1000) {
    return { valid: false, error: `메시지 본문은 최대 1000자까지 입력 가능합니다 (현재: ${data.msg.length}자)` };
  }
  return { valid: true };
}

// ATS 발송 모수(sndMosu) 검증 (BizChat API 규격 v0.29.0)
// - 최소값: sndGoalCnt × 150%
// - 최대값: 400,000
// - sndMosu가 0이면 승인 불가
function validateATSMosu(data: {
  rcvType: number;
  sndGoalCnt: number;
  sndMosu: number | null | undefined;
  sndMosuFlag?: number;
}): { valid: boolean; error?: string; warning?: string } {
  // ATS 일반 타겟팅(rcvType=0)일 때만 검증
  if (data.rcvType !== 0) {
    return { valid: true };
  }
  
  const sndGoalCnt = data.sndGoalCnt || 0;
  const sndMosu = data.sndMosu || 0;
  const sndMosuFlag = data.sndMosuFlag ?? 0; // 0: 150% 체크 사용, 1: 체크 안 함
  
  // 모수가 0이면 승인 불가
  if (sndMosu === 0) {
    return { 
      valid: false, 
      error: '발송 대상 모수가 0명입니다. 타겟팅 조건을 변경해주세요.' 
    };
  }
  
  // 최대값 체크: 400,000
  if (sndMosu > 400000) {
    return { 
      valid: false,
      error: `발송 모수(${sndMosu.toLocaleString()}명)가 최대값(400,000명)을 초과합니다. 타겟팅 조건을 좁혀주세요.` 
    };
  }
  
  // 150% 체크 (sndMosuFlag=0일 때만)
  if (sndMosuFlag === 0) {
    const minMosu = Math.ceil(sndGoalCnt * 1.5);
    if (sndMosu < minMosu) {
      return { 
        valid: false, 
        error: `발송 모수(${sndMosu.toLocaleString()}명)가 발송 목표(${sndGoalCnt.toLocaleString()}건)의 150%(${minMosu.toLocaleString()}명) 미만입니다. 타겟팅 조건을 변경하거나 발송 목표를 줄여주세요.`,
        warning: `발송 모수가 부족합니다. 최소 ${minMosu.toLocaleString()}명 이상이 필요합니다.`
      };
    }
  }
  
  return { valid: true };
}

// Maptics 캠페인 collStartDate 검증 (BizChat API 규격 v0.29.0)
// - 최소: 캠페인 생성 시간 +1시간 이후
// - 권장: 수집 시작일 24시간 이전에 캠페인 생성
function validateMapticsCollStartDate(data: {
  rcvType: number;
  collStartDate?: Date | string | null;
}): { valid: boolean; error?: string; warning?: string } {
  // Maptics 타겟팅(rcvType=1,2)일 때만 검증
  if (data.rcvType !== 1 && data.rcvType !== 2) {
    return { valid: true };
  }
  
  if (!data.collStartDate) {
    return { 
      valid: false, 
      error: 'Maptics 캠페인은 수집 시작일(collStartDate)이 필수입니다.' 
    };
  }
  
  const collStartDate = typeof data.collStartDate === 'string' 
    ? new Date(data.collStartDate) 
    : data.collStartDate;
  const now = new Date();
  
  // 최소 1시간 이후
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  if (collStartDate < oneHourFromNow) {
    return { 
      valid: false, 
      error: '수집 시작일은 현재 시간으로부터 최소 1시간 이후여야 합니다.' 
    };
  }
  
  // 권장: 24시간 이상 여유
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (collStartDate < oneDayFromNow) {
    return { 
      valid: true, 
      warning: '⚠️ Maptics 캠페인은 수집 시작일 최소 24시간 전에 생성하시는 것을 권장합니다. 승인 절차를 고려해주세요.' 
    };
  }
  
  return { valid: true };
}

// ATS 발송 모수 API 호출하여 SQL 형식의 query 획득
// BizChat API 규격: /api/v1/ats/mosu 호출 후 응답의 query 필드를 sndMosuQuery에 사용
async function callATSMosuAPI(
  filterPayload: Record<string, unknown>,
  useProduction: boolean = false
): Promise<{ success: boolean; query: string; filterStr: string; count: number; error?: string }> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    return { success: false, query: '', filterStr: '', count: 0, error: 'API key not configured' };
  }

  const tid = generateTid();
  const url = `${baseUrl}/api/v1/ats/mosu?tid=${tid}`;
  
  console.log(`[ATS Mosu] POST ${url}`);
  console.log(`[ATS Mosu] Payload:`, JSON.stringify(filterPayload, null, 2));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify(filterPayload),
    });

    const responseText = await response.text();
    console.log(`[ATS Mosu] Response: ${response.status} - ${responseText.substring(0, 1000)}`);

    const data = JSON.parse(responseText);
    
    if (data.code === 'S000001' && data.data?.query) {
      console.log(`[ATS Mosu] Success - query: ${data.data.query.substring(0, 200)}...`);
      return {
        success: true,
        query: data.data.query, // SQL 형식의 query 문자열
        filterStr: data.data.filterStr || '',
        count: data.data.cnt || 0,
      };
    }
    
    console.error(`[ATS Mosu] Failed - code: ${data.code}, msg: ${data.msg}`);
    return { 
      success: false, 
      query: '', 
      filterStr: '', 
      count: 0, 
      error: `ATS API failed: ${data.code} - ${data.msg}` 
    };
  } catch (error) {
    console.error(`[ATS Mosu] Error:`, error);
    return { 
      success: false, 
      query: '', 
      filterStr: '', 
      count: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
): Promise<{ status: number; data: Record<string, unknown> }> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const envKeyName = useProduction ? 'BIZCHAT_PROD_API_KEY' : 'BIZCHAT_DEV_API_KEY';
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  console.log(`[BizChat Submit] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[BizChat Submit] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat Submit] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  console.log(`[BizChat Submit] VERCEL_ENV: ${process.env.VERCEL_ENV}, NODE_ENV: ${process.env.NODE_ENV}`);

  if (!apiKey) {
    console.error(`[BizChat Submit] ❌ API key not configured: ${envKeyName}`);
    console.error(`[BizChat Submit] Available keys - DEV: ${!!process.env.BIZCHAT_DEV_API_KEY}, PROD: ${!!process.env.BIZCHAT_PROD_API_KEY}`);
    throw new Error(`BizChat API 키가 설정되지 않았습니다 (${envKeyName}). Vercel 환경변수를 확인해주세요.`);
  }

  const tid = generateTid();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  const db = getDb();
  
  // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
  // SK 담당자 요청: 개발 완료될 때까지 상용 URL이 아닌 개발 URL(gw-dev.bizchat1.co.kr:8443)로 요청
  const detectProductionEnvironment = (): boolean => {
    // ⚠️ 개발 완료 전까지 항상 개발 API 사용
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
    if (forceDevMode) {
      console.log('[BizChat Submit] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  
  const useProduction = detectProductionEnvironment();
  console.log(`[BizChat Submit] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'} (VERCEL_ENV=${process.env.VERCEL_ENV})`);

  try {
    const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
    const campaign = campaignResult[0];

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messageResult = await db.select().from(messages).where(eq(messages.campaignId, id));
    let message = messageResult[0];

    if (!message && campaign.templateId) {
      const templateResult = await db.select().from(templates).where(eq(templates.id, campaign.templateId));
      const template = templateResult[0];
      if (template) {
        message = {
          id: crypto.randomUUID(),
          campaignId: id,
          title: template.title || '',
          content: template.content,
          imageUrl: template.imageUrl || null,
          urlLinks: template.urlLinks || null,
          buttons: template.buttons || null,
        };
      }
    }

    if (!message) {
      return res.status(400).json({ error: 'Campaign message not found' });
    }

    const { scheduledAt } = req.body || {};

    // BizChat API 규격 v0.29.0: 문자열 길이 검증
    const lengthValidation = validateStringLengths({
      name: campaign.name,
      tgtCompanyName: campaign.tgtCompanyName || undefined,
      title: message?.title || undefined,
      msg: message?.content,
    });
    if (!lengthValidation.valid) {
      return res.status(400).json({ error: lengthValidation.error });
    }

    // BizChat API 규격 v0.29.0: 발송 시간 검증
    // rcvType 0: ATS 타겟팅 - 시간 검증 필요 (1시간 이후, 09:00~19:00)
    // rcvType 10: MDN 직접 지정 (테스트 발송) - 시간 검증 완화 (10분 단위 조정만)
    const rcvType = campaign.rcvType ?? 0;
    let sendDateToValidate = scheduledAt || campaign.atsSndStartDate || campaign.scheduledAt;
    
    // 발송 시간이 없으면 기본값 생성
    if (!sendDateToValidate && (rcvType === 0 || rcvType === 10)) {
      const now = new Date();
      // rcvType 10 (테스트 발송): 10분 후로 설정 (BizChat에서 실제로 허용)
      // rcvType 0 (ATS 타겟팅): 1시간 후로 설정 (규격 요구사항)
      const offsetMinutes = rcvType === 10 ? 10 : 60;
      const defaultSendDate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
      defaultSendDate.setSeconds(0);
      defaultSendDate.setMilliseconds(0);
      // 10분 단위로 올림
      const minutes = defaultSendDate.getMinutes();
      const remainder = minutes % 10;
      if (remainder > 0) {
        defaultSendDate.setMinutes(minutes + (10 - remainder));
      }
      sendDateToValidate = defaultSendDate;
      console.log(`[Submit] No scheduledAt provided, using default send date for rcvType ${rcvType}:`, defaultSendDate.toISOString());
    }
    
    // 테스트 발송(rcvType: 10)은 시간 검증 완화 - 10분 단위 조정만 수행
    let adjustedSendDate: Date | string | null | undefined = sendDateToValidate;
    if (rcvType === 10) {
      // 테스트 발송: 10분 단위 조정만 수행 (1시간 제한 및 시간대 검증 스킵)
      if (sendDateToValidate) {
        const targetDate = typeof sendDateToValidate === 'string' ? new Date(sendDateToValidate) : new Date(sendDateToValidate);
        targetDate.setSeconds(0);
        targetDate.setMilliseconds(0);
        const minutes = targetDate.getMinutes();
        const remainder = minutes % 10;
        if (remainder !== 0) {
          targetDate.setMinutes(minutes + (10 - remainder));
        }
        adjustedSendDate = targetDate;
      }
      console.log('[Submit] Test campaign (rcvType=10): Skipping strict time validation');
    } else {
      // ATS 타겟팅 (rcvType: 0): 전체 시간 검증 수행
      const timeValidation = validateSendTime(sendDateToValidate);
      if (!timeValidation.valid) {
        return res.status(400).json({ error: timeValidation.error });
      }
      adjustedSendDate = timeValidation.adjustedDate || sendDateToValidate;
    }

    // ========== ATS 발송 모수(sndMosu) 검증 ==========
    // BizChat API 규격 v0.29.0: sndMosu는 sndGoalCnt의 150% 이상, 최대 400,000
    const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
    const mosuValidation = validateATSMosu({
      rcvType: rcvType,
      sndGoalCnt: sndGoalCnt,
      sndMosu: campaign.sndMosu,
      sndMosuFlag: 0, // 기본: 150% 체크 사용
    });
    if (!mosuValidation.valid) {
      console.error('[Submit] ATS mosu validation failed:', mosuValidation.error);
      return res.status(400).json({ 
        error: mosuValidation.error,
        hint: '발송 목표 건수를 줄이거나 타겟팅 조건을 조정하여 발송 대상 모수를 늘려주세요.'
      });
    }
    if (mosuValidation.warning) {
      console.warn('[Submit] ATS mosu warning:', mosuValidation.warning);
    }

    // ========== Maptics collStartDate 검증 ==========
    // BizChat API 규격 v0.29.0: 수집 시작일은 1시간 이후, 24시간 전 생성 권장
    const mapticsValidation = validateMapticsCollStartDate({
      rcvType: rcvType,
      collStartDate: (campaign as any).collStartDate,
    });
    if (!mapticsValidation.valid) {
      console.error('[Submit] Maptics collStartDate validation failed:', mapticsValidation.error);
      return res.status(400).json({ 
        error: mapticsValidation.error,
        hint: 'Maptics 캠페인은 수집 시작일 최소 24시간 전에 생성하시는 것을 권장합니다.'
      });
    }
    if (mapticsValidation.warning) {
      console.warn('[Submit] Maptics collStartDate warning:', mapticsValidation.warning);
    }

    if (!campaign.bizchatCampaignId) {
      // billingType 결정 (BizChat API 규격 v0.29.0)
      // 0: LMS (파일 없음, rcs 비어있음)
      // 1: RCS MMS (파일 있음, rcs 슬라이드)
      // 2: MMS (파일 있음, rcs 비어있음)
      // 3: RCS LMS (파일 없음, rcs 슬라이드)
      let billingType = 0;
      const hasImage = !!message?.imageUrl;
      if (campaign.messageType === 'RCS') {
        billingType = hasImage ? 1 : 3; // RCS MMS or RCS LMS
      } else if (campaign.messageType === 'MMS' || hasImage) {
        billingType = 2; // MMS
      }
      // else: LMS (0)

      const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
      // sndMosu: 캠페인에 저장된 값 사용 (타겟팅 설정 시 ATS mosu API로 계산됨)
      const sndMosu = campaign.sndMosu || Math.ceil(sndGoalCnt * 1.5);
      console.log(`[Submit Create] Using sndMosu: ${sndMosu.toLocaleString()} (from ${campaign.sndMosu ? 'campaign' : 'calculated'})`);

      // BizChat API 규격 v0.29.0: billingType별 mms/rcs 구성
      // - LMS(0): mms만, fileInfo 없음, rcs 빈 배열
      // - RCS MMS(1): mms + rcs, 파일 있음
      // - MMS(2): mms만, fileInfo 있음, rcs 빈 배열
      // - RCS LMS(3): mms + rcs, 파일 없음
      const isRcs = billingType === 1 || billingType === 3;
      const needsFile = billingType === 1 || billingType === 2;
      
      // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
      // URL 리스트 추출 (jsonb 컬럼은 Drizzle이 자동으로 파싱함)
      const urlLinksData = (message as any)?.urlLinks as { list?: string[]; reward?: number } | null;
      const mmsUrlList: string[] = urlLinksData?.list || (message as any)?.urls || [];
      const urlReward = urlLinksData?.reward;
      
      // buttons 추출 (jsonb 컬럼은 Drizzle이 자동으로 파싱함)
      const buttonsData = (message as any)?.buttons as { list?: Array<{ type: string; name: string; val1: string; val2?: string }> } | null;
      const rcsButtons = buttonsData?.list || (message as any)?.rcsButtons || [];
      
      // MMS 객체 구성 - 조건부로 필드 포함 (빈 객체/배열 생략)
      const mmsObject: Record<string, unknown> = {
        title: message?.title || '',
        msg: message?.content || '',
        ...(needsFile && message?.imageUrl && { fileInfo: { list: [{ origId: message.imageUrl }] } }),
        ...((message as any)?.urlFile && { urlFile: (message as any).urlFile }),
        ...(mmsUrlList.length > 0 && { urlLink: { list: mmsUrlList.slice(0, 3), ...(urlReward !== undefined && { reward: urlReward }) } }),
      };
      
      // RCS 배열 구성 - RCS 타입일 때만 포함, 아니면 완전히 생략
      const rcsSlide: Record<string, unknown> | null = isRcs ? {
        slideNum: 1,
        title: message?.title || '',
        msg: message?.content || '',
        ...(needsFile && message?.imageUrl && { imgOrigId: message.imageUrl }),
        ...((message as any)?.rcsUrlFile && { urlFile: (message as any).rcsUrlFile }),
        ...(mmsUrlList.length > 0 && { urlLink: { list: mmsUrlList.slice(0, 3), ...(urlReward !== undefined && { reward: urlReward }) } }),
        ...(rcsButtons.length > 0 && { 
          buttons: { list: rcsButtons.map((btn: any) => ({ ...btn, type: String(btn.type) })) }
        }),
        ...((message as any)?.rcsOpts?.list?.length > 0 && { opts: (message as any).rcsOpts }),
      } : null;

      const createPayload: Record<string, unknown> = {
        tgtCompanyName: campaign.tgtCompanyName || '위픽',
        name: campaign.name,
        sndNum: campaign.sndNum,
        rcvType: campaign.rcvType ?? 0,
        sndGoalCnt: sndGoalCnt,
        billingType: billingType,
        isTmp: 0,
        settleCnt: campaign.settleCnt ?? sndGoalCnt,
        sndMosu: sndMosu,
        sndMosuFlag: 0, // 150% 체크 사용
        adverDeny: '1504',
        cb: {
          state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
        },
        mms: mmsObject,
        // RCS 타입일 때만 rcs 배열 포함 (빈 배열 생략 - E000002 방지)
        ...(rcsSlide && { rcs: [rcsSlide] }),
      };

      // 타겟팅 정보 추가 (ATS 발송 모수 필터)
      // BizChat API 규격: sndMosuQuery는 ATS mosu API 응답의 query 문자열(SQL 형식)을 사용해야 함
      let atsFilterStr = '';
      if (campaign.sndMosuQuery) {
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        
        // JSON 형식의 필터 조건을 ATS mosu API에 전송하여 SQL query 획득
        const { query: convertedQuery, desc } = convertLegacySndMosuQuery(queryString);
        let filterPayload: Record<string, unknown>;
        try {
          filterPayload = JSON.parse(convertedQuery);
        } catch {
          filterPayload = { '$and': [] };
        }
        
        console.log('[Submit] Calling ATS mosu API to get SQL query...');
        console.log('[Submit] Filter payload:', JSON.stringify(filterPayload, null, 2));
        
        // ATS mosu API 호출하여 SQL 형식의 query 획득
        const atsResult = await callATSMosuAPI(filterPayload, useProduction);
        
        if (atsResult.success && atsResult.query) {
          // ATS API 응답의 SQL query를 sndMosuQuery로 사용
          createPayload.sndMosuQuery = atsResult.query;
          atsFilterStr = atsResult.filterStr;
          console.log('[Submit] sndMosuQuery (SQL from ATS):', atsResult.query.substring(0, 200) + '...');
          console.log('[Submit] ATS count:', atsResult.count);
        } else {
          // ATS API 실패 시 에러 반환
          console.error('[Submit] ATS mosu API failed:', atsResult.error);
          return res.status(400).json({
            error: `ATS 타겟팅 조회 실패: ${atsResult.error || 'Unknown error'}`,
            hint: 'ATS 발송 모수 API 호출에 실패했습니다. 타겟팅 조건을 확인해주세요.',
          });
        }
      }
      
      // BizChat API 규격: sndMosuDesc는 HTML 형식이어야 함
      // 우선순위: 1. ATS API 응답의 filterStr, 2. DB에 저장된 sndMosuDesc
      if (atsFilterStr || campaign.sndMosuDesc) {
        const desc = atsFilterStr || campaign.sndMosuDesc || '';
        const isHtml = desc.startsWith('<html>') || desc.includes('<body>') || desc.includes('<table>');
        createPayload.sndMosuDesc = isHtml 
          ? desc 
          : `<html><body><p>${desc}</p></body></html>`;
        console.log('[Submit] sndMosuDesc:', createPayload.sndMosuDesc?.toString().substring(0, 200) + '...');
      }

      // 10분 단위로 조정된 발송 시간 적용
      if (adjustedSendDate) {
        const adjustedTimestamp = toUnixTimestamp(
          typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate
        );
        createPayload.atsSndStartDate = adjustedTimestamp;
        console.log('[Submit] atsSndStartDate (adjusted):', adjustedTimestamp, new Date((adjustedTimestamp || 0) * 1000).toISOString());
      }

      // RCS 타입 설정 (billingType 1 또는 3일 때)
      if (isRcs && campaign.rcsType !== undefined) {
        createPayload.rcsType = campaign.rcsType;
        // slideCnt: rcsType=2(캐러셀)일 때 슬라이드 개수
        if (campaign.rcsType === 2) {
          createPayload.slideCnt = rcsArray.length || 1;
        }
      }

      console.log('[Submit] Creating campaign in BizChat...');
      console.log('[Submit] Full createPayload:', JSON.stringify(createPayload, null, 2));
      const createResult = await callBizChatAPI('/api/v1/cmpn/create', 'POST', createPayload, useProduction);
      
      if (createResult.data.code !== 'S000001') {
        console.error('[Submit] BizChat API error:', createResult.data);
        return res.status(400).json({
          error: `BizChat 캠페인 생성 실패: ${createResult.data.msg || createResult.data.code}`,
          response: createResult.data,
        });
      }
      
      const bizchatCampaignId = createResult.data.data?.id as string;
      
      if (!bizchatCampaignId) {
        return res.status(400).json({
          error: 'BizChat did not return campaign ID',
          response: createResult.data,
        });
      }

      // DB에 조정된 발송 시간도 저장 (재제출 시 일관성 유지)
      const updateData: Record<string, unknown> = { 
        bizchatCampaignId,
        statusCode: 0,
        status: 'temp_registered',
        updatedAt: new Date(),
      };
      if (adjustedSendDate) {
        updateData.atsSndStartDate = typeof adjustedSendDate === 'string' 
          ? new Date(adjustedSendDate) 
          : adjustedSendDate;
        updateData.scheduledAt = updateData.atsSndStartDate;
      }
      await db.update(campaigns)
        .set(updateData)
        .where(eq(campaigns.id, id));

      console.log(`[Submit] Created BizChat campaign: ${bizchatCampaignId}`);
      campaign.bizchatCampaignId = bizchatCampaignId;
    } else {
      // 재제출 시: 기존 BizChat 캠페인의 전체 페이로드 업데이트
      // billingType 재계산 (메시지 변경 시 반영)
      let billingType = 0;
      const hasImage = !!message?.imageUrl;
      if (campaign.messageType === 'RCS') {
        billingType = hasImage ? 1 : 3;
      } else if (campaign.messageType === 'MMS' || hasImage) {
        billingType = 2;
      }
      
      const isRcs = billingType === 1 || billingType === 3;
      const needsFile = billingType === 1 || billingType === 2;
      
      // 타겟팅/발송 수량 재계산
      const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
      // sndMosu: 캠페인에 저장된 값 사용 (타겟팅 설정 시 ATS mosu API로 계산됨)
      const sndMosu = campaign.sndMosu || Math.ceil(sndGoalCnt * 1.5);
      console.log(`[Submit Update] Using sndMosu: ${sndMosu.toLocaleString()} (from ${campaign.sndMosu ? 'campaign' : 'calculated'})`);
      
      // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
      // URL 리스트 추출 (urlLinks는 JSONB로 저장됨: { list: string[], reward?: number })
      const updateParsedUrlLinks = typeof (message as any)?.urlLinks === 'string' 
        ? JSON.parse((message as any).urlLinks) 
        : (message as any)?.urlLinks;
      const updateMmsUrlList: string[] = updateParsedUrlLinks?.list || (message as any)?.urls || [];
      const updateUrlReward = updateParsedUrlLinks?.reward;
      
      // buttons는 JSONB로 저장됨: { list: [{ type, name, val1, val2? }] }
      const updateParsedButtons = typeof (message as any)?.buttons === 'string'
        ? JSON.parse((message as any).buttons)
        : (message as any)?.buttons;
      const updateRcsButtons = updateParsedButtons?.list || (message as any)?.rcsButtons || [];
      
      // MMS 객체 구성 - 조건부로 필드 포함 (빈 객체/배열 생략)
      const updateMmsObject: Record<string, unknown> = {
        title: message?.title || '',
        msg: message?.content || '',
        ...(needsFile && message?.imageUrl && { fileInfo: { list: [{ origId: message.imageUrl }] } }),
        ...((message as any)?.urlFile && { urlFile: (message as any).urlFile }),
        ...(updateMmsUrlList.length > 0 && { urlLink: { list: updateMmsUrlList.slice(0, 3), ...(updateUrlReward !== undefined && { reward: updateUrlReward }) } }),
      };
      
      // RCS 슬라이드 구성 - RCS 타입일 때만 생성
      const updateRcsSlide: Record<string, unknown> | null = isRcs ? {
        slideNum: 1,
        title: message?.title || '',
        msg: message?.content || '',
        ...(needsFile && message?.imageUrl && { imgOrigId: message.imageUrl }),
        ...((message as any)?.rcsUrlFile && { urlFile: (message as any).rcsUrlFile }),
        ...(updateMmsUrlList.length > 0 && { urlLink: { list: updateMmsUrlList.slice(0, 3), ...(updateUrlReward !== undefined && { reward: updateUrlReward }) } }),
        ...(updateRcsButtons.length > 0 && { 
          buttons: { list: updateRcsButtons.map((btn: any) => ({ ...btn, type: String(btn.type) })) }
        }),
        ...((message as any)?.rcsOpts?.list?.length > 0 && { opts: (message as any).rcsOpts }),
      } : null;
      
      // 업데이트 페이로드 구성 - 빈 배열/객체 완전히 생략
      const updatePayload: Record<string, unknown> = {
        name: campaign.name,
        tgtCompanyName: campaign.tgtCompanyName || '위픽',
        sndNum: campaign.sndNum,
        rcvType: campaign.rcvType ?? 0,
        sndGoalCnt: sndGoalCnt,
        billingType: billingType,
        settleCnt: campaign.settleCnt ?? sndGoalCnt,
        sndMosu: sndMosu,
        sndMosuFlag: 0,
        isTmp: 0, // 필수 필드: 임시저장 여부 (0=아니오, 1=예) - BizChat API 규격: number 타입만 허용
        mms: updateMmsObject,
        // RCS 타입일 때만 rcs 배열 포함 (빈 배열 생략 - E000002 방지)
        ...(updateRcsSlide && { rcs: [updateRcsSlide] }),
      };
      
      // 발송 시간 업데이트
      if (adjustedSendDate) {
        updatePayload.atsSndStartDate = toUnixTimestamp(
          typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate
        );
      }
      
      // RCS 타입 설정
      if (isRcs && campaign.rcsType !== undefined) {
        updatePayload.rcsType = campaign.rcsType;
        if (campaign.rcsType === 2) {
          updatePayload.slideCnt = 1;
        }
      }
      
      // sndMosuDesc/sndMosuQuery 업데이트 (타겟팅 필터)
      // BizChat API 규격: sndMosuQuery는 ATS mosu API 응답의 query 문자열(SQL 형식)을 사용해야 함
      let updateAtsFilterStr = '';
      if (campaign.sndMosuQuery) {
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        
        // JSON 형식의 필터 조건을 ATS mosu API에 전송하여 SQL query 획득
        const convertResult = convertLegacySndMosuQuery(queryString);
        
        // 레거시 SQL 형식인 경우 그대로 사용 (ATS mosu API 호출 불필요)
        if (convertResult.isLegacySql) {
          console.log('[Submit Update] Using legacy SQL query directly (skipping ATS mosu API)');
          updatePayload.sndMosuQuery = convertResult.query;
          // 레거시 SQL인 경우 DB에 저장된 sndMosuDesc 우선 사용
          updateAtsFilterStr = campaign.sndMosuDesc || '';
        } else {
          // JSON 필터인 경우 ATS mosu API 호출
          let filterPayload: Record<string, unknown>;
          try {
            filterPayload = JSON.parse(convertResult.query);
          } catch {
            filterPayload = { '$and': [] };
          }
          
          // 빈 필터 검증 - $and 또는 $or가 비어있으면 오류 반환
          const hasConditions = (filterPayload['$and'] && Array.isArray(filterPayload['$and']) && filterPayload['$and'].length > 0) ||
                                (filterPayload['$or'] && Array.isArray(filterPayload['$or']) && filterPayload['$or'].length > 0);
          
          if (!hasConditions) {
            console.error('[Submit Update] Empty filter detected - no targeting conditions');
            return res.status(400).json({
              error: '타겟팅 조건이 비어있습니다',
              hint: '캠페인에 유효한 타겟팅 조건(연령, 성별, 지역 등)을 설정해주세요.',
            });
          }
          
          console.log('[Submit Update] Calling ATS mosu API to get SQL query...');
          console.log('[Submit Update] Filter payload:', JSON.stringify(filterPayload, null, 2));
          
          // ATS mosu API 호출하여 SQL 형식의 query 획득
          const atsResult = await callATSMosuAPI(filterPayload, useProduction);
          
          if (atsResult.success && atsResult.query) {
            // ATS API 응답의 SQL query를 sndMosuQuery로 사용
            updatePayload.sndMosuQuery = atsResult.query;
            updateAtsFilterStr = atsResult.filterStr;
            console.log('[Submit Update] sndMosuQuery (SQL from ATS):', atsResult.query.substring(0, 200) + '...');
          } else {
            // ATS API 실패 시 에러 반환
            console.error('[Submit Update] ATS mosu API failed:', atsResult.error);
            return res.status(400).json({
              error: `ATS 타겟팅 조회 실패: ${atsResult.error || 'Unknown error'}`,
              hint: 'ATS 발송 모수 API 호출에 실패했습니다. 타겟팅 조건을 확인해주세요.',
            });
          }
        }
      }
      
      if (updateAtsFilterStr || campaign.sndMosuDesc) {
        const desc = updateAtsFilterStr || campaign.sndMosuDesc || '';
        const isHtml = desc.startsWith('<html>') || desc.includes('<body>') || desc.includes('<table>');
        updatePayload.sndMosuDesc = isHtml ? desc : `<html><body><p>${desc}</p></body></html>`;
      }
      
      console.log('[Submit] Updating existing BizChat campaign...');
      console.log('[Submit] Update payload:', JSON.stringify(updatePayload, null, 2));
      
      const updateResult = await callBizChatAPI(
        `/api/v1/cmpn/update?id=${campaign.bizchatCampaignId}`,
        'POST',
        updatePayload,
        useProduction
      );
      
      if (updateResult.data.code !== 'S000001') {
        console.warn('[Submit] BizChat update warning:', updateResult.data);
        // 업데이트 실패해도 승인 요청은 계속 진행
      } else {
        console.log('[Submit] BizChat campaign updated successfully');
      }
      
      // DB에도 조정된 시간 저장
      if (adjustedSendDate) {
        await db.update(campaigns)
          .set({ 
            atsSndStartDate: typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate,
            scheduledAt: typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate,
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, id));
      }
    }

    console.log('[Submit] Requesting approval...');
    const approvalResult = await callBizChatAPI(
      `/api/v1/cmpn/appr/req?id=${campaign.bizchatCampaignId}`,
      'POST',
      {},
      useProduction
    );

    if (approvalResult.data.code !== 'S000001') {
      console.error('[Submit] Approval request failed:', approvalResult.data);
      return res.status(400).json({
        error: `승인 요청 실패: ${approvalResult.data.msg || approvalResult.data.code}`,
        response: approvalResult.data,
      });
    }

    // 승인 요청 후 상태 업데이트 (조정된 발송 시간 유지)
    const approvalUpdateData: Record<string, unknown> = { 
      statusCode: 10,
      status: 'approval_requested',
      updatedAt: new Date(),
    };
    if (adjustedSendDate) {
      approvalUpdateData.scheduledAt = typeof adjustedSendDate === 'string' 
        ? new Date(adjustedSendDate) 
        : adjustedSendDate;
      approvalUpdateData.atsSndStartDate = approvalUpdateData.scheduledAt;
    }
    await db.update(campaigns)
      .set(approvalUpdateData)
      .where(eq(campaigns.id, id));

    console.log(`[Submit] Approval requested for campaign: ${id}`);
    
    return res.status(200).json({
      success: true,
      campaignId: id,
      bizchatCampaignId: campaign.bizchatCampaignId,
      statusCode: 10,
      status: 'approval_requested',
      message: scheduledAt 
        ? `캠페인이 BizChat에 등록되었고, ${new Date(scheduledAt).toLocaleString('ko-KR')}에 발송 예정입니다.`
        : '캠페인이 BizChat에 등록되었고, 승인 요청이 완료되었습니다.',
    });

  } catch (error) {
    console.error('[Submit] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

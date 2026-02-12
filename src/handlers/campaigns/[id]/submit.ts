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
  // Maptics 지오펜스 발송 관련 필드
  atsSndStartDate: timestamp('ats_snd_start_date'),
  collStartDate: timestamp('coll_start_date'),
  collEndDate: timestamp('coll_end_date'),
  collSndDate: timestamp('coll_snd_date'),
  sndGeofenceId: integer('snd_geofence_id'),
  rtStartHhmm: text('rt_start_hhmm'),
  rtEndHhmm: text('rt_end_hhmm'),
  sndDayDiv: integer('snd_day_div'),
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
  imageFileId: text('image_file_id'),
  urlLinks: jsonb('url_links'), // { list: string[], reward?: number }
  buttons: jsonb('buttons'), // { list: [{ type, name, val1, val2? }] }
  // LMS fallback 전용 필드 (RCS 메시지 타입에서만 사용)
  lmsContent: text('lms_content'),
  lmsImageUrl: text('lms_image_url'),
  lmsImageFileId: text('lms_image_file_id'),
  lmsUrlLinks: jsonb('lms_url_links'), // { list: string[], reward?: number }
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type'),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageFileId: text('image_file_id'),
  urlLinks: jsonb('url_links'), // { list: string[], reward?: number }
  buttons: jsonb('buttons'), // { list: [{ type, name, val1, val2? }] }
  status: text('status').default('draft'),
  // LMS fallback 전용 필드 (RCS 메시지 타입에서만 사용)
  lmsContent: text('lms_content'),
  lmsImageUrl: text('lms_image_url'),
  lmsImageFileId: text('lms_image_file_id'),
  lmsUrlLinks: jsonb('lms_url_links'), // { list: string[], reward?: number }
});

const targeting = pgTable('targeting', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  geofenceIds: text('geofence_ids').array(),
  // ATS 타겟팅 조건
  gender: text('gender'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  regions: text('regions').array(),
  districts: text('districts').array(),
  // 고급 타겟팅 조건 (JSON) - 캠페인 생성 시 저장된 전체 ATS 필터 조건
  atsQuery: text('ats_query'),
  estimatedCount: integer('estimated_count'),
});

const geofences = pgTable('geofences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  latitude: text('latitude').notNull(),
  longitude: text('longitude').notNull(),
  radius: integer('radius').default(500),
  bizchatGeofenceId: text('bizchat_geofence_id'),
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

interface GeofenceTarget {
  gender: number;
  minAge: number;
  maxAge: number;
  stayMin: number;
  radius: number;
  address: string;
  lat?: string;
  lon?: string;
}

async function createBizChatGeofence(
  name: string, 
  targets: GeofenceTarget[], 
  useProduction: boolean
): Promise<{ success: boolean; geofenceId?: number; error?: string }> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'BizChat API key not configured' };
  }
  
  const tid = generateTid();
  
  try {
    console.log(`[Submit] Creating BizChat geofence: ${name}`);
    console.log(`[Submit] Geofence targets:`, JSON.stringify(targets, null, 2));
    
    const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/save?tid=${tid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ name, target: targets }),
    });
    
    const result = await response.json();
    console.log(`[Submit] BizChat geofence create response:`, JSON.stringify(result));
    
    if (result.code === 'S000001' && result.data?.id) {
      console.log(`[Submit] BizChat geofence created successfully: ${result.data.id}`);
      return { success: true, geofenceId: result.data.id };
    }
    
    return { success: false, error: result.msg || 'Geofence creation failed' };
  } catch (error) {
    console.error('[Submit] BizChat geofence create error:', error);
    return { success: false, error: String(error) };
  }
}

function toUnixTimestamp(date: Date): number;
function toUnixTimestamp(date: string): number;
function toUnixTimestamp(date: Date | string | null | undefined): number | undefined;
function toUnixTimestamp(date: Date | string | null | undefined): number | undefined {
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

// 한국시간(KST) 기준 발송 가능 시간대로 조정하는 함수
// KST = UTC + 9시간, 발송 가능 시간: 09:00~19:00 KST
// KST 09:00 = UTC 00:00, KST 19:00 = UTC 10:00
function clampToKSTWindow(dateUTC: Date, minTime: Date): Date {
  const KST_OFFSET_HOURS = 9;
  
  // 10분 단위 올림 헬퍼
  const roundUpTo10Min = (date: Date): Date => {
    const result = new Date(date);
    result.setSeconds(0);
    result.setMilliseconds(0);
    const mins = result.getMinutes();
    const rem = mins % 10;
    if (rem > 0) {
      result.setMinutes(mins + (10 - rem));
    }
    return result;
  };
  
  // UTC 시간 기준으로 KST 시간 계산
  const utcHours = dateUTC.getUTCHours();
  const kstHours = utcHours + KST_OFFSET_HOURS;
  const kstHoursNormalized = kstHours % 24;
  const isNextDayKST = kstHours >= 24;
  
  // KST 09:00~18:59 범위 체크
  const isInWindow = kstHoursNormalized >= 9 && kstHoursNormalized < 19;
  
  if (isInWindow) {
    const effectiveDate = dateUTC > minTime ? dateUTC : minTime;
    const resultKstHours = (effectiveDate.getUTCHours() + KST_OFFSET_HOURS) % 24;
    if (resultKstHours >= 9 && resultKstHours < 19) {
      return roundUpTo10Min(effectiveDate);
    }
  }
  
  // 발송 불가 시간대 → 다음 가능한 KST 09:00 (= UTC 00:00)으로 조정
  const adjusted = new Date(dateUTC);
  
  if (kstHoursNormalized >= 19) {
    // KST 19:00~23:59 → 다음날 KST 09:00
    adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    adjusted.setUTCHours(0, 0, 0, 0);
  } else if (kstHoursNormalized < 9) {
    // KST 00:00~08:59
    if (isNextDayKST) {
      // UTC 15:00~23:59 → 다음날 UTC 00:00
      adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    }
    adjusted.setUTCHours(0, 0, 0, 0);
  }
  
  // minTime 이후 보장 + KST 범위 재확인
  let result = adjusted > minTime ? adjusted : minTime;
  
  const resultKstHours = (result.getUTCHours() + KST_OFFSET_HOURS) % 24;
  if (resultKstHours >= 19 || resultKstHours < 9) {
    result = new Date(result);
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(0, 0, 0, 0);
  }
  
  const finalKstHours = (result.getUTCHours() + KST_OFFSET_HOURS) % 24;
  console.log(`[Submit] KST window clamp: ${dateUTC.toISOString()} → ${result.toISOString()} (KST ${String(finalKstHours).padStart(2, '0')}:${String(result.getUTCMinutes()).padStart(2, '0')})`);
  return roundUpTo10Min(result);
}

// 발송 시간 유효성 검증 및 자동 조정 (BizChat API 규격 v0.29.0)
// 1. 현재 시간 대비 1시간 이후여야 함
// 2. 9시부터 19시(19시 미포함) 사이여야 함 (KST 기준) - 범위 밖이면 자동 조정
// 3. 10분 단위로 시간 체크
function validateSendTime(sendDate: Date | string | null): { valid: boolean; error?: string; adjustedDate?: Date } {
  if (!sendDate) return { valid: true };
  
  const targetDate = typeof sendDate === 'string' ? new Date(sendDate) : new Date(sendDate);
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  // KST 기준 시간 추출
  const kstTarget = getKSTTimeComponents(targetDate);
  
  // 1. 발송 시간대 체크 (09:00~19:00, 19시 미포함) - KST 기준
  // 범위 밖이면 자동으로 다음 가능한 시간으로 조정
  if (kstTarget.hours < 9 || kstTarget.hours >= 19) {
    console.log(`[Submit] Send time ${kstTarget.hours}:${kstTarget.minutes.toString().padStart(2, '0')} KST is outside 09:00~19:00, auto-adjusting...`);
    const adjustedDate = clampToKSTWindow(targetDate, oneHourFromNow);
    const kstAdjusted = getKSTTimeComponents(adjustedDate);
    console.log(`[Submit] Adjusted to ${kstAdjusted.hours}:${kstAdjusted.minutes.toString().padStart(2, '0')} KST (${adjustedDate.toISOString()})`);
    return { valid: true, adjustedDate };
  }
  
  // 2. 최소 1시간 여유 체크
  if (targetDate < oneHourFromNow) {
    // 최소 1시간 후로 조정하고 KST 범위도 확인
    const adjustedDate = clampToKSTWindow(oneHourFromNow, oneHourFromNow);
    console.log(`[Submit] Send time is less than 1 hour from now, adjusted to ${adjustedDate.toISOString()}`);
    return { valid: true, adjustedDate };
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
  
  // 조정 후 KST 기준으로 다시 체크 - 19시 넘어가면 다음날로 조정
  const kstAdjusted = getKSTTimeComponents(adjustedDate);
  if (kstAdjusted.hours >= 19) {
    const finalAdjusted = clampToKSTWindow(adjustedDate, oneHourFromNow);
    return { valid: true, adjustedDate: finalAdjusted };
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
  // Maptics 지오펜스 타겟팅 (rcvType=1 또는 rcvType=2)일 때만 검증
  // rcvType 0 = ATS 일반 타겟팅 - collStartDate 불필요
  // rcvType 1 = Maptics 실시간 보내기 (지오펜스) - collStartDate 필수
  // rcvType 2 = Maptics 모아서 보내기 (지오펜스) - collStartDate 필수
  // rcvType 10 = MDN 테스트 발송 - collStartDate 불필요
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

// 타겟팅 테이블에서 ATS 필터 조건 생성
interface TargetingData {
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  regions?: string[] | null;
  atsQuery?: string | null;
}

function buildATSFilterFromTargeting(targetingData: TargetingData): { payload: { '$and': ATSFilterCondition[] }; desc: string } {
  // 1. atsQuery가 있으면 우선 사용 (이미 완전한 ATS 필터가 저장되어 있음)
  // atsQuery는 캠페인 생성 시 estimate.ts에서 buildATSMosuPayload로 생성된 전체 필터
  if (targetingData.atsQuery) {
    try {
      const atsQueryParsed = JSON.parse(targetingData.atsQuery);
      
      // $and 또는 $or 컨테이너가 있는 경우 그대로 반환
      if (atsQueryParsed['$and'] && Array.isArray(atsQueryParsed['$and'])) {
        const descParts = atsQueryParsed['$and']
          .filter((c: ATSFilterCondition) => c.desc)
          .map((c: ATSFilterCondition) => c.desc);
        console.log('[Submit] Using stored atsQuery with', atsQueryParsed['$and'].length, 'conditions');
        return {
          payload: { '$and': atsQueryParsed['$and'] },
          desc: descParts.join(', '),
        };
      }
      if (atsQueryParsed['$or'] && Array.isArray(atsQueryParsed['$or'])) {
        const descParts = atsQueryParsed['$or']
          .filter((c: ATSFilterCondition) => c.desc)
          .map((c: ATSFilterCondition) => c.desc);
        console.log('[Submit] Using stored atsQuery with', atsQueryParsed['$or'].length, 'conditions ($or)');
        return {
          payload: { '$and': atsQueryParsed['$or'] }, // BizChat expects $and
          desc: descParts.join(', '),
        };
      }
    } catch (e) {
      console.log('[Submit] Failed to parse atsQuery, falling back to basic fields:', e);
    }
  }

  // 2. atsQuery가 없거나 파싱 실패 시 기본 필드에서 필터 생성
  const conditions: ATSFilterCondition[] = [];
  const descParts: string[] = [];

  // 연령 필터
  if (targetingData.ageMin !== null && targetingData.ageMin !== undefined || 
      targetingData.ageMax !== null && targetingData.ageMax !== undefined) {
    const min = targetingData.ageMin ?? 0;
    const max = targetingData.ageMax ?? 100;
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

  // 성별 필터
  if (targetingData.gender && targetingData.gender !== 'all') {
    const genderValue = targetingData.gender === 'male' ? '1' : '2';
    const genderName = targetingData.gender === 'male' ? '남자' : '여자';
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

  // 지역 필터
  if (targetingData.regions && targetingData.regions.length > 0) {
    const hcodes: string[] = [];
    const regionNames: string[] = [];
    for (const region of targetingData.regions) {
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

  return {
    payload: { '$and': conditions },
    desc: descParts.join(', '),
  };
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
          imageFileId: template.imageFileId || null,
          urlLinks: template.urlLinks || null,
          buttons: template.buttons || null,
          // LMS fallback 전용 필드 (RCS 메시지 타입에서 사용)
          lmsContent: template.lmsContent || null,
          lmsImageUrl: template.lmsImageUrl || null,
          lmsImageFileId: template.lmsImageFileId || null,
          lmsUrlLinks: template.lmsUrlLinks || null,
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
      
      // ========== 이미지 파일 업로드 처리 ==========
      // BizChat API는 base64 대신 업로드된 파일 ID(origId)를 필요로 함
      // RCS 캠페인의 경우 RCS용 이미지와 LMS fallback용 이미지를 분리하여 업로드
      let imageFileId: string | null = null;
      let lmsImageFileIdResolved: string | null = null;
      
      const uploadImageHelper = async (imgUrl: string, rcsFlag: number, label: string): Promise<string | null> => {
        if (imgUrl.startsWith('data:')) {
          console.log(`[Submit] ${label} image is base64, uploading to BizChat file API (rcs=${rcsFlag})...`);
          try {
            const host = req.headers.host || process.env.VERCEL_URL || 'localhost:5000';
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
            const protocol = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
            const baseUrlForUpload = `${protocol}://${host}`;
            
            const mimeMatch = imgUrl.match(/^data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const extMatch = mimeType.match(/image\/(\w+)/);
            const ext = extMatch ? extMatch[1] : 'jpg';
            const fileName = `campaign_${id}_${label}_${Date.now()}.${ext}`;
            
            const uploadResponse = await fetch(`${baseUrlForUpload}/api/bizchat/file`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
                ...(req.headers['x-impersonate-token'] ? { 'X-Impersonate-Token': req.headers['x-impersonate-token'] as string } : {}),
                ...(req.headers['x-impersonate-user-id'] ? { 'X-Impersonate-User-Id': req.headers['x-impersonate-user-id'] as string } : {}),
              },
              body: JSON.stringify({
                fileData: imgUrl,
                fileName: fileName,
                fileType: mimeType,
                type: 2,
                rcs: rcsFlag,
              }),
            });
            
            const uploadResult = await uploadResponse.json();
            if (uploadResult.success && uploadResult.fileId) {
              console.log(`[Submit] ${label} image uploaded successfully, fileId: ${uploadResult.fileId}`);
              return uploadResult.fileId;
            } else {
              console.error(`[Submit] ${label} image upload failed:`, uploadResult);
              return null;
            }
          } catch (uploadError) {
            console.error(`[Submit] ${label} image upload error:`, uploadError);
            return null;
          }
        } else {
          console.log(`[Submit] ${label} using existing image reference: ${imgUrl.substring(0, 50)}...`);
          return imgUrl;
        }
      };
      
      if (needsFile && message?.imageUrl) {
        // RCS 캠페인: RCS용 이미지 업로드 (rcs: 1)
        const rcsFlag = isRcs ? 1 : 0;
        const result = await uploadImageHelper(message.imageUrl, rcsFlag, isRcs ? 'RCS' : 'MMS');
        if (result) {
          imageFileId = result;
        } else {
          return res.status(400).json({
            error: '이미지 업로드에 실패했습니다.',
          });
        }
      }
      
      // RCS 캠페인: LMS fallback용 이미지 별도 업로드 (rcs: 0)
      if (isRcs && needsFile) {
        const lmsImgUrl = (message as any)?.lmsImageUrl;
        const lmsImgFileId = (message as any)?.lmsImageFileId;
        if (lmsImgFileId) {
          lmsImageFileIdResolved = lmsImgFileId;
          console.log(`[Submit] Using existing LMS fallback imageFileId: ${lmsImageFileIdResolved}`);
        } else if (lmsImgUrl) {
          const result = await uploadImageHelper(lmsImgUrl, 0, 'LMS_fallback');
          if (result) {
            lmsImageFileIdResolved = result;
          } else {
            console.warn('[Submit] LMS fallback image upload failed, MMS will have no image');
          }
        } else {
          console.log('[Submit] No LMS fallback image provided, MMS fallback will have no image');
        }
      }
      
      // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
      // RCS URL 리스트 추출 (jsonb 컬럼은 Drizzle이 자동으로 파싱함)
      const rcsUrlLinksData = (message as any)?.urlLinks as { list?: string[]; reward?: number } | null;
      const rcsUrlList: string[] = rcsUrlLinksData?.list || (message as any)?.urls || [];
      const rcsUrlReward = rcsUrlLinksData?.reward;
      
      // LMS fallback URL 리스트 (RCS 캠페인용)
      const lmsUrlLinksData = (message as any)?.lmsUrlLinks as { list?: string[]; reward?: number } | null;
      const lmsUrlList: string[] = lmsUrlLinksData?.list || [];
      const lmsUrlReward = lmsUrlLinksData?.reward;
      
      // MMS에 사용할 URL 리스트 결정: RCS 캠페인이면 lms* 필드 사용, 아니면 기존 필드 사용
      const mmsUrlList: string[] = isRcs ? lmsUrlList : rcsUrlList;
      const mmsUrlReward = isRcs ? lmsUrlReward : rcsUrlReward;
      
      // buttons 추출 (jsonb 컬럼은 Drizzle이 자동으로 파싱함) - RCS 전용
      const buttonsData = (message as any)?.buttons as { list?: Array<{ type: string; name: string; val1: string; val2?: string }> } | null;
      const rcsButtons = buttonsData?.list || (message as any)?.rcsButtons || [];
      
      // MMS 객체 구성 - 조건부로 필드 포함 (빈 객체/배열 생략)
      // BizChat API 규격: mms.title은 필수 필드 - 빈 문자열 불가, 실제 값 필요
      // RCS 캠페인: MMS는 fallback 메시지 → lms* 필드 사용
      // 비-RCS 캠페인: MMS는 메인 메시지 → 기존 필드 사용
      const fallbackContent = isRcs ? ((message as any)?.lmsContent || message?.content || '') : (message?.content || '');
      const mmsTitle = isRcs
        ? ((message as any)?.lmsTitle?.trim() || message?.title?.trim() || fallbackContent.split('\n')[0].trim().substring(0, 30) || '광고')
        : (message?.title?.trim() || (message?.content || '').split('\n')[0].trim().substring(0, 30) || '광고');
      
      // MMS에 사용할 이미지: RCS 캠페인이면 lmsImageFileIdResolved, 아니면 imageFileId
      const mmsImageFileId = isRcs ? lmsImageFileIdResolved : imageFileId;
      
      if (isRcs) {
        console.log(`[Submit] Using separate LMS fallback for MMS: lmsContent length=${((message as any)?.lmsContent || '').length}, fallbackContent length=${fallbackContent.length}, lmsImageFileId=${lmsImageFileIdResolved}, lmsUrlLinks=${lmsUrlList.length} urls`);
      }
      
      const mmsObject: Record<string, unknown> = {
        title: mmsTitle,
        msg: fallbackContent,
        ...(needsFile && mmsImageFileId && { fileInfo: { list: [{ origId: mmsImageFileId }] } }),
        ...((message as any)?.urlFile && { urlFile: (message as any).urlFile }),
        ...(mmsUrlList.length > 0 && { urlLink: { list: mmsUrlList.slice(0, 3), ...(mmsUrlReward !== undefined && { reward: mmsUrlReward }) } }),
      };
      
      // RCS 배열 구성 - RCS 타입일 때만 포함, 아니면 완전히 생략
      // BizChat API 규격: slideNum은 모든 RCS 타입에서 필수 (누락 시 E000001 오류)
      // effectiveRcsType: campaign.rcsType이 유효하면 사용, 아니면 billingType에 따라 결정
      const effectiveRcsType = (campaign.rcsType !== null && campaign.rcsType !== undefined && campaign.rcsType >= 0 && campaign.rcsType <= 5)
        ? campaign.rcsType
        : (billingType === 1 ? 4 : 1);
      console.log(`[Submit] effectiveRcsType: ${effectiveRcsType}, including slideNum: 1`);
      
      // BizChat API 규격: 모든 RCS 타입(0~5)에서 rcs 배열이 필요함
      // E100018 오류 방지: rcsType에 맞는 슬라이드 개수가 필요 (rcsType=1도 1개 필요)
      const shouldIncludeRcsArray = isRcs;
      console.log(`[Submit] shouldIncludeRcsArray: ${shouldIncludeRcsArray}, effectiveRcsType: ${effectiveRcsType}, isRcs: ${isRcs}`);
      
      // RCS 슬라이드: RCS 전용 필드 사용 (content, imageUrl, urlLinks, buttons)
      const rcsTitle = message?.title?.trim() || (message?.content || '').split('\n')[0].trim().substring(0, 30) || '광고';
      const rcsSlide: Record<string, unknown> | null = shouldIncludeRcsArray ? {
        slideNum: 1,
        title: rcsTitle,
        msg: message?.content || '',
        ...(needsFile && imageFileId && { imgOrigId: imageFileId }),
        ...((message as any)?.rcsUrlFile && { urlFile: (message as any).rcsUrlFile }),
        ...(rcsUrlList.length > 0 && { urlLink: { list: rcsUrlList.slice(0, 3), ...(rcsUrlReward !== undefined && { reward: rcsUrlReward }) } }),
        ...(rcsButtons.length > 0 && { 
          buttons: { list: rcsButtons.map((btn: any) => ({ 
            ...btn, 
            type: String(btn.type),
            val2: btn.val2 ?? ''
          })) }
        }),
        opts: (message as any)?.rcsOpts || {},
      } : null;

      // Maptics 캠페인(rcvType=1,2) 여부 확인
      // ATS 필드(sndMosu, sndMosuFlag, atsSndStartDate)는 ATS 캠페인(rcvType=0,10)에서만 사용
      const rcvTypeForPayload = campaign.rcvType ?? 0;
      const isMapticsCampaign = rcvTypeForPayload === 1 || rcvTypeForPayload === 2;
      
      const createPayload: Record<string, unknown> = {
        tgtCompanyName: campaign.tgtCompanyName || '위픽',
        name: campaign.name,
        sndNum: campaign.sndNum,
        rcvType: rcvTypeForPayload,
        sndGoalCnt: sndGoalCnt,
        billingType: billingType,
        isTmp: 0,
        settleCnt: campaign.settleCnt ?? sndGoalCnt,
        // ATS 전용 필드: Maptics 캠페인에서는 제외 (E000001 오류 방지)
        ...(!isMapticsCampaign && { sndMosu: sndMosu }),
        ...(!isMapticsCampaign && { sndMosuFlag: 0 }), // 150% 체크 사용
        adverDeny: '1504',
        cb: {
          state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
        },
        mms: mmsObject,
        // RCS 타입일 때만 rcs 배열 포함 (빈 배열 생략 - E000002 방지)
        ...(rcsSlide && { rcs: [rcsSlide] }),
      };

      console.log(`[Submit] Final payload check - has rcs array: ${'rcs' in createPayload}, effectiveRcsType: ${effectiveRcsType}`);

      // 지오펜스(Maptics) 캠페인 필드 추가 (rcvType=1: 실시간, rcvType=2: 모아서 보내기)
      const rcvType = campaign.rcvType ?? 0;
      if (rcvType === 1 || rcvType === 2) {
        // rtStartHhmm/rtEndHhmm: 발송 가능 시간대 (0900~2000 범위)
        if (campaign.rtStartHhmm) {
          createPayload.rtStartHhmm = campaign.rtStartHhmm;
        }
        if (campaign.rtEndHhmm) {
          createPayload.rtEndHhmm = campaign.rtEndHhmm;
        }
        // sndDayDiv: 일 균등 분할 발송 (0=미사용, 1=사용)
        if (campaign.sndDayDiv !== null && campaign.sndDayDiv !== undefined) {
          createPayload.sndDayDiv = campaign.sndDayDiv;
        }
        
        // BizChat geofence 생성 또는 기존 ID 사용
        // 1. campaign.sndGeofenceId가 이미 있으면 사용 (이전에 생성된 BizChat geofence ID)
        // 2. 없으면 targeting 테이블에서 geofenceIds 조회 후 BizChat geofence 생성
        let bizchatGeofenceId: number | null = campaign.sndGeofenceId || null;
        
        if (!bizchatGeofenceId) {
          console.log('[Submit] No sndGeofenceId found, looking up geofences from targeting table...');
          
          // targeting 테이블에서 geofenceIds 조회
          const targetingResult = await db.select().from(targeting).where(eq(targeting.campaignId, id));
          const campaignTargeting = targetingResult[0];
          
          if (campaignTargeting?.geofenceIds?.length) {
            console.log('[Submit] Found geofenceIds in targeting:', campaignTargeting.geofenceIds);
            
            // geofences 테이블에서 지오펜스 정보 조회
            const geofenceResult = await db.select().from(geofences).where(
              eq(geofences.id, campaignTargeting.geofenceIds[0])
            );
            const geofence = geofenceResult[0];
            
            if (geofence) {
              console.log('[Submit] Found geofence in DB:', geofence.name, geofence.latitude, geofence.longitude);
              
              // 기존 bizchatGeofenceId가 있으면 재사용
              if (geofence.bizchatGeofenceId) {
                bizchatGeofenceId = parseInt(geofence.bizchatGeofenceId, 10);
                console.log('[Submit] Reusing existing bizchatGeofenceId:', bizchatGeofenceId);
                
                // campaign.sndGeofenceId에도 저장
                await db.update(campaigns)
                  .set({ sndGeofenceId: bizchatGeofenceId, updatedAt: new Date() })
                  .where(eq(campaigns.id, id));
              } else {
                // BizChat geofence API 호출하여 sndGeofenceId 생성
                const geofenceTargets: GeofenceTarget[] = [{
                  gender: 0, // 전체
                  minAge: 0, // 전체 연령
                  maxAge: 100,
                  stayMin: 30, // 기본 30분 체류
                  radius: geofence.radius || 500,
                  address: geofence.name, // 주소 대신 이름 사용
                  lat: geofence.latitude,
                  lon: geofence.longitude,
                }];
                
                const geofenceCreateResult = await createBizChatGeofence(
                  `${campaign.name}_geofence_${Date.now()}`,
                  geofenceTargets,
                  useProduction
                );
                
                if (geofenceCreateResult.success && geofenceCreateResult.geofenceId) {
                  bizchatGeofenceId = geofenceCreateResult.geofenceId;
                  console.log('[Submit] BizChat geofence created, ID:', bizchatGeofenceId);
                  
                  // DB에 bizchatGeofenceId 저장 (campaign.sndGeofenceId 및 geofences.bizchatGeofenceId)
                  await Promise.all([
                    db.update(campaigns)
                      .set({ sndGeofenceId: bizchatGeofenceId, updatedAt: new Date() })
                      .where(eq(campaigns.id, id)),
                    db.update(geofences)
                      .set({ bizchatGeofenceId: String(bizchatGeofenceId) })
                      .where(eq(geofences.id, geofence.id)),
                  ]);
                } else {
                  console.error('[Submit] Failed to create BizChat geofence:', geofenceCreateResult.error);
                  return res.status(400).json({
                    error: `지오펜스 생성 실패: ${geofenceCreateResult.error}`,
                    code: 'E100012',
                    hint: '지오펜스 정보를 확인해주세요.',
                  });
                }
              }
            } else {
              console.error('[Submit] Geofence not found in DB:', campaignTargeting.geofenceIds[0]);
              return res.status(400).json({
                error: '지오펜스를 찾을 수 없습니다',
                code: 'E100012',
                hint: '캠페인 타겟팅 설정에서 지오펜스를 다시 선택해주세요.',
              });
            }
          } else {
            console.error('[Submit] No geofenceIds found in targeting for rcvType=1/2 campaign');
            return res.status(400).json({
              error: '지오펜스 캠페인에 지오펜스 ID가 없습니다',
              code: 'E100012',
              hint: '캠페인 타겟팅 설정에서 지오펜스를 선택해주세요.',
            });
          }
        }
        
        // sndGeofenceId 추가 (필수)
        createPayload.sndGeofenceId = bizchatGeofenceId;
        
        // collStartDate/collEndDate/collSndDate 추가 (rcvType=1/2 필수)
        // BizChat API 규격: 데이터 수집 시작/종료 일시 (Unix timestamp, 초 단위)
        // collStartDate: 지오펜스 데이터 수집 시작 시점 (반드시 현재보다 미래여야 함)
        // collEndDate: 지오펜스 데이터 수집 종료 시점
        // collSndDate: 발송 시작 시점 (rcvType=2 모아서 보내기용, rcvType=1은 실시간 발송)
        // 
        // E100015 규칙: rcvType=1(실시간)의 경우 rtStartHhmm~rtEndHhmm 시간대가 
        // collStartDate~collEndDate 범위 내에 포함되어야 함
        
        // 발송 시작 시간 기준으로 기본값 계산
        // 우선순위: adjustedSendDate → campaign.scheduledAt → campaign.atsSndStartDate → now + 24h
        let scheduledSendTimestamp: number;
        if (adjustedSendDate) {
          scheduledSendTimestamp = toUnixTimestamp(typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate);
        } else if (campaign.scheduledAt) {
          scheduledSendTimestamp = toUnixTimestamp(new Date(campaign.scheduledAt));
        } else if (campaign.atsSndStartDate) {
          // atsSndStartDate가 이미 Unix timestamp라면 그대로 사용
          scheduledSendTimestamp = typeof campaign.atsSndStartDate === 'number' 
            ? campaign.atsSndStartDate 
            : toUnixTimestamp(new Date(campaign.atsSndStartDate));
        } else {
          // 기본값: 현재로부터 24시간 후
          scheduledSendTimestamp = toUnixTimestamp(new Date()) + 86400;
        }
        const nowTimestamp = toUnixTimestamp(new Date());
        
        // 발송일의 날짜 부분 추출 (KST 기준)
        const scheduledDate = new Date(scheduledSendTimestamp * 1000);
        // KST = UTC + 9시간
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstDate = new Date(scheduledDate.getTime() + kstOffset);
        const year = kstDate.getUTCFullYear();
        const month = kstDate.getUTCMonth();
        const day = kstDate.getUTCDate();
        
        console.log(`[Submit] Maptics coll* calculation - scheduledSendTimestamp: ${scheduledSendTimestamp} (${scheduledDate.toISOString()}), KST date: ${year}-${month+1}-${day}`);
        
        // rcvType=1 (실시간)의 경우 rtStartHhmm/rtEndHhmm 시간대를 고려
        // collStartDate는 rtStartHhmm 이전, collEndDate는 rtEndHhmm 이후가 되어야 함
        let collStartTimestamp: number;
        let collEndTimestamp: number;
        
        if (rcvType === 1 && campaign.rtStartHhmm && campaign.rtEndHhmm) {
          // hhmm 형식에서 시간/분 추출 (예: "1500" → 15:00, "15:00" → 15:00)
          // non-digit 문자 제거 후 파싱
          const rtStartClean = String(campaign.rtStartHhmm).replace(/\D/g, '').padStart(4, '0');
          const rtEndClean = String(campaign.rtEndHhmm).replace(/\D/g, '').padStart(4, '0');
          
          // 유효성 검증 (4자리 숫자인지 확인)
          if (rtStartClean.length < 4 || rtEndClean.length < 4) {
            console.error(`[Submit] Invalid rtHhmm format: rtStart=${campaign.rtStartHhmm}, rtEnd=${campaign.rtEndHhmm}`);
            return res.status(400).json({
              error: '발송 시간 형식이 올바르지 않습니다',
              code: 'E100015',
              hint: '발송 시간은 HHMM 형식(예: 1500)으로 입력해주세요.',
            });
          }
          
          const rtStartHour = parseInt(rtStartClean.substring(0, 2), 10);
          const rtStartMin = parseInt(rtStartClean.substring(2, 4), 10);
          const rtEndHour = parseInt(rtEndClean.substring(0, 2), 10);
          const rtEndMin = parseInt(rtEndClean.substring(2, 4), 10);
          
          // NaN 체크
          if (isNaN(rtStartHour) || isNaN(rtStartMin) || isNaN(rtEndHour) || isNaN(rtEndMin)) {
            console.error(`[Submit] NaN in rtHhmm parsing: ${rtStartHour}:${rtStartMin} ~ ${rtEndHour}:${rtEndMin}`);
            return res.status(400).json({
              error: '발송 시간 형식이 올바르지 않습니다',
              code: 'E100015',
              hint: '발송 시간을 확인해주세요.',
            });
          }
          
          // rtStart/rtEnd UTC timestamp 계산
          const rtStartUtcMs = Date.UTC(year, month, day, rtStartHour - 9, rtStartMin, 0);
          const rtStartTimestamp = Math.floor(rtStartUtcMs / 1000);
          let rtEndUtcMs = Date.UTC(year, month, day, rtEndHour - 9, rtEndMin, 0);
          let rtEndTimestamp = Math.floor(rtEndUtcMs / 1000);
          
          // 자정 넘김 처리: rtEnd < rtStart인 경우 (예: 23:00~01:00)
          // rtEndTimestamp에 24시간 추가
          if (rtEndTimestamp <= rtStartTimestamp) {
            rtEndTimestamp += 86400; // +24시간
            console.log(`[Submit] Cross-midnight detected: rtEnd adjusted to next day`);
          }
          
          // BizChat 규칙: collStart ≤ rtStart ≤ rtEnd ≤ collEnd
          // collStartDate: rtStart와 동일 (BizChat은 같은 경우도 허용)
          // collEndDate: rtEnd + 30분
          collStartTimestamp = rtStartTimestamp;
          collEndTimestamp = rtEndTimestamp + 1800; // rtEnd + 30분
          
          console.log(`[Submit] rcvType=1: rtStart=${rtStartHour}:${rtStartMin}, rtEnd=${rtEndHour}:${rtEndMin}`);
          console.log(`[Submit] rtStartTimestamp: ${rtStartTimestamp} (${new Date(rtStartTimestamp * 1000).toISOString()})`);
          console.log(`[Submit] rtEndTimestamp: ${rtEndTimestamp} (${new Date(rtEndTimestamp * 1000).toISOString()})`);
          console.log(`[Submit] Calculated collStart: ${new Date(collStartTimestamp * 1000).toISOString()}, collEnd: ${new Date(collEndTimestamp * 1000).toISOString()}`);
          
          // collStartDate는 반드시 미래여야 함
          // 현재 시간이 이미 rtStart를 지났다면(초과) 캠페인 제출 불가
          // BizChat은 collStart == rtStart를 허용하므로 > 사용 (>= 아님)
          if (nowTimestamp > rtStartTimestamp) {
            console.error(`[Submit] Cannot submit: rtStart (${new Date(rtStartTimestamp * 1000).toISOString()}) already passed`);
            return res.status(400).json({
              error: '발송 시작 시간이 이미 지났습니다',
              code: 'E100015',
              hint: `발송 시작 시간(${rtStartHour}:${String(rtStartMin).padStart(2, '0')})이 현재 시간보다 이후여야 합니다.`,
            });
          }
          
          // collStartDate가 현재보다 과거거나 같으면 현재 + 60초로 조정
          // 단, rtStartTimestamp를 초과하면 안 됨
          if (collStartTimestamp <= nowTimestamp) {
            collStartTimestamp = Math.min(nowTimestamp + 60, rtStartTimestamp);
            console.log('[Submit] collStartDate adjusted to future:', new Date(collStartTimestamp * 1000).toISOString());
          }
        } else {
          // rcvType=2 또는 rtHhmm이 없는 경우 기존 로직 사용
          if (campaign.collStartDate) {
            collStartTimestamp = toUnixTimestamp(new Date(campaign.collStartDate));
            if (collStartTimestamp <= nowTimestamp) {
              collStartTimestamp = nowTimestamp + 3600;
              console.log('[Submit] collStartDate adjusted to future:', new Date(collStartTimestamp * 1000).toISOString());
            }
          } else {
            // 기본값: max(현재 + 1시간, 발송일 - 1일)
            const sendMinus1Day = scheduledSendTimestamp - 86400;
            const nowPlus1Hour = nowTimestamp + 3600;
            collStartTimestamp = Math.max(nowPlus1Hour, sendMinus1Day);
            if (collStartTimestamp >= scheduledSendTimestamp) {
              collStartTimestamp = nowPlus1Hour;
            }
          }
          
          if (campaign.collEndDate) {
            collEndTimestamp = toUnixTimestamp(new Date(campaign.collEndDate));
            if (collEndTimestamp <= collStartTimestamp) {
              collEndTimestamp = scheduledSendTimestamp;
            }
          } else {
            collEndTimestamp = scheduledSendTimestamp;
          }
        }
        
        createPayload.collStartDate = collStartTimestamp;
        createPayload.collEndDate = collEndTimestamp;
        
        // rcvType=2 (모아서 보내기)의 경우 collSndDate 추가
        if (rcvType === 2) {
          let collSndTimestamp: number;
          if (campaign.collSndDate) {
            collSndTimestamp = toUnixTimestamp(new Date(campaign.collSndDate));
          } else {
            // 기본값: 발송 시작일
            collSndTimestamp = scheduledSendTimestamp;
          }
          createPayload.collSndDate = collSndTimestamp;
        }
        
        console.log(`[Submit] Maptics campaign fields - rcvType: ${rcvType}, sndGeofenceId: ${bizchatGeofenceId}, collStartDate: ${collStartTimestamp} (${new Date(collStartTimestamp * 1000).toISOString()}), collEndDate: ${collEndTimestamp} (${new Date(collEndTimestamp * 1000).toISOString()}), rtStartHhmm: ${campaign.rtStartHhmm}, rtEndHhmm: ${campaign.rtEndHhmm}, sndDayDiv: ${campaign.sndDayDiv}`);
      }

      // 타겟팅 정보 추가 (ATS 발송 모수 필터)
      // BizChat API 규격: sndMosuQuery는 ATS mosu API 응답의 query 문자열(SQL 형식)을 사용해야 함
      // 항상 targeting 테이블에서 조건을 조회하여 현재 환경(상용/개발)에 맞는 ATS API로 쿼리 생성
      let atsFilterStr = '';
      
      // 1. targeting 테이블에서 타겟팅 조건 조회
      const targetingResult = await db.select().from(targeting).where(eq(targeting.campaignId, id));
      const campaignTargetingForAts = targetingResult[0];
      
      console.log('[Submit] Querying targeting table for campaign:', id);
      console.log('[Submit] Found targeting data:', campaignTargetingForAts ? 'yes' : 'no');
      
      // 2. targeting 테이블 조건 또는 campaign.sndMosuQuery 사용
      let filterPayload: Record<string, unknown>;
      
      if (campaignTargetingForAts && (
        campaignTargetingForAts.gender ||
        campaignTargetingForAts.ageMin ||
        campaignTargetingForAts.ageMax ||
        (campaignTargetingForAts.regions && campaignTargetingForAts.regions.length > 0) ||
        campaignTargetingForAts.atsQuery
      )) {
        // targeting 테이블에서 조건을 가져와 ATS 필터 생성
        console.log('[Submit] Building ATS filter from targeting table...');
        const { payload, desc } = buildATSFilterFromTargeting({
          gender: campaignTargetingForAts.gender,
          ageMin: campaignTargetingForAts.ageMin,
          ageMax: campaignTargetingForAts.ageMax,
          regions: campaignTargetingForAts.regions,
          atsQuery: campaignTargetingForAts.atsQuery,
        });
        filterPayload = payload;
        console.log('[Submit] Built ATS filter from targeting:', JSON.stringify(filterPayload, null, 2));
      } else if (campaign.sndMosuQuery) {
        // fallback: campaign.sndMosuQuery 사용
        console.log('[Submit] Using campaign.sndMosuQuery as fallback...');
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        
        // JSON 형식의 필터 조건을 ATS mosu API에 전송하여 SQL query 획득
        const { query: convertedQuery, desc } = convertLegacySndMosuQuery(queryString);
        try {
          filterPayload = JSON.parse(convertedQuery);
        } catch {
          filterPayload = { '$and': [] };
        }
      } else {
        // 타겟팅 조건 없음 - 기본 빈 필터
        filterPayload = { '$and': [] };
      }
      
      // 3. ATS mosu API 호출 (필터 조건이 있는 경우만)
      const hasFilterConditions = filterPayload['$and'] && (filterPayload['$and'] as unknown[]).length > 0;
      
      if (hasFilterConditions) {
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
      } else {
        console.log('[Submit] No ATS filter conditions, skipping ATS mosu API call');
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

      // 10분 단위로 조정된 발송 시간 적용 (ATS 캠페인에서만 - Maptics는 collStartDate 사용)
      if (adjustedSendDate && !isMapticsCampaign) {
        const adjustedTimestamp = toUnixTimestamp(
          typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate
        );
        createPayload.atsSndStartDate = adjustedTimestamp;
        console.log('[Submit] atsSndStartDate (adjusted):', adjustedTimestamp, new Date((adjustedTimestamp || 0) * 1000).toISOString());
      }

      // RCS 타입 설정 (billingType 1 또는 3일 때)
      // BizChat API rcsType: 0=스탠다드, 1=LMS(텍스트), 2=슬라이드(캐러셀), 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
      // 
      // 각 RCS 타입별 이미지 규격:
      // - 스탠다드(0): 400x240, 500x300 (작은 이미지)
      // - 슬라이드(2): 464x336
      // - 이미지강조A(3): 900x1200 (세로형)
      // - 이미지강조B(4): 900x900 (정사각형)
      // - 상품소개세로(5): 900x560 (opts 필드 필수!)
      //
      // E100038 오류 방지: 이미지가 900x560인 경우 API가 상품소개세로로 인식하여 opts를 요구함
      // 해결: 큰 이미지가 있는 RCS MMS는 이미지강조B(rcsType=4)를 사용 (900x900 지원)
      if (isRcs) {
        const slideCount = rcsSlide ? 1 : 0;
        
        // rcsType 결정 로직:
        // 1. campaign.rcsType이 유효하면 사용 (0~5 범위)
        // 2. 유효하지 않으면 billingType에 따라 자동 결정:
        //    - billingType=1 (RCS MMS, 이미지 있음): rcsType=4 (이미지강조B) - 큰 이미지 지원, opts 불필요
        //    - billingType=3 (RCS LMS, 텍스트만): rcsType=1 (LMS)
        let validRcsType: number;
        if (campaign.rcsType !== null && campaign.rcsType !== undefined && campaign.rcsType >= 0 && campaign.rcsType <= 5) {
          validRcsType = campaign.rcsType;
          console.log(`[Submit] Using campaign rcsType: ${validRcsType}`);
        } else {
          // billingType에 따라 자동 결정
          // RCS MMS(이미지 있음) → 이미지강조B(4) 사용 (상품소개세로 opts 오류 방지)
          validRcsType = billingType === 1 ? 4 : 1;
          console.log(`[Submit] Auto-determined rcsType from billingType=${billingType}: ${validRcsType} (4=이미지강조B, 1=LMS)`);
        }
        createPayload.rcsType = validRcsType;
        console.log(`[Submit] RCS type set to: ${validRcsType} (campaign.rcsType: ${campaign.rcsType}, billingType: ${billingType}, slides: ${slideCount})`);
        // slideCnt: rcsType=2(슬라이드/캐러셀)일 때 슬라이드 개수
        if (validRcsType === 2) {
          createPayload.slideCnt = slideCount || 1;
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
      
      const bizchatCampaignId = (createResult.data.data as { id?: string })?.id as string;
      
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
      
      // ========== 이미지 파일 업로드 처리 (재제출 시) ==========
      // RCS 캠페인의 경우 RCS용 이미지와 LMS fallback용 이미지를 분리하여 업로드
      let updateImageFileId: string | null = null;
      let updateLmsImageFileIdResolved: string | null = null;
      
      const updateUploadImageHelper = async (imgUrl: string, rcsFlag: number, label: string): Promise<string | null> => {
        if (imgUrl.startsWith('data:')) {
          console.log(`[Submit Update] ${label} image is base64, uploading to BizChat file API (rcs=${rcsFlag})...`);
          try {
            const host = req.headers.host || process.env.VERCEL_URL || 'localhost:5000';
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
            const protocol = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
            const baseUrlForUpload = `${protocol}://${host}`;
            
            const mimeMatch = imgUrl.match(/^data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const extMatch = mimeType.match(/image\/(\w+)/);
            const ext = extMatch ? extMatch[1] : 'jpg';
            const fileName = `campaign_${id}_${label}_${Date.now()}.${ext}`;
            
            const uploadResponse = await fetch(`${baseUrlForUpload}/api/bizchat/file`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
                ...(req.headers['x-impersonate-token'] ? { 'X-Impersonate-Token': req.headers['x-impersonate-token'] as string } : {}),
                ...(req.headers['x-impersonate-user-id'] ? { 'X-Impersonate-User-Id': req.headers['x-impersonate-user-id'] as string } : {}),
              },
              body: JSON.stringify({
                fileData: imgUrl,
                fileName: fileName,
                fileType: mimeType,
                type: 2,
                rcs: rcsFlag,
              }),
            });
            
            const uploadResult = await uploadResponse.json();
            if (uploadResult.success && uploadResult.fileId) {
              console.log(`[Submit Update] ${label} image uploaded successfully, fileId: ${uploadResult.fileId}`);
              return uploadResult.fileId;
            } else {
              console.error(`[Submit Update] ${label} image upload failed:`, uploadResult);
              return null;
            }
          } catch (uploadError) {
            console.error(`[Submit Update] ${label} image upload error:`, uploadError);
            return null;
          }
        } else {
          console.log(`[Submit Update] ${label} using existing image reference: ${imgUrl.substring(0, 50)}...`);
          return imgUrl;
        }
      };
      
      if (needsFile && message?.imageUrl) {
        const rcsFlag = isRcs ? 1 : 0;
        const result = await updateUploadImageHelper(message.imageUrl, rcsFlag, isRcs ? 'RCS' : 'MMS');
        if (result) {
          updateImageFileId = result;
        } else {
          return res.status(400).json({
            error: '이미지 업로드에 실패했습니다.',
          });
        }
      }
      
      // RCS 캠페인: LMS fallback용 이미지 별도 업로드 (rcs: 0)
      if (isRcs && needsFile) {
        const lmsImgUrl = (message as any)?.lmsImageUrl;
        const lmsImgFileId = (message as any)?.lmsImageFileId;
        if (lmsImgFileId) {
          updateLmsImageFileIdResolved = lmsImgFileId;
          console.log(`[Submit Update] Using existing LMS fallback imageFileId: ${updateLmsImageFileIdResolved}`);
        } else if (lmsImgUrl) {
          const result = await updateUploadImageHelper(lmsImgUrl, 0, 'LMS_fallback');
          if (result) {
            updateLmsImageFileIdResolved = result;
          } else {
            console.warn('[Submit Update] LMS fallback image upload failed, MMS will have no image');
          }
        } else {
          console.log('[Submit Update] No LMS fallback image provided, MMS fallback will have no image');
        }
      }
      
      // 타겟팅/발송 수량 재계산
      const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1000;
      const sndMosu = campaign.sndMosu || Math.ceil(sndGoalCnt * 1.5);
      console.log(`[Submit Update] Using sndMosu: ${sndMosu.toLocaleString()} (from ${campaign.sndMosu ? 'campaign' : 'calculated'})`);
      
      // BizChat API 규격: 빈 객체/배열은 완전히 생략해야 함 (E000002 에러 방지)
      // RCS URL 리스트 추출 (urlLinks는 JSONB로 저장됨: { list: string[], reward?: number })
      const updateParsedUrlLinks = typeof (message as any)?.urlLinks === 'string' 
        ? JSON.parse((message as any).urlLinks) 
        : (message as any)?.urlLinks;
      const updateRcsUrlList: string[] = updateParsedUrlLinks?.list || (message as any)?.urls || [];
      const updateRcsUrlReward = updateParsedUrlLinks?.reward;
      
      // LMS fallback URL 리스트 (RCS 캠페인용)
      const updateLmsUrlLinksData = typeof (message as any)?.lmsUrlLinks === 'string'
        ? JSON.parse((message as any).lmsUrlLinks)
        : (message as any)?.lmsUrlLinks;
      const updateLmsUrlList: string[] = updateLmsUrlLinksData?.list || [];
      const updateLmsUrlReward = updateLmsUrlLinksData?.reward;
      
      // MMS에 사용할 URL 리스트 결정: RCS 캠페인이면 lms* 필드 사용, 아니면 기존 필드 사용
      const updateMmsUrlList: string[] = isRcs ? updateLmsUrlList : updateRcsUrlList;
      const updateMmsUrlReward = isRcs ? updateLmsUrlReward : updateRcsUrlReward;
      
      // buttons는 JSONB로 저장됨: { list: [{ type, name, val1, val2? }] } - RCS 전용
      const updateParsedButtons = typeof (message as any)?.buttons === 'string'
        ? JSON.parse((message as any).buttons)
        : (message as any)?.buttons;
      const updateRcsButtons = updateParsedButtons?.list || (message as any)?.rcsButtons || [];
      
      // MMS 객체 구성 - 조건부로 필드 포함 (빈 객체/배열 생략)
      // BizChat API 규격: mms.title은 필수 필드 - 빈 문자열 불가, 실제 값 필요
      // RCS 캠페인: MMS는 fallback 메시지 → lms* 필드 사용
      // 비-RCS 캠페인: MMS는 메인 메시지 → 기존 필드 사용
      const updateFallbackContent = isRcs ? ((message as any)?.lmsContent || message?.content || '') : (message?.content || '');
      const updateMmsTitle = isRcs
        ? ((message as any)?.lmsTitle?.trim() || message?.title?.trim() || updateFallbackContent.split('\n')[0].trim().substring(0, 30) || '광고')
        : (message?.title?.trim() || (message?.content || '').split('\n')[0].trim().substring(0, 30) || '광고');
      
      // MMS에 사용할 이미지: RCS 캠페인이면 lmsImageFileIdResolved, 아니면 updateImageFileId
      const updateMmsImageFileId = isRcs ? updateLmsImageFileIdResolved : updateImageFileId;
      
      if (isRcs) {
        console.log(`[Submit Update] Using separate LMS fallback for MMS: lmsContent length=${((message as any)?.lmsContent || '').length}, fallbackContent length=${updateFallbackContent.length}, lmsImageFileId=${updateLmsImageFileIdResolved}, lmsUrlLinks=${updateLmsUrlList.length} urls`);
      }
      
      const updateMmsObject: Record<string, unknown> = {
        title: updateMmsTitle,
        msg: updateFallbackContent,
        ...(needsFile && updateMmsImageFileId && { fileInfo: { list: [{ origId: updateMmsImageFileId }] } }),
        ...((message as any)?.urlFile && { urlFile: (message as any).urlFile }),
        ...(updateMmsUrlList.length > 0 && { urlLink: { list: updateMmsUrlList.slice(0, 3), ...(updateMmsUrlReward !== undefined && { reward: updateMmsUrlReward }) } }),
      };
      
      // RCS 슬라이드 구성 - RCS 타입일 때만 생성
      // RCS 슬라이드: RCS 전용 필드 사용 (content, imageUrl, urlLinks, buttons)
      const updateEffectiveRcsType = (campaign.rcsType !== null && campaign.rcsType !== undefined && campaign.rcsType >= 0 && campaign.rcsType <= 5)
        ? campaign.rcsType
        : (billingType === 1 ? 4 : 1);
      console.log(`[Submit Update] effectiveRcsType for slideNum check: ${updateEffectiveRcsType}`);
      
      const shouldIncludeUpdateRcsArray = isRcs;
      console.log(`[Submit Update] shouldIncludeRcsArray: ${shouldIncludeUpdateRcsArray}, effectiveRcsType: ${updateEffectiveRcsType}`);
      
      const updateRcsTitle = message?.title?.trim() || (message?.content || '').split('\n')[0].trim().substring(0, 30) || '광고';
      const updateRcsSlide: Record<string, unknown> | null = shouldIncludeUpdateRcsArray ? {
        slideNum: 1,
        title: updateRcsTitle,
        msg: message?.content || '',
        ...(needsFile && updateImageFileId && { imgOrigId: updateImageFileId }),
        ...((message as any)?.rcsUrlFile && { urlFile: (message as any).rcsUrlFile }),
        ...(updateRcsUrlList.length > 0 && { urlLink: { list: updateRcsUrlList.slice(0, 3), ...(updateRcsUrlReward !== undefined && { reward: updateRcsUrlReward }) } }),
        ...(updateRcsButtons.length > 0 && { 
          buttons: { list: updateRcsButtons.map((btn: any) => ({ 
            ...btn, 
            type: String(btn.type),
            val2: btn.val2 ?? ''
          })) }
        }),
        opts: (message as any)?.rcsOpts || {},
      } : null;
      
      // Maptics 캠페인(rcvType=1,2) 여부 확인
      // ATS 필드(sndMosu, sndMosuFlag, atsSndStartDate)는 ATS 캠페인(rcvType=0,10)에서만 사용
      const updateRcvTypeForPayload = campaign.rcvType ?? 0;
      const updateIsMapticsCampaign = updateRcvTypeForPayload === 1 || updateRcvTypeForPayload === 2;
      
      // 업데이트 페이로드 구성 - 빈 배열/객체 완전히 생략
      const updatePayload: Record<string, unknown> = {
        name: campaign.name,
        tgtCompanyName: campaign.tgtCompanyName || '위픽',
        sndNum: campaign.sndNum,
        rcvType: updateRcvTypeForPayload,
        sndGoalCnt: sndGoalCnt,
        billingType: billingType,
        settleCnt: campaign.settleCnt ?? sndGoalCnt,
        // ATS 전용 필드: Maptics 캠페인에서는 제외 (E000001 오류 방지)
        ...(!updateIsMapticsCampaign && { sndMosu: sndMosu }),
        ...(!updateIsMapticsCampaign && { sndMosuFlag: 0 }),
        isTmp: 0, // 필수 필드: 임시저장 여부 (0=아니오, 1=예) - BizChat API 규격: number 타입만 허용
        mms: updateMmsObject,
        // RCS 타입일 때만 rcs 배열 포함 (빈 배열 생략 - E000002 방지)
        ...(updateRcsSlide && { rcs: [updateRcsSlide] }),
      };

      console.log(`[Submit Update] Final payload check - has rcs array: ${'rcs' in updatePayload}, effectiveRcsType: ${updateEffectiveRcsType}`);

      // 지오펜스(Maptics) 캠페인 필드 추가 (rcvType=1: 실시간, rcvType=2: 모아서 보내기)
      const updateRcvType = campaign.rcvType ?? 0;
      if (updateRcvType === 1 || updateRcvType === 2) {
        if (campaign.rtStartHhmm) {
          updatePayload.rtStartHhmm = campaign.rtStartHhmm;
        }
        if (campaign.rtEndHhmm) {
          updatePayload.rtEndHhmm = campaign.rtEndHhmm;
        }
        if (campaign.sndDayDiv !== null && campaign.sndDayDiv !== undefined) {
          updatePayload.sndDayDiv = campaign.sndDayDiv;
        }
        
        // sndGeofenceId 필수 추가 (기존 ID 사용 또는 targeting에서 조회/생성)
        let updateBizchatGeofenceId: number | null = campaign.sndGeofenceId || null;
        
        if (!updateBizchatGeofenceId) {
          console.log('[Submit Update] No sndGeofenceId found, looking up geofences from targeting table...');
          
          // targeting 테이블에서 geofenceIds 조회
          const targetingResult = await db.select().from(targeting).where(eq(targeting.campaignId, id));
          const campaignTargeting = targetingResult[0];
          
          if (campaignTargeting?.geofenceIds?.length) {
            console.log('[Submit Update] Found geofenceIds in targeting:', campaignTargeting.geofenceIds);
            
            // geofences 테이블에서 지오펜스 정보 조회
            const geofenceResult = await db.select().from(geofences).where(
              eq(geofences.id, campaignTargeting.geofenceIds[0])
            );
            const geofence = geofenceResult[0];
            
            if (geofence) {
              // 기존 bizchatGeofenceId가 있으면 재사용
              if (geofence.bizchatGeofenceId) {
                updateBizchatGeofenceId = parseInt(geofence.bizchatGeofenceId, 10);
                console.log('[Submit Update] Reusing existing bizchatGeofenceId:', updateBizchatGeofenceId);
              } else {
                // BizChat geofence API 호출하여 생성
                const geofenceTargets: GeofenceTarget[] = [{
                  gender: 0,
                  minAge: 0,
                  maxAge: 100,
                  stayMin: 30,
                  radius: geofence.radius || 500,
                  address: geofence.name,
                  lat: geofence.latitude,
                  lon: geofence.longitude,
                }];
                
                const geofenceCreateResult = await createBizChatGeofence(
                  `${campaign.name}_geofence_${Date.now()}`,
                  geofenceTargets,
                  useProduction
                );
                
                if (geofenceCreateResult.success && geofenceCreateResult.geofenceId) {
                  updateBizchatGeofenceId = geofenceCreateResult.geofenceId;
                  console.log('[Submit Update] BizChat geofence created, ID:', updateBizchatGeofenceId);
                  
                  // DB에 저장
                  await Promise.all([
                    db.update(campaigns)
                      .set({ sndGeofenceId: updateBizchatGeofenceId, updatedAt: new Date() })
                      .where(eq(campaigns.id, id)),
                    db.update(geofences)
                      .set({ bizchatGeofenceId: String(updateBizchatGeofenceId) })
                      .where(eq(geofences.id, geofence.id)),
                  ]);
                } else {
                  console.error('[Submit Update] Failed to create BizChat geofence:', geofenceCreateResult.error);
                  return res.status(400).json({
                    error: `지오펜스 생성 실패: ${geofenceCreateResult.error}`,
                    code: 'E100012',
                  });
                }
              }
              
              // campaign.sndGeofenceId에도 저장
              await db.update(campaigns)
                .set({ sndGeofenceId: updateBizchatGeofenceId, updatedAt: new Date() })
                .where(eq(campaigns.id, id));
            } else {
              console.error('[Submit Update] Geofence not found in DB');
              return res.status(400).json({
                error: '지오펜스를 찾을 수 없습니다',
                code: 'E100012',
              });
            }
          } else {
            console.error('[Submit Update] No geofenceIds found in targeting');
            return res.status(400).json({
              error: '지오펜스 캠페인에 지오펜스 ID가 없습니다',
              code: 'E100012',
            });
          }
        }
        
        updatePayload.sndGeofenceId = updateBizchatGeofenceId;
        
        // collStartDate/collEndDate/collSndDate 추가 (rcvType=1/2 필수)
        // BizChat API 규격: 데이터 수집 시작/종료 일시 (Unix timestamp, 초 단위)
        // E100015 규칙: rcvType=1(실시간)의 경우 rtStartHhmm~rtEndHhmm 시간대가 
        // collStartDate~collEndDate 범위 내에 포함되어야 함
        
        // 발송 시작 시간 기준으로 기본값 계산
        // 우선순위: adjustedSendDate → campaign.scheduledAt → campaign.atsSndStartDate → now + 24h
        let updateScheduledSendTimestamp: number;
        if (adjustedSendDate) {
          updateScheduledSendTimestamp = toUnixTimestamp(typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate);
        } else if (campaign.scheduledAt) {
          updateScheduledSendTimestamp = toUnixTimestamp(new Date(campaign.scheduledAt));
        } else if (campaign.atsSndStartDate) {
          updateScheduledSendTimestamp = typeof campaign.atsSndStartDate === 'number' 
            ? campaign.atsSndStartDate 
            : toUnixTimestamp(new Date(campaign.atsSndStartDate));
        } else {
          updateScheduledSendTimestamp = toUnixTimestamp(new Date()) + 86400;
        }
        const updateNowTimestamp = toUnixTimestamp(new Date());
        
        // 발송일의 날짜 부분 추출 (KST 기준)
        const updateScheduledDate = new Date(updateScheduledSendTimestamp * 1000);
        const updateKstOffset = 9 * 60 * 60 * 1000;
        const updateKstDate = new Date(updateScheduledDate.getTime() + updateKstOffset);
        const updateYear = updateKstDate.getUTCFullYear();
        const updateMonth = updateKstDate.getUTCMonth();
        const updateDay = updateKstDate.getUTCDate();
        
        console.log(`[Submit Update] Maptics coll* calculation - scheduledSendTimestamp: ${updateScheduledSendTimestamp} (${updateScheduledDate.toISOString()}), KST date: ${updateYear}-${updateMonth+1}-${updateDay}`);
        
        // rcvType=1 (실시간)의 경우 rtStartHhmm/rtEndHhmm 시간대를 고려
        let updateCollStartTimestamp: number;
        let updateCollEndTimestamp: number;
        
        if (updateRcvType === 1 && campaign.rtStartHhmm && campaign.rtEndHhmm) {
          // hhmm 형식에서 시간/분 추출 (non-digit 문자 제거)
          const rtStartClean = String(campaign.rtStartHhmm).replace(/\D/g, '').padStart(4, '0');
          const rtEndClean = String(campaign.rtEndHhmm).replace(/\D/g, '').padStart(4, '0');
          
          if (rtStartClean.length < 4 || rtEndClean.length < 4) {
            console.error(`[Submit Update] Invalid rtHhmm format`);
            return res.status(400).json({
              error: '발송 시간 형식이 올바르지 않습니다',
              code: 'E100015',
              hint: '발송 시간은 HHMM 형식(예: 1500)으로 입력해주세요.',
            });
          }
          
          const rtStartHour = parseInt(rtStartClean.substring(0, 2), 10);
          const rtStartMin = parseInt(rtStartClean.substring(2, 4), 10);
          const rtEndHour = parseInt(rtEndClean.substring(0, 2), 10);
          const rtEndMin = parseInt(rtEndClean.substring(2, 4), 10);
          
          if (isNaN(rtStartHour) || isNaN(rtStartMin) || isNaN(rtEndHour) || isNaN(rtEndMin)) {
            console.error(`[Submit Update] NaN in rtHhmm parsing`);
            return res.status(400).json({
              error: '발송 시간 형식이 올바르지 않습니다',
              code: 'E100015',
              hint: '발송 시간을 확인해주세요.',
            });
          }
          
          // rtStart/rtEnd UTC timestamp 계산
          const updateRtStartUtcMs = Date.UTC(updateYear, updateMonth, updateDay, rtStartHour - 9, rtStartMin, 0);
          const updateRtStartTimestamp = Math.floor(updateRtStartUtcMs / 1000);
          let updateRtEndUtcMs = Date.UTC(updateYear, updateMonth, updateDay, rtEndHour - 9, rtEndMin, 0);
          let updateRtEndTimestamp = Math.floor(updateRtEndUtcMs / 1000);
          
          // 자정 넘김 처리: rtEnd < rtStart인 경우 (예: 23:00~01:00)
          if (updateRtEndTimestamp <= updateRtStartTimestamp) {
            updateRtEndTimestamp += 86400; // +24시간
            console.log(`[Submit Update] Cross-midnight detected: rtEnd adjusted to next day`);
          }
          
          // BizChat 규칙: collStart ≤ rtStart ≤ rtEnd ≤ collEnd
          updateCollStartTimestamp = updateRtStartTimestamp;
          updateCollEndTimestamp = updateRtEndTimestamp + 1800;
          
          console.log(`[Submit Update] rcvType=1: rtStart=${rtStartHour}:${rtStartMin}, rtEnd=${rtEndHour}:${rtEndMin}`);
          console.log(`[Submit Update] rtStartTimestamp: ${updateRtStartTimestamp} (${new Date(updateRtStartTimestamp * 1000).toISOString()})`);
          console.log(`[Submit Update] rtEndTimestamp: ${updateRtEndTimestamp} (${new Date(updateRtEndTimestamp * 1000).toISOString()})`);
          console.log(`[Submit Update] Calculated collStart: ${new Date(updateCollStartTimestamp * 1000).toISOString()}, collEnd: ${new Date(updateCollEndTimestamp * 1000).toISOString()}`);
          
          // 현재 시간이 이미 rtStart를 지났다면(초과) 캠페인 제출 불가
          // BizChat은 collStart == rtStart를 허용하므로 > 사용
          if (updateNowTimestamp > updateRtStartTimestamp) {
            console.error(`[Submit Update] Cannot submit: rtStart already passed`);
            return res.status(400).json({
              error: '발송 시작 시간이 이미 지났습니다',
              code: 'E100015',
              hint: `발송 시작 시간(${rtStartHour}:${String(rtStartMin).padStart(2, '0')})이 현재 시간보다 이후여야 합니다.`,
            });
          }
          
          // collStartDate가 현재보다 과거거나 같으면 현재 + 60초로 조정
          if (updateCollStartTimestamp <= updateNowTimestamp) {
            updateCollStartTimestamp = Math.min(updateNowTimestamp + 60, updateRtStartTimestamp);
            console.log('[Submit Update] collStartDate adjusted to future:', new Date(updateCollStartTimestamp * 1000).toISOString());
          }
        } else {
          // rcvType=2 또는 rtHhmm이 없는 경우 기존 로직 사용
          if (campaign.collStartDate) {
            updateCollStartTimestamp = toUnixTimestamp(new Date(campaign.collStartDate));
            if (updateCollStartTimestamp <= updateNowTimestamp) {
              updateCollStartTimestamp = updateNowTimestamp + 3600;
              console.log('[Submit Update] collStartDate adjusted to future:', new Date(updateCollStartTimestamp * 1000).toISOString());
            }
          } else {
            const sendMinus1Day = updateScheduledSendTimestamp - 86400;
            const nowPlus1Hour = updateNowTimestamp + 3600;
            updateCollStartTimestamp = Math.max(nowPlus1Hour, sendMinus1Day);
            if (updateCollStartTimestamp >= updateScheduledSendTimestamp) {
              updateCollStartTimestamp = nowPlus1Hour;
            }
          }
          
          if (campaign.collEndDate) {
            updateCollEndTimestamp = toUnixTimestamp(new Date(campaign.collEndDate));
            if (updateCollEndTimestamp <= updateCollStartTimestamp) {
              updateCollEndTimestamp = updateScheduledSendTimestamp;
            }
          } else {
            updateCollEndTimestamp = updateScheduledSendTimestamp;
          }
        }
        
        updatePayload.collStartDate = updateCollStartTimestamp;
        updatePayload.collEndDate = updateCollEndTimestamp;
        
        // rcvType=2 (모아서 보내기)의 경우 collSndDate 추가
        if (updateRcvType === 2) {
          let updateCollSndTimestamp: number;
          if (campaign.collSndDate) {
            updateCollSndTimestamp = toUnixTimestamp(new Date(campaign.collSndDate));
          } else {
            updateCollSndTimestamp = updateScheduledSendTimestamp;
          }
          updatePayload.collSndDate = updateCollSndTimestamp;
        }
        
        console.log(`[Submit Update] Maptics campaign fields - rcvType: ${updateRcvType}, sndGeofenceId: ${updateBizchatGeofenceId}, collStartDate: ${updateCollStartTimestamp} (${new Date(updateCollStartTimestamp * 1000).toISOString()}), collEndDate: ${updateCollEndTimestamp} (${new Date(updateCollEndTimestamp * 1000).toISOString()}), rtStartHhmm: ${campaign.rtStartHhmm}, rtEndHhmm: ${campaign.rtEndHhmm}, sndDayDiv: ${campaign.sndDayDiv}`);
      }
      
      // 발송 시간 업데이트 (ATS 캠페인에서만 - Maptics는 collStartDate 사용)
      if (adjustedSendDate && !updateIsMapticsCampaign) {
        updatePayload.atsSndStartDate = toUnixTimestamp(
          typeof adjustedSendDate === 'string' ? new Date(adjustedSendDate) : adjustedSendDate
        );
      }
      
      // RCS 타입 설정
      // BizChat API rcsType: 0=스탠다드, 1=LMS(텍스트), 2=슬라이드(캐러셀), 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
      // E100038 오류 방지: 이미지가 있는 RCS MMS는 이미지강조B(rcsType=4) 사용
      if (isRcs) {
        const updateSlideCount = updateRcsSlide ? 1 : 0;
        
        // rcsType 결정 로직:
        // 1. campaign.rcsType이 유효하면 사용 (0~5 범위)
        // 2. 유효하지 않으면 billingType에 따라 자동 결정
        let validRcsType: number;
        if (campaign.rcsType !== null && campaign.rcsType !== undefined && campaign.rcsType >= 0 && campaign.rcsType <= 5) {
          validRcsType = campaign.rcsType;
          console.log(`[Submit Update] Using campaign rcsType: ${validRcsType}`);
        } else {
          // RCS MMS(이미지 있음) → 이미지강조B(4), RCS LMS → LMS(1)
          validRcsType = billingType === 1 ? 4 : 1;
          console.log(`[Submit Update] Auto-determined rcsType from billingType=${billingType}: ${validRcsType} (4=이미지강조B, 1=LMS)`);
        }
        updatePayload.rcsType = validRcsType;
        console.log(`[Submit Update] RCS type set to: ${validRcsType} (campaign.rcsType: ${campaign.rcsType}, billingType: ${billingType}, slides: ${updateSlideCount})`);
        if (validRcsType === 2) {
          updatePayload.slideCnt = updateSlideCount || 1;
        }
      }
      
      // sndMosuDesc/sndMosuQuery 업데이트 (타겟팅 필터)
      // BizChat API 규격: sndMosuQuery는 ATS mosu API 응답의 query 문자열(SQL 형식)을 사용해야 함
      // 항상 targeting 테이블에서 조건을 조회하여 현재 환경(상용/개발)에 맞는 ATS API로 쿼리 생성
      let updateAtsFilterStr = '';
      
      // targeting 테이블에서 타겟팅 조건 조회
      const updateTargetingResult = await db.select().from(targeting).where(eq(targeting.campaignId, id));
      const updateCampaignTargeting = updateTargetingResult[0];
      
      console.log('[Submit Update] Querying targeting table for campaign:', id);
      console.log('[Submit Update] Found targeting data:', updateCampaignTargeting ? 'yes' : 'no');
      
      let updateFilterPayload: Record<string, unknown>;
      
      if (updateCampaignTargeting && (
        updateCampaignTargeting.gender ||
        updateCampaignTargeting.ageMin ||
        updateCampaignTargeting.ageMax ||
        (updateCampaignTargeting.regions && updateCampaignTargeting.regions.length > 0) ||
        updateCampaignTargeting.atsQuery
      )) {
        // targeting 테이블에서 조건을 가져와 ATS 필터 생성
        console.log('[Submit Update] Building ATS filter from targeting table...');
        const { payload, desc } = buildATSFilterFromTargeting({
          gender: updateCampaignTargeting.gender,
          ageMin: updateCampaignTargeting.ageMin,
          ageMax: updateCampaignTargeting.ageMax,
          regions: updateCampaignTargeting.regions,
          atsQuery: updateCampaignTargeting.atsQuery,
        });
        updateFilterPayload = payload;
        console.log('[Submit Update] Built ATS filter from targeting:', JSON.stringify(updateFilterPayload, null, 2));
      } else if (campaign.sndMosuQuery) {
        // fallback: campaign.sndMosuQuery 사용
        console.log('[Submit Update] Using campaign.sndMosuQuery as fallback...');
        const queryString = typeof campaign.sndMosuQuery === 'string' 
          ? campaign.sndMosuQuery 
          : JSON.stringify(campaign.sndMosuQuery);
        
        const convertResult = convertLegacySndMosuQuery(queryString);
        
        // 레거시 SQL 형식인 경우 그대로 사용
        if (convertResult.isLegacySql) {
          console.log('[Submit Update] Using legacy SQL query directly (skipping ATS mosu API)');
          updatePayload.sndMosuQuery = convertResult.query;
          updateAtsFilterStr = campaign.sndMosuDesc || '';
          updateFilterPayload = { '$and': [] }; // 빈 필터 - ATS API 호출 건너뜀
        } else {
          try {
            updateFilterPayload = JSON.parse(convertResult.query);
          } catch {
            updateFilterPayload = { '$and': [] };
          }
        }
      } else {
        updateFilterPayload = { '$and': [] };
      }
      
      // ATS mosu API 호출 (필터 조건이 있는 경우만)
      const updateHasConditions = updateFilterPayload['$and'] && (updateFilterPayload['$and'] as unknown[]).length > 0;
      
      if (updateHasConditions) {
        console.log('[Submit Update] Calling ATS mosu API to get SQL query...');
        console.log('[Submit Update] Filter payload:', JSON.stringify(updateFilterPayload, null, 2));
        
        const atsResult = await callATSMosuAPI(updateFilterPayload, useProduction);
        
        if (atsResult.success && atsResult.query) {
          updatePayload.sndMosuQuery = atsResult.query;
          updateAtsFilterStr = atsResult.filterStr;
          console.log('[Submit Update] sndMosuQuery (SQL from ATS):', atsResult.query.substring(0, 200) + '...');
        } else {
          console.error('[Submit Update] ATS mosu API failed:', atsResult.error);
          return res.status(400).json({
            error: `ATS 타겟팅 조회 실패: ${atsResult.error || 'Unknown error'}`,
            hint: 'ATS 발송 모수 API 호출에 실패했습니다. 타겟팅 조건을 확인해주세요.',
          });
        }
      } else {
        console.log('[Submit Update] No ATS filter conditions, skipping ATS mosu API call');
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { randomUUID, createHmac } from 'crypto';

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

function generateTid(): string {
  return Date.now().toString();
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
    console.log(`[ATS Mosu] Response: ${response.status} - ${responseText.substring(0, 500)}`);

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

// Callback URL (Vercel 배포 도메인)
const CALLBACK_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://wepickbizchat-new.vercel.app';

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: numeric('balance').default('0').notNull(),
});

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  tgtCompanyName: text('tgt_company_name'),
  templateId: text('template_id'),
  messageType: text('message_type'),
  bizchatCampaignId: text('bizchat_campaign_id'),
  sndNum: text('snd_num'),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  rcvType: integer('rcv_type').default(0),
  billingType: integer('billing_type').default(0),
  rcsType: integer('rcs_type'),
  sndGoalCnt: integer('snd_goal_cnt'),
  sndMosu: integer('snd_mosu'),
  sndMosuQuery: text('snd_mosu_query'),
  sndMosuDesc: text('snd_mosu_desc'),
  settleCnt: integer('settle_cnt').default(0),
  targetCount: integer('target_count'),
  sentCount: integer('sent_count'),
  successCount: integer('success_count'),
  budget: numeric('budget'),
  costPerMessage: numeric('cost_per_message'),
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
  createdAt: timestamp('created_at').defaultNow(),
});

const targeting = pgTable('targeting', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  gender: text('gender'),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  regions: text('regions').array(),
  districts: text('districts').array(),
  carrierTypes: text('carrier_types').array(),
  deviceTypes: text('device_types').array(),
  shopping11stCategories: text('shopping_11st_categories').array(),
  webappCategories: text('webapp_categories').array(),
  callUsageTypes: text('call_usage_types').array(),
  locationTypes: text('location_types').array(),
  mobilityPatterns: text('mobility_patterns').array(),
  geofenceIds: text('geofence_ids').array(),
  atsQuery: text('ats_query'),
  estimatedCount: integer('estimated_count'),
  createdAt: timestamp('created_at').defaultNow(),
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
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

// 대리 로그인 토큰 검증
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
  // 대리 로그인 토큰 확인
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

// 환경 감지 함수: 개발 완료 전까지 항상 개발 API 사용
// SK 담당자 요청: 개발 완료될 때까지 상용 URL이 아닌 개발 URL(gw-dev.bizchat1.co.kr:8443)로 요청
function detectProductionEnvironment(req: VercelRequest): boolean {
  // ⚠️ 개발 완료 전까지 항상 개발 API 사용 (BIZCHAT_USE_PROD=true 설정 시에만 운영 API 사용)
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
  if (forceDevMode) {
    console.log('[BizChat] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
    return false;
  }
  
  if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
  if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
  if (process.env.VERCEL_ENV === 'production') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
}

// BizChat API 호출 - API 키가 없으면 에러 발생
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

  console.log(`[BizChat] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[BizChat] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  console.log(`[BizChat] VERCEL_ENV: ${process.env.VERCEL_ENV}, NODE_ENV: ${process.env.NODE_ENV}`);

  // API 키가 없으면 에러 발생
  if (!apiKey) {
    console.error(`[BizChat] ❌ API key not configured: ${envKeyName}`);
    console.error(`[BizChat] Available keys - DEV: ${!!process.env.BIZCHAT_DEV_API_KEY}, PROD: ${!!process.env.BIZCHAT_PROD_API_KEY}`);
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

// 지역명 → hcode 매핑
const REGION_HCODE_MAP: Record<string, string> = {
  '서울': '11', '경기': '41', '인천': '28', '부산': '26', '대구': '27',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36', '강원': '42',
  '충북': '43', '충남': '44', '전북': '45', '전남': '46', '경북': '47',
  '경남': '48', '제주': '50',
};

// BizChat ATS 필터 조건 인터페이스
interface ATSFilterCondition {
  data: unknown;
  dataType: 'number' | 'code' | 'boolean' | 'cate';
  metaType: 'svc' | 'loc' | 'pro' | 'app' | 'tel' | 'call' | 'STREET' | 'TEL' | 'CALL';
  code: string;
  desc: string;
  not: boolean;
}

// 새로운 타겟팅 형식 (BizChat v0.31.0 규격)
// cat1/cat2/cat3에는 cateid 코드를 저장, *Name에는 표시명을 저장
interface SelectedCategory {
  cat1: string;       // cateid 코드 (예: "01")
  cat1Name?: string;  // 표시명 (예: "가구/인테리어")
  cat2?: string;      // cateid 코드 (예: "0101")
  cat2Name?: string;  // 표시명
  cat3?: string;      // cateid 코드 (예: "010101")
  cat3Name?: string;  // 표시명
}

interface SelectedLocation {
  code: string;
  type: 'home' | 'work';
  name: string;
}

interface SelectedProfiling {
  code: string;
  value: string | { gt: string; lt: string };
  desc: string;
}

// 타겟팅 정보를 BizChat ATS mosu 형식으로 변환
function buildAtsQuery(targetingData: {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  regions?: string[];
  districts?: string[];
  // 새로운 형식 (BizChat 규격)
  shopping11stCategories?: SelectedCategory[];
  webappCategories?: SelectedCategory[];
  callCategories?: SelectedCategory[];
  locations?: SelectedLocation[];
  profiling?: SelectedProfiling[];
  // 레거시 형식 (하위 호환)
  carrierTypes?: string[];
  deviceTypes?: string[];
  callUsageTypes?: string[];
  locationTypes?: string[];
  mobilityPatterns?: string[];
  geofenceIds?: string[];
}): { query: { '$and': ATSFilterCondition[] }; description: string; htmlDescription: string } {
  const conditions: ATSFilterCondition[] = [];
  const descParts: string[] = [];

  // 1. 연령 필터 (metaType: svc, code: cust_age_cd)
  if (targetingData.ageMin !== undefined || targetingData.ageMax !== undefined) {
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

  // 2. 성별 필터 (metaType: svc, code: sex_cd)
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

  // 3. 기본 지역 필터 (metaType: loc, code: home_location)
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

  // 4. 11번가 쇼핑 카테고리 (metaType: STREET, dataType: cate)
  // BizChat ATS mosu 형식: cat1/cat2/cat3에 카테고리 이름 사용 (cateid 코드가 아님!)
  if (targetingData.shopping11stCategories && targetingData.shopping11stCategories.length > 0) {
    // 카테고리 이름으로 API 페이로드 구성 (API 규격 v0.29.0)
    const categoryData = targetingData.shopping11stCategories.map(cat => ({
      cat1: cat.cat1Name || cat.cat1,  // 카테고리 이름 (예: "가구/인테리어")
      ...(cat.cat2 && { cat2: cat.cat2Name || cat.cat2 }),  // 카테고리 이름 (예: "침대/소파")
      ...(cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }),  // 카테고리 이름 (예: "펠트")
    }));
    
    // 설명에는 표시명 사용
    const categoryDesc = targetingData.shopping11stCategories.map(cat => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? (cat.cat2Name || cat.cat2) : '';
      const cat3Display = cat.cat3 ? (cat.cat3Name || cat.cat3) : '';
      return `${cat1Display}${cat2Display ? ' > ' + cat2Display : ''}${cat3Display ? ' > ' + cat3Display : ''}`;
    }).join(', ');
    
    conditions.push({
      data: categoryData,
      dataType: 'cate',
      metaType: 'STREET',  // BizChat ATS mosu API 규격: 11번가는 'STREET'
      code: '',
      desc: `11번가: ${categoryDesc}`,
      not: false,
    });
    descParts.push(`11번가: ${categoryDesc}`);
  }

  // 5. 웹앱 카테고리 (metaType: app, dataType: cate)
  // BizChat ATS mosu 형식: cat1/cat2/cat3에 카테고리 이름 사용 (cateid 코드가 아님!)
  if (targetingData.webappCategories && targetingData.webappCategories.length > 0) {
    // 카테고리 이름으로 API 페이로드 구성 (API 규격 v0.29.0)
    const categoryData = targetingData.webappCategories.map(cat => ({
      cat1: cat.cat1Name || cat.cat1,  // 카테고리 이름 (예: "게임")
      ...(cat.cat2 && { cat2: cat.cat2Name || cat.cat2 }),  // 카테고리 이름 (예: "VR/AR게임")
      ...(cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }),  // 카테고리 이름 (예: "포켓몬 고")
    }));
    
    // 설명에는 표시명 사용
    const categoryDesc = targetingData.webappCategories.map(cat => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? (cat.cat2Name || cat.cat2) : '';
      const cat3Display = cat.cat3 ? (cat.cat3Name || cat.cat3) : '';
      return `${cat1Display}${cat2Display ? ' > ' + cat2Display : ''}${cat3Display ? ' > ' + cat3Display : ''}`;
    }).join(', ');
    
    conditions.push({
      data: categoryData,
      dataType: 'cate',
      metaType: 'app',  // BizChat ATS mosu API 규격: 웹앱은 'app' (소문자)
      code: '',
      desc: `앱/웹: ${categoryDesc}`,
      not: false,
    });
    descParts.push(`앱/웹: ${categoryDesc}`);
  }

  // 6. 통화Usage 카테고리 (metaType: TEL, dataType: cate)
  // BizChat ATS mosu 형식: cat1/cat2/cat3에 카테고리 이름 사용 (cateid 코드가 아님!)
  if (targetingData.callCategories && targetingData.callCategories.length > 0) {
    // 카테고리 이름으로 API 페이로드 구성 (API 규격 v0.29.0)
    const categoryData = targetingData.callCategories.map(cat => ({
      cat1: cat.cat1Name || cat.cat1,  // 카테고리 이름
      ...(cat.cat2 && { cat2: cat.cat2Name || cat.cat2 }),
      ...(cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }),
    }));
    
    // 설명에는 표시명 사용
    const categoryDesc = targetingData.callCategories.map(cat => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? (cat.cat2Name || cat.cat2) : '';
      const cat3Display = cat.cat3 ? (cat.cat3Name || cat.cat3) : '';
      return `${cat1Display}${cat2Display ? ' > ' + cat2Display : ''}${cat3Display ? ' > ' + cat3Display : ''}`;
    }).join(', ');
    
    conditions.push({
      data: categoryData,
      dataType: 'cate',
      metaType: 'TEL',  // BizChat ATS mosu API 규격: 통화Usage는 'TEL' (대문자)
      code: '',
      desc: `통화: ${categoryDesc}`,
      not: false,
    });
    descParts.push(`통화: ${categoryDesc}`);
  }

  // 7. 고급 위치 타겟팅 (metaType: loc)
  if (targetingData.locations && targetingData.locations.length > 0) {
    const homeLocations = targetingData.locations.filter(l => l.type === 'home');
    const workLocations = targetingData.locations.filter(l => l.type === 'work');
    
    if (homeLocations.length > 0) {
      const hcodes = homeLocations.map(l => l.code);
      const names = homeLocations.map(l => l.name);
      conditions.push({
        data: hcodes,
        dataType: 'code',
        metaType: 'loc',
        code: 'home_location',
        desc: `추정 집주소: ${names.join(', ')}`,
        not: false,
      });
      descParts.push(`집주소: ${names.join(', ')}`);
    }
    
    if (workLocations.length > 0) {
      const hcodes = workLocations.map(l => l.code);
      const names = workLocations.map(l => l.name);
      conditions.push({
        data: hcodes,
        dataType: 'code',
        metaType: 'loc',
        code: 'work_location',
        desc: `추정 직장주소: ${names.join(', ')}`,
        not: false,
      });
      descParts.push(`직장주소: ${names.join(', ')}`);
    }
  }

  // 7. 프로파일링 필터 (metaType: pro)
  // BizChat API 규격: 범위 값은 {gt: number, lt: number} 형식
  if (targetingData.profiling && targetingData.profiling.length > 0) {
    for (const pro of targetingData.profiling) {
      // 값 처리: 문자열 gt/lt를 숫자로 변환
      let processedValue: unknown = pro.value;
      let dataType: 'number' | 'boolean' | 'code' = 'number';
      
      if (typeof pro.value === 'object' && pro.value !== null && 'gt' in pro.value) {
        // 범위 값 - 숫자로 변환
        const rangeValue = pro.value as { gt?: string | number; lt?: string | number };
        processedValue = {
          gt: typeof rangeValue.gt === 'string' ? parseFloat(rangeValue.gt) : rangeValue.gt,
          lt: typeof rangeValue.lt === 'string' ? parseFloat(rangeValue.lt) : rangeValue.lt,
        };
        dataType = 'number';
      } else if (typeof pro.value === 'boolean') {
        dataType = 'boolean';
      } else if (typeof pro.value === 'string') {
        // 문자열 값 (예: 'Y', 'N') - code 타입으로 처리
        dataType = 'code';
        processedValue = [pro.value]; // BizChat API는 배열 형식을 기대
      } else if (typeof pro.value === 'number') {
        dataType = 'number';
      }
      
      conditions.push({
        data: processedValue,
        dataType: dataType,
        metaType: 'pro',
        code: pro.code,
        desc: pro.desc,
        not: false,
      });
      descParts.push(pro.desc);
    }
  }

  const plainDescription = descParts.length > 0 ? descParts.join(', ') : '전체 대상';
  const htmlDescription = `<html><body><p>${plainDescription}</p></body></html>`;

  return {
    query: { '$and': conditions },
    description: plainDescription,
    htmlDescription,
  };
}

// 발송 시간 유효성 검증 (BizChat API 규격)
// 1. 현재 시간 대비 1시간 이후여야 함
// 2. 9시부터 19시(19시 미포함) 사이여야 함
// 3. 10분 단위로 시간 체크
function validateSendTime(sendDate: Date | string | null): { valid: boolean; error?: string; adjustedDate?: Date } {
  if (!sendDate) {
    return { valid: true };
  }
  
  const targetDate = typeof sendDate === 'string' ? new Date(sendDate) : new Date(sendDate);
  const now = new Date();
  
  // 1. 발송 시간대 체크 (09:00~19:00, 19시 미포함)
  const targetHour = targetDate.getHours();
  if (targetHour < 9 || targetHour >= 19) {
    return { 
      valid: false, 
      error: '발송 시간은 09:00~19:00 사이여야 합니다 (19시 이전)' 
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
  // 10분 단위가 아니면 올림 처리
  const adjustedDate = new Date(targetDate);
  adjustedDate.setSeconds(0);
  adjustedDate.setMilliseconds(0);
  
  const targetMinutes = adjustedDate.getMinutes();
  const remainder = targetMinutes % 10;
  if (remainder !== 0) {
    adjustedDate.setMinutes(targetMinutes + (10 - remainder));
    if (adjustedDate.getMinutes() === 0) {
      // 시간이 넘어간 경우 (예: 59분 → 00분)
      // 이미 setMinutes에서 자동으로 시간이 증가됨
    }
  }
  
  // 조정된 시간이 19시 이상이면 에러
  if (adjustedDate.getHours() >= 19) {
    return { 
      valid: false, 
      error: '발송 시간은 19:00 이전이어야 합니다' 
    };
  }
  
  return { valid: true, adjustedDate };
}

// 문자열 길이 검증 (BizChat API 규격)
function validateStringLengths(data: {
  name?: string;
  tgtCompanyName?: string;
  title?: string;
  msg?: string;
}): { valid: boolean; error?: string } {
  // 캠페인명: 최대 40자
  if (data.name && data.name.length > 40) {
    return { valid: false, error: `캠페인명은 최대 40자까지 입력 가능합니다 (현재: ${data.name.length}자)` };
  }
  
  // 고객사명: 최대 100자
  if (data.tgtCompanyName && data.tgtCompanyName.length > 100) {
    return { valid: false, error: `고객사명은 최대 100자까지 입력 가능합니다 (현재: ${data.tgtCompanyName.length}자)` };
  }
  
  // 메시지 제목: 최대 30자
  if (data.title && data.title.length > 30) {
    return { valid: false, error: `메시지 제목은 최대 30자까지 입력 가능합니다 (현재: ${data.title.length}자)` };
  }
  
  // 메시지 본문: 최대 1000자
  if (data.msg && data.msg.length > 1000) {
    return { valid: false, error: `메시지 본문은 최대 1000자까지 입력 가능합니다 (현재: ${data.msg.length}자)` };
  }
  
  return { valid: true };
}

// BizChat 캠페인 생성 (POST /api/v1/cmpn/create)
async function createCampaignInBizChat(
  campaignData: {
    name: string;
    tgtCompanyName?: string;
    messageType: string;
    sndNum: string;
    targetCount: number;
    rcsType?: number;
    rcvType?: number;
    atsSndStartDate?: Date | null;
    sndMosuQuery?: string;
    sndMosuDesc?: string;
    // Maptics 지오펜스 관련 파라미터 (rcvType=1,2일 때 사용)
    sndGeofenceId?: number;
    collStartDate?: Date | null;  // 수집 시작 일시
    collEndDate?: Date | null;    // 수집 종료 일시
    collSndDate?: Date | null;    // 발송 시작 일시 (rcvType=2)
    // Maptics 실시간 보내기 전용 (rcvType=1)
    rtStartHhmm?: string;         // 발송 시작 시간 (HHMM, 0900~1950)
    rtEndHhmm?: string;           // 발송 종료 시간 (HHMM, 0910~2000)
    sndDayDiv?: number;           // 일 균등 분할 (0: 미분할, 1: 분할)
  },
  messageData: {
    title?: string;
    content: string;
    imageUrl?: string | null;
  },
  useProduction: boolean = false
) {
  // billingType: 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  let billingType = 0;
  if (campaignData.messageType === 'RCS') {
    billingType = campaignData.rcsType === 2 ? 1 : 3;
  } else if (campaignData.messageType === 'MMS') {
    billingType = 2;
  }

  const sndGoalCnt = campaignData.targetCount || 1000;
  const sndMosu = Math.min(Math.ceil(sndGoalCnt * 1.5), 400000);

  // rcvType: 0=ATS 타겟팅, 10=MDN 직접 지정
  const rcvType = campaignData.rcvType ?? 0;

  // atsSndStartDate: rcvType=0,10일 때 필수 (Unix timestamp 초단위)
  // BizChat 규칙: 현재 시간 + 1시간 이후, 10분 단위로 올림
  const calculateValidSendDate = (requestedDate: Date | null | undefined): number => {
    const now = new Date();
    const minStartTime = new Date(now.getTime() + 60 * 60 * 1000); // 현재 + 1시간
    
    // 요청된 시간이 없거나 최소 시작 시간보다 이전이면 최소 시작 시간 사용
    let targetDate = requestedDate ? new Date(requestedDate) : minStartTime;
    if (targetDate < minStartTime) {
      targetDate = minStartTime;
    }
    
    // 항상 초/밀리초를 0으로 초기화
    targetDate.setSeconds(0);
    targetDate.setMilliseconds(0);
    
    // 10분 단위로 올림 (예: 11:13 → 11:20, 11:20 → 11:20)
    const minutes = targetDate.getMinutes();
    const remainder = minutes % 10;
    if (remainder > 0) {
      targetDate.setMinutes(minutes + (10 - remainder));
    }
    
    // 올림 후 다시 최소 시작 시간 확인 (경계 케이스)
    if (targetDate < minStartTime) {
      targetDate = new Date(minStartTime.getTime());
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);
      const mins = targetDate.getMinutes();
      const rem = mins % 10;
      if (rem > 0) {
        targetDate.setMinutes(mins + (10 - rem));
      }
    }
    
    return Math.floor(targetDate.getTime() / 1000);
  };

  const payload: Record<string, unknown> = {
    tgtCompanyName: campaignData.tgtCompanyName || '위픽',
    name: campaignData.name,
    sndNum: campaignData.sndNum,
    rcvType: rcvType,
    sndGoalCnt: sndGoalCnt,
    billingType: billingType,
    isTmp: 0, // 임시저장 아님
    settleCnt: sndGoalCnt,
    sndMosu: sndMosu,
    sndMosuFlag: 0,
    adverDeny: '1504',
    // rcvType=0,10일 때 atsSndStartDate 필수 (10분 단위 올림, 현재+1시간 이후)
    atsSndStartDate: calculateValidSendDate(campaignData.atsSndStartDate),
    cb: {
      state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`,
    },
    // MMS 메시지 객체 (BizChat API 규격 v0.29.0)
    // - mms.title: 메시지 제목 (최대 30자)
    // - mms.msg: 메시지 본문 (최대 1000자)
    // - mms.fileInfo: 이미지 파일 정보 (파일이 없으면 empty object {})
    // - mms.urlLink: 마케팅 URL 정보 (링크가 없으면 empty object {})
    mms: {
      title: messageData.title || '',
      msg: messageData.content || '',
      fileInfo: {}, // 파일이 포함되지 않으면 empty object
      urlLink: {}, // 링크가 없으면 empty object (규격 준수)
    },
    // rcs 필드는 RCS 캠페인일 때만 포함 (LMS/MMS일 때 제외)
  };

  // 발송 모수 설명/쿼리 (ATS 타겟팅 정보)
  if (campaignData.sndMosuDesc) {
    payload.sndMosuDesc = campaignData.sndMosuDesc;
  }
  if (campaignData.sndMosuQuery) {
    payload.sndMosuQuery = campaignData.sndMosuQuery;
  }

  // MMS 이미지 첨부
  if (campaignData.messageType === 'MMS' && messageData.imageUrl) {
    payload.mms = {
      ...payload.mms as object,
      fileInfo: {
        list: [{ origId: messageData.imageUrl }],
      },
    };
  }

  // RCS 타입 및 rcs 배열 (RCS 캠페인일 때만 포함)
  if (campaignData.messageType === 'RCS' && campaignData.rcsType !== undefined) {
    payload.rcsType = campaignData.rcsType;
    // RCS 메시지 배열 - RCS 캠페인일 때만 포함
    payload.rcs = [{
      slideNum: 1,
      title: messageData.title || '',
      msg: messageData.content || '',
      urlFile: '',
      urlLink: {},
      buttons: {},
      opts: {},
    }];
  }
  // LMS/MMS일 때는 rcs 필드 자체를 포함하지 않음 (빈 배열도 X)

  // Maptics 지오펜스 (rcvType=1: 실시간, rcvType=2: 모아서)
  if (rcvType === 1 || rcvType === 2) {
    // 지오펜스 ID 필수
    if (campaignData.sndGeofenceId) {
      payload.sndGeofenceId = campaignData.sndGeofenceId;
    }
    
    // 수집 시작/종료 일시 (필수)
    if (campaignData.collStartDate) {
      payload.collStartDate = Math.floor(new Date(campaignData.collStartDate).getTime() / 1000);
    }
    if (campaignData.collEndDate) {
      payload.collEndDate = Math.floor(new Date(campaignData.collEndDate).getTime() / 1000);
    }
    
    // rcvType=2 (모아서 보내기)일 때 발송 시작 일시
    if (rcvType === 2 && campaignData.collSndDate) {
      payload.collSndDate = Math.floor(new Date(campaignData.collSndDate).getTime() / 1000);
    }
    
    // rcvType=1 (실시간 보내기)일 때 발송 시간대 및 일 균등 분할
    if (rcvType === 1) {
      if (campaignData.rtStartHhmm) {
        payload.rtStartHhmm = campaignData.rtStartHhmm;
      }
      if (campaignData.rtEndHhmm) {
        payload.rtEndHhmm = campaignData.rtEndHhmm;
      }
      // sndDayDiv: 0=미분할 (기본), 1=분할
      payload.sndDayDiv = campaignData.sndDayDiv ?? 0;
    }
    
    // Maptics는 ATS mosu가 아닌 지오펜스로 타겟팅하므로, atsSndStartDate 제거
    delete payload.atsSndStartDate;
    delete payload.sndMosu;
    delete payload.sndMosuFlag;
    delete payload.sndMosuDesc;
    delete payload.sndMosuQuery;
  }

  return callBizChatAPI('/api/v1/cmpn/create', 'POST', payload, useProduction);
}

// 위치 타겟팅 스키마
const selectedLocationSchema = z.object({
  code: z.string(),
  type: z.enum(['home', 'work']),
  name: z.string(),
});

// 카테고리 타겟팅 스키마
const selectedCategorySchema = z.object({
  cat1: z.string(),
  cat1Name: z.string().optional(),
  cat2: z.string().optional(),
  cat2Name: z.string().optional(),
  cat3: z.string().optional(),
  cat3Name: z.string().optional(),
});

// 프로파일링 스키마 - BizChat ATS 규격에 맞게 범위 값({gt, lt})도 지원
// 프론트엔드에서 문자열로 전송되는 경우도 처리하기 위해 coerce 사용
const profilingRangeSchema = z.object({
  gt: z.coerce.number().optional(),
  lt: z.coerce.number().optional(),
});

const selectedProfilingSchema = z.object({
  code: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), profilingRangeSchema]),
  desc: z.string(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().min(1),
  messageType: z.enum(['LMS', 'MMS', 'RCS']),
  sndNum: z.string().min(1),
  gender: z.enum(['all', 'male', 'female']).default('all'),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  districts: z.array(z.string()).optional(),
  carrierTypes: z.array(z.string()).optional(),
  deviceTypes: z.array(z.string()).optional(),
  // 카테고리 타겟팅: 객체 배열 형식 (BizChat 규격)
  shopping11stCategories: z.array(selectedCategorySchema).optional(),
  webappCategories: z.array(selectedCategorySchema).optional(),
  callCategories: z.array(selectedCategorySchema).optional(),
  locations: z.array(selectedLocationSchema).optional(), // 위치 타겟팅
  profiling: z.array(selectedProfilingSchema).optional(), // 프로파일링 타겟팅
  callUsageTypes: z.array(z.string()).optional(),
  locationTypes: z.array(z.string()).optional(),
  mobilityPatterns: z.array(z.string()).optional(),
  geofenceIds: z.array(z.string()).optional(),
  geofences: z.array(z.object({
    id: z.number(),
    name: z.string(),
    targets: z.array(z.object({
      gender: z.number(),
      minAge: z.number(),
      maxAge: z.number(),
      stayMin: z.number(),
      radius: z.number(),
      address: z.string(),
      lat: z.string().optional(),
      lon: z.string().optional(),
    })),
  })).optional(),
  // Maptics 발송 방식 (rcvType=1: realtime, rcvType=2: batch)
  mapticsSendType: z.enum(['realtime', 'batch']).optional(),
  // Maptics 실시간 발송 시간대 (rcvType=1, HHMM 형식)
  rtStartHhmm: z.string().regex(/^(0[9]|1[0-9])([0-5][0])$/).optional(), // 0900~1950
  rtEndHhmm: z.string().regex(/^(0[9]|1[0-9]|20)([0-1][0])$/).optional(), // 0910~2000
  // Maptics 일 균등 분할 (rcvType=1, 0: 미분할, 1: 분할)
  sndDayDiv: z.number().min(0).max(1).optional(),
  targetCount: z.number().min(100).default(1000),
  budget: z.number().min(10000),
  scheduledAt: z.string().datetime().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  const userId = auth.userId;
  const useProduction = detectProductionEnvironment(req);

  console.log(`[Campaign] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

  if (req.method === 'GET') {
    try {
      const result = await db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
  }

  if (req.method === 'POST') {
    try {
      const userResult = await db.select().from(users).where(eq(users.id, userId));
      const user = userResult[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      const data = createCampaignSchema.parse(req.body);

      const templateResult = await db.select().from(templates).where(eq(templates.id, data.templateId));
      const template = templateResult[0];
      if (!template) return res.status(404).json({ error: 'Template not found' });
      // 시스템 템플릿(추천 템플릿)은 모든 사용자가 사용 가능
      const SYSTEM_USER_ID = 'system';
      if (template.userId !== userId && template.userId !== SYSTEM_USER_ID) {
        return res.status(403).json({ error: 'Access denied to template' });
      }

      // 메시지 유형별 단가 (RCS: ₩130으로 변경됨)
      const MESSAGE_PRICES: Record<string, number> = { LMS: 100, MMS: 120, RCS: 130 };
      const costPerMessage = MESSAGE_PRICES[template.messageType] || 100;
      
      const userBalance = parseFloat(user.balance || '0');
      const estimatedCost = data.targetCount * costPerMessage;
      if (userBalance < estimatedCost) return res.status(400).json({ error: '잔액이 부족합니다' });

      // 지오펜스 선택 여부 먼저 확인 (ATS vs Maptics 분기)
      const geofenceIds = data.geofenceIds || (data.geofences?.map(g => String(g.id)) ?? []);
      const hasGeofence = geofenceIds.length > 0;
      
      // rcvType 결정: 지오펜스가 있으면 Maptics (1=실시간, 2=모아서), 없으면 ATS (0)
      // mapticsSendType: 'realtime' → rcvType=1, 'batch' (기본) → rcvType=2
      let rcvType = 0; // 기본: ATS 일반
      if (hasGeofence) {
        rcvType = data.mapticsSendType === 'realtime' ? 1 : 2;
      }
      
      // 실시간 보내기(rcvType=1) 검증
      if (rcvType === 1) {
        if (!data.rtStartHhmm || !data.rtEndHhmm) {
          return res.status(400).json({ 
            error: '실시간 보내기는 발송 시작/종료 시간이 필요합니다',
            code: 'MAPTICS_REALTIME_TIME_REQUIRED',
          });
        }
        // 시간 유효성 검증: rtStartHhmm < rtEndHhmm
        const startTime = parseInt(data.rtStartHhmm, 10);
        const endTime = parseInt(data.rtEndHhmm, 10);
        if (startTime >= endTime) {
          return res.status(400).json({ 
            error: '발송 시작 시간은 종료 시간보다 이전이어야 합니다',
            code: 'MAPTICS_REALTIME_INVALID_TIME_RANGE',
          });
        }
      }

      console.log(`[Campaign] rcvType=${rcvType}, hasGeofence=${hasGeofence}, mapticsSendType=${data.mapticsSendType}`);

      // ATS 일반 (rcvType=0)일 때만 ATS mosu API 호출
      // Maptics (rcvType=1,2)는 지오펜스로 타겟팅하므로 ATS mosu 불필요
      let sndMosuQuerySQL = '';
      let sndMosuDescHTML = '';
      let atsMosuCount: number | undefined = undefined;
      let atsResult: { query: { '$and': ATSFilterCondition[] }; description: string; htmlDescription: string } | null = null;

      if (!hasGeofence) {
        // ATS 타겟팅 정보를 ATS 쿼리로 변환
        atsResult = buildAtsQuery({
          gender: data.gender,
          ageMin: data.ageMin,
          ageMax: data.ageMax,
          regions: data.regions,
          districts: data.districts,
          carrierTypes: data.carrierTypes,
          deviceTypes: data.deviceTypes,
          shopping11stCategories: data.shopping11stCategories as unknown as SelectedCategory[],
          webappCategories: data.webappCategories as unknown as SelectedCategory[],
          callCategories: data.callCategories as unknown as SelectedCategory[],
          locations: data.locations as SelectedLocation[] | undefined,
          profiling: data.profiling as SelectedProfiling[] | undefined,
          callUsageTypes: data.callUsageTypes,
          locationTypes: data.locationTypes,
          mobilityPatterns: data.mobilityPatterns,
          geofenceIds: [],
        });

        sndMosuDescHTML = atsResult.htmlDescription;

        console.log('[Campaign] Calling ATS mosu API to get SQL query...');
        const atsMosuResult = await callATSMosuAPI(atsResult.query, useProduction);
        
        if (atsMosuResult.success) {
          sndMosuQuerySQL = atsMosuResult.query;
          atsMosuCount = atsMosuResult.count;
          if (atsMosuResult.filterStr) {
            sndMosuDescHTML = atsMosuResult.filterStr;
          }
          console.log(`[Campaign] ATS mosu API success - SQL query obtained, count: ${atsMosuCount}`);
        } else {
          console.error('[Campaign] ATS mosu API failed:', atsMosuResult.error);
          return res.status(503).json({ 
            error: 'ATS 타겟팅 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
            code: 'ATS_MOSU_UNAVAILABLE',
            details: atsMosuResult.error,
          });
        }
      } else {
        // Maptics 지오펜스 캠페인: ATS mosu 건너뜀
        console.log('[Campaign] Using Maptics geofence targeting, skipping ATS mosu API');
      }

      const campaignId = randomUUID();

      // 1. 로컬 DB에 캠페인 저장 (초기 상태: temp_registered)
      const campaignResult = await db.insert(campaigns).values({
        id: campaignId,
        userId,
        name: data.name,
        tgtCompanyName: '위픽',
        templateId: data.templateId,
        messageType: data.messageType,
        sndNum: data.sndNum,
        statusCode: 0, // temp_registered (BizChat 등록 시도)
        status: 'temp_registered',
        rcvType: rcvType,
        billingType: data.messageType === 'MMS' ? 2 : (data.messageType === 'RCS' ? 3 : 0),
        sndGoalCnt: data.targetCount,
        // Maptics는 sndMosu 사용 안함
        sndMosu: hasGeofence ? null : (atsMosuCount ?? Math.min(Math.ceil(data.targetCount * 1.5), 400000)),
        sndMosuQuery: hasGeofence ? null : sndMosuQuerySQL,
        sndMosuDesc: hasGeofence ? null : sndMosuDescHTML,
        settleCnt: data.targetCount,
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        costPerMessage: '50',
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        // Maptics 실시간 보내기 필드 (rcvType=1)
        ...(rcvType === 1 ? {
          rtStartHhmm: data.rtStartHhmm,
          rtEndHhmm: data.rtEndHhmm,
          sndDayDiv: data.sndDayDiv ?? 0,
        } : {}),
      }).returning();

      // jsonb 컬럼은 Drizzle이 자동으로 직렬화/역직렬화함
      await db.insert(messages).values({
        id: randomUUID(),
        campaignId,
        title: template.title,
        content: template.content,
        imageUrl: template.imageUrl,
        urlLinks: template.urlLinks || null,
        buttons: template.buttons || null,
      });

      // 타겟팅 데이터 저장
      await db.insert(targeting).values({
        id: randomUUID(),
        campaignId,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
        districts: data.districts || [],
        carrierTypes: data.carrierTypes || [],
        deviceTypes: data.deviceTypes || [],
        shopping11stCategories: [],
        webappCategories: [],
        callUsageTypes: data.callUsageTypes || [],
        locationTypes: data.locationTypes || [],
        mobilityPatterns: data.mobilityPatterns || [],
        geofenceIds: geofenceIds,
        atsQuery: hasGeofence 
          ? JSON.stringify({ geofenceIds, rcvType: 2 })  // Maptics 메타데이터
          : JSON.stringify({
              jsonQuery: atsResult?.query,
              sqlQuery: sndMosuQuerySQL,
              estimatedCount: atsMosuCount,
            }),
      });

      // 2. BizChat API에 캠페인 등록
      // 발송 시간 계산 (10분 단위 올림, 현재+1시간 이후)
      const calculateValidSendDateForCampaign = (requestedDate: Date | null | undefined): Date => {
        const now = new Date();
        const minStartTime = new Date(now.getTime() + 60 * 60 * 1000); // 현재 + 1시간
        
        let targetDate = requestedDate ? new Date(requestedDate) : minStartTime;
        if (targetDate < minStartTime) {
          targetDate = minStartTime;
        }
        
        targetDate.setSeconds(0);
        targetDate.setMilliseconds(0);
        
        const minutes = targetDate.getMinutes();
        const remainder = minutes % 10;
        if (remainder > 0) {
          targetDate.setMinutes(minutes + (10 - remainder));
        }
        
        return targetDate;
      };

      const scheduledDate = data.scheduledAt ? new Date(data.scheduledAt) : null;
      let atsSndStartDate = calculateValidSendDateForCampaign(scheduledDate);

      // Maptics 모아서 보내기(rcvType=2)용 일시 설정 (BizChat 규격 v0.29.0 준수)
      // BizChat 규격: 
      // - collStartDate는 캠페인 생성 요청 시간 보다 +1시간 미래여야 함
      // - collSndDate는 한국시간 09:00~20:00 범위 내여야 함
      // - collStartDate < collEndDate < collSndDate
      
      // 10분 단위 올림 헬퍼 함수
      const roundUpTo10Min = (date: Date): Date => {
        const result = new Date(date);
        result.setSeconds(0);
        result.setMilliseconds(0);
        const minutes = result.getMinutes();
        const remainder = minutes % 10;
        if (remainder > 0) {
          result.setMinutes(minutes + (10 - remainder));
        }
        return result;
      };
      
      // 한국시간(KST) 기준 발송 가능 시간대로 조정하는 함수
      // KST = UTC + 9시간, 발송 가능 시간: 09:00~19:00 KST (ATS/Maptics 동일)
      // KST 09:00 = UTC 00:00, KST 19:00 = UTC 10:00
      const clampToKSTWindow = (dateUTC: Date, minTime: Date): Date => {
        const KST_OFFSET_HOURS = 9;
        
        // UTC 시간 기준으로 KST 시간 계산
        const utcHours = dateUTC.getUTCHours();
        // KST 시간 = UTC + 9 (날짜 넘어갈 수 있음)
        const kstHours = utcHours + KST_OFFSET_HOURS;
        const kstHoursNormalized = kstHours % 24;
        const isNextDayKST = kstHours >= 24;
        
        // KST 09:00~18:59 범위 = UTC 00:00~09:59 범위
        // (KST 19:00 = UTC 10:00)
        const isInWindow = kstHoursNormalized >= 9 && kstHoursNormalized < 19;
        
        if (isInWindow) {
          // 이미 발송 가능 시간대 내
          // minTime과 비교하여 더 늦은 시간 반환
          const effectiveDate = dateUTC > minTime ? dateUTC : minTime;
          // 반환값도 KST 범위 내인지 확인
          const resultKstHours = (effectiveDate.getUTCHours() + KST_OFFSET_HOURS) % 24;
          if (resultKstHours >= 9 && resultKstHours < 19) {
            return roundUpTo10Min(effectiveDate);
          }
          // minTime이 범위 밖이면 다음 09:00으로 이동
        }
        
        // 발송 불가 시간대 → 다음 가능한 KST 09:00 (= UTC 00:00)으로 조정
        const adjusted = new Date(dateUTC);
        
        if (kstHoursNormalized >= 19) {
          // KST 19:00~23:59 (UTC 10:00~14:59) → 다음날 KST 09:00
          // 다음날 UTC 00:00으로 설정
          adjusted.setUTCDate(adjusted.getUTCDate() + 1);
          adjusted.setUTCHours(0, 0, 0, 0);
        } else if (kstHoursNormalized < 9) {
          // KST 00:00~08:59 
          if (isNextDayKST) {
            // UTC 15:00~23:59 → 이미 KST 기준 다음날이므로 당일 UTC 00:00
            // 하지만 UTC 00:00은 과거일 수 있으므로 다음날로
            adjusted.setUTCDate(adjusted.getUTCDate() + 1);
          }
          // UTC 00:00 (= KST 09:00)으로 설정
          adjusted.setUTCHours(0, 0, 0, 0);
        }
        
        // minTime 이후 보장 + KST 범위 재확인
        let result = adjusted > minTime ? adjusted : minTime;
        
        // minTime이 KST 범위 밖일 수 있으므로 재확인
        const resultKstHours = (result.getUTCHours() + KST_OFFSET_HOURS) % 24;
        if (resultKstHours >= 19 || resultKstHours < 9) {
          // minTime이 범위 밖이면 다음 KST 09:00으로 조정
          result = new Date(result);
          if (resultKstHours >= 19) {
            result.setUTCDate(result.getUTCDate() + 1);
          } else {
            result.setUTCDate(result.getUTCDate() + 1);
          }
          result.setUTCHours(0, 0, 0, 0);
        }
        
        const finalKstHours = (result.getUTCHours() + KST_OFFSET_HOURS) % 24;
        console.log(`[Campaign] KST window clamp: ${dateUTC.toISOString()} → ${result.toISOString()} (KST ${String(finalKstHours).padStart(2, '0')}:${String(result.getUTCMinutes()).padStart(2, '0')})`);
        return roundUpTo10Min(result);
      };
      
      const now = new Date();
      
      // ATS 캠페인 (rcvType=0)도 KST 09:00~19:00 범위 적용
      if (!hasGeofence) {
        const minAtsTime = new Date(now.getTime() + 60 * 60 * 1000); // 현재 + 1시간
        atsSndStartDate = clampToKSTWindow(atsSndStartDate, minAtsTime);
        console.log(`[Campaign] ATS atsSndStartDate (KST adjusted): ${atsSndStartDate.toISOString()}`);
      }
      now.setSeconds(0);
      now.setMilliseconds(0);
      
      // Step 1: collStartDate 계산 (현재 + 1시간 이후, 10분 단위 올림) - BizChat 필수 조건
      const minCollStartTime = roundUpTo10Min(new Date(now.getTime() + 60 * 60 * 1000));
      
      // Step 2: collSndDate 계산 (collStartDate + 2시간 이상, 한국시간 09:00~20:00 범위)
      const minCollSndTime = new Date(minCollStartTime.getTime() + 2 * 60 * 60 * 1000); // 최소 수집 시간 2시간 확보
      const userRequestedTime = data.scheduledAt ? new Date(data.scheduledAt) : minCollSndTime;
      
      // 사용자 요청 시간과 최소 시간 중 늦은 것 선택, 한국시간 범위로 조정
      let tentativeCollSndDate = hasGeofence 
        ? (userRequestedTime > minCollSndTime ? userRequestedTime : minCollSndTime)
        : atsSndStartDate;
      // clampToKSTWindow: 한국시간 09:00~20:00 범위로 조정 + minCollStartTime 이후 보장 + 10분 올림
      let collSndDate = clampToKSTWindow(tentativeCollSndDate, minCollStartTime);
      
      // Step 3: collSndDate가 조정되면 collStartDate도 재계산
      // collStartDate = max(현재+1시간, collSndDate-2시간), 10분 단위 올림
      let collStartDate = new Date(collSndDate.getTime() - 2 * 60 * 60 * 1000);
      if (collStartDate < minCollStartTime) {
        collStartDate = new Date(minCollStartTime);
      }
      collStartDate = roundUpTo10Min(collStartDate);
      
      // Step 4: collEndDate = max(collStartDate+30분, collSndDate-30분), 10분 단위 올림
      const endFromStart = new Date(collStartDate.getTime() + 30 * 60 * 1000);
      const endFromSnd = new Date(collSndDate.getTime() - 30 * 60 * 1000);
      let collEndDate = endFromStart > endFromSnd ? endFromStart : endFromSnd;
      collEndDate = roundUpTo10Min(collEndDate);
      
      // Step 5: 최종 검증 - collStartDate < collEndDate < collSndDate
      if (collEndDate <= collStartDate) {
        collEndDate = roundUpTo10Min(new Date(collStartDate.getTime() + 30 * 60 * 1000));
      }
      if (collEndDate >= collSndDate) {
        collSndDate = roundUpTo10Min(new Date(collEndDate.getTime() + 30 * 60 * 1000));
        // 재조정된 collSndDate도 한국시간 범위 확인
        collSndDate = clampToKSTWindow(collSndDate, minCollStartTime);
      }
      
      console.log(`[Campaign] Maptics dates (KST adjusted) - collStartDate: ${collStartDate.toISOString()}, collEndDate: ${collEndDate.toISOString()}, collSndDate: ${collSndDate.toISOString()}`);

      try {
        // 문자열 길이 검증
        const lengthValidation = validateStringLengths({
          name: data.name,
          tgtCompanyName: '위픽',
          title: template.title || undefined,
          msg: template.content,
        });
        if (!lengthValidation.valid) {
          return res.status(400).json({ error: lengthValidation.error });
        }

        // BizChat에 등록 (지오펜스 여부에 따라 다른 파라미터 사용)
        const bizchatResult = await createCampaignInBizChat(
          {
            name: data.name,
            tgtCompanyName: '위픽',
            messageType: data.messageType,
            sndNum: data.sndNum,
            targetCount: data.targetCount,
            rcvType: rcvType,
            // ATS 일반 (rcvType=0)용
            atsSndStartDate: atsSndStartDate,
            sndMosuQuery: sndMosuQuerySQL,
            sndMosuDesc: sndMosuDescHTML,
            // Maptics 지오펜스 (rcvType=1,2)용
            sndGeofenceId: hasGeofence ? Number(geofenceIds[0]) : undefined,
            collStartDate: hasGeofence ? collStartDate : undefined,
            collEndDate: hasGeofence ? collEndDate : undefined,
            collSndDate: rcvType === 2 ? collSndDate : undefined,
            // Maptics 실시간 보내기 (rcvType=1)용
            rtStartHhmm: rcvType === 1 ? data.rtStartHhmm : undefined,
            rtEndHhmm: rcvType === 1 ? data.rtEndHhmm : undefined,
            sndDayDiv: rcvType === 1 ? (data.sndDayDiv ?? 0) : undefined,
          },
          {
            title: template.title || undefined,
            content: template.content,
            imageUrl: template.imageUrl,
          },
          useProduction
        );

        if (bizchatResult.data.code === 'S000001') {
          const responseData = bizchatResult.data.data as { id?: string } | undefined;
          const bizchatCampaignId = responseData?.id;
          
          if (bizchatCampaignId) {
            // BizChat 캠페인 ID 저장
            await db.update(campaigns)
              .set({ 
                bizchatCampaignId,
                statusCode: 0, // 임시등록
                status: 'temp_registered',
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaignId));

            console.log(`[Campaign] Created in BizChat: ${bizchatCampaignId}`);

            return res.status(201).json({
              ...campaignResult[0],
              bizchatCampaignId,
              statusCode: 0,
              status: 'temp_registered',
              bizchatRegistered: true,
            });
          }
        }

        // BizChat 등록 실패 시에도 로컬 캠페인은 유지 (임시등록 상태로)
        console.error('[Campaign] BizChat registration failed:', bizchatResult.data);
        
        return res.status(201).json({
          ...campaignResult[0],
          statusCode: 0,
          status: 'temp_registered',
          bizchatRegistered: false,
          bizchatError: {
            code: bizchatResult.data.code,
            message: bizchatResult.data.msg || 'BizChat 등록 실패',
          },
          warning: 'BizChat 등록에 실패했습니다. 캠페인 상세에서 다시 등록해주세요.',
        });

      } catch (bizchatError) {
        console.error('[Campaign] BizChat API error:', bizchatError);
        
        return res.status(201).json({
          ...campaignResult[0],
          statusCode: 0,
          status: 'temp_registered',
          bizchatRegistered: false,
          bizchatError: {
            code: 'API_ERROR',
            message: bizchatError instanceof Error ? bizchatError.message : 'BizChat API 오류',
          },
          warning: 'BizChat 서버 연결에 실패했습니다. 캠페인 상세에서 다시 등록해주세요.',
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      console.error('Error creating campaign:', error);
      return res.status(500).json({ error: 'Failed to create campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

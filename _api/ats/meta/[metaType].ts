import type { VercelRequest, VercelResponse } from '@vercel/node';

const BIZCHAT_DEV_URL = 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = 'https://gw.bizchat1.co.kr';

function getBizChatUrl() {
  return process.env.BIZCHAT_USE_PROD === 'true' ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
}

function getBizChatApiKey() {
  return process.env.BIZCHAT_USE_PROD === 'true' 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;
}

// 11번가 카테고리 메타 조회 (계층적)
async function fetch11stCategories(cateid?: string): Promise<any> {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  
  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const url = `${getBizChatUrl()}/api/v1/ats/meta/11st?tid=${tid}`;
  const body: any = {};
  if (cateid) {
    body.cateid = cateid;
  }

  console.log('[ATS Meta 11st] Fetching categories:', { cateid, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[ATS Meta 11st] Response:', JSON.stringify(data).substring(0, 500));

  if (data.code !== 'S000001') {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }

  // BizChat 형식을 UI 형식으로 변환
  // BizChat 응답: { list: [{ id: "01", cateid: "01", name: "가구/인테리어" }] }
  // cateid가 실제 API 호출에 사용되는 코드이고, id는 표시용 식별자일 수 있음
  // BizChat API 규격에 따라 cateid 필드를 우선 사용
  return {
    metaType: data.data?.metaType || 'STREET',
    dataType: data.data?.dataType || 'cate',
    list: (data.data?.list || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      cateid: item.cateid ?? item.id,  // cateid 우선, 없으면 id 사용 (하위 호환)
    })),
  };
}

// 통화Usage 카테고리 메타 조회
async function fetchCallCategories(cateid?: string): Promise<any> {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  
  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const url = `${getBizChatUrl()}/api/v1/ats/meta/call?tid=${tid}`;
  const body: any = {};
  if (cateid) {
    body.cateid = cateid;
  }

  console.log('[ATS Meta call] Fetching categories:', { cateid, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[ATS Meta call] Response:', JSON.stringify(data).substring(0, 500));

  if (data.code !== 'S000001') {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }

  // BizChat 응답: { list: [{ id: "01", cateid: "01", name: "카테고리명" }] }
  // cateid가 실제 API 호출에 사용되는 코드
  return {
    metaType: data.data?.metaType || 'CALL',
    dataType: data.data?.dataType || 'cate',
    list: (data.data?.list || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      cateid: item.cateid ?? item.id,  // cateid 우선, 없으면 id 사용 (하위 호환)
    })),
  };
}

// 웹앱 카테고리 메타 조회
async function fetchWebappCategories(cateid?: string): Promise<any> {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  
  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const url = `${getBizChatUrl()}/api/v1/ats/meta/webapp?tid=${tid}`;
  const body: any = {};
  if (cateid) {
    body.cateid = cateid;
  }

  console.log('[ATS Meta webapp] Fetching categories:', { cateid, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[ATS Meta webapp] Response:', JSON.stringify(data).substring(0, 500));

  if (data.code !== 'S000001') {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }

  // BizChat 응답: { list: [{ id: "01", cateid: "01", name: "게임" }] }
  // cateid가 실제 API 호출에 사용되는 코드
  return {
    metaType: data.data?.metaType || 'APP',
    dataType: data.data?.dataType || 'cate',
    list: (data.data?.list || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      cateid: item.cateid ?? item.id,  // cateid 우선, 없으면 id 사용 (하위 호환)
    })),
  };
}

// 위치 코드 검색 (법정동/행정동)
async function fetchLocationCodes(addr: string): Promise<any> {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  
  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const url = `${getBizChatUrl()}/api/v1/ats/meta/loc?tid=${tid}`;
  const body = { addr };

  console.log('[ATS Meta loc] Searching location:', { addr, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[ATS Meta loc] Response:', JSON.stringify(data).substring(0, 500));

  if (data.code !== 'S000001') {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }

  // 법정동(list)과 행정동(listR) 모두 반환
  return {
    list: data.data?.list || [],
    listR: data.data?.listR || [],
  };
}

// 필터 메타 조회 (svc/loc/pro)
async function fetchFilterMeta(filterType: string): Promise<any> {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  
  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const url = `${getBizChatUrl()}/api/v1/ats/meta/filter?tid=${tid}&type=${filterType}`;
  const body = { type: filterType };

  console.log('[ATS Meta filter] Fetching filter meta:', { filterType, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[ATS Meta filter] Response:', JSON.stringify(data).substring(0, 500));

  if (data.code !== 'S000001') {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }

  // 필터 메타 형식:
  // { metaType: "svc", list: [{ name, desc, code, dataType, min, max, unit, attributes }] }
  return {
    metaType: data.data?.metaType || filterType,
    list: data.data?.list || [],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { metaType, cateid, addr, filterType } = req.query;
  
  if (typeof metaType !== 'string') {
    return res.status(400).json({ error: 'Invalid meta type' });
  }

  try {
    switch (metaType) {
      case '11st': {
        // 11번가 카테고리 조회
        const cateIdStr = typeof cateid === 'string' ? cateid : undefined;
        const result = await fetch11stCategories(cateIdStr);
        return res.status(200).json(result);
      }

      case 'webapp': {
        // 웹앱 카테고리 조회
        const cateIdStr = typeof cateid === 'string' ? cateid : undefined;
        const result = await fetchWebappCategories(cateIdStr);
        return res.status(200).json(result);
      }

      case 'call': {
        // 통화Usage 카테고리 조회
        const cateIdStr = typeof cateid === 'string' ? cateid : undefined;
        const result = await fetchCallCategories(cateIdStr);
        return res.status(200).json(result);
      }

      case 'loc': {
        // 위치 검색
        if (req.method === 'POST') {
          const addrStr = req.body?.addr || '';
          if (!addrStr) {
            return res.status(400).json({ error: 'addr is required' });
          }
          const result = await fetchLocationCodes(addrStr);
          return res.status(200).json(result);
        } else {
          // GET: 광역시도 목록 반환 (하드코딩 - BizChat은 검색만 지원)
          return res.status(200).json({
            list: [
              { hcode: '11', name: '서울' },
              { hcode: '26', name: '부산' },
              { hcode: '27', name: '대구' },
              { hcode: '28', name: '인천' },
              { hcode: '29', name: '광주' },
              { hcode: '30', name: '대전' },
              { hcode: '31', name: '울산' },
              { hcode: '36', name: '세종' },
              { hcode: '41', name: '경기' },
              { hcode: '42', name: '강원' },
              { hcode: '43', name: '충북' },
              { hcode: '44', name: '충남' },
              { hcode: '45', name: '전북' },
              { hcode: '46', name: '전남' },
              { hcode: '47', name: '경북' },
              { hcode: '48', name: '경남' },
              { hcode: '50', name: '제주' },
            ],
          });
        }
      }

      case 'filter': {
        // 필터 메타 (svc/loc/pro)
        const fType = typeof filterType === 'string' ? filterType : 'svc';
        const validTypes = ['svc', 'loc', 'pro'];
        if (!validTypes.includes(fType)) {
          return res.status(400).json({ error: 'Invalid filter type. Use svc, loc, or pro' });
        }
        const result = await fetchFilterMeta(fType);
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({ error: `Unknown meta type: ${metaType}` });
    }
  } catch (error: any) {
    console.error(`[ATS Meta ${metaType}] Error:`, error);
    return res.status(500).json({ error: error.message || 'Failed to fetch meta data' });
  }
}

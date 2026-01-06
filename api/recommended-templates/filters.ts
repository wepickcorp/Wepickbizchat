import type { VercelRequest, VercelResponse } from '@vercel/node';

// 업종 분류
const RECOMMENDED_CATEGORIES = [
  { value: 'commerce', label: '커머스/쇼핑' },
  { value: 'cafe_food', label: '카페/외식/프랜차이즈' },
  { value: 'travel_culture', label: '여행/문화' },
  { value: 'sports_health', label: '스포츠/건강' },
  { value: 'education_life', label: '교육/라이프' },
];

// 목적 분류
const RECOMMENDED_PURPOSES = [
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
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    success: true,
    categories: RECOMMENDED_CATEGORIES,
    purposes: RECOMMENDED_PURPOSES,
  });
}

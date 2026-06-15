-- ============================================================================
-- 비즈챗 크레딧 캠페인 런칭 퍼널 측정 SQL
-- ----------------------------------------------------------------------------
-- 목적: 프론트 분석 도구(GA/Amplitude 등)가 아직 없으므로, credit_ledger +
--       campaigns 테이블로 "가입 -> 첫 발송"까지의 퍼널을 역산한다.
--
-- North Star = 주간 첫 발송 완료 사장님 수 (Weekly Activated Senders)
-- 활성화(발송 완료) 정의 = credit_ledger.type='use' 1건 이상
--   (크레딧은 실제 발송 시점에 차감되므로 가장 정확한 신호)
--
-- 사용법:
--   1) 아래 params CTE의 launch_at 을 실제 배포 시각으로 바꾼다.
--   2) 각 쿼리를 개별 실행 (psql / DB 콘솔).
--   3) Q3(전환율)에서 가장 많이 새는 칸이 이번 주 전쟁터.
--
-- 집계 대상: 대행사(is_agency)·마스터(is_master)·내부테스트(@wepick.kr) 제외
-- DB: PostgreSQL
-- ============================================================================


-- ============================================================================
-- Q1. 헤드라인 퍼널 (런칭 이후 누적) — 한 눈에 보는 5단계
-- ============================================================================
WITH params AS (
  SELECT TIMESTAMP '2026-06-13 00:00:00' AS launch_at   -- ← 배포 시각으로 수정
),
real_users AS (   -- 진짜 사장님만
  SELECT u.id, u.created_at
  FROM users u, params p
  WHERE COALESCE(u.is_agency, false) = false
    AND COALESCE(u.is_master, false) = false
    AND (u.email IS NULL OR u.email NOT LIKE '%@wepick.kr')
    AND u.created_at >= p.launch_at
),
created AS (   -- 캠페인을 1개라도 만든 사장님
  SELECT DISTINCT user_id FROM campaigns
  WHERE user_id IN (SELECT id FROM real_users)
),
charged AS (   -- 크레딧을 1번이라도 충전한 사장님
  SELECT DISTINCT user_id FROM credit_ledger
  WHERE type = 'grant' AND user_id IN (SELECT id FROM real_users)
),
sent AS (      -- 첫 발송을 완료한 사장님 (= 활성화)
  SELECT DISTINCT user_id FROM credit_ledger
  WHERE type = 'use' AND user_id IN (SELECT id FROM real_users)
),
repeat_sent AS (   -- 발송을 2회 이상 (서로 다른 캠페인) 한 사장님
  SELECT user_id FROM credit_ledger
  WHERE type = 'use' AND campaign_id IS NOT NULL
    AND user_id IN (SELECT id FROM real_users)
  GROUP BY user_id
  HAVING COUNT(DISTINCT campaign_id) >= 2
)
SELECT '1. 가입'            AS step, (SELECT COUNT(*) FROM real_users)  AS users
UNION ALL SELECT '2. 캠페인 생성', (SELECT COUNT(*) FROM created)
UNION ALL SELECT '3. 크레딧 충전', (SELECT COUNT(*) FROM charged)
UNION ALL SELECT '4. 발송 완료 (활성화)', (SELECT COUNT(*) FROM sent)
UNION ALL SELECT '5. 재발송 (초기 리텐션)', (SELECT COUNT(*) FROM repeat_sent)
ORDER BY step;


-- ============================================================================
-- Q2. 일자별 퍼널 (배포 후 날짜별로 추이 보기)
--     가입 코호트가 아니라 "그 날 발생한 이벤트" 기준
-- ============================================================================
WITH params AS (SELECT TIMESTAMP '2026-06-13 00:00:00' AS launch_at),
real_users AS (
  SELECT u.id FROM users u, params p
  WHERE COALESCE(u.is_agency,false)=false AND COALESCE(u.is_master,false)=false
    AND (u.email IS NULL OR u.email NOT LIKE '%@wepick.kr')
),
d_signup AS (
  SELECT date_trunc('day', u.created_at)::date AS d, COUNT(*) AS signups
  FROM users u, params p
  WHERE u.id IN (SELECT id FROM real_users) AND u.created_at >= p.launch_at
  GROUP BY 1
),
d_created AS (
  SELECT date_trunc('day', created_at)::date AS d, COUNT(DISTINCT user_id) AS created
  FROM campaigns c, params p
  WHERE user_id IN (SELECT id FROM real_users) AND created_at >= p.launch_at
  GROUP BY 1
),
d_charged AS (
  SELECT date_trunc('day', created_at)::date AS d, COUNT(DISTINCT user_id) AS charged
  FROM credit_ledger l, params p
  WHERE type='grant' AND user_id IN (SELECT id FROM real_users) AND created_at >= p.launch_at
  GROUP BY 1
),
d_sent AS (
  SELECT date_trunc('day', created_at)::date AS d, COUNT(DISTINCT user_id) AS senders
  FROM credit_ledger l, params p
  WHERE type='use' AND user_id IN (SELECT id FROM real_users) AND created_at >= p.launch_at
  GROUP BY 1
)
SELECT d.d AS day,
       COALESCE(s.signups,0)  AS signups,
       COALESCE(c.created,0)  AS campaign_creators,
       COALESCE(g.charged,0)  AS chargers,
       COALESCE(x.senders,0)  AS senders
FROM (SELECT DISTINCT d FROM (
        SELECT d FROM d_signup UNION SELECT d FROM d_created
        UNION SELECT d FROM d_charged UNION SELECT d FROM d_sent) z) d
LEFT JOIN d_signup  s ON s.d=d.d
LEFT JOIN d_created c ON c.d=d.d
LEFT JOIN d_charged g ON g.d=d.d
LEFT JOIN d_sent    x ON x.d=d.d
ORDER BY day;


-- ============================================================================
-- Q3. 단계별 전환율 — 가장 많이 새는 칸 찾기 (★ 이번 주 전쟁터 결정)
-- ============================================================================
WITH params AS (SELECT TIMESTAMP '2026-06-13 00:00:00' AS launch_at),
real_users AS (
  SELECT u.id FROM users u, params p
  WHERE COALESCE(u.is_agency,false)=false AND COALESCE(u.is_master,false)=false
    AND (u.email IS NULL OR u.email NOT LIKE '%@wepick.kr')
    AND u.created_at >= p.launch_at
),
n_signup  AS (SELECT COUNT(*) n FROM real_users),
n_created AS (SELECT COUNT(DISTINCT user_id) n FROM campaigns WHERE user_id IN (SELECT id FROM real_users)),
n_charged AS (SELECT COUNT(DISTINCT user_id) n FROM credit_ledger WHERE type='grant' AND user_id IN (SELECT id FROM real_users)),
n_sent    AS (SELECT COUNT(DISTINCT user_id) n FROM credit_ledger WHERE type='use'   AND user_id IN (SELECT id FROM real_users))
SELECT
  '가입 → 캠페인생성'  AS transition,
  (SELECT n FROM n_created) || ' / ' || (SELECT n FROM n_signup)  AS ratio,
  ROUND(100.0*(SELECT n FROM n_created)/NULLIF((SELECT n FROM n_signup),0),1) || '%' AS rate
UNION ALL SELECT '캠페인생성 → 크레딧충전',
  (SELECT n FROM n_charged) || ' / ' || (SELECT n FROM n_created),
  ROUND(100.0*(SELECT n FROM n_charged)/NULLIF((SELECT n FROM n_created),0),1) || '%'
UNION ALL SELECT '크레딧충전 → 발송완료',
  (SELECT n FROM n_sent) || ' / ' || (SELECT n FROM n_charged),
  ROUND(100.0*(SELECT n FROM n_sent)/NULLIF((SELECT n FROM n_charged),0),1) || '%'
UNION ALL SELECT '★ 전체: 가입 → 발송완료',
  (SELECT n FROM n_sent) || ' / ' || (SELECT n FROM n_signup),
  ROUND(100.0*(SELECT n FROM n_sent)/NULLIF((SELECT n FROM n_signup),0),1) || '%';


-- ============================================================================
-- Q4. 캠페인은 어디서 죽는가 — status_code 분포
--     (0=임시저장, 10=승인요청, 11=승인, 25=취소, 30=발송중, 35=중단, 40=완료)
--     생성은 했는데 발송까지 못 간 캠페인이 어느 상태에 고여있는지
-- ============================================================================
WITH params AS (SELECT TIMESTAMP '2026-06-13 00:00:00' AS launch_at),
real_users AS (
  SELECT u.id FROM users u
  WHERE COALESCE(u.is_agency,false)=false AND COALESCE(u.is_master,false)=false
    AND (u.email IS NULL OR u.email NOT LIKE '%@wepick.kr')
)
SELECT
  c.status_code,
  c.status,
  COUNT(*)                          AS campaigns,
  COUNT(DISTINCT c.user_id)         AS users,
  SUM(CASE WHEN c.sent_count > 0 THEN 1 ELSE 0 END) AS with_sends
FROM campaigns c, params p
WHERE c.user_id IN (SELECT id FROM real_users)
  AND c.created_at >= p.launch_at
GROUP BY c.status_code, c.status
ORDER BY c.status_code;


-- ============================================================================
-- Q5. 활성화 속도 — 가입에서 첫 발송까지 걸린 시간
--     (빠를수록 온보딩이 좋다는 신호. 토스 PO 핵심 보조지표)
-- ============================================================================
WITH params AS (SELECT TIMESTAMP '2026-06-13 00:00:00' AS launch_at),
real_users AS (
  SELECT u.id, u.created_at FROM users u, params p
  WHERE COALESCE(u.is_agency,false)=false AND COALESCE(u.is_master,false)=false
    AND (u.email IS NULL OR u.email NOT LIKE '%@wepick.kr')
    AND u.created_at >= p.launch_at
),
first_send AS (
  SELECT user_id, MIN(created_at) AS first_send_at
  FROM credit_ledger
  WHERE type='use' AND user_id IN (SELECT id FROM real_users)
  GROUP BY user_id
)
SELECT
  COUNT(*)                                                       AS activated_users,
  ROUND(AVG(EXTRACT(EPOCH FROM (f.first_send_at - u.created_at))/3600.0)::numeric, 1) AS avg_hours_to_first_send,
  ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (f.first_send_at - u.created_at))/3600.0))::numeric, 1) AS median_hours,
  SUM(CASE WHEN f.first_send_at - u.created_at <= INTERVAL '1 hour' THEN 1 ELSE 0 END) AS within_1h
FROM real_users u
JOIN first_send f ON f.user_id = u.id;


-- ============================================================================
-- Q6. 크레딧 상품 분포 — 어떤 패키지를 사는가 (light/topup/booster/enterprise)
-- ============================================================================
WITH params AS (SELECT TIMESTAMP '2026-06-13 00:00:00' AS launch_at),
real_users AS (
  SELECT u.id FROM users u
  WHERE COALESCE(u.is_agency,false)=false AND COALESCE(u.is_master,false)=false
    AND (u.email IS NULL OR u.email NOT LIKE '%@wepick.kr')
)
SELECT
  COALESCE(g.product_type, '(미지정)') AS product_type,
  COUNT(DISTINCT g.user_id)            AS purchasers,
  COUNT(*)                             AS purchases,
  SUM(g.original_credits)              AS total_credits
FROM credit_grants g, params p
WHERE g.user_id IN (SELECT id FROM real_users)
  AND g.purchased_at >= p.launch_at
GROUP BY g.product_type
ORDER BY purchasers DESC;

import { sql } from 'drizzle-orm';
import {
  CREDIT_PRODUCTS,
  calculateCampaignCredits,
  getCreditExpiryDate,
  type CreditProductType,
} from '../../../shared/credit-policy';

export function isCreditModeEnabled() {
  return process.env.CREDIT_MODE_ENABLED === 'true';
}

export function getNeededCampaignCredits(targetCount: number | null | undefined) {
  return calculateCampaignCredits({ targetCount: targetCount || 0, templateCount: 1 });
}

export function getKstMonthRange(date: Date = new Date()) {
  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth() + 1, 1) - 9 * 60 * 60 * 1000);
  return { start, end };
}

export async function hasLightCreditGrantInCurrentKstMonthForServerless(db: any, userId: string) {
  const { start, end } = getKstMonthRange();
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM credit_grants
      WHERE user_id = ${userId}
        AND product_type = 'light'
        AND purchased_at >= ${start}
        AND purchased_at < ${end}
      LIMIT 1
    ) AS exists
  `);
  const row = result.rows?.[0] || {};
  return Boolean(row.exists);
}

export async function grantPurchasedCreditsForServerless(
  db: any,
  input: {
    userId: string;
    transactionId?: string | null;
    productType: CreditProductType;
    paymentReference: string;
    metadata?: Record<string, unknown>;
  },
) {
  const product = CREDIT_PRODUCTS[input.productType];
  const purchasedAt = new Date();
  const expiresAt = getCreditExpiryDate(purchasedAt);
  const { start: monthStart, end: monthEnd } = getKstMonthRange(purchasedAt);
  const idempotencyKey = `credit-grant:${input.paymentReference}`;

  const result = await db.execute(sql`
    WITH existing_ledger AS (
      SELECT id, type
      FROM credit_ledger
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    ),
    existing_light_grant AS (
      SELECT id
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND product_type = 'light'
        AND purchased_at >= ${monthStart}
        AND purchased_at < ${monthEnd}
        AND ${product.productType} = 'light'
        AND NOT EXISTS (SELECT 1 FROM existing_ledger)
      LIMIT 1
    ),
    active_balance_before AS (
      SELECT COALESCE(SUM(remaining_credits), 0)::integer AS balance_before_credits
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND remaining_credits > 0
        AND expires_at > NOW()
    ),
    inserted_ledger_marker AS (
      INSERT INTO credit_ledger (
        user_id,
        transaction_id,
        type,
        amount_credits,
        balance_after_credits,
        product_type,
        idempotency_key,
        description,
        metadata
      )
      SELECT
        ${input.userId},
        ${input.transactionId || null},
        CASE WHEN EXISTS (SELECT 1 FROM existing_light_grant) THEN 'grant_blocked' ELSE 'grant' END,
        CASE WHEN EXISTS (SELECT 1 FROM existing_light_grant) THEN 0 ELSE ${product.credits} END,
        NULL,
        ${product.productType},
        ${idempotencyKey},
        CASE WHEN EXISTS (SELECT 1 FROM existing_light_grant)
          THEN ${`${product.name} 크레딧 지급 차단(라이트 월 1회 한도)`}
          ELSE ${`${product.name} 크레딧 지급`} END,
        ${JSON.stringify({
          paymentReference: input.paymentReference,
          ...(input.metadata || {}),
        })}::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM existing_ledger)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, type
    ),
    inserted_grant AS (
      INSERT INTO credit_grants (
        user_id,
        transaction_id,
        product_type,
        original_credits,
        remaining_credits,
        expires_at
      )
      SELECT
        ${input.userId},
        ${input.transactionId || null},
        ${product.productType},
        ${product.credits},
        ${product.credits},
        ${expiresAt}
      FROM inserted_ledger_marker
      WHERE inserted_ledger_marker.type = 'grant'
      RETURNING id
    ),
    updated_ledger AS (
      UPDATE credit_ledger
      SET
        credit_grant_id = inserted_grant.id,
        balance_after_credits = active_balance_before.balance_before_credits + ${product.credits}
      FROM inserted_grant, active_balance_before
      WHERE credit_ledger.id = (SELECT id FROM inserted_ledger_marker WHERE type = 'grant' LIMIT 1)
      RETURNING credit_ledger.id, credit_ledger.balance_after_credits
    )
    SELECT
      EXISTS (SELECT 1 FROM existing_ledger) AS already_granted,
      COALESCE((SELECT type = 'grant_blocked' FROM existing_ledger LIMIT 1), false) AS already_blocked,
      EXISTS (SELECT 1 FROM inserted_ledger_marker WHERE type = 'grant_blocked') AS light_limit_blocked,
      EXISTS (SELECT 1 FROM inserted_grant) AS grant_inserted,
      EXISTS (SELECT 1 FROM updated_ledger) AS ledger_inserted,
      COALESCE(
        (SELECT balance_after_credits FROM updated_ledger LIMIT 1),
        (SELECT balance_before_credits FROM active_balance_before LIMIT 1)
      ) AS balance_after_credits
  `);

  const row = result.rows?.[0] || {};

  if (row.already_granted) {
    return {
      success: false as const,
      alreadyProcessed: true,
      lightLimitBlocked: Boolean(row.already_blocked),
      productType: product.productType,
      credits: product.credits,
      balanceAfterCredits: Number(row.balance_after_credits || 0),
    };
  }

  if (row.light_limit_blocked) {
    return {
      success: false as const,
      error: '라이트 충전은 매월 1회만 구매할 수 있습니다',
      lightLimitBlocked: true,
      productType: product.productType,
      credits: product.credits,
      balanceAfterCredits: Number(row.balance_after_credits || 0),
    };
  }

  if (!row.grant_inserted || !row.ledger_inserted) {
    return {
      success: false as const,
      error: '크레딧 지급 중 오류가 발생했습니다',
      productType: product.productType,
      credits: product.credits,
      balanceAfterCredits: Number(row.balance_after_credits || 0),
    };
  }

  return {
    success: true as const,
    productType: product.productType,
    credits: product.credits,
    balanceAfterCredits: Number(row.balance_after_credits || 0),
  };
}

export async function reserveCampaignCreditsForServerless(
  db: any,
  input: {
    userId: string;
    campaignId: string;
    neededCredits: number;
    scheduledAt?: Date | string | null;
    description: string;
  },
) {
  const idempotencyKey = `campaign-reserve:${input.campaignId}`;

  const result = await db.execute(sql`
    WITH existing_reserve AS (
      SELECT id, balance_after_credits
      FROM credit_ledger
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    ),
    existing_use AS (
      SELECT id
      FROM credit_ledger
      WHERE idempotency_key = ${`campaign-start:${input.campaignId}`}
      LIMIT 1
    ),
    active_lots AS (
      SELECT
        id,
        remaining_credits::integer AS remaining_credits,
        expires_at,
        COALESCE(
          SUM(remaining_credits::integer) OVER (
            ORDER BY expires_at ASC, id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),
          0
        ) AS credits_before
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND remaining_credits > 0
        AND expires_at > NOW()
    ),
    available AS (
      SELECT COALESCE(SUM(remaining_credits), 0)::integer AS credits
      FROM active_lots
    ),
    selected_lots AS (
      SELECT
        id,
        expires_at,
        GREATEST(0, LEAST(remaining_credits, ${input.neededCredits} - credits_before))::integer AS reserved_credits
      FROM active_lots
      WHERE credits_before < ${input.neededCredits}
    ),
    updated_grants AS (
      UPDATE credit_grants AS grant
      SET
        remaining_credits = grant.remaining_credits - selected_lots.reserved_credits,
        updated_at = NOW()
      FROM selected_lots, available
      WHERE grant.id = selected_lots.id
        AND selected_lots.reserved_credits > 0
        AND available.credits >= ${input.neededCredits}
        AND NOT EXISTS (SELECT 1 FROM existing_reserve)
        AND NOT EXISTS (SELECT 1 FROM existing_use)
      RETURNING
        grant.id,
        selected_lots.reserved_credits,
        grant.remaining_credits AS remaining_credits_after,
        grant.expires_at
    ),
    allocations AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'creditGrantId', id,
            'reservedCredits', reserved_credits,
            'remainingCreditsAfter', remaining_credits_after,
            'expiresAt', expires_at
          )
          ORDER BY expires_at ASC, id ASC
        ),
        '[]'::jsonb
      ) AS data
      FROM updated_grants
    ),
    inserted_ledger AS (
      INSERT INTO credit_ledger (
        user_id,
        campaign_id,
        credit_grant_id,
        type,
        amount_credits,
        balance_after_credits,
        idempotency_key,
        description,
        metadata
      )
      SELECT
        ${input.userId},
        ${input.campaignId},
        (SELECT id FROM updated_grants ORDER BY expires_at ASC, id ASC LIMIT 1),
        'reserve',
        -${input.neededCredits},
        (available.credits - ${input.neededCredits}),
        ${idempotencyKey},
        ${input.description},
        jsonb_build_object(
          'allocations', allocations.data,
          'scheduledAt', ${input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null}
        )
      FROM available, allocations
      WHERE available.credits >= ${input.neededCredits}
        AND NOT EXISTS (SELECT 1 FROM existing_reserve)
        AND NOT EXISTS (SELECT 1 FROM existing_use)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, balance_after_credits
    )
    SELECT
      (SELECT credits FROM available) AS available_credits,
      EXISTS(SELECT 1 FROM existing_reserve) AS already_reserved,
      EXISTS(SELECT 1 FROM existing_use) AS already_used,
      COALESCE(
        (SELECT balance_after_credits FROM inserted_ledger LIMIT 1),
        (SELECT balance_after_credits FROM existing_reserve LIMIT 1)
      ) AS balance_after_credits,
      EXISTS(SELECT 1 FROM inserted_ledger) AS reserved_now
  `);

  const row = result.rows?.[0] || {};
  const availableCredits = Number(row.available_credits || 0);

  if (row.already_used) {
    return { success: false, error: '이미 발송이 시작된 캠페인입니다' };
  }

  if (availableCredits < input.neededCredits && !row.already_reserved) {
    return {
      success: false,
      error: '크레딧이 부족합니다',
      balanceAfterCredits: availableCredits,
    };
  }

  return {
    success: true,
    alreadyProcessed: Boolean(row.already_reserved),
    balanceAfterCredits: Number(row.balance_after_credits ?? availableCredits),
  };
}

export async function releaseReservedCampaignCreditsForServerless(
  db: any,
  input: {
    userId: string;
    campaignId: string;
    description: string;
    statusCode?: number;
    status?: string;
  },
) {
  const reserveIdempotencyKey = `campaign-reserve:${input.campaignId}`;
  const releaseIdempotencyKey = `campaign-release:${input.campaignId}`;
  const startIdempotencyKey = `campaign-start:${input.campaignId}`;

  const result = await db.execute(sql`
    WITH existing_release AS (
      SELECT id, balance_after_credits
      FROM credit_ledger
      WHERE idempotency_key = ${releaseIdempotencyKey}
      LIMIT 1
    ),
    existing_use AS (
      SELECT id
      FROM credit_ledger
      WHERE idempotency_key = ${startIdempotencyKey}
      LIMIT 1
    ),
    reserve_ledger AS (
      SELECT id, credit_grant_id, metadata
      FROM credit_ledger
      WHERE idempotency_key = ${reserveIdempotencyKey}
      LIMIT 1
    ),
    allocations AS (
      SELECT
        value->>'creditGrantId' AS credit_grant_id,
        COALESCE((value->>'reservedCredits')::integer, 0) AS released_credits
      FROM reserve_ledger, jsonb_array_elements(COALESCE(reserve_ledger.metadata->'allocations', '[]'::jsonb)) AS value
    ),
    updated_grants AS (
      UPDATE credit_grants AS grant
      SET
        remaining_credits = grant.remaining_credits + allocations.released_credits,
        updated_at = NOW()
      FROM allocations
      WHERE grant.id = allocations.credit_grant_id
        AND allocations.released_credits > 0
        AND NOT EXISTS (SELECT 1 FROM existing_release)
        AND NOT EXISTS (SELECT 1 FROM existing_use)
      RETURNING allocations.released_credits
    ),
    active_balance AS (
      SELECT COALESCE(SUM(remaining_credits), 0)::integer AS balance_after_credits
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND remaining_credits > 0
        AND expires_at > NOW()
    ),
    inserted_ledger AS (
      INSERT INTO credit_ledger (
        user_id,
        campaign_id,
        credit_grant_id,
        type,
        amount_credits,
        balance_after_credits,
        idempotency_key,
        description,
        metadata
      )
      SELECT
        ${input.userId},
        ${input.campaignId},
        reserve_ledger.credit_grant_id,
        'release',
        COALESCE((SELECT SUM(released_credits) FROM updated_grants), 0),
        active_balance.balance_after_credits,
        ${releaseIdempotencyKey},
        ${input.description},
        jsonb_build_object(
          'reservedLedgerId', reserve_ledger.id,
          'allocations', COALESCE(reserve_ledger.metadata->'allocations', '[]'::jsonb)
        )
      FROM reserve_ledger, active_balance
      WHERE COALESCE((SELECT SUM(released_credits) FROM updated_grants), 0) > 0
        AND NOT EXISTS (SELECT 1 FROM existing_release)
        AND NOT EXISTS (SELECT 1 FROM existing_use)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, amount_credits, balance_after_credits
    ),
    updated_campaign AS (
      UPDATE campaigns
      SET
        status_code = ${input.statusCode ?? 25},
        status = ${input.status ?? 'cancelled'},
        updated_at = NOW()
      WHERE id = ${input.campaignId}
        AND user_id = ${input.userId}
      RETURNING id
    )
    SELECT
      EXISTS(SELECT 1 FROM existing_release) AS already_released,
      EXISTS(SELECT 1 FROM existing_use) AS already_used,
      COALESCE(
        (SELECT amount_credits FROM inserted_ledger LIMIT 1),
        0
      ) AS released_credits,
      COALESCE(
        (SELECT balance_after_credits FROM inserted_ledger LIMIT 1),
        (SELECT balance_after_credits FROM existing_release LIMIT 1),
        (SELECT balance_after_credits FROM active_balance LIMIT 1)
      ) AS balance_after_credits
  `);

  const row = result.rows?.[0] || {};
  if (row.already_used) {
    return { success: false, error: '이미 발송이 시작된 캠페인은 예약 크레딧을 해제할 수 없습니다' };
  }

  return {
    success: true,
    alreadyProcessed: Boolean(row.already_released),
    releasedCredits: Number(row.released_credits || 0),
    balanceAfterCredits: Number(row.balance_after_credits || 0),
  };
}

export async function startCampaignCreditsForServerless(
  db: any,
  input: {
    userId: string;
    campaignId: string;
    neededCredits: number;
    sentCount: number;
    successCount: number;
    description: string;
  },
) {
  const startIdempotencyKey = `campaign-start:${input.campaignId}`;
  const reserveIdempotencyKey = `campaign-reserve:${input.campaignId}`;

  const result = await db.execute(sql`
    WITH campaign_row AS (
      SELECT id, user_id, status_code, status
      FROM campaigns
      WHERE id = ${input.campaignId}
        AND user_id = ${input.userId}
      FOR UPDATE
    ),
    existing_start AS (
      SELECT id, balance_after_credits
      FROM credit_ledger
      WHERE idempotency_key = ${startIdempotencyKey}
      LIMIT 1
    ),
    reserve_ledger AS (
      SELECT id, credit_grant_id, amount_credits, balance_after_credits, metadata
      FROM credit_ledger
      WHERE idempotency_key = ${reserveIdempotencyKey}
      LIMIT 1
    ),
    active_lots AS (
      SELECT
        id,
        remaining_credits::integer AS remaining_credits,
        expires_at,
        COALESCE(
          SUM(remaining_credits::integer) OVER (
            ORDER BY expires_at ASC, id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),
          0
        ) AS credits_before
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND remaining_credits > 0
        AND expires_at > NOW()
    ),
    available AS (
      SELECT COALESCE(SUM(remaining_credits), 0)::integer AS credits
      FROM active_lots
    ),
    selected_lots AS (
      SELECT
        id,
        expires_at,
        GREATEST(0, LEAST(remaining_credits, ${input.neededCredits} - credits_before))::integer AS used_credits
      FROM active_lots
      WHERE credits_before < ${input.neededCredits}
    ),
    updated_grants AS (
      UPDATE credit_grants AS grant
      SET
        remaining_credits = grant.remaining_credits - selected_lots.used_credits,
        updated_at = NOW()
      FROM selected_lots, available, campaign_row
      WHERE grant.id = selected_lots.id
        AND selected_lots.used_credits > 0
        AND available.credits >= ${input.neededCredits}
        AND campaign_row.status_code = 11
        AND NOT EXISTS (SELECT 1 FROM existing_start)
        AND NOT EXISTS (SELECT 1 FROM reserve_ledger)
      RETURNING
        grant.id,
        selected_lots.used_credits,
        grant.remaining_credits AS remaining_credits_after,
        grant.expires_at
    ),
    direct_allocations AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'creditGrantId', id,
            'usedCredits', used_credits,
            'remainingCreditsAfter', remaining_credits_after,
            'expiresAt', expires_at
          )
          ORDER BY expires_at ASC, id ASC
        ),
        '[]'::jsonb
      ) AS data
      FROM updated_grants
    ),
    active_balance AS (
      SELECT COALESCE(SUM(remaining_credits), 0)::integer AS balance_after_credits
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND remaining_credits > 0
        AND expires_at > NOW()
    ),
    inserted_direct_ledger AS (
      INSERT INTO credit_ledger (
        user_id,
        campaign_id,
        credit_grant_id,
        type,
        amount_credits,
        balance_after_credits,
        idempotency_key,
        description,
        metadata
      )
      SELECT
        ${input.userId},
        ${input.campaignId},
        (SELECT id FROM updated_grants ORDER BY expires_at ASC, id ASC LIMIT 1),
        'use',
        -${input.neededCredits},
        active_balance.balance_after_credits,
        ${startIdempotencyKey},
        ${input.description},
        jsonb_build_object(
          'allocations', direct_allocations.data,
          'targetCount', ${input.sentCount}
        )
      FROM active_balance, direct_allocations, campaign_row
      WHERE campaign_row.status_code = 11
        AND NOT EXISTS (SELECT 1 FROM existing_start)
        AND NOT EXISTS (SELECT 1 FROM reserve_ledger)
        AND COALESCE((SELECT SUM(used_credits) FROM updated_grants), 0) = ${input.neededCredits}
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, balance_after_credits
    ),
    inserted_reserved_ledger AS (
      INSERT INTO credit_ledger (
        user_id,
        campaign_id,
        credit_grant_id,
        type,
        amount_credits,
        balance_after_credits,
        idempotency_key,
        description,
        metadata
      )
      SELECT
        ${input.userId},
        ${input.campaignId},
        reserve_ledger.credit_grant_id,
        'use',
        -${input.neededCredits},
        active_balance.balance_after_credits,
        ${startIdempotencyKey},
        ${input.description},
        jsonb_build_object(
          'reservedLedgerId', reserve_ledger.id,
          'reserveAllocations', COALESCE(reserve_ledger.metadata->'allocations', '[]'::jsonb),
          'targetCount', ${input.sentCount}
        )
      FROM reserve_ledger, active_balance, campaign_row
      WHERE campaign_row.status_code = 11
        AND ABS(reserve_ledger.amount_credits) = ${input.neededCredits}
        AND NOT EXISTS (SELECT 1 FROM existing_start)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, balance_after_credits
    ),
    updated_campaign AS (
      UPDATE campaigns
      SET
        status_code = 30,
        status = 'running',
        sent_count = ${input.sentCount},
        success_count = ${input.successCount},
        scheduled_at = COALESCE(scheduled_at, NOW()),
        updated_at = NOW()
      WHERE id = ${input.campaignId}
        AND user_id = ${input.userId}
        AND (
          EXISTS (SELECT 1 FROM inserted_direct_ledger)
          OR EXISTS (SELECT 1 FROM inserted_reserved_ledger)
          OR EXISTS (SELECT 1 FROM existing_start)
          OR status_code IN (30, 40)
        )
      RETURNING *
    )
    SELECT
      EXISTS(SELECT 1 FROM campaign_row) AS campaign_found,
      (SELECT status_code FROM campaign_row LIMIT 1) AS original_status_code,
      EXISTS(SELECT 1 FROM existing_start) AS already_started,
      EXISTS(SELECT 1 FROM reserve_ledger) AS has_reserve,
      COALESCE((SELECT ABS(amount_credits) FROM reserve_ledger LIMIT 1), 0)::integer AS reserved_credits,
      (SELECT credits FROM available) AS available_credits,
      COALESCE(
        (SELECT balance_after_credits FROM inserted_direct_ledger LIMIT 1),
        (SELECT balance_after_credits FROM inserted_reserved_ledger LIMIT 1),
        (SELECT balance_after_credits FROM existing_start LIMIT 1),
        (SELECT balance_after_credits FROM active_balance LIMIT 1)
      ) AS balance_after_credits,
      (SELECT row_to_json(updated_campaign) FROM updated_campaign LIMIT 1) AS campaign
    FROM (SELECT 1) AS singleton
  `);

  const row = result.rows?.[0] || {};
  const originalStatusCode = Number(row.original_status_code ?? -1);
  const availableCredits = Number(row.available_credits || 0);
  const reservedCredits = Number(row.reserved_credits || 0);

  if (!row.campaign_found) {
    return { success: false, error: 'Campaign not found' };
  }

  if (originalStatusCode === 30 || originalStatusCode === 40 || row.already_started) {
    return {
      success: true,
      alreadyProcessed: true,
      campaign: row.campaign,
      balanceAfterCredits: Number(row.balance_after_credits ?? availableCredits),
    };
  }

  if (originalStatusCode !== 11) {
    return { success: false, error: 'Only approved campaigns can be started' };
  }

  if (row.has_reserve && reservedCredits !== input.neededCredits) {
    return {
      success: false,
      error: '예약된 크레딧과 필요한 크레딧이 일치하지 않습니다',
      balanceAfterCredits: Number(row.balance_after_credits ?? availableCredits),
    };
  }

  if (!row.has_reserve && availableCredits < input.neededCredits) {
    return {
      success: false,
      error: '크레딧이 부족합니다',
      balanceAfterCredits: availableCredits,
    };
  }

  if (!row.campaign) {
    return { success: false, error: '크레딧 차감 중 오류가 발생했습니다' };
  }

  return {
    success: true,
    campaign: row.campaign,
    balanceAfterCredits: Number(row.balance_after_credits ?? availableCredits),
  };
}

export async function restoreUsedCampaignCreditsForServerless(
  db: any,
  input: {
    userId: string;
    campaignId: string;
    reason: string;
    description: string;
    restoreCredits?: number;
    statusCode?: number;
    status?: string;
  },
) {
  const startIdempotencyKey = `campaign-start:${input.campaignId}`;
  const restoreIdempotencyKey = `campaign-restore:${input.campaignId}:${input.reason}`;
  const maxRestoreCredits = input.restoreCredits == null
    ? 2_147_483_647
    : Math.max(0, Math.floor(input.restoreCredits));

  const result = await db.execute(sql`
    WITH existing_restore AS (
      SELECT id, amount_credits, balance_after_credits
      FROM credit_ledger
      WHERE idempotency_key = ${restoreIdempotencyKey}
      LIMIT 1
    ),
    use_ledger AS (
      SELECT id, credit_grant_id, metadata
      FROM credit_ledger
      WHERE idempotency_key = ${startIdempotencyKey}
      LIMIT 1
    ),
    previous_restore_rows AS (
      SELECT amount_credits, metadata
      FROM credit_ledger
      WHERE campaign_id = ${input.campaignId}
        AND type = 'adjustment'
        AND idempotency_key LIKE ${`campaign-restore:${input.campaignId}:%`}
    ),
    previous_restores AS (
      SELECT COALESCE(SUM(GREATEST(amount_credits, 0)), 0)::integer AS credits
      FROM previous_restore_rows
    ),
    previous_restore_allocations AS (
      SELECT
        value->>'creditGrantId' AS credit_grant_id,
        COALESCE(SUM((value->>'restoredCredits')::integer), 0)::integer AS restored_credits
      FROM previous_restore_rows,
        jsonb_array_elements(COALESCE(previous_restore_rows.metadata->'allocations', '[]'::jsonb)) AS value
      GROUP BY value->>'creditGrantId'
    ),
    direct_allocations AS (
      SELECT
        value->>'creditGrantId' AS credit_grant_id,
        COALESCE((value->>'usedCredits')::integer, 0) AS restored_credits
      FROM use_ledger, jsonb_array_elements(COALESCE(use_ledger.metadata->'allocations', '[]'::jsonb)) AS value
    ),
    reserve_allocations AS (
      SELECT
        value->>'creditGrantId' AS credit_grant_id,
        COALESCE((value->>'reservedCredits')::integer, 0) AS restored_credits
      FROM use_ledger, jsonb_array_elements(COALESCE(use_ledger.metadata->'reserveAllocations', '[]'::jsonb)) AS value
      WHERE NOT EXISTS (SELECT 1 FROM direct_allocations)
    ),
    allocations AS (
      SELECT * FROM direct_allocations
      UNION ALL
      SELECT * FROM reserve_allocations
    ),
    restorable_allocations AS (
      SELECT
        allocations.credit_grant_id,
        GREATEST(
          0,
          allocations.restored_credits - COALESCE(previous_restore_allocations.restored_credits, 0)
        )::integer AS restored_credits
      FROM allocations
      LEFT JOIN previous_restore_allocations
        ON previous_restore_allocations.credit_grant_id = allocations.credit_grant_id
    ),
    restorable AS (
      SELECT GREATEST(0, COALESCE(SUM(restored_credits), 0)::integer - (SELECT credits FROM previous_restores)) AS credits
      FROM allocations
    ),
    capped_allocations AS (
      SELECT
        credit_grant_id,
        GREATEST(
          0,
          LEAST(
            restored_credits,
            LEAST(${maxRestoreCredits}, (SELECT credits FROM restorable)) - COALESCE(
              SUM(restored_credits) OVER (
                ORDER BY credit_grant_id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            )
          )
        )::integer AS restored_credits
      FROM restorable_allocations
    ),
    updated_grants AS (
      UPDATE credit_grants AS grant
      SET
        remaining_credits = grant.remaining_credits + capped_allocations.restored_credits,
        updated_at = NOW()
      FROM capped_allocations
      WHERE grant.id = capped_allocations.credit_grant_id
        AND capped_allocations.restored_credits > 0
        AND NOT EXISTS (SELECT 1 FROM existing_restore)
      RETURNING capped_allocations.restored_credits
    ),
    active_balance AS (
      SELECT COALESCE(SUM(remaining_credits), 0)::integer AS balance_after_credits
      FROM credit_grants
      WHERE user_id = ${input.userId}
        AND remaining_credits > 0
        AND expires_at > NOW()
    ),
    allocation_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'creditGrantId', credit_grant_id,
            'restoredCredits', restored_credits
          )
        ),
        '[]'::jsonb
      ) AS data
      FROM capped_allocations
      WHERE restored_credits > 0
    ),
    inserted_ledger AS (
      INSERT INTO credit_ledger (
        user_id,
        campaign_id,
        credit_grant_id,
        type,
        amount_credits,
        balance_after_credits,
        idempotency_key,
        description,
        metadata
      )
      SELECT
        ${input.userId},
        ${input.campaignId},
        use_ledger.credit_grant_id,
        'adjustment',
        COALESCE((SELECT SUM(restored_credits) FROM updated_grants), 0),
        active_balance.balance_after_credits,
        ${restoreIdempotencyKey},
        ${input.description},
        jsonb_build_object(
          'reason', ${input.reason},
          'useLedgerId', use_ledger.id,
          'allocations', allocation_json.data
        )
      FROM use_ledger, active_balance, allocation_json
      WHERE COALESCE((SELECT SUM(restored_credits) FROM updated_grants), 0) > 0
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, amount_credits, balance_after_credits
    ),
    updated_campaign AS (
      UPDATE campaigns
      SET
        status_code = ${input.statusCode ?? 35},
        status = ${input.status ?? 'stopped'},
        updated_at = NOW()
      WHERE id = ${input.campaignId}
        AND user_id = ${input.userId}
      RETURNING id
    )
    SELECT
      EXISTS(SELECT 1 FROM existing_restore) AS already_restored,
      EXISTS(SELECT 1 FROM use_ledger) AS has_use_ledger,
      COALESCE(
        (SELECT amount_credits FROM inserted_ledger LIMIT 1),
        (SELECT amount_credits FROM existing_restore LIMIT 1),
        0
      ) AS restored_credits,
      COALESCE(
        (SELECT balance_after_credits FROM inserted_ledger LIMIT 1),
        (SELECT balance_after_credits FROM existing_restore LIMIT 1),
        (SELECT balance_after_credits FROM active_balance LIMIT 1)
      ) AS balance_after_credits
  `);

  const row = result.rows?.[0] || {};
  return {
    success: true,
    alreadyProcessed: Boolean(row.already_restored || !row.has_use_ledger),
    restoredCredits: Number(row.restored_credits || 0),
    balanceAfterCredits: Number(row.balance_after_credits || 0),
  };
}

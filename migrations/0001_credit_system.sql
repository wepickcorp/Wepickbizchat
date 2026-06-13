CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE recommended_templates
  ADD COLUMN IF NOT EXISTS lms_title_template varchar(60),
  ADD COLUMN IF NOT EXISTS lms_content_template text,
  ADD COLUMN IF NOT EXISTS variable_schema jsonb,
  ADD COLUMN IF NOT EXISTS url_links jsonb,
  ADD COLUMN IF NOT EXISTS buttons jsonb,
  ADD COLUMN IF NOT EXISTS source_template_id varchar,
  ADD COLUMN IF NOT EXISTS targeting_config jsonb;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS lms_title varchar(60),
  ADD COLUMN IF NOT EXISTS lms_content text,
  ADD COLUMN IF NOT EXISTS variable_schema jsonb,
  ADD COLUMN IF NOT EXISTS image_file_id varchar(100),
  ADD COLUMN IF NOT EXISTS lms_image_url text,
  ADD COLUMN IF NOT EXISTS lms_image_file_id varchar(100),
  ADD COLUMN IF NOT EXISTS url_links jsonb,
  ADD COLUMN IF NOT EXISTS lms_url_links jsonb,
  ADD COLUMN IF NOT EXISTS buttons jsonb;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS rcv_type integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_type integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rcs_type integer,
  ADD COLUMN IF NOT EXISTS snd_num varchar(20),
  ADD COLUMN IF NOT EXISTS snd_goal_cnt integer,
  ADD COLUMN IF NOT EXISTS snd_mosu integer,
  ADD COLUMN IF NOT EXISTS snd_mosu_query text,
  ADD COLUMN IF NOT EXISTS snd_mosu_desc text,
  ADD COLUMN IF NOT EXISTS settle_cnt integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mdn_file_id varchar(50),
  ADD COLUMN IF NOT EXISTS ats_snd_start_date timestamp,
  ADD COLUMN IF NOT EXISTS coll_start_date timestamp,
  ADD COLUMN IF NOT EXISTS coll_end_date timestamp,
  ADD COLUMN IF NOT EXISTS coll_snd_date timestamp,
  ADD COLUMN IF NOT EXISTS snd_geofence_id integer,
  ADD COLUMN IF NOT EXISTS rt_start_hhmm varchar(4),
  ADD COLUMN IF NOT EXISTS rt_end_hhmm varchar(4),
  ADD COLUMN IF NOT EXISTS snd_day_div integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_message decimal(10, 0) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS bizchat_campaign_id varchar(100),
  ADD COLUMN IF NOT EXISTS creation_mode varchar(20),
  ADD COLUMN IF NOT EXISTS recommended_template_id varchar,
  ADD COLUMN IF NOT EXISTS variable_values jsonb,
  ADD COLUMN IF NOT EXISTS test_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp,
  ADD COLUMN IF NOT EXISTS completed_at timestamp;

CREATE TABLE IF NOT EXISTS message_copy_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  content text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'reviewing',
  admin_id varchar,
  admin_note text,
  rejection_reason text,
  template_id varchar REFERENCES templates(id),
  promoted_template_id varchar REFERENCES recommended_templates(id),
  reviewed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_grants (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  transaction_id varchar REFERENCES transactions(id),
  product_type varchar(30),
  original_credits integer NOT NULL,
  remaining_credits integer NOT NULL,
  purchased_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_grants_user_expires
  ON credit_grants(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_credit_grants_user_remaining
  ON credit_grants(user_id, remaining_credits);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  credit_grant_id varchar REFERENCES credit_grants(id),
  transaction_id varchar REFERENCES transactions(id),
  campaign_id varchar REFERENCES campaigns(id),
  type varchar(30) NOT NULL,
  amount_credits integer NOT NULL,
  balance_after_credits integer,
  product_type varchar(30),
  idempotency_key varchar(120),
  description text,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_campaign
  ON credit_ledger(campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_credit_ledger_idempotency
  ON credit_ledger(idempotency_key);

CREATE TABLE IF NOT EXISTS refunds (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  transaction_id varchar REFERENCES transactions(id),
  amount decimal(12, 0) NOT NULL,
  reason text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  admin_id varchar REFERENCES admins(id),
  admin_note text,
  bank_name varchar(50),
  account_number varchar(50),
  account_holder varchar(50),
  processed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_user_created
  ON refunds(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_refunds_status_created
  ON refunds(status, created_at);

CREATE TABLE IF NOT EXISTS payment_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(30) NOT NULL,
  order_no varchar(120) NOT NULL UNIQUE,
  user_id varchar NOT NULL REFERENCES users(id),
  product_type varchar(30),
  amount_krw integer NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  payment_reference varchar(120),
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user
  ON payment_orders(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_reference
  ON payment_orders(payment_reference);

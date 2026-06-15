CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS event_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar REFERENCES users(id),
  anonymous_id varchar(120),
  event_name varchar(100) NOT NULL,
  funnel_step varchar(80),
  page_path text,
  referrer text,
  campaign_id varchar REFERENCES campaigns(id),
  template_id varchar,
  product_type varchar(30),
  metadata jsonb,
  user_agent text,
  ip_address varchar(45),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_created ON event_logs(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_created ON event_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_logs_anonymous_created ON event_logs(anonymous_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_logs_funnel_created ON event_logs(funnel_step, created_at);

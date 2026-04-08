-- =============================================================================
-- Telegram ↔ Subscriber linking (PostgreSQL) — idempotent, non-destructive
-- تشغيل يدوي: psql "$DATABASE_URL" -f backend/db/telegram_linking_migration.sql
-- تُطبَّق أيضاً عبر bootstrap من schema_idempotent.sql
-- =============================================================================

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscribers_telegram_chat_id
  ON subscribers(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_users (
  id SERIAL PRIMARY KEY,
  subscriber_id BIGINT,
  real_name VARCHAR(255),
  phone VARCHAR(20),
  telegram_chat_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS subscriber_id BIGINT;
ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS real_name VARCHAR(255);
ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

ALTER TABLE telegram_users ALTER COLUMN subscriber_id TYPE BIGINT USING subscriber_id::bigint;
ALTER TABLE telegram_users ALTER COLUMN phone TYPE VARCHAR(20) USING LEFT(COALESCE(phone, ''), 20);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_users_telegram_chat_id ON telegram_users(telegram_chat_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_users_subscriber_id
  ON telegram_users(subscriber_id) WHERE subscriber_id IS NOT NULL;

ALTER TABLE telegram_users DROP CONSTRAINT IF EXISTS fk_telegram_users_subscriber_id;
ALTER TABLE telegram_users ADD CONSTRAINT fk_telegram_users_subscriber_id FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL;

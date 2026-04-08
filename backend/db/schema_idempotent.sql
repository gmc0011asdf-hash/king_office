-- Idempotent schema for king_office_new (PostgreSQL)
-- Creates missing tables and missing columns only (no drops).

BEGIN;

-- ========= users =========
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  role            VARCHAR(50)  NOT NULL DEFAULT 'user',
  password        VARCHAR(255) NOT NULL,
  recovery_email  VARCHAR(255),
  last_login      TIMESTAMP,
  status          VARCHAR(50)  NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP    NOT NULL DEFAULT now(),
  permissions     TEXT,
  reset_code      VARCHAR(10),
  reset_code_expiry TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expiry TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN NOT NULL DEFAULT false;

-- ========= system_settings =========
CREATE TABLE IF NOT EXISTS system_settings (
  id BIGSERIAL PRIMARY KEY,
  wallet_alert_threshold NUMERIC(14,2) NOT NULL DEFAULT 50000,
  stock_alert_threshold  INTEGER       NOT NULL DEFAULT 5,
  earthlink_threshold    NUMERIC(14,2) NOT NULL DEFAULT 50000,
  swig_threshold         NUMERIC(14,2) NOT NULL DEFAULT 50000,
  qi_threshold           NUMERIC(14,2) NOT NULL DEFAULT 50000,
  cards_threshold        INTEGER       NOT NULL DEFAULT 5,
  materials_threshold    INTEGER       NOT NULL DEFAULT 5,
  updated_at             TIMESTAMP     NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wallet_alert_threshold NUMERIC(14,2);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS stock_alert_threshold INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS earthlink_threshold NUMERIC(14,2);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS swig_threshold NUMERIC(14,2);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS qi_threshold NUMERIC(14,2);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS cards_threshold INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS materials_threshold INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS office_name VARCHAR(255);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS office_phone VARCHAR(20);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS cards_report_name VARCHAR(255);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS backup_storage_path TEXT;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS backup_schedule VARCHAR(20) DEFAULT 'none';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS backup_schedule_time VARCHAR(8) DEFAULT '02:00';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS backup_schedule_weekday INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS backup_schedule_month_day INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS backup_last_scheduled_at TIMESTAMP;

-- ========= wallet_transactions =========
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT now(),
  description TEXT
);

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS wallet_type VARCHAR(50);

-- ========= subscribers =========
CREATE TABLE IF NOT EXISTS subscribers (
  id BIGSERIAL PRIMARY KEY,
  user_code VARCHAR(100),
  real_name VARCHAR(255),
  national_id_name VARCHAR(255),
  phone VARCHAR(50),
  zone VARCHAR(100),
  fat VARCHAR(100),
  category VARCHAR(100),
  category_price NUMERIC(14,2),
  debt NUMERIC(14,2) NOT NULL DEFAULT 0,
  subscription_date DATE,
  expiration_date DATE,
  status VARCHAR(50),
  location VARCHAR(255)
);

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS user_code VARCHAR(100);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS real_name VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS national_id_name VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS zone VARCHAR(100);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS fat VARCHAR(100);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS category_price NUMERIC(14,2);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(50);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS debt NUMERIC(14,2);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS subscription_date DATE;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- السماح بترك الاسم الحقيقي فارغاً بعد ترحيل FTTH (يُملأ لاحقاً يدوياً)
ALTER TABLE subscribers ALTER COLUMN real_name DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscribers_user_code ON subscribers(user_code);

-- ========= Telegram linking (n8n / bot) — لا يغيّر منطق الاشتراكات =========
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscribers_telegram_chat_id ON subscribers(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- تثبيتات جديدة: id SERIAL (integer)، subscriber_id BIGINT، phone VARCHAR(20)
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

-- مواءمة تركيبات قديمة (integer → bigint، عرض الهاتف في مرآة telegram فقط)
ALTER TABLE telegram_users ALTER COLUMN subscriber_id TYPE BIGINT USING subscriber_id::bigint;
ALTER TABLE telegram_users ALTER COLUMN phone TYPE VARCHAR(20) USING LEFT(COALESCE(phone, ''), 20);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_users_telegram_chat_id ON telegram_users(telegram_chat_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_users_subscriber_id ON telegram_users(subscriber_id) WHERE subscriber_id IS NOT NULL;

-- FK (جملتان بدون DO $$ حتى يبقى التقسيم عند ';' في bootstrap صالحاً)
ALTER TABLE telegram_users DROP CONSTRAINT IF EXISTS fk_telegram_users_subscriber_id;
ALTER TABLE telegram_users ADD CONSTRAINT fk_telegram_users_subscriber_id FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL;

-- ========= internet_phones =========
CREATE TABLE IF NOT EXISTS internet_phones (
  id BIGSERIAL PRIMARY KEY,
  sequence INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(255),
  phone_number VARCHAR(100) NOT NULL UNIQUE
);

ALTER TABLE internet_phones ADD COLUMN IF NOT EXISTS sequence INTEGER;
ALTER TABLE internet_phones ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE internet_phones ADD COLUMN IF NOT EXISTS phone_number VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS ux_internet_phones_phone_number ON internet_phones(phone_number);

-- ========= subscriber_history =========
CREATE TABLE IF NOT EXISTS subscriber_history (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL DEFAULT now(),
  type VARCHAR(100),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT
);

ALTER TABLE subscriber_history ADD COLUMN IF NOT EXISTS subscriber_id BIGINT;
ALTER TABLE subscriber_history ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE subscriber_history ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE subscriber_history ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE subscriber_history ADD COLUMN IF NOT EXISTS description TEXT;

-- ========= subscriber_debt_entries (تفاصيل ديون المشتركين) =========
CREATE TABLE IF NOT EXISTS subscriber_debt_entries (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  remaining_amount NUMERIC(14,2) NOT NULL,
  debt_date DATE NOT NULL,
  description TEXT,
  debt_scope VARCHAR(20) NOT NULL DEFAULT 'current',
  entry_source VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_subscriber_debt_entries_subscriber_id ON subscriber_debt_entries(subscriber_id);
CREATE INDEX IF NOT EXISTS ix_subscriber_debt_entries_created_by_user_id ON subscriber_debt_entries(created_by_user_id);

-- ========= internet_zones =========
CREATE TABLE IF NOT EXISTS internet_zones (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE internet_zones ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE internet_zones ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

-- ========= internet_fats =========
CREATE TABLE IF NOT EXISTS internet_fats (
  id BIGSERIAL PRIMARY KEY,
  zone_id BIGINT NOT NULL REFERENCES internet_zones(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  coordinates VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE internet_fats ADD COLUMN IF NOT EXISTS zone_id BIGINT;
ALTER TABLE internet_fats ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE internet_fats ADD COLUMN IF NOT EXISTS coordinates VARCHAR(255);
ALTER TABLE internet_fats ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_internet_fats_zone_id ON internet_fats(zone_id);

-- ========= subscription_categories =========
CREATE TABLE IF NOT EXISTS subscription_categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE subscription_categories ADD COLUMN IF NOT EXISTS name VARCHAR(150);
ALTER TABLE subscription_categories ADD COLUMN IF NOT EXISTS price NUMERIC(14,2);
ALTER TABLE subscription_categories ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(50);
ALTER TABLE subscription_categories ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2);
ALTER TABLE subscription_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

-- ========= internet_materials =========
CREATE TABLE IF NOT EXISTS internet_materials (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE internet_materials ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE internet_materials ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14,2);
ALTER TABLE internet_materials ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE internet_materials ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE internet_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

-- ========= internet_material_sales =========
CREATE TABLE IF NOT EXISTS internet_material_sales (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT REFERENCES internet_materials(id) ON DELETE SET NULL,
  date TIMESTAMP NOT NULL DEFAULT now(),
  material_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  subscriber_name VARCHAR(255)
);

ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS material_id BIGINT;
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS material_name VARCHAR(255);
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14,2);
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS profit NUMERIC(14,2);
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE internet_material_sales ADD COLUMN IF NOT EXISTS subscriber_name VARCHAR(255);

-- ========= office_materials =========
CREATE TABLE IF NOT EXISTS office_materials (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  purchase_price NUMERIC(14,2) NOT NULL,
  selling_price NUMERIC(14,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE office_materials ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE office_materials ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14,2);
ALTER TABLE office_materials ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE office_materials ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- ========= office_customers =========
CREATE TABLE IF NOT EXISTS office_customers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  debt NUMERIC(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE office_customers ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE office_customers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE office_customers ADD COLUMN IF NOT EXISTS debt NUMERIC(14,2);

-- ========= office_customer_history =========
CREATE TABLE IF NOT EXISTS office_customer_history (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES office_customers(id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL DEFAULT now(),
  type VARCHAR(100),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT
);

ALTER TABLE office_customer_history ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE office_customer_history ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE office_customer_history ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE office_customer_history ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE office_customer_history ADD COLUMN IF NOT EXISTS description TEXT;

-- ========= office_invoices =========
CREATE TABLE IF NOT EXISTS office_invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_no VARCHAR(50) UNIQUE,
  office_name VARCHAR(255) NOT NULL DEFAULT 'مكتب الملك',
  date TIMESTAMP NOT NULL DEFAULT now(),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash', -- cash | debt
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(50);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS office_name VARCHAR(255);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES office_customers(id) ON DELETE SET NULL;
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2);
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS is_paid BOOLEAN;
ALTER TABLE office_invoices ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_office_invoices_invoice_no ON office_invoices(invoice_no);

-- ========= office_invoice_items =========
CREATE TABLE IF NOT EXISTS office_invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES office_invoices(id) ON DELETE CASCADE,
  material_id BIGINT REFERENCES office_materials(id) ON DELETE SET NULL,
  material_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE office_invoice_items ADD COLUMN IF NOT EXISTS invoice_id BIGINT;
ALTER TABLE office_invoice_items ADD COLUMN IF NOT EXISTS material_id BIGINT;
ALTER TABLE office_invoice_items ADD COLUMN IF NOT EXISTS material_name VARCHAR(255);
ALTER TABLE office_invoice_items ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE office_invoice_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE office_invoice_items ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);

-- ========= office_payments (debt/installments collections) =========
CREATE TABLE IF NOT EXISTS office_payments (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES office_customers(id) ON DELETE SET NULL,
  installment_id BIGINT,
  date TIMESTAMP NOT NULL DEFAULT now(),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT
);

ALTER TABLE office_payments ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE office_payments ADD COLUMN IF NOT EXISTS installment_id BIGINT;
ALTER TABLE office_payments ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE office_payments ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE office_payments ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS ix_office_payments_customer_id ON office_payments(customer_id);

-- ========= office_installments =========
CREATE TABLE IF NOT EXISTS office_installments (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES office_customers(id) ON DELETE CASCADE,
  sale_id BIGINT REFERENCES office_sales(id) ON DELETE SET NULL,
  installment_index INTEGER NOT NULL DEFAULT 1,
  due_date DATE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_date TIMESTAMP,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS sale_id BIGINT;
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS installment_index INTEGER;
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2);
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS paid_date TIMESTAMP;
ALTER TABLE office_installments ADD COLUMN IF NOT EXISTS is_paid BOOLEAN;

CREATE INDEX IF NOT EXISTS ix_office_installments_customer_id ON office_installments(customer_id);

-- ========= office_sales =========
CREATE TABLE IF NOT EXISTS office_sales (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP NOT NULL DEFAULT now(),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50),
  customer_id BIGINT REFERENCES office_customers(id) ON DELETE SET NULL,
  material_id BIGINT REFERENCES office_materials(id) ON DELETE SET NULL,
  material_name VARCHAR(255),
  quantity INTEGER NOT NULL DEFAULT 1,
  purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  purchase_date DATE,
  commission_percent NUMERIC(6,2),
  total_with_commission NUMERIC(14,2),
  installments_months INTEGER,
  monthly_installment NUMERIC(14,2)
);

ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS profit NUMERIC(14,2);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS material_id BIGINT;
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS material_name VARCHAR(255);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14,2);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS total_with_commission NUMERIC(14,2);
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS installments_months INTEGER;
ALTER TABLE office_sales ADD COLUMN IF NOT EXISTS monthly_installment NUMERIC(14,2);

-- ========= partners =========
CREATE TABLE IF NOT EXISTS partners (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  join_date DATE,
  percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  department VARCHAR(100)
);

ALTER TABLE partners ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS join_date DATE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS percentage NUMERIC(6,2);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- ========= partner_transactions =========
CREATE TABLE IF NOT EXISTS partner_transactions (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL DEFAULT now(),
  department VARCHAR(100),
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  partner_share NUMERIC(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS partner_id BIGINT;
ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS revenue NUMERIC(14,2);
ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS expenses NUMERIC(14,2);
ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS net_profit NUMERIC(14,2);
ALTER TABLE partner_transactions ADD COLUMN IF NOT EXISTS partner_share NUMERIC(14,2);

-- ========= suppliers =========
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  specialty VARCHAR(255),
  phone VARCHAR(50),
  outstanding_debt NUMERIC(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS specialty VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS outstanding_debt NUMERIC(14,2);

-- ========= supplier_transactions =========
CREATE TABLE IF NOT EXISTS supplier_transactions (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL DEFAULT now(),
  type VARCHAR(50),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT
);

ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS supplier_id BIGINT;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- ========= card_wallet_transactions =========
CREATE TABLE IF NOT EXISTS card_wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_type VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  date TIMESTAMP NOT NULL DEFAULT now(),
  status VARCHAR(100),
  description TEXT,
  balance_after NUMERIC(14,2)
);

ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS wallet_type VARCHAR(50);
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS commission NUMERIC(14,2);
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS total NUMERIC(14,2);
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(100);
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE card_wallet_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2);

-- ========= card_purchases =========
CREATE TABLE IF NOT EXISTS card_purchases (
  id BIGSERIAL PRIMARY KEY,
  quantity INTEGER NOT NULL,
  purchase_price NUMERIC(14,2) NOT NULL,
  selling_price NUMERIC(14,2),
  total_amount NUMERIC(14,2) NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14,2);
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS date TIMESTAMP;

-- ========= card_sales =========
CREATE TABLE IF NOT EXISTS card_sales (
  id BIGSERIAL PRIMARY KEY,
  quantity INTEGER NOT NULL,
  selling_price NUMERIC(14,2) NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  profit NUMERIC(14,2) NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS profit NUMERIC(14,2);
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS date TIMESTAMP;

-- ========= expenses =========
CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  amount NUMERIC(14,2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS date TIMESTAMP;

-- ========= cashback_history =========
CREATE TABLE IF NOT EXISTS cashback_history (
  id BIGSERIAL PRIMARY KEY,
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE cashback_history ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE cashback_history ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE cashback_history ADD COLUMN IF NOT EXISTS date TIMESTAMP;

-- ========= sim_packages =========
CREATE TABLE IF NOT EXISTS sim_packages (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  topup_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  company_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  jb_return NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS topup_amount NUMERIC(14,2);
ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS company_commission NUMERIC(14,2);
ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS jb_return NUMERIC(14,2);
ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2);
ALTER TABLE sim_packages ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);

-- ========= sim_inventory_transactions =========
CREATE TABLE IF NOT EXISTS sim_inventory_transactions (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE sim_inventory_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE sim_inventory_transactions ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE sim_inventory_transactions ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE sim_inventory_transactions ADD COLUMN IF NOT EXISTS date TIMESTAMP;

-- ========= sim_numbers =========
CREATE TABLE IF NOT EXISTS sim_numbers (
  id BIGSERIAL PRIMARY KEY,
  number VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  sold_date TIMESTAMP,
  package_id BIGINT REFERENCES sim_packages(id) ON DELETE SET NULL
);

ALTER TABLE sim_numbers ADD COLUMN IF NOT EXISTS number VARCHAR(50);
ALTER TABLE sim_numbers ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE sim_numbers ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE sim_numbers ADD COLUMN IF NOT EXISTS sold_date TIMESTAMP;
ALTER TABLE sim_numbers ADD COLUMN IF NOT EXISTS package_id BIGINT;

-- ========= sim_sales =========
CREATE TABLE IF NOT EXISTS sim_sales (
  id BIGSERIAL PRIMARY KEY,
  package_id BIGINT REFERENCES sim_packages(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT now(),
  selling_price NUMERIC(14,2) NOT NULL,
  cost NUMERIC(14,2) NOT NULL,
  profit NUMERIC(14,2) NOT NULL,
  company_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  jb_return NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_number_id BIGINT REFERENCES sim_numbers(id) ON DELETE SET NULL
);

ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS package_id BIGINT;
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS date TIMESTAMP;
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2);
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2);
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS profit NUMERIC(14,2);
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS company_commission NUMERIC(14,2);
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS jb_return NUMERIC(14,2);
ALTER TABLE sim_sales ADD COLUMN IF NOT EXISTS sim_number_id BIGINT;

-- ========= notifications (للإشعارات للمدير عند تسجيل دخول الموظف أو من جهاز آخر) =========
CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  type            VARCHAR(50) NOT NULL DEFAULT 'info',
  read_at         TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_created_at ON notifications(created_at DESC);

-- ========= activity_log (سجل حركات الموظفين والمدير) =========
CREATE TABLE IF NOT EXISTS activity_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name       VARCHAR(255),
  section         VARCHAR(100) NOT NULL,
  action          VARCHAR(100) NOT NULL,
  details         TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS section VARCHAR(100);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS action VARCHAR(100);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS ix_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_activity_log_section ON activity_log(section);

-- ========= FTTH Portal (وسيط خارجي — منفصل عن subscribers) =========
CREATE TABLE IF NOT EXISTS ftth_portal_config (
  id                BIGSERIAL PRIMARY KEY,
  login_url         TEXT NOT NULL,
  list_url          TEXT,
  username_enc      BYTEA NOT NULL,
  password_enc      BYTEA NOT NULL,
  parse_mode        VARCHAR(50) NOT NULL DEFAULT 'json_generic',
  parse_options     JSONB NOT NULL DEFAULT '{}',
  last_sync_at      TIMESTAMPTZ,
  last_sync_new     INTEGER NOT NULL DEFAULT 0,
  last_sync_updated INTEGER NOT NULL DEFAULT 0,
  last_sync_error   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS login_url TEXT;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS list_url TEXT;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS username_enc BYTEA;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS password_enc BYTEA;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS parse_mode VARCHAR(50);
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS parse_options JSONB;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS last_sync_new INTEGER;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS last_sync_updated INTEGER;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE ftth_portal_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ftth_external_data (
  id                      BIGSERIAL PRIMARY KEY,
  external_id             VARCHAR(255) NOT NULL,
  national_name           VARCHAR(500),
  phone                   VARCHAR(100),
  zone                    VARCHAR(200),
  fat                     VARCHAR(200),
  location                TEXT,
  service_username        VARCHAR(200),
  start_date              DATE,
  end_date                DATE,
  remaining_days          INTEGER,
  status                  VARCHAR(255),
  raw_payload             JSONB NOT NULL DEFAULT '{}',
  imported_subscriber_id  BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS national_name VARCHAR(500);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS remaining_days INTEGER;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS status VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_payload JSONB;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS imported_subscriber_id BIGINT;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS zone VARCHAR(200);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS fat VARCHAR(200);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS service_username VARCHAR(200);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(100);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS customer_type VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS fdt VARCHAR(200);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS bundle VARCHAR(500);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS governorate VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS district VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS sub_district VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS street VARCHAR(500);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS house VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(12,8);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(12,8);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS onu_serial VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS mac_address VARCHAR(100);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS has_active_session BOOLEAN;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS active_session_started_at TIMESTAMPTZ;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS usr_referral_code VARCHAR(255);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS partner_name VARCHAR(500);
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS is_pending BOOLEAN;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS is_trial BOOLEAN;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_customer_json JSONB;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_detail_json JSONB;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_subscription_json JSONB;
ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS commitment_period INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ftth_external_data_external_id ON ftth_external_data(external_id);
CREATE INDEX IF NOT EXISTS ix_ftth_external_data_national_name ON ftth_external_data(national_name);
CREATE INDEX IF NOT EXISTS ix_ftth_external_data_imported ON ftth_external_data(imported_subscriber_id);

COMMIT;


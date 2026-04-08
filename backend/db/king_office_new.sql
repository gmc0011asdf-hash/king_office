-- king_office_new schema (PostgreSQL)
-- Naming rule (as requested): section_table_column
-- Example: internet_subscribers.internet_subscribers_real_name

BEGIN;

-- Database creation is typically done outside a transaction.
-- If you run this in psql as a superuser, you can uncomment:
-- CREATE DATABASE king_office_new;

-- Schemas (logical sections)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS settings;
CREATE SCHEMA IF NOT EXISTS wallet;
CREATE SCHEMA IF NOT EXISTS internet;
CREATE SCHEMA IF NOT EXISTS office;
CREATE SCHEMA IF NOT EXISTS partners;
CREATE SCHEMA IF NOT EXISTS cards;
CREATE SCHEMA IF NOT EXISTS expenses;
CREATE SCHEMA IF NOT EXISTS sim;

-- =========================
-- AUTH / USERS
-- =========================
CREATE TABLE IF NOT EXISTS auth.auth_users (
  auth_users_id              BIGSERIAL PRIMARY KEY,
  auth_users_name            VARCHAR(255) NOT NULL,
  auth_users_email           VARCHAR(255) NOT NULL UNIQUE,
  auth_users_role            VARCHAR(50)  NOT NULL DEFAULT 'user',
  auth_users_password        VARCHAR(255) NOT NULL,
  auth_users_recovery_email  VARCHAR(255),
  auth_users_last_login      TIMESTAMPTZ,
  auth_users_status          VARCHAR(50)  NOT NULL DEFAULT 'active',
  auth_users_created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  auth_users_permissions     TEXT,
  auth_users_reset_code      VARCHAR(10),
  auth_users_reset_code_expiry TIMESTAMPTZ
);

-- =========================
-- SETTINGS
-- =========================
CREATE TABLE IF NOT EXISTS settings.settings_system (
  settings_system_id                    BIGSERIAL PRIMARY KEY,
  settings_system_wallet_alert_threshold NUMERIC(14,2) NOT NULL DEFAULT 50000,
  settings_system_stock_alert_threshold  INTEGER       NOT NULL DEFAULT 5,
  settings_system_earthlink_threshold    NUMERIC(14,2) NOT NULL DEFAULT 50000,
  settings_system_swig_threshold         NUMERIC(14,2) NOT NULL DEFAULT 50000,
  settings_system_qi_threshold           NUMERIC(14,2) NOT NULL DEFAULT 50000,
  settings_system_cards_threshold        INTEGER       NOT NULL DEFAULT 5,
  settings_system_materials_threshold    INTEGER       NOT NULL DEFAULT 5,
  settings_system_updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- =========================
-- WALLET
-- =========================
CREATE TABLE IF NOT EXISTS wallet.wallet_transactions (
  wallet_transactions_id          BIGSERIAL PRIMARY KEY,
  wallet_transactions_type        VARCHAR(50)  NOT NULL,
  wallet_transactions_amount      NUMERIC(14,2) NOT NULL,
  wallet_transactions_date        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  wallet_transactions_description TEXT
);

-- =========================
-- INTERNET (Subscribers + Meta + Sales + Reports Inputs)
-- =========================
CREATE TABLE IF NOT EXISTS internet.internet_subscribers (
  internet_subscribers_id                 BIGSERIAL PRIMARY KEY,
  internet_subscribers_real_name          VARCHAR(255) NOT NULL,
  internet_subscribers_national_id_name   VARCHAR(255),
  internet_subscribers_phone              VARCHAR(50),
  internet_subscribers_zone               VARCHAR(100),
  internet_subscribers_fat                VARCHAR(100),
  internet_subscribers_category           VARCHAR(100),
  internet_subscribers_category_price     NUMERIC(14,2),
  internet_subscribers_debt               NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_subscribers_subscription_date  DATE,
  internet_subscribers_expiration_date    DATE,
  internet_subscribers_status             VARCHAR(50),
  internet_subscribers_location           VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS internet.internet_subscriber_history (
  internet_subscriber_history_id            BIGSERIAL PRIMARY KEY,
  internet_subscriber_history_subscriber_id BIGINT NOT NULL REFERENCES internet.internet_subscribers(internet_subscribers_id) ON DELETE CASCADE,
  internet_subscriber_history_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  internet_subscriber_history_type          VARCHAR(100),
  internet_subscriber_history_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_subscriber_history_description   TEXT
);

CREATE TABLE IF NOT EXISTS internet.internet_zones (
  internet_zones_id         BIGSERIAL PRIMARY KEY,
  internet_zones_name       VARCHAR(100) NOT NULL UNIQUE,
  internet_zones_created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internet.internet_fats (
  internet_fats_id          BIGSERIAL PRIMARY KEY,
  internet_fats_zone_id     BIGINT NOT NULL REFERENCES internet.internet_zones(internet_zones_id) ON DELETE CASCADE,
  internet_fats_name        VARCHAR(100) NOT NULL,
  internet_fats_coordinates VARCHAR(255),
  internet_fats_created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_internet_fats_zone_id ON internet.internet_fats(internet_fats_zone_id);

CREATE TABLE IF NOT EXISTS internet.internet_subscription_categories (
  internet_subscription_categories_id         BIGSERIAL PRIMARY KEY,
  internet_subscription_categories_name       VARCHAR(150) NOT NULL UNIQUE,
  internet_subscription_categories_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_subscription_categories_created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internet.internet_materials (
  internet_materials_id            BIGSERIAL PRIMARY KEY,
  internet_materials_name          VARCHAR(255) NOT NULL UNIQUE,
  internet_materials_purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_materials_selling_price  NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_materials_quantity      INTEGER NOT NULL DEFAULT 0,
  internet_materials_created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internet.internet_material_sales (
  internet_material_sales_id              BIGSERIAL PRIMARY KEY,
  internet_material_sales_material_id     BIGINT REFERENCES internet.internet_materials(internet_materials_id) ON DELETE SET NULL,
  internet_material_sales_date            TIMESTAMPTZ NOT NULL DEFAULT now(),
  internet_material_sales_material_name   VARCHAR(255) NOT NULL,
  internet_material_sales_quantity        INTEGER NOT NULL DEFAULT 1,
  internet_material_sales_purchase_price  NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_material_sales_selling_price   NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_material_sales_total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_material_sales_profit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  internet_material_sales_payment_method  VARCHAR(50)  NOT NULL DEFAULT 'cash',
  internet_material_sales_subscriber_name VARCHAR(255)
);

-- =========================
-- OFFICE (Materials + Customers + Sales)
-- =========================
CREATE TABLE IF NOT EXISTS office.office_materials (
  office_materials_id             BIGSERIAL PRIMARY KEY,
  office_materials_name           VARCHAR(255) NOT NULL,
  office_materials_purchase_price NUMERIC(14,2) NOT NULL,
  office_materials_selling_price  NUMERIC(14,2) NOT NULL,
  office_materials_quantity       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS office.office_customers (
  office_customers_id    BIGSERIAL PRIMARY KEY,
  office_customers_name  VARCHAR(255) NOT NULL,
  office_customers_phone VARCHAR(50),
  office_customers_debt  NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS office.office_customer_history (
  office_customer_history_id          BIGSERIAL PRIMARY KEY,
  office_customer_history_customer_id BIGINT NOT NULL REFERENCES office.office_customers(office_customers_id) ON DELETE CASCADE,
  office_customer_history_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  office_customer_history_type        VARCHAR(100),
  office_customer_history_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  office_customer_history_description TEXT
);

CREATE TABLE IF NOT EXISTS office.office_sales (
  office_sales_id            BIGSERIAL PRIMARY KEY,
  office_sales_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  office_sales_total_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  office_sales_profit        NUMERIC(14,2) NOT NULL DEFAULT 0,
  office_sales_payment_method VARCHAR(50),
  office_sales_customer_id   BIGINT REFERENCES office.office_customers(office_customers_id) ON DELETE SET NULL
);

-- =========================
-- PARTNERS / SUPPLIERS
-- =========================
CREATE TABLE IF NOT EXISTS partners.partners_partners (
  partners_partners_id        BIGSERIAL PRIMARY KEY,
  partners_partners_name      VARCHAR(255) NOT NULL,
  partners_partners_join_date DATE,
  partners_partners_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  partners_partners_department VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS partners.partners_transactions (
  partners_transactions_id          BIGSERIAL PRIMARY KEY,
  partners_transactions_partner_id  BIGINT NOT NULL REFERENCES partners.partners_partners(partners_partners_id) ON DELETE CASCADE,
  partners_transactions_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  partners_transactions_department  VARCHAR(100),
  partners_transactions_revenue     NUMERIC(14,2) NOT NULL DEFAULT 0,
  partners_transactions_expenses    NUMERIC(14,2) NOT NULL DEFAULT 0,
  partners_transactions_net_profit  NUMERIC(14,2) NOT NULL DEFAULT 0,
  partners_transactions_partner_share NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS partners.partners_suppliers (
  partners_suppliers_id              BIGSERIAL PRIMARY KEY,
  partners_suppliers_name            VARCHAR(255) NOT NULL,
  partners_suppliers_specialty       VARCHAR(255),
  partners_suppliers_phone           VARCHAR(50),
  partners_suppliers_outstanding_debt NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS partners.partners_supplier_transactions (
  partners_supplier_transactions_id          BIGSERIAL PRIMARY KEY,
  partners_supplier_transactions_supplier_id BIGINT NOT NULL REFERENCES partners.partners_suppliers(partners_suppliers_id) ON DELETE CASCADE,
  partners_supplier_transactions_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  partners_supplier_transactions_type        VARCHAR(50),
  partners_supplier_transactions_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  partners_supplier_transactions_notes       TEXT
);

-- =========================
-- CARDS
-- =========================
CREATE TABLE IF NOT EXISTS cards.cards_wallet_transactions (
  cards_wallet_transactions_id            BIGSERIAL PRIMARY KEY,
  cards_wallet_transactions_wallet_type   VARCHAR(50),
  cards_wallet_transactions_type          VARCHAR(50) NOT NULL,
  cards_wallet_transactions_amount        NUMERIC(14,2) NOT NULL,
  cards_wallet_transactions_commission    NUMERIC(14,2) NOT NULL DEFAULT 0,
  cards_wallet_transactions_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  cards_wallet_transactions_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  cards_wallet_transactions_status        VARCHAR(100),
  cards_wallet_transactions_description   TEXT,
  cards_wallet_transactions_balance_after NUMERIC(14,2)
);

CREATE TABLE IF NOT EXISTS cards.cards_purchases (
  cards_purchases_id              BIGSERIAL PRIMARY KEY,
  cards_purchases_quantity        INTEGER NOT NULL,
  cards_purchases_purchase_price  NUMERIC(14,2) NOT NULL,
  cards_purchases_selling_price   NUMERIC(14,2),
  cards_purchases_total_amount    NUMERIC(14,2) NOT NULL,
  cards_purchases_date            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cards.cards_sales (
  cards_sales_id            BIGSERIAL PRIMARY KEY,
  cards_sales_quantity      INTEGER NOT NULL,
  cards_sales_selling_price NUMERIC(14,2) NOT NULL,
  cards_sales_total_amount  NUMERIC(14,2) NOT NULL,
  cards_sales_profit        NUMERIC(14,2) NOT NULL,
  cards_sales_date          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- EXPENSES
-- =========================
CREATE TABLE IF NOT EXISTS expenses.expenses_expenses (
  expenses_expenses_id          BIGSERIAL PRIMARY KEY,
  expenses_expenses_amount      NUMERIC(14,2) NOT NULL,
  expenses_expenses_category    VARCHAR(100) NOT NULL,
  expenses_expenses_description TEXT,
  expenses_expenses_date        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses.expenses_cashback_history (
  expenses_cashback_history_id          BIGSERIAL PRIMARY KEY,
  expenses_cashback_history_amount      NUMERIC(14,2) NOT NULL,
  expenses_cashback_history_description TEXT,
  expenses_cashback_history_date        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- SIM
-- =========================
CREATE TABLE IF NOT EXISTS sim.sim_packages (
  sim_packages_id               BIGSERIAL PRIMARY KEY,
  sim_packages_type             VARCHAR(50) NOT NULL,
  sim_packages_name             VARCHAR(255) NOT NULL,
  sim_packages_topup_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_packages_company_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_packages_jb_return        NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_packages_cost             NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_packages_selling_price    NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sim.sim_numbers (
  sim_numbers_id        BIGSERIAL PRIMARY KEY,
  sim_numbers_number    VARCHAR(50) NOT NULL UNIQUE,
  sim_numbers_type      VARCHAR(50) NOT NULL,
  sim_numbers_status    VARCHAR(50) NOT NULL DEFAULT 'available',
  sim_numbers_sold_date TIMESTAMPTZ,
  sim_numbers_package_id BIGINT REFERENCES sim.sim_packages(sim_packages_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sim.sim_inventory_transactions (
  sim_inventory_transactions_id       BIGSERIAL PRIMARY KEY,
  sim_inventory_transactions_type     VARCHAR(50) NOT NULL,
  sim_inventory_transactions_quantity INTEGER NOT NULL,
  sim_inventory_transactions_action   VARCHAR(50) NOT NULL,
  sim_inventory_transactions_date     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sim.sim_sales (
  sim_sales_id                 BIGSERIAL PRIMARY KEY,
  sim_sales_package_id         BIGINT REFERENCES sim.sim_packages(sim_packages_id) ON DELETE SET NULL,
  sim_sales_type               VARCHAR(50) NOT NULL,
  sim_sales_date               TIMESTAMPTZ NOT NULL DEFAULT now(),
  sim_sales_selling_price      NUMERIC(14,2) NOT NULL,
  sim_sales_cost               NUMERIC(14,2) NOT NULL,
  sim_sales_profit             NUMERIC(14,2) NOT NULL,
  sim_sales_company_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_sales_jb_return          NUMERIC(14,2) NOT NULL DEFAULT 0,
  sim_sales_sim_number_id      BIGINT REFERENCES sim.sim_numbers(sim_numbers_id) ON DELETE SET NULL
);

COMMIT;


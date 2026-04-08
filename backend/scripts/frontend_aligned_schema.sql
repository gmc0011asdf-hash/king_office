DROP TABLE IF EXISTS subscriber_history CASCADE;
DROP TABLE IF EXISTS subscribers CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS office_sales CASCADE;
DROP TABLE IF EXISTS office_customer_history CASCADE;
DROP TABLE IF EXISTS office_customers CASCADE;
DROP TABLE IF EXISTS office_materials CASCADE;
DROP TABLE IF EXISTS card_wallet_transactions CASCADE;
DROP TABLE IF EXISTS card_purchases CASCADE;
DROP TABLE IF EXISTS card_sales CASCADE;
DROP TABLE IF EXISTS partner_transactions CASCADE;
DROP TABLE IF EXISTS partners CASCADE;
DROP TABLE IF EXISTS supplier_transactions CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS cashback_history CASCADE;
DROP TABLE IF EXISTS sim_sales CASCADE;
DROP TABLE IF EXISTS sim_inventory_transactions CASCADE;
DROP TABLE IF EXISTS sim_numbers CASCADE;
DROP TABLE IF EXISTS sim_packages CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    password VARCHAR(255) NOT NULL,
    recovery_email VARCHAR(255),
    last_login TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    wallet_alert_threshold NUMERIC(14,2) NOT NULL DEFAULT 50000,
    stock_alert_threshold INTEGER NOT NULL DEFAULT 5,
    earthlink_threshold NUMERIC(14,2) NOT NULL DEFAULT 50000,
    swig_threshold NUMERIC(14,2) NOT NULL DEFAULT 50000,
    qi_threshold NUMERIC(14,2) NOT NULL DEFAULT 50000,
    cards_threshold INTEGER NOT NULL DEFAULT 5,
    materials_threshold INTEGER NOT NULL DEFAULT 5,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

CREATE TABLE subscribers (
    id SERIAL PRIMARY KEY,
    real_name VARCHAR(255) NOT NULL,
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

CREATE TABLE subscriber_history (
    id SERIAL PRIMARY KEY,
    subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(100),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    description TEXT
);

CREATE TABLE office_materials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    purchase_price NUMERIC(14,2) NOT NULL,
    selling_price NUMERIC(14,2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE office_customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    debt NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE office_customer_history (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES office_customers(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(100),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    description TEXT
);

CREATE TABLE office_sales (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    profit NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    customer_id INTEGER REFERENCES office_customers(id) ON DELETE SET NULL
);

CREATE TABLE partners (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    join_date DATE,
    percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
    department VARCHAR(100)
);

CREATE TABLE partner_transactions (
    id SERIAL PRIMARY KEY,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    department VARCHAR(100),
    revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
    expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
    partner_share NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255),
    phone VARCHAR(50),
    outstanding_debt NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE supplier_transactions (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT
);

CREATE TABLE card_wallet_transactions (
    id SERIAL PRIMARY KEY,
    wallet_type VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(100),
    description TEXT,
    balance_after NUMERIC(14,2)
);

CREATE TABLE card_purchases (
    id SERIAL PRIMARY KEY,
    quantity INTEGER NOT NULL,
    purchase_price NUMERIC(14,2) NOT NULL,
    selling_price NUMERIC(14,2),
    total_amount NUMERIC(14,2) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE card_sales (
    id SERIAL PRIMARY KEY,
    quantity INTEGER NOT NULL,
    selling_price NUMERIC(14,2) NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL,
    profit NUMERIC(14,2) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(14,2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cashback_history (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(14,2) NOT NULL,
    description TEXT,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sim_packages (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    topup_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    company_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    jb_return NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE sim_inventory_transactions (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sim_numbers (
    id SERIAL PRIMARY KEY,
    number VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'available',
    sold_date TIMESTAMP,
    package_id INTEGER REFERENCES sim_packages(id) ON DELETE SET NULL
);

CREATE TABLE sim_sales (
    id SERIAL PRIMARY KEY,
    package_id INTEGER REFERENCES sim_packages(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    selling_price NUMERIC(14,2) NOT NULL,
    cost NUMERIC(14,2) NOT NULL,
    profit NUMERIC(14,2) NOT NULL,
    company_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    jb_return NUMERIC(14,2) NOT NULL DEFAULT 0,
    sim_number_id INTEGER REFERENCES sim_numbers(id) ON DELETE SET NULL
);

INSERT INTO users (name, email, role, password, recovery_email, status)
VALUES ('مدير النظام', 'admin@maktabalmalik.com', 'admin', 'admin123', '', 'active');

INSERT INTO system_settings DEFAULT VALUES;

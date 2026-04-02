CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  pix_key TEXT,
  pix_key_type TEXT,
  document TEXT,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  gross_amount NUMERIC(10,2) NOT NULL,
  gateway_fee NUMERIC(10,2) NOT NULL DEFAULT 1,
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  withdrawal_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(10,2) NOT NULL,
  pix_key TEXT,
  pix_key_type TEXT,
  external_id TEXT,
  qr_code TEXT,
  qr_code_base64 TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  telegram_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO bot_settings (key, value) VALUES ('botName', 'NexiumPix | Payments') ON CONFLICT (key) DO NOTHING;
INSERT INTO bot_settings (key, value) VALUES ('welcomeText', '💫 Sua plataforma para receber e sacar Pix com total segurança.\n\nEscolha uma opção abaixo:') ON CONFLICT (key) DO NOTHING;

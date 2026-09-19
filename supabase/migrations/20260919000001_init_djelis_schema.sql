-- ==============================================================================
-- Djeli'S Messaging API - Schéma Initial Supabase PostgreSQL
-- ==============================================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum Types
DO $$ BEGIN
    CREATE TYPE sms_type_enum AS ENUM ('otp', 'transactional', 'marketing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sms_status_enum AS ENUM (
        'queued',
        'processing',
        'accepted',
        'sent',
        'delivered',
        'failed',
        'unknown'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE provider_health_enum AS ENUM ('healthy', 'degraded', 'down', 'maintenance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Table: applications (Applications clientes : TAKO, Sigi, Siraba, Comy_stock)
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    daily_limit INTEGER NOT NULL DEFAULT 10000,
    monthly_limit INTEGER NOT NULL DEFAULT 250000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table: api_keys (Gestion sécurisée des clés API avec SHA-256)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_app ON api_keys(application_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- 3. Table: providers (Fournisseurs SMS enregistrés)
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 100,
    health_status provider_health_enum NOT NULL DEFAULT 'healthy',
    configuration_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Table: routing_rules (Règles de sélection par pays, réseau, type)
CREATE TABLE IF NOT EXISTS routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(10) NOT NULL, -- Ex: 'ML', '223', '*'
    network_code VARCHAR(30) NOT NULL DEFAULT '*', -- Ex: 'ORANGE', 'MOOV', 'TELECEL', '*'
    sms_type sms_type_enum NOT NULL,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 10, -- Plus petit = plus prioritaire
    enabled BOOLEAN NOT NULL DEFAULT true,
    cost_per_segment_fcfa NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_lookup ON routing_rules(country_code, network_code, sms_type, enabled, priority);

-- 5. Table: templates (Gabarits de messages)
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE, -- NULL pour les templates globaux
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    sms_type sms_type_enum NOT NULL DEFAULT 'transactional',
    sender_id VARCHAR(11),
    variables JSONB NOT NULL DEFAULT '[]'::jsonb, -- Liste des variables attendues
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_template_slug_app UNIQUE (application_id, slug)
);

-- 6. Table: contacts (Gestion du consentement par numéro)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    phone_encrypted TEXT,
    phone_hash VARCHAR(64) NOT NULL,
    phone_masked VARCHAR(30) NOT NULL,
    consent_transactional BOOLEAN NOT NULL DEFAULT true,
    consent_marketing BOOLEAN NOT NULL DEFAULT false,
    consent_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_contact_app_phone UNIQUE (application_id, phone_hash)
);

CREATE INDEX IF NOT EXISTS idx_contacts_hash ON contacts(phone_hash);

-- 7. Table: opt_outs (Liste d'opposition marketing/globale)
CREATE TABLE IF NOT EXISTS opt_outs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE, -- NULL = blocage global
    phone_hash VARCHAR(64) NOT NULL,
    reason VARCHAR(255) DEFAULT 'User request',
    source VARCHAR(50) DEFAULT 'SMS_STOP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opt_outs_lookup ON opt_outs(phone_hash, application_id);

-- 8. Table: messages (Table principale des messages avec idempotence)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    recipient_encrypted TEXT,
    recipient_masked VARCHAR(30) NOT NULL,
    country_code VARCHAR(10) NOT NULL,
    network_code VARCHAR(30),
    sms_type sms_type_enum NOT NULL,
    sender_id VARCHAR(11),
    body TEXT NOT NULL,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    provider_message_id VARCHAR(100),
    status sms_status_enum NOT NULL DEFAULT 'queued',
    segment_count INTEGER NOT NULL DEFAULT 1,
    estimated_cost_fcfa NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_cost_fcfa NUMERIC(10, 2),
    idempotency_key VARCHAR(128) NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_app_idempotency UNIQUE (application_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_provider_msg_id ON messages(provider_message_id);

-- 9. Table: message_attempts (Historique des tentatives multi-fournisseurs)
CREATE TABLE IF NOT EXISTS message_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status sms_status_enum NOT NULL,
    provider_message_id VARCHAR(100),
    response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attempts_msg ON message_attempts(message_id);

-- 10. Table: delivery_events (Webhooks & Rapports de livraison DLR)
CREATE TABLE IF NOT EXISTS delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    provider_status VARCHAR(50) NOT NULL,
    normalized_status sms_status_enum NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_msg ON delivery_events(message_id);

-- 11. Table: usage_quotas (Agrégation journalière et mensuelle)
CREATE TABLE IF NOT EXISTS usage_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    period VARCHAR(10) NOT NULL, -- Format 'YYYY-MM' ou 'YYYY-MM-DD'
    messages_sent INTEGER NOT NULL DEFAULT 0,
    segments_sent INTEGER NOT NULL DEFAULT 0,
    total_cost_fcfa NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_app_period UNIQUE (application_id, period)
);

-- 12. Table: provider_costs (Grille tarifaire par fournisseur et réseau en FCFA)
CREATE TABLE IF NOT EXISTS provider_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    country_code VARCHAR(10) NOT NULL,
    network_code VARCHAR(30) NOT NULL DEFAULT '*',
    sms_type sms_type_enum NOT NULL DEFAULT 'transactional',
    cost_per_segment_fcfa NUMERIC(10, 2) NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ
);

-- 13. Table: audit_logs (Actions administratives et sécuritaires)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Politiques : Le backend (service_role) a accès complet
CREATE POLICY "service_role_all_access_applications" ON applications FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_api_keys" ON api_keys FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_providers" ON providers FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_routing_rules" ON routing_rules FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_templates" ON templates FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_contacts" ON contacts FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_opt_outs" ON opt_outs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_messages" ON messages FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_message_attempts" ON message_attempts FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_delivery_events" ON delivery_events FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_usage_quotas" ON usage_quotas FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_provider_costs" ON provider_costs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_access_audit_logs" ON audit_logs FOR ALL TO service_role USING (true);

-- Politiques : Administrateurs authentifiés (Supabase Auth)
CREATE POLICY "admin_auth_read_applications" ON applications FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_auth_write_applications" ON applications FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_auth_read_messages" ON messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_auth_read_providers" ON providers FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_auth_read_routing" ON routing_rules FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_auth_read_templates" ON templates FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_auth_read_quotas" ON usage_quotas FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_auth_read_audit" ON audit_logs FOR SELECT TO authenticated USING (true);

-- ==============================================================================
-- DONNÉES INITIALES (SEED)
-- ==============================================================================

-- 1. Fournisseurs
INSERT INTO providers (id, code, name, enabled, priority, health_status, configuration_metadata)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'infobip', 'Infobip SMS', true, 10, 'healthy', '{"description": "Connecteur Infobip réel HTTP REST"}'::jsonb),
    ('a0000000-0000-0000-0000-000000000002', 'mock', 'Simulateur / Mock Provider', true, 999, 'healthy', '{"description": "Fournisseur simulé pour le développement et les tests"}'::jsonb),
    ('a0000000-0000-0000-0000-000000000003', 'orange_mali', 'Orange Mali SMS API', false, 20, 'maintenance', '{"description": "Squelette en attente des identifiants et documentation contractuelle"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 2. Applications de départ
INSERT INTO applications (id, name, slug, status, daily_limit, monthly_limit)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'TAKO', 'tako', 'active', 20000, 500000),
    ('b0000000-0000-0000-0000-000000000002', 'Sigi', 'sigi', 'active', 10000, 250000),
    ('b0000000-0000-0000-0000-000000000003', 'Siraba', 'siraba', 'active', 15000, 350000),
    ('b0000000-0000-0000-0000-000000000004', 'Comy_stock', 'comy_stock', 'active', 5000, 100000)
ON CONFLICT (slug) DO NOTHING;

-- 3. Règles de routage par défaut
-- Mali (ML / 223) : OTP via Infobip (priorité 1), Mock en fallback (priorité 99)
INSERT INTO routing_rules (country_code, network_code, sms_type, provider_id, priority, enabled, cost_per_segment_fcfa)
VALUES
    ('223', '*', 'otp', 'a0000000-0000-0000-0000-000000000001', 1, true, 22.50),
    ('223', '*', 'otp', 'a0000000-0000-0000-0000-000000000002', 99, true, 0.00),
    ('223', '*', 'transactional', 'a0000000-0000-0000-0000-000000000001', 1, true, 22.50),
    ('223', '*', 'transactional', 'a0000000-0000-0000-0000-000000000002', 99, true, 0.00),
    ('223', '*', 'marketing', 'a0000000-0000-0000-0000-000000000001', 1, true, 20.00),
    ('*', '*', 'otp', 'a0000000-0000-0000-0000-000000000001', 1, true, 30.00),
    ('*', '*', 'transactional', 'a0000000-0000-0000-0000-000000000001', 1, true, 30.00),
    ('*', '*', 'marketing', 'a0000000-0000-0000-0000-000000000001', 1, true, 28.00)
ON CONFLICT DO NOTHING;

-- 4. Modèles de SMS initiaux
INSERT INTO templates (application_id, name, slug, content, sms_type, sender_id, variables, active)
VALUES
    (NULL, 'Code OTP Standard', 'otp_standard', 'Votre code de verification Djeli''S est {{code}}. Valable 5 minutes.', 'otp', 'DJELIS', '["code"]'::jsonb, true),
    (NULL, 'Confirmation de Commande', 'commande_confirmee', 'Bonjour {{client}}, votre commande {{numero}} est confirmee avec succes.', 'transactional', 'DJELIS', '["client", "numero"]'::jsonb, true)
ON CONFLICT DO NOTHING;

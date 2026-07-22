-- Initial schema for omni-pdms-v2 server.
-- Target: PostgreSQL 16+

BEGIN;

-- ───────────────────────────────────────────────
--  Users
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'viewer'
                        CHECK (role IN ('admin', 'operator', 'viewer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Machines
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machines (
    id              SERIAL PRIMARY KEY,
    serial_number   VARCHAR(255) NOT NULL UNIQUE,
    label           VARCHAR(255),
    software_version VARCHAR(255),
    ip_address      VARCHAR(45),
    port            INTEGER,
    status          VARCHAR(20) NOT NULL DEFAULT 'offline',
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Software versions
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS software_versions (
    id              SERIAL PRIMARY KEY,
    fingerprint     VARCHAR(64) NOT NULL UNIQUE,
    language_id     INTEGER,
    system_sw       VARCHAR(64),
    dss_fw          VARCHAR(64),
    dss_hw          VARCHAR(64),
    css_fw          VARCHAR(64),
    css_hw          VARCHAR(64),
    pss_fw          VARCHAR(64),
    pss_hw          VARCHAR(64),
    language1       VARCHAR(64),
    language2       VARCHAR(64),
    language3       VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Data attributes (per software version)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_attributes (
    id                  SERIAL PRIMARY KEY,
    software_version_id INTEGER NOT NULL
                        REFERENCES software_versions(id) ON DELETE CASCADE,
    handle              INTEGER NOT NULL,
    data_type           VARCHAR(64),
    size                INTEGER,
    conversion_factor   INTEGER,
    label_did           INTEGER,
    unit_did            INTEGER,
    signal_id           INTEGER,
    internal_name       VARCHAR(255)
);

-- ───────────────────────────────────────────────
--  Dictionary entries (per software version)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dictionary_entries (
    id                  SERIAL PRIMARY KEY,
    software_version_id INTEGER NOT NULL
                        REFERENCES software_versions(id) ON DELETE CASCADE,
    dict_id             INTEGER NOT NULL,
    text                TEXT
);

-- ───────────────────────────────────────────────
--  Patients
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              SERIAL PRIMARY KEY,
    external_id     VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

-- ───────────────────────────────────────────────
--  Therapies
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS therapies (
    id              SERIAL PRIMARY KEY,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    machine_id      INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    status          VARCHAR(20)
                        CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    therapy_type    VARCHAR(100),
    kit             VARCHAR(100),
    weight          DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Therapy notes
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS therapy_notes (
    id              SERIAL PRIMARY KEY,
    therapy_id      INTEGER NOT NULL REFERENCES therapies(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Signals catalog
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
    id              SERIAL PRIMARY KEY,
    internal_name   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255),
    unit            VARCHAR(64),
    value_mapping   JSONB,
    deleted_at      TIMESTAMPTZ,
    deleted_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Value mappings (numeric → display name)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS value_mappings (
    id              SERIAL PRIMARY KEY,
    signal_id       INTEGER NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    numeric_value   NUMERIC,
    display_name    VARCHAR(255),
    deleted_at      TIMESTAMPTZ,
    deleted_by      INTEGER REFERENCES users(id)
);

-- ───────────────────────────────────────────────
--  Value mapping audit log
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS value_mapping_audit (
    id              SERIAL PRIMARY KEY,
    value_mapping_id INTEGER NOT NULL,
    action          VARCHAR(20) NOT NULL,
    changed_by      INTEGER NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Readings (telemetry data)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS readings (
    id              SERIAL PRIMARY KEY,
    machine_id      INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    therapy_id      INTEGER REFERENCES therapies(id),
    signal_id       INTEGER REFERENCES signals(id),
    recorded_at     TIMESTAMPTZ,
    raw_value       BIGINT,
    value           DOUBLE PRECISION,
    unit            VARCHAR(64),
    display_label   VARCHAR(255),
    phase           VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────
--  Indexes
-- ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_readings_machine_recorded
    ON readings (machine_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_readings_therapy_signal_time
    ON readings (therapy_id, signal_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_external_id
    ON patients (external_id);

CREATE INDEX IF NOT EXISTS idx_machines_serial_number
    ON machines (serial_number);

CREATE INDEX IF NOT EXISTS idx_software_versions_fingerprint
    ON software_versions (fingerprint);

COMMIT;

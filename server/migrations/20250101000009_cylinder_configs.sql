-- Migration 009: cylinder gauge scale configuration (min/max/step per pressure type)
--
-- Shared across ALL web clients: previously the frontend persisted these in
-- localStorage, so each browser had its own calibration. The defaults below
-- are seeded ON CONFLICT DO NOTHING so the table is never empty but user
-- edits are preserved.

CREATE TABLE IF NOT EXISTS cylinder_configs (
    pressure_type TEXT PRIMARY KEY,
    min_value DOUBLE PRECISION NOT NULL,
    max_value DOUBLE PRECISION NOT NULL,
    step_value DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cylinder_configs (pressure_type, min_value, max_value, step_value) VALUES
    ('arterial', -400, 500, 100),
    ('venous', -400, 300, 100),
    ('tmp', 0, 80, 20),
    ('filter', 0, 500, 100),
    ('effluent', 0, 500, 100)
ON CONFLICT (pressure_type) DO NOTHING;

-- Migration 002: Add unique constraint on signals.internal_name
-- and value_mappings.(signal_id, numeric_value).
--
-- The application layer already treats internal_name as unique.
-- This makes it official at the DB level.
--
-- Idempotent: safe to run multiple times (uses IF NOT EXISTS checks).

-- ── Signals ──────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_signals_internal_name'
    ) THEN
        -- Remove duplicates first (keep the latest by id for each internal_name)
        WITH dupes AS (
            SELECT id, internal_name,
                   ROW_NUMBER() OVER (PARTITION BY internal_name ORDER BY id DESC) AS rn
            FROM signals
        )
        DELETE FROM signals WHERE id IN (
            SELECT id FROM dupes WHERE rn > 1
        );

        -- Now we can safely add the constraint
        ALTER TABLE signals ADD CONSTRAINT uq_signals_internal_name UNIQUE (internal_name);
    END IF;
END;
$$;

-- ── Value mappings ───────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_value_mappings_signal_value'
    ) THEN
        ALTER TABLE value_mappings ADD CONSTRAINT uq_value_mappings_signal_value UNIQUE (signal_id, numeric_value);
    END IF;
END;
$$;

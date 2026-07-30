-- Migration 005: performance indexes for readings queries.
--
-- Adds a composite index for machine_summary (DISTINCT ON signal_id)
-- and therapy_timeseries (ORDER BY recorded_at) queries.

CREATE INDEX IF NOT EXISTS idx_readings_machine_signal_recorded
    ON readings (machine_id, signal_id, recorded_at DESC);

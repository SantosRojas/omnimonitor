-- Migration 006: drop unused phase column from readings
--
-- phase nunca se pobló desde el bridge. therapy_id se mantiene como FK
-- a therapies — el server lo resuelve al persistir.

DROP INDEX IF EXISTS idx_readings_therapy_signal_time;

ALTER TABLE readings
    DROP COLUMN IF EXISTS phase;

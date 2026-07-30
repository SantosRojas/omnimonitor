-- Migration 007: optional patient info fields + end weight on therapies

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS name    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS age     INTEGER,
    ADD COLUMN IF NOT EXISTS email   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE therapies
    ADD COLUMN IF NOT EXISTS end_weight DOUBLE PRECISION;

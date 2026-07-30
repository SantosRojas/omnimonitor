-- Migration 007: optional patient info fields + end weight on therapies
BEGIN;

ALTER TABLE patients
    ADD COLUMN name    VARCHAR(255),
    ADD COLUMN age     INTEGER,
    ADD COLUMN email   VARCHAR(255),
    ADD COLUMN address TEXT;

ALTER TABLE therapies
    ADD COLUMN end_weight DOUBLE PRECISION;

COMMIT;

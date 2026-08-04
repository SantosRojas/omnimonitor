-- Migration 010: enforce at most one open therapy per patient.
--
-- The application closes open therapies before starting a new one, but the
-- data model did not guarantee it: a crash could leave a therapy 'active'
-- and concurrent setups could create duplicates. This migration closes any
-- pre-existing duplicates (keeping the most recent open therapy per patient)
-- and then enforces the invariant with a partial unique index.
--
-- Uniqueness is per patient across all machines: a patient can never have
-- more than one therapy in 'planned' or 'active' at the same time.

UPDATE therapies t
SET status = 'completed', ended_at = NOW()
WHERE t.status IN ('planned', 'active')
  AND t.id NOT IN (
      SELECT DISTINCT ON (patient_id) id
      FROM therapies
      WHERE status IN ('planned', 'active')
      ORDER BY patient_id, created_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_therapies_one_open_per_patient
    ON therapies (patient_id)
    WHERE status IN ('planned', 'active');

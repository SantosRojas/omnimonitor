-- Migration 011: soft-delete audit trail for therapies.
--
-- Therapies are immutable clinical records, so removing one from the history
-- must keep an audit trail: who deleted it, when, and why.

ALTER TABLE therapies
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

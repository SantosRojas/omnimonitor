-- Migration 012: add an optional, unique email address to users.
--
-- Existing rows keep NULL; the UNIQUE constraint (users_email_key) permits
-- multiple NULLs, so the column stays fully optional while preventing two
-- users from sharing a non-NULL address.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

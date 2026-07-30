-- Migration 003: remove unused description column from equivalences

ALTER TABLE equivalences DROP COLUMN IF EXISTS description;

-- Migration 004: Create bridges table for IP-based authentication.
--
-- The bridges table stores pre-registered bridge IPs that are authorized
-- to connect to the WebSocket server. Each bridge is identified by its
-- IP address (IPv4 or IPv6 compatible via VARCHAR(45)).
--
-- Bridges authenticate at connect time by sending Register { ip_address }.
-- The server looks up the IP in this table and returns Registered { bridge_id }
-- or an error if the IP is not found or not authorized.
--
-- Idempotent: safe to run multiple times (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS bridges (
    id            BIGSERIAL PRIMARY KEY,
    ip_address    VARCHAR(45) NOT NULL UNIQUE,
    label         VARCHAR(255),
    authorized    BOOLEAN NOT NULL DEFAULT true,
    status        VARCHAR(20) NOT NULL DEFAULT 'offline',
    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bridges_ip_address ON bridges (ip_address);

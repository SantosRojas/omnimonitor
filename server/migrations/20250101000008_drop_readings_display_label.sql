-- Migration 008: drop unused display_label column from readings
--
-- display_label siempre fue NULL: el bridge manda display_value=None
-- y las señales con value_mappings (estados) no viajan como readings.
-- El histórico resuelve el nombre legible desde signals.display_name.

ALTER TABLE readings
    DROP COLUMN IF EXISTS display_label;

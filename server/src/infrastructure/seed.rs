//! Seed module — populates `signals`, `value_mappings`, and the standalone
//! `equivalences` table from the embedded catalog generated from `data.xlsx`.
//!
//! Run once at server startup after migrations. Safe to run multiple times.
//!
//! # Language selection
//!
//! Set `SEED_LANG=es` in the environment to use Spanish display names.
//! Omit it or set it to anything else to use English (the default).
//!
//! # Refresh (overwrite existing data)
//!
//! By default the seed preserves existing `display_name` values (insert-only for
//! new rows). Set `SEED_REFRESH=true` to force-overwrite all display names with
//! the currently selected language. Do this once after changing `SEED_LANG` or
//! updating `data.xlsx`.

use std::collections::HashMap;

use sqlx::PgPool;
use tracing::info;

use super::seed_data::{SIGNALS, VALUE_MAPPINGS};

/// Returns `true` if `SEED_LANG=es` is set in the environment.
fn use_spanish() -> bool {
    std::env::var("SEED_LANG")
        .ok()
        .as_deref()
        .map(|v| v.eq_ignore_ascii_case("es"))
        .unwrap_or(false)
}

/// Returns `true` if `SEED_REFRESH=true` is set.
fn should_refresh() -> bool {
    std::env::var("SEED_REFRESH")
        .ok()
        .as_deref()
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Pick the display name based on the language setting.
fn display_name(sig: &super::seed_data::SignalSeed) -> &'static str {
    if use_spanish() {
        sig.display_name_es
    } else {
        sig.display_name_en
    }
}

/// Pick the value mapping display name based on the language setting.
fn mapping_display_name(vm: &super::seed_data::ValueMappingSeed) -> &'static str {
    if use_spanish() {
        vm.display_name_es
    } else {
        vm.display_name_en
    }
}

/// Seed all signals, value mappings, and equivalences from the embedded catalog.
pub async fn run(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let lang = if use_spanish() { "es" } else { "en" };
    let refresh = should_refresh();
    info!("[Seed] Language: {}, refresh: {}", lang, refresh);

    // ── PHASE 1: normal seed (insert-only, preserves existing) ──
    seed_insert_only(pool).await?;

    // ── PHASE 2: refresh (overwrite display names when requested) ──
    if refresh {
        refresh_display_names(pool).await?;
    }

    Ok(())
}

/// Insert-only seed: creates missing rows but never overwrites existing data.
/// Uses `ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS` so existing data is
/// preserved. Counts only real inserts.
async fn seed_insert_only(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // ── Signals ──────────────────────────────────────
    let total = SIGNALS.len();
    let mut inserted_sigs = 0u64;

    for sig in SIGNALS {
        let n = sqlx::query(
            "INSERT INTO signals (internal_name, display_name, unit) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (internal_name) DO NOTHING",
        )
        .bind(sig.internal_name)
        .bind(display_name(sig))
        .bind(sig.unit)
        .execute(pool)
        .await?
        .rows_affected();
        inserted_sigs += n;
    }

    info!(
        "[Seed] Signals: {}/{} inserted, {} already existed (unit={})",
        inserted_sigs,
        total,
        total - inserted_sigs as usize,
        SIGNALS.iter().filter(|s| s.unit.is_some()).count(),
    );

    // ── Value Mappings ──────────────────────────────
    let mapping_total = VALUE_MAPPINGS.len();
    let mut inserted_mappings = 0u64;
    let mut signal_cache: HashMap<&str, i64> = HashMap::new();

    for vm in VALUE_MAPPINGS {
        let signal_id = match signal_cache.get(vm.internal_name) {
            Some(&id) => id,
            None => {
                let signal_id: i64 =
                    sqlx::query_scalar("SELECT id FROM signals WHERE internal_name = $1")
                        .bind(vm.internal_name)
                        .fetch_optional(pool)
                        .await?
                        .ok_or_else(|| {
                            format!(
                                "Seed: signal '{}' not found for value mapping",
                                vm.internal_name
                            )
                        })?;
                signal_cache.insert(vm.internal_name, signal_id);
                signal_id
            }
        };

        let n = sqlx::query(
            "INSERT INTO value_mappings (signal_id, numeric_value, display_name) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (signal_id, numeric_value) DO NOTHING",
        )
        .bind(signal_id)
        .bind(vm.numeric_value.to_string())
        .bind(mapping_display_name(vm))
        .execute(pool)
        .await?
        .rows_affected();
        inserted_mappings += n;
    }

    info!(
        "[Seed] Value mappings: {}/{} inserted, {} already existed across {} signal groups",
        inserted_mappings,
        mapping_total,
        mapping_total - inserted_mappings as usize,
        signal_cache.len(),
    );

    // ── Standalone Equivalences ─────────────────────
    let mut inserted_equivs = 0u64;

    for vm in VALUE_MAPPINGS {
        let input_value = format!("{}:{}", vm.internal_name, vm.numeric_value);

        let n = sqlx::query(
            "INSERT INTO equivalences (input_value, output_value) \
             SELECT $1, $2 \
             WHERE NOT EXISTS (SELECT 1 FROM equivalences WHERE input_value = $1)",
        )
        .bind(&input_value)
        .bind(mapping_display_name(vm))
        .execute(pool)
        .await?
        .rows_affected();
        inserted_equivs += n;
    }

    info!(
        "[Seed] Equivalences: {}/{} inserted, {} already existed for EquivalenceConfig",
        inserted_equivs,
        mapping_total,
        mapping_total - inserted_equivs as usize,
    );

    Ok(())
}

/// Refresh phase: force-overwrites all display names with the currently
/// selected language. Runs only when `SEED_REFRESH=true`.
async fn refresh_display_names(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // ── Refresh signals ─────────────────────────────
    for sig in SIGNALS {
        sqlx::query("UPDATE signals SET display_name = $1 WHERE internal_name = $2")
            .bind(display_name(sig))
            .bind(sig.internal_name)
            .execute(pool)
            .await?;
    }

    info!("[Seed] Refreshed {} signal display_names", SIGNALS.len());

    // ── Refresh value mappings ──────────────────────
    // Maps internal_name → signal_id for the UPDATE JOIN
    let mut signal_ids: HashMap<&str, i64> = HashMap::new();
    for sig in SIGNALS {
        let id: Option<i64> =
            sqlx::query_scalar("SELECT id FROM signals WHERE internal_name = $1")
                .bind(sig.internal_name)
                .fetch_optional(pool)
                .await?;
        if let Some(id) = id {
            signal_ids.insert(sig.internal_name, id);
        }
    }

    for vm in VALUE_MAPPINGS {
        if let Some(&signal_id) = signal_ids.get(vm.internal_name) {
            sqlx::query(
                "UPDATE value_mappings SET display_name = $1 WHERE signal_id = $2 AND numeric_value = $3",
            )
            .bind(mapping_display_name(vm))
            .bind(signal_id)
            .bind(vm.numeric_value.to_string())
            .execute(pool)
            .await?;
        }
    }

    info!(
        "[Seed] Refreshed {} value mapping display_names",
        VALUE_MAPPINGS.len()
    );

    // ── Refresh equivalences ────────────────────────
    for vm in VALUE_MAPPINGS {
        let input_value = format!("{}:{}", vm.internal_name, vm.numeric_value);
        sqlx::query("UPDATE equivalences SET output_value = $1 WHERE input_value = $2")
            .bind(mapping_display_name(vm))
            .bind(&input_value)
            .execute(pool)
            .await?;
    }

    info!(
        "[Seed] Refreshed {} equivalence entries",
        VALUE_MAPPINGS.len()
    );

    Ok(())
}

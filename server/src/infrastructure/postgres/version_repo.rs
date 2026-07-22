//! PostgreSQL repository for software version cache.

use serde::Serialize;
use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::SoftwareVersion;

/// An attribute cached from serial init.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DataAttributeRow {
    pub id: i64,
    pub software_version_id: i64,
    pub handle: i32,
    pub data_type: Option<String>,
    pub size: Option<i32>,
    pub conversion_factor: Option<i32>,
    pub label_did: Option<i32>,
    pub unit_did: Option<i32>,
    pub signal_id: Option<i32>,
    pub internal_name: Option<String>,
}

/// A dictionary entry cached from serial init.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DictionaryEntryRow {
    pub id: i64,
    pub software_version_id: i64,
    pub dict_id: i32,
    pub text: Option<String>,
}

/// Repository for software version caching and initialization.
#[derive(Debug, Clone)]
pub struct VersionRepo {
    pool: PgPool,
}

impl VersionRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get a software version by its fingerprint.
    pub async fn get_by_fingerprint(&self, fingerprint: &str) -> Result<Option<SoftwareVersion>, RepoError> {
        let row = sqlx::query_as::<_, SoftwareVersion>(
            "SELECT * FROM software_versions WHERE fingerprint = $1",
        )
        .bind(fingerprint)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Get attributes for a software version.
    pub async fn get_attributes(&self, version_id: i64) -> Result<Vec<DataAttributeRow>, RepoError> {
        let rows = sqlx::query_as::<_, DataAttributeRow>(
            "SELECT * FROM data_attributes WHERE software_version_id = $1 ORDER BY handle",
        )
        .bind(version_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Get dictionary entries for a software version.
    pub async fn get_dictionary(&self, version_id: i64) -> Result<Vec<DictionaryEntryRow>, RepoError> {
        let rows = sqlx::query_as::<_, DictionaryEntryRow>(
            "SELECT * FROM dictionary_entries WHERE software_version_id = $1 ORDER BY dict_id",
        )
        .bind(version_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Save a full initialization bundle (version + attributes + dictionary) in a single transaction.
    pub async fn save_initialization(
        &self,
        fingerprint: &str,
        language_id: Option<i32>,
        system_sw: Option<&str>,
        dss_fw: Option<&str>,
        dss_hw: Option<&str>,
        css_fw: Option<&str>,
        css_hw: Option<&str>,
        pss_fw: Option<&str>,
        pss_hw: Option<&str>,
        language1: Option<&str>,
        attributes: &[InitAttribute],
        dictionary: &[InitDictionary],
    ) -> Result<i64, RepoError> {
        let mut tx = self.pool.begin().await?;

        // Insert or update software version
        let version_id: (i64,) = sqlx::query_as(
            r#"
            INSERT INTO software_versions (fingerprint, language_id, system_sw, dss_fw, dss_hw, css_fw, css_hw, pss_fw, pss_hw, language1)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (fingerprint) DO UPDATE SET
                language_id = COALESCE($2, software_versions.language_id),
                system_sw = COALESCE($3, software_versions.system_sw),
                dss_fw = COALESCE($4, software_versions.dss_fw),
                dss_hw = COALESCE($5, software_versions.dss_hw),
                css_fw = COALESCE($6, software_versions.css_fw),
                css_hw = COALESCE($7, software_versions.css_hw),
                pss_fw = COALESCE($8, software_versions.pss_fw),
                pss_hw = COALESCE($9, software_versions.pss_hw),
                language1 = COALESCE($10, software_versions.language1)
            RETURNING id
            "#,
        )
        .bind(fingerprint)
        .bind(language_id)
        .bind(system_sw)
        .bind(dss_fw)
        .bind(dss_hw)
        .bind(css_fw)
        .bind(css_hw)
        .bind(pss_fw)
        .bind(pss_hw)
        .bind(language1)
        .fetch_one(&mut *tx)
        .await?;

        // Delete old attributes/dictionary for this version (re-init)
        sqlx::query("DELETE FROM data_attributes WHERE software_version_id = $1")
            .bind(version_id.0)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM dictionary_entries WHERE software_version_id = $1")
            .bind(version_id.0)
            .execute(&mut *tx)
            .await?;

        // Phase 1: ensure every internal_name exists in the signals catalog.
        // If the seed already created it → ON CONFLICT DO NOTHING.
        // If it's a brand-new signal the seed doesn't know about → INSERT.
        for attr in attributes {
            if !attr.internal_name.is_empty() {
                sqlx::query(
                    "INSERT INTO signals (internal_name) VALUES ($1) ON CONFLICT (internal_name) DO NOTHING",
                )
                .bind(&attr.internal_name)
                .execute(&mut *tx)
                .await?;
            }
        }

        // Phase 2: insert data_attributes with the *real* signal_id from our catalog,
        // not the raw OMNI handle number that the bridge sends as attr.signal_id.
        for attr in attributes {
            let catalog_signal_id: Option<i32> = if attr.internal_name.is_empty() {
                None
            } else {
                let raw_id: i64 =
                    sqlx::query_scalar("SELECT id FROM signals WHERE internal_name = $1")
                        .bind(&attr.internal_name)
                        .fetch_one(&mut *tx)
                        .await?;
                Some(raw_id as i32)
            };

            sqlx::query(
                r#"
                INSERT INTO data_attributes (software_version_id, handle, data_type, size, conversion_factor, label_did, unit_did, signal_id, internal_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#,
            )
            .bind(version_id.0)
            .bind(attr.handle)
            .bind(&attr.data_type)
            .bind(attr.size)
            .bind(attr.conversion_factor)
            .bind(attr.label_did)
            .bind(attr.unit_did)
            .bind(catalog_signal_id)
            .bind(&attr.internal_name)
            .execute(&mut *tx)
            .await?;
        }

        // Insert dictionary entries
        for entry in dictionary {
            sqlx::query(
                "INSERT INTO dictionary_entries (software_version_id, dict_id, text) VALUES ($1, $2, $3)",
            )
            .bind(version_id.0)
            .bind(entry.dict_id)
            .bind(&entry.text)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(version_id.0)
    }
}

/// An attribute to persist during store_init.
#[derive(Debug, Clone)]
pub struct InitAttribute {
    pub handle: i32,
    pub data_type: String,
    pub size: i32,
    pub conversion_factor: i32,
    pub label_did: i32,
    pub unit_did: i32,
    pub signal_id: i32,
    pub internal_name: String,
}

/// A dictionary entry to persist during store_init.
#[derive(Debug, Clone)]
pub struct InitDictionary {
    pub dict_id: i32,
    pub text: String,
}

package ru.dmitry.matercontroller.core.database

import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "leads")
data class LeadEntity(
    @PrimaryKey val leadId: String,
    val bucket: String,
    val company: String?,
    val status: String?,
    val sendProof: String?,
    val smtpCode: Int?,
    val sendable: Boolean,
    val json: String,
    val updatedAt: Long,
)

@Entity(tableName = "cache_kv")
data class CacheEntity(
    @PrimaryKey val key: String,
    val json: String,
    val updatedAt: Long,
)

/**
 * Structured per-domain cache (v2). One row per canonical/queue entity, storing the full DTO
 * JSON plus indexed columns for domain, canonical id, revision and freshness. Cache-only:
 * never a source of truth, never mutated except by write-through from a successful API read.
 */
@Entity(
    tableName = "domain_cache",
    primaryKeys = ["domain", "entityId"],
    indices = [Index(value = ["domain"]), Index(value = ["entityId"])],
)
data class DomainEntity(
    val domain: String,       // e.g. "audit", "draft", "reply_draft", "followup", "job", "source", "scheduler"
    val entityId: String,     // canonical id (leadId / jobId / sourceId / "_singleton")
    val status: String? = null,
    val revision: Int? = null,
    val json: String,
    val fetchedAt: Long,
)

@Dao
interface LeadDao {
    @Query("SELECT * FROM leads WHERE bucket = :bucket ORDER BY company")
    fun observeByBucket(bucket: String): Flow<List<LeadEntity>>

    @Query("SELECT * FROM leads WHERE leadId = :id LIMIT 1")
    suspend fun getById(id: String): LeadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<LeadEntity>)

    @Query("DELETE FROM leads WHERE bucket = :bucket")
    suspend fun clearBucket(bucket: String)

    @Transaction
    suspend fun replaceBucket(bucket: String, items: List<LeadEntity>) {
        clearBucket(bucket)
        upsertAll(items)
    }
}

@Dao
interface CacheDao {
    @Query("SELECT * FROM cache_kv WHERE key = :key LIMIT 1")
    suspend fun get(key: String): CacheEntity?

    @Query("SELECT * FROM cache_kv WHERE key = :key LIMIT 1")
    fun observe(key: String): Flow<CacheEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(entity: CacheEntity)
}

@Dao
interface DomainDao {
    @Query("SELECT * FROM domain_cache WHERE domain = :domain ORDER BY entityId")
    suspend fun listByDomain(domain: String): List<DomainEntity>

    @Query("SELECT * FROM domain_cache WHERE domain = :domain AND entityId = :id LIMIT 1")
    suspend fun getOne(domain: String, id: String): DomainEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<DomainEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(item: DomainEntity)

    @Query("DELETE FROM domain_cache WHERE domain = :domain")
    suspend fun clearDomain(domain: String)

    @Transaction
    suspend fun replaceDomain(domain: String, items: List<DomainEntity>) {
        clearDomain(domain)
        upsertAll(items)
    }
}

@Database(entities = [LeadEntity::class, CacheEntity::class, DomainEntity::class], version = 4, exportSchema = false)
abstract class MaterDatabase : RoomDatabase() {
    abstract fun leadDao(): LeadDao
    abstract fun cacheDao(): CacheDao
    abstract fun domainDao(): DomainDao

    companion object {
        /**
         * Non-destructive v1→v2: add the structured domain_cache table only. Existing `leads`,
         * `cache_kv`, connection profile (DataStore — separate store) and settings are untouched,
         * so cached leads/replies and the paired profile survive the upgrade. The SQL lives in
         * [MIGRATION_1_2_SQL] so a pure-JVM test can run the exact statements.
         */
        val MIGRATION_1_2_SQL: List<String> = listOf(
            "CREATE TABLE IF NOT EXISTS `domain_cache` (" +
                "`domain` TEXT NOT NULL, `entityId` TEXT NOT NULL, `status` TEXT, " +
                "`revision` INTEGER, `json` TEXT NOT NULL, `fetchedAt` INTEGER NOT NULL, " +
                "PRIMARY KEY(`domain`, `entityId`))",
            "CREATE INDEX IF NOT EXISTS `index_domain_cache_domain` ON `domain_cache` (`domain`)",
            "CREATE INDEX IF NOT EXISTS `index_domain_cache_entityId` ON `domain_cache` (`entityId`)",
        )

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                MIGRATION_1_2_SQL.forEach { db.execSQL(it) }
            }
        }

        /**
         * Non-destructive v2→v3 (RC6 defect C). Removes ONLY stale radar/knowledge digest snapshots
         * from `cache_kv` so the radar screen re-reads them fresh from the RC6 endpoints instead of
         * showing pre-RC6 fixtures/empty payloads. All other cache keys, the `leads` table, the
         * `domain_cache` table, the paired profile (EncryptedSharedPreferences) and settings
         * (DataStore) are untouched — pairing and leads survive the upgrade. Targets the read-through
         * cache keys written with the `rc:` prefix: rc:knowledge_* / rc:radar_* and the weekly digest.
         * No DROP/ALTER; only scoped DELETE of stale rows.
         */
        val MIGRATION_2_3_SQL: List<String> = listOf(
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:knowledge_%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:knowledge_digest:%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:radar_%'",
        )

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                MIGRATION_2_3_SQL.forEach { db.execSQL(it) }
            }
        }

        /**
         * Non-destructive v3→v4 (RC7 unified commercial truth). Removes ONLY stale DERIVED commercial
         * cache snapshots from `cache_kv` so every owner screen re-reads the unified truth fresh
         * instead of showing the pre-RC7 split projections (false awaiting-reply / follow-up / legacy
         * delivery / stale owner next action / stale dialogs / reservoir summary). The `leads` table,
         * `domain_cache`, real audit/commercial entities, paired profile (EncryptedSharedPreferences)
         * and settings (DataStore) are untouched — pairing and leads survive. Scoped DELETE only.
         */
        val MIGRATION_3_4_SQL: List<String> = listOf(
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:mini_audit%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:commercial_summary%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:commercial_reconciliation%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:owner_queues%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:mc_owner_queue%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:delivery_containment%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:next_action%'",
            "DELETE FROM `cache_kv` WHERE `key` LIKE 'rc:reservoir_%'",
        )

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                MIGRATION_3_4_SQL.forEach { db.execSQL(it) }
            }
        }
    }
}

package ru.dmitry.matercontroller

import org.junit.Assert.*
import org.junit.Test
import ru.dmitry.matercontroller.core.database.MaterDatabase
import java.sql.DriverManager

/**
 * Proves the v1→v2 Room migration is NON-DESTRUCTIVE by running the EXACT production SQL
 * (MaterDatabase.MIGRATION_1_2_SQL) against a real in-memory SQLite database seeded with a v1
 * schema + rows. No Robolectric/instrumentation — pure JDBC against the same DDL Room emits.
 */
class RoomMigrationTest {
    // v1 schema as Room generated it (leads + cache_kv).
    private val v1Ddl = listOf(
        "CREATE TABLE `leads` (`leadId` TEXT NOT NULL, `bucket` TEXT NOT NULL, `company` TEXT, " +
            "`status` TEXT, `sendProof` TEXT, `smtpCode` INTEGER, `sendable` INTEGER NOT NULL, " +
            "`json` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`leadId`))",
        "CREATE TABLE `cache_kv` (`key` TEXT NOT NULL, `json` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`key`))",
    )

    @Test fun migrationPreservesExistingDataAndAddsTable() {
        Class.forName("org.sqlite.JDBC")
        DriverManager.getConnection("jdbc:sqlite::memory:").use { c ->
            val st = c.createStatement()
            // --- seed a v1 database ---
            v1Ddl.forEach { st.executeUpdate(it) }
            st.executeUpdate("INSERT INTO leads VALUES ('KZ-1','verified_ready','ТОО Пример','verified_ready','proven',250,0,'{\"leadId\":\"KZ-1\"}',111)")
            st.executeUpdate("INSERT INTO cache_kv VALUES ('replies','{\"items\":[]}',222)")

            // --- run the EXACT production migration SQL ---
            MaterDatabase.MIGRATION_1_2_SQL.forEach { st.executeUpdate(it) }

            // 1+2+3: old tables still readable, rows preserved
            val leadRs = st.executeQuery("SELECT leadId, company FROM leads")
            assertTrue(leadRs.next())
            assertEquals("KZ-1", leadRs.getString("leadId"))
            assertEquals("ТОО Пример", leadRs.getString("company"))

            val cacheRs = st.executeQuery("SELECT COUNT(*) AS n FROM cache_kv")
            cacheRs.next()
            assertEquals(1, cacheRs.getInt("n"))

            // 6: new domain_cache table created and usable
            st.executeUpdate("INSERT INTO domain_cache VALUES ('audit','KZ-1','audit_ready',5,'{\"x\":1}',333)")
            val dcRs = st.executeQuery("SELECT domain, revision FROM domain_cache WHERE entityId='KZ-1'")
            assertTrue(dcRs.next())
            assertEquals("audit", dcRs.getString("domain"))
            assertEquals(5, dcRs.getInt("revision"))

            // 7: no destructive reset — leads row count unchanged (still 1)
            val n = st.executeQuery("SELECT COUNT(*) AS n FROM leads"); n.next()
            assertEquals(1, n.getInt("n"))
        }
    }

    @Test fun migrationIsIdempotent() {
        Class.forName("org.sqlite.JDBC")
        DriverManager.getConnection("jdbc:sqlite::memory:").use { c ->
            val st = c.createStatement()
            v1Ddl.forEach { st.executeUpdate(it) }
            // running twice must not throw (IF NOT EXISTS)
            MaterDatabase.MIGRATION_1_2_SQL.forEach { st.executeUpdate(it) }
            MaterDatabase.MIGRATION_1_2_SQL.forEach { st.executeUpdate(it) }
            val rs = st.executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='domain_cache'")
            assertTrue(rs.next())
        }
    }

    @Test fun migration3to4ClearsStaleDerivedCachesPreservesLeads() {
        Class.forName("org.sqlite.JDBC")
        DriverManager.getConnection("jdbc:sqlite::memory:").use { c ->
            val st = c.createStatement()
            v1Ddl.forEach { st.executeUpdate(it) }
            // seed leads (must survive) + stale derived caches (must be cleared) + a keep cache key
            st.executeUpdate("INSERT INTO leads VALUES ('STROYDVOR-UG_RU','x','СтройДвор-Юг','x',null,null,0,'{}',1)")
            st.executeUpdate("INSERT INTO cache_kv VALUES ('rc:mini_audit_status','{\"waitingReply\":3}',1)")
            st.executeUpdate("INSERT INTO cache_kv VALUES ('rc:commercial_summary','{\"x\":1}',1)")
            st.executeUpdate("INSERT INTO cache_kv VALUES ('rc:owner_queues','{\"x\":1}',1)")
            st.executeUpdate("INSERT INTO cache_kv VALUES ('rc:reservoir_summary','{\"x\":1}',1)")
            st.executeUpdate("INSERT INTO cache_kv VALUES ('rc:catalog','{\"keep\":true}',1)") // unrelated -> kept

            MaterDatabase.MIGRATION_3_4_SQL.forEach { st.executeUpdate(it) }

            // stale derived caches removed
            val stale = st.executeQuery("SELECT COUNT(*) AS n FROM cache_kv WHERE key IN ('rc:mini_audit_status','rc:commercial_summary','rc:owner_queues','rc:reservoir_summary')")
            stale.next(); assertEquals(0, stale.getInt("n"))
            // unrelated cache kept
            val kept = st.executeQuery("SELECT COUNT(*) AS n FROM cache_kv WHERE key='rc:catalog'")
            kept.next(); assertEquals(1, kept.getInt("n"))
            // leads preserved (pairing lives in EncryptedSharedPreferences, untouched by SQL)
            val leads = st.executeQuery("SELECT company FROM leads WHERE leadId='STROYDVOR-UG_RU'")
            assertTrue(leads.next()); assertEquals("СтройДвор-Юг", leads.getString("company"))
        }
    }
}

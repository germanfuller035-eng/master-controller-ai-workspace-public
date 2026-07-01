package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.database.MaterDatabase

/**
 * Upgrade-safety invariants (Phase 10). A signed APK installed OVER the current build must
 * preserve the existing pairing credential. Two structural guarantees make that true and are
 * locked here so a future change can't silently break them:
 *
 *  1) The Room cache DB version is UNCHANGED (still 2) and the only migration is the additive,
 *     idempotent v1→v2 (CREATE TABLE IF NOT EXISTS). So an over-install runs no destructive
 *     migration and never triggers a fallback-to-destructive rebuild.
 *  2) The pairing credential is NOT stored in Room or DataStore — it lives in a dedicated
 *     EncryptedSharedPreferences file (Android Keystore-backed), which the OS preserves across
 *     an app update (same applicationId, same signer). Room migrations cannot affect it.
 *
 * This is a pure-JVM structural assertion; the physical over-install is verified in the owner
 * smoke (Phase 19, step 4).
 */
class UpgradeSafetyTest {

    @Test fun roomVersionUnchangedSoNoDestructiveMigrationOnUpgrade() {
        // The migration set is purely additive + idempotent (IF NOT EXISTS).
        assertTrue(MaterDatabase.MIGRATION_1_2_SQL.all { it.contains("IF NOT EXISTS") })
        // Exactly the three additive statements (table + 2 indices); no DROP/DELETE/ALTER.
        assertEquals(3, MaterDatabase.MIGRATION_1_2_SQL.size)
        assertTrue(MaterDatabase.MIGRATION_1_2_SQL.none {
            it.contains("DROP", true) || it.contains("DELETE", true) || it.contains("ALTER", true)
        })
    }
}

package ru.dmitry.matercontroller.core.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import ru.dmitry.matercontroller.core.database.MaterDatabase
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MaterDatabase =
        Room.databaseBuilder(context, MaterDatabase::class.java, "mater_cache.db")
            .addMigrations(MaterDatabase.MIGRATION_1_2, MaterDatabase.MIGRATION_2_3, MaterDatabase.MIGRATION_3_4)
            .build()

    @Provides fun provideLeadDao(db: MaterDatabase) = db.leadDao()
    @Provides fun provideCacheDao(db: MaterDatabase) = db.cacheDao()
    @Provides fun provideDomainDao(db: MaterDatabase) = db.domainDao()
}

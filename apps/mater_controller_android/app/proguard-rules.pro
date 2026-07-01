# Mater Controller ProGuard rules
-keepattributes *Annotation*, Signature, Exception
# kotlinx.serialization
-keepclassmembers @kotlinx.serialization.Serializable class ** { *; }
-keep,includedescriptorclasses class ru.dmitry.matercontroller.**$$serializer { *; }
-keepclassmembers class ru.dmitry.matercontroller.** { *** Companion; }
# Retrofit / OkHttp
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-keep class kotlin.coroutines.Continuation
# Room
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# Tink / security-crypto references errorprone annotations not on the runtime classpath
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-keep class com.google.crypto.tink.** { *; }
# Tink optional KeysDownloader pulls google-http-client / joda-time we don't use
-dontwarn com.google.api.client.http.**
-dontwarn org.joda.time.**

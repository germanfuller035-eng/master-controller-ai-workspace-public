package ru.dmitry.matercontroller.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val BrandBlue = Color(0xFF2D6CDF)
private val BrandBlueLight = Color(0xFF9B6CFF)
private val OwnerGreen = Color(0xFF2E7D32)
private val OwnerGreenDark = Color(0xFF8ED29A)
private val OwnerAmber = Color(0xFFB26A00)
private val OwnerAmberDark = Color(0xFFFFCA75)
private val OwnerRed = Color(0xFFB3261E)
private val OwnerRedDark = Color(0xFFFFB4AB)

private val DarkColors = darkColorScheme(
    primary = BrandBlueLight,
    onPrimary = Color(0xFF120735),
    secondary = OwnerGreenDark,
    onSecondary = Color(0xFF04210B),
    tertiary = OwnerAmberDark,
    onTertiary = Color(0xFF2A1700),
    error = OwnerRedDark,
    background = Color(0xFF050505),
    surface = Color(0xFF151515),
    surfaceVariant = Color(0xFF292929),
    primaryContainer = Color(0xFF1F1F1F),
    onPrimaryContainer = Color(0xFFF5F5F5),
    secondaryContainer = Color(0xFF123829),
    onSecondaryContainer = Color(0xFFE6FFF4),
    tertiaryContainer = Color(0xFF3A2A08),
    onTertiaryContainer = Color(0xFFFFF0C2),
    errorContainer = Color(0xFF3D1515),
    onErrorContainer = Color(0xFFFFD7D7),
    outline = Color(0xFF333333),
    onBackground = Color(0xFFF5F5F5),
    onSurface = Color(0xFFF5F5F5),
    onSurfaceVariant = Color(0xFFB7B7B7),
)

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    secondary = OwnerGreen,
    onSecondary = Color.White,
    tertiary = OwnerAmber,
    onTertiary = Color.White,
    error = OwnerRed,
    background = Color(0xFFF7F9FC),
    surface = Color.White,
    surfaceVariant = Color(0xFFEAEFF6),
    onBackground = Color(0xFF12181F),
    onSurface = Color(0xFF12181F),
)

private val OwnerTypography = Typography(
    headlineSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp),
)

private val OwnerShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
)

enum class ThemeMode { SYSTEM, DARK, LIGHT }

@Composable
fun MaterControllerTheme(themeMode: ThemeMode = ThemeMode.DARK, content: @Composable () -> Unit) {
    val dark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
    }
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography = OwnerTypography,
        shapes = OwnerShapes,
        content = content,
    )
}

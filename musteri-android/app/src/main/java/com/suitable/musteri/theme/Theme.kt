package com.suitable.musteri.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

fun String.toColor(): Color {
    return try {
        Color(android.graphics.Color.parseColor(this))
    } catch (e: Exception) {
        Color(0xFF000000) // Default fallback
    }
}

val Slate900 = Color(0xFF0F172A)
val Slate800 = Color(0xFF1E293B)
val LightSurface = Color(0xFFF8FAFC)

private val DarkColorScheme = darkColorScheme(
    primary = Purple80,
    secondary = PurpleGrey80,
    tertiary = Pink80,
    background = Slate900,
    surface = Slate800,
    onPrimary = Color.White,
    onBackground = Color.White,
    onSurface = Color.White
)

private val LightColorScheme = lightColorScheme(
    primary = Purple40,
    secondary = PurpleGrey40,
    tertiary = Pink40,
    background = LightSurface,
    surface = Color.White,
    onPrimary = Color.White,
    onBackground = Slate900,
    onSurface = Slate900
)

@Composable
fun MusteriAppTheme(
  brandColorHex: String? = null,
  darkTheme: Boolean = isSystemInDarkTheme(),
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val brandColor = brandColorHex?.toColor()

  val baseColorScheme =
    when {
      dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        val context = LocalContext.current
        if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
      }
      darkTheme -> DarkColorScheme
      else -> LightColorScheme
    }

  val colorScheme = if (brandColor != null) {
      baseColorScheme.copy(primary = brandColor, onPrimary = Color.White)
  } else {
      baseColorScheme
  }

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}

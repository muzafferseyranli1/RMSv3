package com.suitable.kiosk.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val KioskColorScheme = darkColorScheme(
    primary          = Color(0xFF6C63FF),
    onPrimary        = Color.White,
    secondary        = Color(0xFF03DAC6),
    onSecondary      = Color.Black,
    background       = Color(0xFF0A0A14),
    onBackground     = Color.White,
    surface          = Color(0xFF1E1E32),
    onSurface        = Color.White,
    error            = Color(0xFFFF6B6B),
    onError          = Color.White,
)

@Composable
fun KioskTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KioskColorScheme,
        content = content,
    )
}

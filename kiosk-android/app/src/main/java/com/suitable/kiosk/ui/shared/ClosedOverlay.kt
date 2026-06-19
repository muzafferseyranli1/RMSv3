package com.suitable.kiosk.ui.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ClosedOverlay() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.92f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(40.dp),
        ) {
            Text("🕐", fontSize = 64.sp)
            Spacer(Modifier.height(20.dp))
            Text(
                "Şu an kapalıyız",
                color = Color(0xFFEEEEFF),
                fontSize = 28.sp,
                fontWeight = FontWeight.Black,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Çalışma saatlerimizde tekrar bekleriz.",
                color = Color(0xFF9090C0),
                fontSize = 15.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

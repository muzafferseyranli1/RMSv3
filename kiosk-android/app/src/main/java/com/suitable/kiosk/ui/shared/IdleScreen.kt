package com.suitable.kiosk.ui.shared

import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.google.gson.JsonObject

@Composable
fun IdleScreen(
    branchName: String,
    settings: JsonObject?,
    baseUrl: String,
    onStart: () -> Unit,
) {
    val idleTitle = settings?.get("idle_title")?.asString ?: "HOŞ GELDİNİZ!"
    val idleSubtitle = settings?.get("idle_subtitle")?.asString ?: "Sipariş vermek için ekrana dokunun"
    val idleImg = settings?.get("idle_background_image")?.asString
        ?: settings?.get("kiosk_bg_image")?.asString
    val kioskLogo = settings?.get("kiosk_logo_url")?.asString

    val resolvedImgUrl = remember(idleImg, baseUrl) {
        if (!idleImg.isNullOrBlank()) {
            if (idleImg.startsWith("http://") || idleImg.startsWith("https://") || idleImg.startsWith("data:")) {
                idleImg
            } else {
                "${baseUrl.trimEnd('/')}/${idleImg.trimStart('/')}"
            }
        } else null
    }

    val resolvedLogoUrl = remember(kioskLogo, baseUrl) {
        if (!kioskLogo.isNullOrBlank()) {
            if (kioskLogo.startsWith("http://") || kioskLogo.startsWith("https://") || kioskLogo.startsWith("data:")) {
                kioskLogo
            } else {
                "${baseUrl.trimEnd('/')}/${kioskLogo.trimStart('/')}"
            }
        } else null
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .clickable(onClick = onStart)
    ) {
        // Arka plan görseli
        if (resolvedImgUrl != null) {
            AsyncImage(
                model = resolvedImgUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            // Görsel yoksa koyu gradyan fallback
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xFF2A1F1D), Color(0xFF0F0E0C))
                        )
                    )
            )
        }

        // Koyu gradyan overlay (yazıların okunması için)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.25f),
                            Color.Black.copy(alpha = 0.45f),
                            Color.Black.copy(alpha = 0.92f)
                        )
                    )
                )
        )

        // İçerik yerleşimi
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Üst kısım: Şube adı
            Column {
                Text(
                    text = "ŞUBE: ${branchName.uppercase()}",
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp
                )
                Spacer(Modifier.height(12.dp))
                // Yuvarlak logo / görsel (opsiyonel)
                if (resolvedLogoUrl != null) {
                    AsyncImage(
                        model = resolvedLogoUrl,
                        contentDescription = "Kiosk Logo",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .size(74.dp)
                            .clip(RoundedCornerShape(8.dp))
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White.copy(alpha = 0.1f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("🍔", fontSize = 28.sp)
                    }
                }
            }

            // Alt kısım: Başlık, alt başlık ve BAŞLAT butonu
            Column {
                Text(
                    text = idleTitle.uppercase(),
                    color = Color.White,
                    fontSize = 38.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = 44.sp
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = idleSubtitle,
                    color = Color.White.copy(alpha = 0.75f),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(Modifier.height(28.dp))
                // BAŞLAT butonu
                Box(
                    modifier = Modifier
                        .size(110.dp)
                        .clip(CircleShape)
                        .background(Color.White)
                        .clickable(onClick = onStart),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "BAŞLAT",
                        color = Color.Black,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }
    }
}

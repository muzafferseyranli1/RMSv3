package com.suitable.musteri.ui.main

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo

data class CouponModel(
    val id: String,
    val title: String,
    val benefit: String,
    val code: String,
    val expiry: String,
    val gradientColors: List<Color>
)

val sampleCoupons = listOf(
    CouponModel("1", "KAHVE HEDİYE KAMPANYASI", "HEDİYE", "FREECOFFEE", "15 Haz 2026", listOf(Color(0xFFEC4899), Color(0xFF3B82F6))),
    CouponModel("2", "HAFTA SONU %50 İNDİRİM", "%50", "WEEKEND50", "20 Haz 2026", listOf(Color(0xFFFDE047), Color(0xFFDC2626))),
    CouponModel("3", "İLK SİPARİŞE 50 TL", "50TL", "WELCOME50", "Süresiz geçerlidir", listOf(Color(0xFF10B981), Color(0xFF06B6D4))),
    CouponModel("4", "DOĞUM GÜNÜ PASTASI", "HEDİYE", "BDAYCAKE", "31 Tem 2026", listOf(Color(0xFFA855F7), Color(0xFFEC4899)))
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouponsScreen(
    config: AppConfig? = null,
    customerInfo: CustomerInfo? = null,
    onNavigate: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    var activatedCoupons by remember { mutableStateOf(setOf<String>()) }
    val view = LocalView.current

    AppScaffold(config = config, customerInfo = customerInfo, onNavigate = onNavigate) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
                .windowInsetsPadding(WindowInsets.statusBars)
        ) {
            // Top Bar with Back Button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B))
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { onNavigate("home") }) {
                    Icon(
                        Icons.Default.ArrowBack,
                        contentDescription = "Geri",
                        tint = Color.White
                    )
                }
                Text(
                    text = "Kampanyalar",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(sampleCoupons) { coupon ->
                    val isActivated = activatedCoupons.contains(coupon.id)
                    CouponCard(
                        benefitText = coupon.benefit,
                        title = coupon.title,
                        code = coupon.code,
                        expiry = coupon.expiry,
                        gradientColors = coupon.gradientColors,
                        isActivated = isActivated,
                        onClick = {
                            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            activatedCoupons = if (isActivated) {
                                activatedCoupons - coupon.id
                            } else {
                                activatedCoupons + coupon.id
                            }
                        }
                    )
                }
            }
        }
    }
}

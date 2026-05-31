package com.suitable.musteri.ui.main

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp

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

@Composable
fun CouponsScreen(
    modifier: Modifier = Modifier
) {
    var activatedCoupons by remember { mutableStateOf(setOf<String>()) }
    val view = LocalView.current

    LazyColumn(
        modifier = modifier.fillMaxSize(),
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

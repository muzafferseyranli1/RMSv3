package com.suitable.kiosk.ui.tablet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.kiosk.data.model.MenuLoadState
import com.suitable.kiosk.ui.KioskDataViewModel

/**
 * Tablet modu — YER TUTUCU
 *
 * Faz 4'te tam menü/sepet/ödeme UI'ı buraya gelecek.
 */
@Composable
fun KioskTabletScreen(
    stationCode: String,
    viewModel: KioskDataViewModel,
    onSecretUnlock: () -> Unit,
) {
    val menuState by viewModel.menuState.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A0A14)),
        contentAlignment = Alignment.Center,
    ) {
        when (menuState) {
            is MenuLoadState.Loading -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFF6C63FF))
                    Spacer(Modifier.height(16.dp))
                    Text("Menü yükleniyor…", color = Color(0xFF9090C0), fontSize = 15.sp)
                }
            }
            is MenuLoadState.Ready -> {
                val data = (menuState as MenuLoadState.Ready).data
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("📱 Tablet Modu", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text("İstasyon: $stationCode", color = Color(0xFF9090C0), fontSize = 15.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("${data.categories.size} kategori · ${data.items.size} ürün yüklendi", color = Color(0xFF5555AA), fontSize = 13.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("Faz 4'te tam menü ekranı burada görünecek.", color = Color(0xFF444466), fontSize = 12.sp)
                }
            }
            is MenuLoadState.Offline -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("📡 Bağlantı Yok", color = Color(0xFFFF6B6B), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text("İnternet bağlantısı kontrol edin.", color = Color(0xFF9090C0), fontSize = 14.sp)
                }
            }
            is MenuLoadState.Error -> {
                val msg = (menuState as MenuLoadState.Error).message
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Hata", color = Color(0xFFFF6B6B), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(msg, color = Color(0xFF9090C0), fontSize = 13.sp)
                }
            }
        }
    }
}

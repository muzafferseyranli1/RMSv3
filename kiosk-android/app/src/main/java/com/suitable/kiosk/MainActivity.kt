package com.suitable.kiosk

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.suitable.kiosk.data.KioskRepository
import com.suitable.kiosk.data.model.KioskMode
import com.suitable.kiosk.prefs.KioskPrefs
import com.suitable.kiosk.ui.KioskDataViewModel
import com.suitable.kiosk.ui.bigscreen.KioskBigScreen
import com.suitable.kiosk.ui.setup.PairingScreen
import com.suitable.kiosk.ui.setup.PairingViewModel
import com.suitable.kiosk.ui.tablet.KioskTabletScreen
import com.suitable.kiosk.ui.theme.KioskTheme

class MainActivity : ComponentActivity() {

    private lateinit var prefs: KioskPrefs
    private lateinit var repository: KioskRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        prefs = KioskPrefs(this)
        repository = KioskRepository.create(prefs.getApiUrl())

        // ─── Kiosk lockdown: ekran sürekli açık ─────────────────────────────
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // ─── Ekran yönünü başlangıçta ayarla ────────────────────────────────
        applyOrientationForMode(prefs.getKioskMode())

        // ─── Immersive mode (geri/home butonu gizli) ─────────────────────────
        setImmersiveMode()

        setContent {
            KioskTheme {
                KioskApp(
                    prefs = prefs,
                    repository = repository,
                    onModeChanged = { mode -> applyOrientationForMode(mode) },
                )
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Bildirim çekmecesi veya başka uygulama kapatılınca immersive'e geri dön
        if (hasFocus) setImmersiveMode()
    }

    // ─── Yardımcılar ─────────────────────────────────────────────────────────

    private fun setImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )
    }

    private fun applyOrientationForMode(mode: KioskMode?) {
        requestedOrientation = when (mode) {
            KioskMode.BIG_SCREEN -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            KioskMode.TABLET     -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
            null                 -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT  // Eşleme ekranı
        }
    }
}

// ─── Uygulama navigasyonu ─────────────────────────────────────────────────────

@Composable
private fun KioskApp(
    prefs: KioskPrefs,
    repository: KioskRepository,
    onModeChanged: (KioskMode) -> Unit,
) {
    // Başlangıçta eşleme yapılmış mı?
    var currentMode by remember { mutableStateOf(if (prefs.isPaired()) prefs.getKioskMode() else null) }
    var stationCode by remember { mutableStateOf(prefs.getStationCode() ?: "") }

    var showAdminPinDialog by remember { mutableStateOf(false) }
    var adminPinInput by remember { mutableStateOf("") }
    var adminPinError by remember { mutableStateOf("") }

    // KioskDataViewModel: yalnızca cihaz eşlenince oluşturulur
    val dataViewModel: KioskDataViewModel? = if (currentMode != null) {
        viewModel(
            key = "kiosk_data_vm_${stationCode}",
            factory = object : ViewModelProvider.Factory {
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    @Suppress("UNCHECKED_CAST")
                    return KioskDataViewModel(prefs, repository) as T
                }
            }
        )
    } else null

    when (val mode = currentMode) {
        null -> {
            // ─── Eşleme ekranı ───────────────────────────────────────────────
            val viewModel = remember { PairingViewModel(prefs, repository) }
            PairingScreen(
                viewModel = viewModel,
                onPaired = { pairedMode ->
                    currentMode = pairedMode
                    stationCode = prefs.getStationCode() ?: ""
                    onModeChanged(pairedMode)
                },
            )
        }

        KioskMode.BIG_SCREEN -> {
            KioskBigScreen(
                stationCode = stationCode,
                viewModel = dataViewModel!!,
                onSecretUnlock = {
                    showAdminPinDialog = true
                },
            )
        }

        KioskMode.TABLET -> {
            KioskTabletScreen(
                stationCode = stationCode,
                viewModel = dataViewModel!!,
                onSecretUnlock = {
                    showAdminPinDialog = true
                },
            )
        }
    }

    if (showAdminPinDialog) {
        Dialog(
            onDismissRequest = {
                showAdminPinDialog = false
                adminPinInput = ""
                adminPinError = ""
            },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.65f)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E32)),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier
                        .width(400.dp)
                        .padding(24.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Yönetici PIN Girişi",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Black
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Cihazın eşlemesini kaldırmak için yönetici PIN kodunu girin.",
                            color = Color(0xFF9090C0),
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(16.dp))

                        TextField(
                            value = adminPinInput,
                            onValueChange = {
                                adminPinError = ""
                                adminPinInput = it.take(8)
                            },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            isError = adminPinError.isNotEmpty(),
                            placeholder = { Text("PIN giriniz", color = Color(0xFF64748B)) },
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color(0xFF0F172A),
                                unfocusedContainerColor = Color(0xFF0F172A),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                cursorColor = Color(0xFF6C63FF)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        if (adminPinError.isNotEmpty()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = adminPinError,
                                color = Color(0xFFFF6B6B),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(Modifier.height(24.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Button(
                                onClick = {
                                    showAdminPinDialog = false
                                    adminPinInput = ""
                                    adminPinError = ""
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("İptal", color = Color.White, fontWeight = FontWeight.Bold)
                            }

                            Button(
                                onClick = {
                                    if (adminPinInput == "1903") {
                                        prefs.clearDeviceConfig()
                                        currentMode = null
                                        stationCode = ""
                                        showAdminPinDialog = false
                                        adminPinInput = ""
                                        adminPinError = ""
                                        // Eşleme ekranına yönlenip yönü sıfırlamak için
                                        onModeChanged(KioskMode.BIG_SCREEN)
                                    } else {
                                        adminPinError = "Hatalı PIN kodu!"
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF6B6B)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Doğrula", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

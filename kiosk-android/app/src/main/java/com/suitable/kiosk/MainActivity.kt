package com.suitable.kiosk

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
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
                    // Yönetici PIN doğrulandı → yeniden eşleme
                    currentMode = null
                    stationCode = ""
                    onModeChanged(KioskMode.BIG_SCREEN) // yönü sıfırlamak için
                },
            )
        }

        KioskMode.TABLET -> {
            KioskTabletScreen(
                stationCode = stationCode,
                viewModel = dataViewModel!!,
                onSecretUnlock = {
                    currentMode = null
                    stationCode = ""
                },
            )
        }
    }
}

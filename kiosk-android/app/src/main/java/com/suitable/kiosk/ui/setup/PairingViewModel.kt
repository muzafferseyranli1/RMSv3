package com.suitable.kiosk.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.suitable.kiosk.data.KioskRepository
import com.suitable.kiosk.data.model.KioskMode
import com.suitable.kiosk.data.model.PairingResult
import com.suitable.kiosk.prefs.KioskPrefs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Eşleme ekranı UI durumu */
sealed class PairingUiState {
    /** Kullanıcı kod giriyor */
    object Idle : PairingUiState()

    /** API çağrısı sürüyor */
    object Loading : PairingUiState()

    /** Eşleme başarılı — moda göre yönlendirme yapılacak */
    data class Paired(val mode: KioskMode) : PairingUiState()

    /** Hata mesajı */
    data class Failure(val message: String) : PairingUiState()
}

class PairingViewModel(
    private val prefs: KioskPrefs,
    private val repository: KioskRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<PairingUiState>(PairingUiState.Idle)
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    /** Kullanıcı girdiği kod */
    private val _code = MutableStateFlow("")
    val code: StateFlow<String> = _code.asStateFlow()

    fun onCodeChange(value: String) {
        // Büyük harf, boşluk temizle
        _code.value = value.uppercase().trim().take(20)
        if (_uiState.value is PairingUiState.Failure) {
            _uiState.value = PairingUiState.Idle
        }
    }

    /** "Eşle" butonuna basılınca çağrılır */
    fun pair() {
        val stationCode = _code.value
        if (stationCode.isBlank()) {
            _uiState.value = PairingUiState.Failure("Lütfen istasyon kodunu girin.")
            return
        }
        viewModelScope.launch {
            _uiState.value = PairingUiState.Loading
            val result = repository.pairDevice(stationCode)
            _uiState.value = when (result) {
                is PairingResult.Success -> {
                    prefs.saveDeviceConfig(
                        mode = result.mode,
                        stationCode = result.stationCode,
                        terminalId = result.terminalId,
                        branchId = result.branchId,
                    )
                    PairingUiState.Paired(result.mode)
                }
                is PairingResult.NotFound ->
                    PairingUiState.Failure("Bu kod sistemde kayıtlı değil. Kiosk yönetiminden cihaz eklendiğinden emin olun.")
                is PairingResult.UnknownType ->
                    PairingUiState.Failure("Bu terminal tipi desteklenmiyor: ${result.rawType}")
                is PairingResult.Inactive ->
                    PairingUiState.Failure("Bu cihaz pasif olarak işaretlenmiş. Kiosk yönetiminden aktif edin.")
                is PairingResult.Error ->
                    PairingUiState.Failure("Sunucuya ulaşılamadı: ${result.message}")
            }
        }
    }

    /** Yeniden eşleme — PIN doğrulandıktan sonra çağrılır */
    fun unpair() {
        prefs.clearDeviceConfig()
        _code.value = ""
        _uiState.value = PairingUiState.Idle
    }
}

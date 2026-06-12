package com.suitable.wms.ui.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.suitable.wms.data.ApiClient
import com.suitable.wms.data.ParseBarcodeRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class WmsScanUiState {
    object Idle : WmsScanUiState()
    object Loading : WmsScanUiState()
    data class Success(val result: WmsScanResult) : WmsScanUiState()
    data class Error(val message: String) : WmsScanUiState()
}

class WmsScanViewModel : ViewModel() {
    private val _uiState = MutableStateFlow<WmsScanUiState>(WmsScanUiState.Idle)
    val uiState: StateFlow<WmsScanUiState> = _uiState.asStateFlow()

    fun scanBarcode(
        barcode: String,
        branchId: String,
        taskId: String? = null,
        personnelId: String? = null,
        terminalId: String? = null
    ) {
        _uiState.value = WmsScanUiState.Loading
        viewModelScope.launch {
            try {
                val response = ApiClient.apiService.parseBarcode(
                    ParseBarcodeRequest(
                        barcode = barcode,
                        branch_id = branchId,
                        task_id = taskId,
                        personnel_id = personnelId,
                        terminal_id = terminalId
                    )
                )
                if (response.error != null) {
                    val errMsg = response.error["message"]?.toString() ?: "Doğrulama hatası oluştu."
                    _uiState.value = WmsScanUiState.Error(errMsg)
                } else if (response.data != null) {
                    _uiState.value = WmsScanUiState.Success(response.data)
                } else {
                    _uiState.value = WmsScanUiState.Error("Bilinmeyen sunucu hatası.")
                }
            } catch (e: Exception) {
                _uiState.value = WmsScanUiState.Error(e.message ?: "Ağ bağlantı hatası.")
            }
        }
    }

    fun clearState() {
        _uiState.value = WmsScanUiState.Idle
    }
}

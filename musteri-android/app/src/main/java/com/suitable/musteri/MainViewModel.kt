package com.suitable.musteri

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.ConfigRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class MainViewModel : ViewModel() {
    private val repository = ConfigRepository()
    
    private val _configState = MutableStateFlow<AppConfig?>(null)
    val configState: StateFlow<AppConfig?> = _configState
    
    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading

    init {
        fetchConfig()
    }

    private fun fetchConfig() {
        viewModelScope.launch {
            _isLoading.value = true
            val config = repository.getAppConfig()
            _configState.value = config
            _isLoading.value = false
        }
    }
}

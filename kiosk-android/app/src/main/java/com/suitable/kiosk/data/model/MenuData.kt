package com.suitable.kiosk.data.model

/**
 * Uygulama genelinde yüklenen menü verisi.
 * KioskDataViewModel tarafından tutulur.
 */
data class MenuData(
    val categories: List<SaleCategory> = emptyList(),
    val items: List<SaleItem> = emptyList(),
    val optionGroups: List<OptionGroup> = emptyList(),
    val kioskChannel: SalesChannel? = null,
    val operatingRules: List<OperatingHoursRule> = emptyList(),
    val terminalRules: List<TerminalOperatingRule> = emptyList(),
    val branchName: String? = null,
)

/**
 * Menü yükleme durumu.
 */
sealed class MenuLoadState {
    object Loading : MenuLoadState()
    data class Ready(val data: MenuData) : MenuLoadState()
    data class Error(val message: String) : MenuLoadState()
    /** Ağ bağlantısı yok */
    object Offline : MenuLoadState()
}

/**
 * Sipariş gönderme durumu.
 */
sealed class OrderSubmitState {
    object Idle : OrderSubmitState()
    object Submitting : OrderSubmitState()
    data class Success(val saleId: String, val displayNo: Int?) : OrderSubmitState()
    data class Error(val message: String) : OrderSubmitState()
}

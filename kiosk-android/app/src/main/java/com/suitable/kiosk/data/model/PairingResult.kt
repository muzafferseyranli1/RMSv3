package com.suitable.kiosk.data.model

import com.suitable.kiosk.data.model.KioskMode

/**
 * pos_terminals eşleme sonucu.
 */
sealed class PairingResult {

    /** Eşleme başarılı — terminal bulundu ve mod belirlendi. */
    data class Success(
        val mode: KioskMode,
        val stationCode: String,
        val terminalId: String,
        val branchId: String?,
        val label: String?,
    ) : PairingResult()

    /** Bu station_code'a sahip terminal bulunamadı. */
    object NotFound : PairingResult()

    /** Terminal var ama terminal_type desteklenen bir değer değil. */
    data class UnknownType(val rawType: String?) : PairingResult()

    /** Terminal pasif (is_active = false). */
    object Inactive : PairingResult()

    /** Ağ / sunucu hatası. */
    data class Error(val message: String) : PairingResult()
}

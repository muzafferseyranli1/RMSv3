package com.suitable.kiosk.data.model

import com.google.gson.annotations.SerializedName

/**
 * kiosk_operating_hours_rules tablosu satırı.
 * Şubede tanımlı genel çalışma saati kuralları.
 */
data class OperatingHoursRule(
    val id: String = "",
    @SerializedName("branch_id") val branchId: String = "",
    val label: String? = null,
    @SerializedName("day_codes") val dayCodes: List<String> = emptyList(),  // ["mon","tue",...]
    @SerializedName("start_time") val startTime: String = "00:00",          // "HH:mm"
    @SerializedName("end_time") val endTime: String = "23:59",
    @SerializedName("is_open") val isOpen: Boolean = true,
)

/**
 * kiosk_terminal_operating_rules junction tablosu satırı.
 * Hangi terminale hangi kural atanmış.
 */
data class TerminalOperatingRule(
    @SerializedName("terminal_id") val terminalId: String = "",
    @SerializedName("rule_id") val ruleId: String = "",
)

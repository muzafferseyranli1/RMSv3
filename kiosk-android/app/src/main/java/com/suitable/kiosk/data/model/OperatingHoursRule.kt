package com.suitable.kiosk.data.model

import com.google.gson.annotations.SerializedName

/**
 * kiosk_operating_hours_rules tablosu satırı.
 * Şubede tanımlı genel çalışma saati kuralları.
 *
 * DB şeması (schema-railway-master.sql):
 *   id, branch_id, name, days TEXT[], start_time, end_time
 *   NOT: is_open kolonu YOKTUR — her kural zaten açık olduğu saati tanımlar.
 *   NOT: days kolonu adı "days"tir, "day_codes" değil.
 */
data class OperatingHoursRule(
    val id: String = "",
    @SerializedName("branch_id") val branchId: String = "",
    val name: String = "",
    val days: List<String> = emptyList(),       // DB: days TEXT[] — ["mon","tue",...]
    @SerializedName("start_time") val startTime: String = "09:00",  // "HH:mm"
    @SerializedName("end_time")   val endTime: String = "22:00",
)

/**
 * kiosk_terminal_operating_rules junction tablosu satırı.
 * Hangi terminale hangi kural atanmış.
 */
data class TerminalOperatingRule(
    @SerializedName("terminal_id") val terminalId: String = "",
    @SerializedName("rule_id") val ruleId: String = "",
)

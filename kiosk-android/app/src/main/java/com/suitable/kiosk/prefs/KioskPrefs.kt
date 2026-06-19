package com.suitable.kiosk.prefs

import android.content.Context
import android.content.SharedPreferences
import com.suitable.kiosk.data.model.KioskMode

/**
 * Cihaz yapılandırmasını SharedPreferences'a kaydeder ve okur.
 *
 * Burada saklanan veriler İŞ VERİSİ DEĞİLDİR; yalnızca cihaz tercihi
 * (hangi istasyon kodu, hangi mod) saklanır. Bu nedenle .antigravityrules
 * Kural 1'deki yerel depolama yasağının istisnası kapsamındadır.
 */
class KioskPrefs(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

    /** Kayıtlı kiosk modunu döner; eşleme yapılmamışsa null. */
    fun getKioskMode(): KioskMode? {
        val raw = prefs.getString(KEY_MODE, null) ?: return null
        return try { KioskMode.valueOf(raw) } catch (_: IllegalArgumentException) { null }
    }

    /** Kayıtlı istasyon kodunu döner; eşleme yapılmamışsa null. */
    fun getStationCode(): String? = prefs.getString(KEY_STATION_CODE, null)

    /** Kayıtlı şube ID'sini döner. */
    fun getBranchId(): String? = prefs.getString(KEY_BRANCH_ID, null)

    /** Kayıtlı terminal ID'sini döner (pos_terminals.id). */
    fun getTerminalId(): String? = prefs.getString(KEY_TERMINAL_ID, null)

    /** API adresini döner; ayarlanmamışsa varsayılanı. */
    fun getApiUrl(): String =
        prefs.getString(KEY_API_URL, DEFAULT_API_URL) ?: DEFAULT_API_URL

    /**
     * Eşleme başarılı olunca çağrılır.
     * @param mode         Belirlenen mod (BIG_SCREEN / TABLET)
     * @param stationCode  pos_terminals'dan gelen istasyon kodu
     * @param terminalId   pos_terminals.id
     * @param branchId     pos_terminals.branch_id
     */
    fun saveDeviceConfig(
        mode: KioskMode,
        stationCode: String,
        terminalId: String,
        branchId: String?,
    ) {
        prefs.edit()
            .putString(KEY_MODE, mode.name)
            .putString(KEY_STATION_CODE, stationCode)
            .putString(KEY_TERMINAL_ID, terminalId)
            .putString(KEY_BRANCH_ID, branchId)
            .apply()
    }

    /**
     * Cihaz yapılandırmasını siler → uygulama PairingScreen'e döner.
     * Yönetici PIN koruması PairingViewModel içinde yapılır.
     */
    fun clearDeviceConfig() {
        prefs.edit()
            .remove(KEY_MODE)
            .remove(KEY_STATION_CODE)
            .remove(KEY_TERMINAL_ID)
            .remove(KEY_BRANCH_ID)
            .apply()
    }

    /** Özel bir API adresi kaydeder (yönetici ayarlarından). */
    fun saveApiUrl(url: String) {
        prefs.edit().putString(KEY_API_URL, url.trimEnd('/')).apply()
    }

    /** Cihaz eşleme yapılmış mı? */
    fun isPaired(): Boolean = getKioskMode() != null && getStationCode() != null

    companion object {
        private const val PREFS_FILE        = "kiosk_device_prefs"
        private const val KEY_MODE          = "kiosk_mode"
        private const val KEY_STATION_CODE  = "station_code"
        private const val KEY_TERMINAL_ID   = "terminal_id"
        private const val KEY_BRANCH_ID     = "branch_id"
        private const val KEY_API_URL       = "api_url"
        const val DEFAULT_API_URL           = "https://rms-api-production-219d.up.railway.app"
    }
}

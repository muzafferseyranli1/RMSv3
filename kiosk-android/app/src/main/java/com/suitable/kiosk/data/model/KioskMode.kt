package com.suitable.kiosk.data.model

/**
 * Kiosk cihaz modu.
 *
 * - [BIG_SCREEN] → Dikey büyük TV ekranı (portrait lock, 480×854 canvas)
 *   pos_terminals.terminal_type = "kiosk"
 *
 * - [TABLET] → Yatay veya dikey tablet (portrait + landscape)
 *   pos_terminals.terminal_type = "kiosk_tablet"
 */
enum class KioskMode {
    BIG_SCREEN,
    TABLET;

    companion object {
        /**
         * pos_terminals.terminal_type değerinden mod çözer.
         * Bilinmeyen bir değer gelirse null döner; PairingScreen hata gösterir.
         */
        fun fromTerminalType(type: String?): KioskMode? = when (type?.lowercase()?.trim()) {
            "kiosk"        -> BIG_SCREEN
            "kiosk_tablet" -> TABLET
            else           -> null
        }
    }
}

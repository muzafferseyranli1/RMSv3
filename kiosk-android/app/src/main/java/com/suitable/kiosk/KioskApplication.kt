package com.suitable.kiosk

import android.app.Application

/**
 * Uygulama sınıfı.
 * Retrofit instance ve global bağımlılıklar burada başlatılır.
 */
class KioskApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // Gelecekte Coil global image loader veya başka singleton'lar buraya eklenebilir.
    }
}

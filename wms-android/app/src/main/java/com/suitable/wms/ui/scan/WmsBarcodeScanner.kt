package com.suitable.wms.ui.scan

import com.journeyapps.barcodescanner.ScanOptions

object WmsBarcodeScanner {
    /**
     * WMS için ortak ZXing ScanOptions altyapısını döner.
     */
    fun getScanOptions(prompt: String = "WMS Barkod veya QR Kodunu Taratın"): ScanOptions {
        return ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.ALL_CODE_TYPES)
            setPrompt(prompt)
            setBeepEnabled(true)
            setOrientationLocked(true)
            setBarcodeImageEnabled(false)
        }
    }
}

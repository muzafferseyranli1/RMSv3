package com.suitable.wms.ui.scan

data class WmsScanProduct(
    val id: String,
    val name: String,
    val sku: String,
    val unit: String?,
    val image_url: String?
)

data class WmsScanLocation(
    val id: String,
    val zone_code: String,
    val aisle: Int?,
    val rack: Int?,
    val level: Int?,
    val bin: Int?
)

data class WmsScanLpn(
    val id: String,
    val lpn_code: String,
    val location_id: String?
)

data class WmsScanLotInfo(
    val lot_number: String?,
    val expiration_date: String?
)

data class WmsScanPackageUnit(
    val package_unit_id: String?,
    val unit_name: String?,
    val unit_symbol: String?,
    val conversion_factor: Double,
    val barcode: String?,
    val length_cm: Double?,
    val width_cm: Double?,
    val height_cm: Double?,
    val volume_m3: Double?,
    val gross_weight_kg: Double?
)

data class WmsScanResult(
    val barcode: String,
    val scan_type: String,
    val matched: Boolean,
    val product: WmsScanProduct? = null,
    val package_unit: WmsScanPackageUnit? = null,
    val location: WmsScanLocation? = null,
    val lpn: WmsScanLpn? = null,
    val lot_info: WmsScanLotInfo? = null,
    val is_expected: Boolean,
    val message: String
)

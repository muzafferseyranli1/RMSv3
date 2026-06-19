package com.suitable.kiosk.data.model

import com.google.gson.annotations.SerializedName

/**
 * sales tablosuna yazılacak sipariş başlığı.
 * Web kaynak: KioskBig.jsx satır 4250 (salesHeader objesi)
 */
data class OrderHeader(
    @SerializedName("sale_datetime") val saleDatetime: String,
    val source: String = "kiosk",
    @SerializedName("source_channel_type") val sourceChannelType: String = "kiosk",
    @SerializedName("sales_channel_id") val salesChannelId: String?,
    @SerializedName("sales_channel_name") val salesChannelName: String = "Kiosk",
    @SerializedName("branch_id") val branchId: String?,
    @SerializedName("branch_name") val branchName: String?,
    @SerializedName("customer_id") val customerId: String? = null,
    @SerializedName("customer_name") val customerName: String? = null,
    @SerializedName("currency_code") val currencyCode: String = "TRY",
    @SerializedName("gross_total_before_discount") val grossTotalBeforeDiscount: Double,
    @SerializedName("discount_type") val discountType: String? = null,
    @SerializedName("discount_value") val discountValue: Double = 0.0,
    @SerializedName("discount_amount") val discountAmount: Double = 0.0,
    @SerializedName("gross_total_after_discount") val grossTotalAfterDiscount: Double,
    @SerializedName("net_total_after_discount") val netTotalAfterDiscount: Double,
    @SerializedName("cost_total") val costTotal: Double = 0.0,
    @SerializedName("payment_total") val paymentTotal: Double,
    @SerializedName("change_amount") val changeAmount: Double = 0.0,
    val status: String = "completed",
    @SerializedName("order_note") val orderNote: String? = null,
    @SerializedName("updated_at") val updatedAt: String,
    // Kiosk özel alanlar (migration varsa yazılır)
    @SerializedName("kds_status") val kdsStatus: String = "pending",
    @SerializedName("pickup_called") val pickupCalled: Boolean = false,
    @SerializedName("kiosk_service_type") val kioskServiceType: String = "takeaway",
    @SerializedName("kiosk_table_number") val kioskTableNumber: String? = null,
    @SerializedName("kiosk_display_no") val kioskDisplayNo: Int? = null,
)

/**
 * sale_lines tablosuna yazılacak sipariş satırı.
 * Web kaynak: KioskBig.jsx satır 4312 (lines map)
 */
data class OrderLine(
    @SerializedName("sale_id") val saleId: String,
    @SerializedName("line_no") val lineNo: Int,
    @SerializedName("product_id") val productId: String?,
    @SerializedName("product_name") val productName: String,
    @SerializedName("product_sku") val productSku: String?,
    val qty: Int,
    @SerializedName("unit_gross_before_discount") val unitGrossBeforeDiscount: Double,
    @SerializedName("line_gross_before_discount") val lineGrossBeforeDiscount: Double,
    @SerializedName("discount_allocated_amount") val discountAllocatedAmount: Double = 0.0,
    @SerializedName("unit_gross_after_discount") val unitGrossAfterDiscount: Double,
    @SerializedName("line_gross_after_discount") val lineGrossAfterDiscount: Double,
    @SerializedName("tax_id") val taxId: String? = null,
    @SerializedName("tax_name") val taxName: String? = null,
    @SerializedName("tax_rate") val taxRate: Double = 0.0,
    @SerializedName("line_net_after_discount") val lineNetAfterDiscount: Double,
    @SerializedName("unit_cost_snapshot") val unitCostSnapshot: Double = 0.0,
    @SerializedName("line_cost_total") val lineCostTotal: Double = 0.0,
    @SerializedName("options_json") val optionsJson: List<Map<String, Any>> = emptyList(),
    @SerializedName("portion_id") val portionId: String? = null,
    @SerializedName("portion_name") val portionName: String? = null,
    @SerializedName("branch_id") val branchId: String?,
    @SerializedName("branch_name") val branchName: String?,
    @SerializedName("sale_datetime") val saleDatetime: String,
    @SerializedName("sales_channel_id") val salesChannelId: String?,
    @SerializedName("kds_completed") val kdsCompleted: Boolean = false,
    @SerializedName("prep_time_minutes") val prepTimeMinutes: Int = 0,
)

/**
 * sale_payments tablosuna yazılacak ödeme.
 * Web kaynak: KioskBig.jsx satır 4359
 */
data class OrderPayment(
    @SerializedName("sale_id") val saleId: String,
    @SerializedName("payment_method") val paymentMethod: String = "card",
    @SerializedName("payment_method_label") val paymentMethodLabel: String = "Kart",
    val amount: Double,
    @SerializedName("payment_datetime") val paymentDatetime: String,
)

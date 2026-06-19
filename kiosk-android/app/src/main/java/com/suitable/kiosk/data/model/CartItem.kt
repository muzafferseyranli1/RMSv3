package com.suitable.kiosk.data.model

/**
 * Sepet kalemi.
 * İş verisi değildir — yalnızca uygulama hafızasında (ViewModel) tutulur.
 * Sipariş gönderilirken [OrderLine]'a dönüştürülür.
 */
data class CartItem(
    val saleItem: SaleItem,
    val quantity: Int = 1,
    val selectedOptions: List<SelectedOption> = emptyList(),
    val portionId: String? = null,
    val portionName: String? = null,
    val note: String = "",
    val unitPrice: Double,                  // Kiosk kanalı fiyatı + seçenek modifiers
    val comboBundle: ComboBundle? = null,
) {
    val lineTotal: Double get() = unitPrice * quantity

    /** Benzersiz sepet anahtar — ürün + seçenekler + porsiyon kombinasyonu */
    val cartKey: String get() =
        if (saleItem.isComboMenu && comboBundle != null) {
            "${saleItem.id}|" + comboBundle.expandedLines.joinToString("|") { line ->
                "${line.productId}:${line.options.sortedBy { it.optionId }.joinToString(",") { it.optionId }}"
            }
        } else {
            "${saleItem.id}|${portionId ?: ""}|${selectedOptions.sortedBy { it.optionId }.joinToString(",") { "${it.groupId}:${it.optionId}" }}"
        }
}

data class SelectedOption(
    val groupId: String,
    val groupName: String,
    val optionId: String,
    val optionName: String,
    val priceModifier: Double = 0.0,
)

data class ComboBundle(
    val comboUnitPrice: Double,
    val realTotal: Double,
    val comboBasePrice: Double,
    val adjustmentTotal: Double,
    val expandedLines: List<ComboExpandedLine>,
)

data class ComboExpandedLine(
    val productId: String,
    val productName: String,
    val productSku: String?,
    val groupName: String,
    val isPrimary: Boolean,
    val baseUnitPrice: Double,
    val unitPrice: Double,
    val options: List<SelectedOption> = emptyList(),
    val prepTimeMinutes: Int = 0,
)

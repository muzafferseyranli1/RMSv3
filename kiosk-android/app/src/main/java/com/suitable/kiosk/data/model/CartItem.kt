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
) {
    val lineTotal: Double get() = unitPrice * quantity

    /** Benzersiz sepet anahtar — ürün + seçenekler + porsiyon kombinasyonu */
    val cartKey: String get() =
        "${saleItem.id}|${portionId ?: ""}|${selectedOptions.sortedBy { it.optionId }.joinToString(",") { "${it.groupId}:${it.optionId}" }}"
}

data class SelectedOption(
    val groupId: String,
    val groupName: String,
    val optionId: String,
    val optionName: String,
    val priceModifier: Double = 0.0,
)

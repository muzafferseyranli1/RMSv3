package com.suitable.kiosk.data.model

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

/**
 * sale_items tablosu satırı.
 * Web: db.from('sale_items').select('id,name,sku,sale_cat_l1,sale_cat_l2,...,channel_prices,portions,option_groups,channel_image,channel_description,prep_time_minutes')
 *
 * Fiyatlar channel_prices JSON'ında saklanır:
 *   { "<channel_id>": { price: 25.0 }, ... }
 * Kiosk kanalı sales_channels tablosunda name ILIKE 'kiosk' ile bulunur.
 */
data class SaleItem(
    val id: String = "",
    val name: String = "",
    val sku: String? = null,
    // Kategori bağlantıları (seviye 1..5)
    @SerializedName("sale_cat_l1") val catL1: String? = null,
    @SerializedName("sale_cat_l2") val catL2: String? = null,
    @SerializedName("sale_cat_l3") val catL3: String? = null,
    @SerializedName("sale_cat_l4") val catL4: String? = null,
    @SerializedName("sale_cat_l5") val catL5: String? = null,
    // Fiyatlar — JsonElement olarak alınır, sonra channel_id'ye göre parse edilir
    @SerializedName("channel_prices") val channelPricesRaw: JsonElement? = null,
    // Porsiyon bilgisi: [{ id, name, price_modifier }]
    val portions: JsonElement? = null,
    // Seçenek grupları: [{ group_id, ... }]
    @SerializedName("option_groups") val optionGroupsRaw: JsonElement? = null,
    // Kanal bazlı görsel
    @SerializedName("channel_image") val channelImageRaw: JsonElement? = null,
    // Kanal bazlı açıklama
    @SerializedName("channel_description") val channelDescriptionRaw: JsonElement? = null,
    @SerializedName("prep_time_minutes") val prepTimeMinutes: Int = 0,
    @SerializedName("tax_id") val taxId: String? = null,
    val active: Boolean = true,
    @SerializedName("deleted_at") val deletedAt: String? = null,
) {
    /** Belirtilen kiosk kanalı için fiyatı döner; bulamazsa 0.0 */
    fun priceForChannel(channelId: String?): Double {
        if (channelPricesRaw == null || channelId == null) return 0.0
        return try {
            val obj = channelPricesRaw.asJsonObject
            obj.get(channelId)?.asJsonObject?.get("price")?.asDouble ?: 0.0
        } catch (_: Exception) { 0.0 }
    }

    /** Belirtilen kiosk kanalı için görsel URL'sini döner */
    fun imageUrlForChannel(channelId: String?): String? {
        if (channelImageRaw == null || channelId == null) return null
        return try {
            channelImageRaw.asJsonObject.get(channelId)?.asString
        } catch (_: Exception) { null }
    }

    /** Ürünün ait olduğu tüm kategori ID'lerini döner */
    val categoryIds: List<String> get() =
        listOfNotNull(catL1, catL2, catL3, catL4, catL5)
}

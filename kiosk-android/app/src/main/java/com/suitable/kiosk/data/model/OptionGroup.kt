package com.suitable.kiosk.data.model

import com.google.gson.annotations.SerializedName

/**
 * option_groups tablosu satırı.
 * Web: db.from('option_groups').select('id,name,options')
 *
 * options alanı JSON array olarak gelir:
 * [{ id, name, price_modifier, is_active, sort_order }]
 */
data class OptionGroup(
    val id: String = "",
    val name: String = "",
    val options: List<ItemOption> = emptyList(),
    @SerializedName("min_select") val minSelect: Int = 0,
    @SerializedName("max_select") val maxSelect: Int = 1,
    @SerializedName("deleted_at") val deletedAt: String? = null,
)

data class ItemOption(
    val id: String = "",
    val name: String = "",
    @SerializedName("price_modifier") val priceModifier: Double = 0.0,
    @SerializedName("is_active") val isActive: Boolean = true,
    @SerializedName("sort_order") val sortOrder: Int = 0,
)

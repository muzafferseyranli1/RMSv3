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
    @SerializedName("options") private val allOptionsRaw: List<ItemOption> = emptyList(),
    @SerializedName("min_select") private val minSelectField: Int? = null,
    @SerializedName("max_select") private val maxSelectField: Int? = null,
    @SerializedName("deleted_at") val deletedAt: String? = null,
) {
    constructor(
        id: String = "",
        name: String = "",
        options: List<ItemOption> = emptyList(),
        minSelect: Int = 0,
        maxSelect: Int = 1,
        deletedAt: String? = null
    ) : this(
        id = id,
        name = name,
        allOptionsRaw = options,
        minSelectField = minSelect,
        maxSelectField = maxSelect,
        deletedAt = deletedAt
    )

    val options: List<ItemOption>
        get() = allOptionsRaw.filter { it.metaType != "selection_rules" }

    val minSelect: Int
        get() = minSelectField ?: allOptionsRaw.find { it.metaType == "selection_rules" }?.minSelect ?: 0

    val maxSelect: Int
        get() = maxSelectField ?: allOptionsRaw.find { it.metaType == "selection_rules" }?.maxSelect ?: 1
}

data class ItemOption(
    @SerializedName(value = "id", alternate = ["option_id"]) val id: String = "",
    val name: String = "",
    @SerializedName(value = "price_modifier", alternate = ["price"]) val priceModifier: Double = 0.0,
    @SerializedName("is_active") val isActiveField: Boolean? = null,
    val active: Boolean? = null,
    @SerializedName("sort_order") val sortOrder: Int = 0,
    @SerializedName("__meta_type") val metaType: String? = null,
    @SerializedName("min_select") val minSelect: Int? = null,
    @SerializedName("max_select") val maxSelect: Int? = null,
) {
    val isActive: Boolean
        get() = isActiveField ?: active ?: true
}


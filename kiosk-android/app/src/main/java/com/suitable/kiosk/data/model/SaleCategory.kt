package com.suitable.kiosk.data.model

import com.google.gson.annotations.SerializedName

/**
 * sale_categories tablosu satırı.
 * Web: db.from('sale_categories').select('id,name,parent_id,image_url,bg,text_color')
 */
data class SaleCategory(
    val id: String = "",
    val name: String = "",
    @SerializedName("parent_id") val parentId: String? = null,
    @SerializedName("image_url") val imageUrl: String? = null,
    val bg: String? = null,                 // arka plan rengi (hex)
    @SerializedName("text_color") val textColor: String? = null,
    @SerializedName("deleted_at") val deletedAt: String? = null,
)

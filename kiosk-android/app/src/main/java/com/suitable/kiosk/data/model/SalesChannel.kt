package com.suitable.kiosk.data.model

import com.google.gson.annotations.SerializedName

/**
 * sales_channels tablosundan gelen kiosk kanalı.
 * Web: db.from('sales_channels').ilike('name','kiosk').maybeSingle()
 */
data class SalesChannel(
    val id: String = "",
    val name: String = "",
    @SerializedName("deleted_at") val deletedAt: String? = null,
)

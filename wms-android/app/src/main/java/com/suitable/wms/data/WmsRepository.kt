package com.suitable.wms.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext

data class WarehouseTask(
    val id: String,
    val branchId: String,
    val taskType: String, // "putaway", "pick", "pack", "load", "count"
    val status: String,   // "pending", "assigned", "in_progress", "done", "exception", "cancelled"
    val productId: String?,
    val productName: String?,
    val productCode: String?,
    val barcode: String?,
    val quantity: Int,
    var scannedQuantity: Int,
    val sourceLocation: String?,
    val targetLocation: String?,
    val assignedPersonnelId: String?,
    val createdAt: String,
    val updatedAt: String,
    
    // Ek alanlar (Putaway/Picking detayları için)
    val lotNumber: String? = null,
    val expirationDate: String? = null,
    val lpnId: String? = null,
    val lpnCode: String? = null,
    val unit: String? = null,
    val imageUrl: String? = null,
    val sourceDocId: String? = null,
    val sourceDocType: String? = null
) {
    fun isCompleted(): Boolean = status == "done"
}

data class StockLookupResult(
    val barcode: String,
    val name: String,
    val sku: String,
    val unit: String?,
    val imageUrl: String?,
    val locations: List<StockLocationDetail> = emptyList()
)

data class StockLocationDetail(
    val locationName: String,
    val quantity: Double
)

class WmsRepository {

    private fun formatLocationAddress(locMap: Map<String, Any?>?): String? {
        if (locMap == null) return null
        val zoneCode = locMap["zone_code"]?.toString() ?: return null
        val aisle = locMap["aisle"]?.toString()?.toDoubleOrNull()?.toInt()
        val rack = locMap["rack"]?.toString()?.toDoubleOrNull()?.toInt()
        val level = locMap["level"]?.toString()?.toDoubleOrNull()?.toInt()
        val bin = locMap["bin"]?.toString()?.toDoubleOrNull()?.toInt()
        
        val parts = mutableListOf<String>()
        parts.add(zoneCode)
        if (aisle != null && aisle > 0) parts.add("K$aisle")
        if (rack != null && rack > 0) parts.add("R$rack")
        if (level != null && level > 0) parts.add("S$level")
        if (bin != null && bin > 0) parts.add("G$bin")
        
        return parts.joinToString("-")
    }

    suspend fun fetchWarehouseTasks(branchId: String): List<WarehouseTask> = withContext(Dispatchers.IO) {
        try {
            val request = QueryRequest(
                table = "warehouse_tasks",
                operation = "select",
                filters = listOf(
                    mapOf("type" to "eq", "col" to "branch_id", "val" to branchId),
                    mapOf("type" to "in", "col" to "status", "val" to listOf("pending", "assigned", "in_progress", "exception"))
                )
            )
            val response = ApiClient.apiService.executeQuery(request)
            if (response.error != null) {
                Log.e("WmsRepository", "API Error: ${response.error}")
                throw Exception(response.error["message"]?.toString() ?: "Fetch error")
            }
            val dataList = response.data as? List<*> ?: return@withContext emptyList()
            
            val stockItemIds = mutableSetOf<String>()
            val lpnIds = mutableSetOf<String>()
            val locationIds = mutableSetOf<String>()

            val tasksRaw = dataList.mapNotNull { item ->
                val row = item as? Map<*, *> ?: return@mapNotNull null
                val meta = row["meta"] as? Map<*, *>
                
                val stockItemId = meta?.get("stock_item_id")?.toString() ?: meta?.get("product_id")?.toString()
                if (!stockItemId.isNullOrBlank()) stockItemIds.add(stockItemId)
                
                val lpnId = meta?.get("lpn_id")?.toString()
                if (!lpnId.isNullOrBlank()) lpnIds.add(lpnId)
                
                val fromLocId = meta?.get("from_location_id")?.toString() 
                    ?: meta?.get("source_location_id")?.toString()
                    ?: meta?.get("location_id")?.toString()
                if (!fromLocId.isNullOrBlank()) locationIds.add(fromLocId)
                
                val targetLocId = meta?.get("target_location_id")?.toString()
                if (!targetLocId.isNullOrBlank()) locationIds.add(targetLocId)

                row
            }

            // Fetch reference tables in parallel using coroutine async
            val stockItemsDeferred = async {
                if (stockItemIds.isEmpty()) emptyMap<String, Map<String, Any?>>()
                else {
                    try {
                        val req = QueryRequest(
                            table = "stock_items",
                            operation = "select",
                            select = "id, name, sku, unit, image_url",
                            filters = listOf(mapOf("type" to "in", "col" to "id", "val" to stockItemIds.toList()))
                        )
                        val res = ApiClient.apiService.executeQuery(req)
                        val list = res.data as? List<*> ?: emptyList<Any>()
                        list.associate {
                            val r = it as Map<String, Any?>
                            r["id"]?.toString().orEmpty() to r
                        }
                    } catch (e: Exception) {
                        Log.e("WmsRepository", "Error resolving stock items", e)
                        emptyMap()
                    }
                }
            }

            val locationsDeferred = async {
                if (locationIds.isEmpty()) emptyMap<String, Map<String, Any?>>()
                else {
                    try {
                        val req = QueryRequest(
                            table = "warehouse_locations",
                            operation = "select",
                            select = "id, zone_code, aisle, rack, level, bin",
                            filters = listOf(mapOf("type" to "in", "col" to "id", "val" to locationIds.toList()))
                        )
                        val res = ApiClient.apiService.executeQuery(req)
                        val list = res.data as? List<*> ?: emptyList<Any>()
                        list.associate {
                            val r = it as Map<String, Any?>
                            r["id"]?.toString().orEmpty() to r
                        }
                    } catch (e: Exception) {
                        Log.e("WmsRepository", "Error resolving locations", e)
                        emptyMap()
                    }
                }
            }

            val lpnsDeferred = async {
                if (lpnIds.isEmpty()) emptyMap<String, Map<String, Any?>>()
                else {
                    try {
                        val req = QueryRequest(
                            table = "warehouse_lpns",
                            operation = "select",
                            select = "id, lpn_code",
                            filters = listOf(mapOf("type" to "in", "col" to "id", "val" to lpnIds.toList()))
                        )
                        val res = ApiClient.apiService.executeQuery(req)
                        val list = res.data as? List<*> ?: emptyList<Any>()
                        list.associate {
                            val r = it as Map<String, Any?>
                            r["id"]?.toString().orEmpty() to r
                        }
                    } catch (e: Exception) {
                        Log.e("WmsRepository", "Error resolving LPNs", e)
                        emptyMap()
                    }
                }
            }

            val stockItemsResolved = stockItemsDeferred.await()
            val locationsResolved = locationsDeferred.await()
            val lpnsResolved = lpnsDeferred.await()

            tasksRaw.mapNotNull { row ->
                val meta = row["meta"] as? Map<*, *>
                
                val stockItemId = meta?.get("stock_item_id")?.toString() ?: meta?.get("product_id")?.toString()
                val stockItem = stockItemsResolved[stockItemId]
                
                val fromLocId = meta?.get("from_location_id")?.toString() 
                    ?: meta?.get("source_location_id")?.toString()
                    ?: meta?.get("location_id")?.toString()
                val fromLoc = locationsResolved[fromLocId]
                
                val targetLocId = meta?.get("target_location_id")?.toString()
                val targetLoc = locationsResolved[targetLocId]
                
                val lpnId = meta?.get("lpn_id")?.toString()
                val lpn = lpnsResolved[lpnId]

                val productName = stockItem?.get("name")?.toString() ?: meta?.get("product_name")?.toString() ?: "İsimsiz Ürün"
                val productSku = stockItem?.get("sku")?.toString() ?: meta?.get("product_code")?.toString() ?: ""
                val unit = stockItem?.get("unit")?.toString() ?: "Adet"
                val imageUrl = ApiClient.resolveImageUrl(stockItem?.get("image_url")?.toString())

                val sourceLocationName = formatLocationAddress(fromLoc) ?: meta?.get("source_location")?.toString() ?: "—"
                val targetLocationName = formatLocationAddress(targetLoc) ?: meta?.get("target_location")?.toString() ?: "—"

                WarehouseTask(
                    id = row["id"]?.toString() ?: "",
                    branchId = row["branch_id"]?.toString() ?: "",
                    taskType = row["task_type"]?.toString() ?: "putaway",
                    status = row["status"]?.toString() ?: "pending",
                    productId = stockItemId,
                    productName = productName,
                    productCode = productSku,
                    barcode = stockItem?.get("sku")?.toString() ?: meta?.get("barcode")?.toString() ?: productSku,
                    quantity = (meta?.get("quantity") as? Number)?.toInt() 
                        ?: meta?.get("quantity")?.toString()?.toDoubleOrNull()?.toInt() 
                        ?: 0,
                    scannedQuantity = (meta?.get("scanned_quantity") as? Number)?.toInt() 
                        ?: meta?.get("scanned_quantity")?.toString()?.toDoubleOrNull()?.toInt() 
                        ?: 0,
                    sourceLocation = sourceLocationName,
                    targetLocation = targetLocationName,
                    assignedPersonnelId = row["assigned_personnel_id"]?.toString(),
                    createdAt = row["created_at"]?.toString() ?: "",
                    updatedAt = row["updated_at"]?.toString() ?: "",
                    lotNumber = meta?.get("lot_number")?.toString(),
                    expirationDate = meta?.get("expiration_date")?.toString(),
                    lpnId = lpnId,
                    lpnCode = lpn?.get("lpn_code")?.toString(),
                    unit = unit,
                    imageUrl = imageUrl,
                    sourceDocId = row["source_doc_id"]?.toString(),
                    sourceDocType = row["source_doc_type"]?.toString()
                )
            }
        } catch (e: Exception) {
            Log.e("WmsRepository", "Network exception in fetchWarehouseTasks", e)
            throw e
        }
    }

    suspend fun resolveLocationId(barcode: String, branchId: String): String? = withContext(Dispatchers.IO) {
        try {
            // Eğer taranan veri halihazırda geçerli bir UUID ise doğrudan geri döndür
            try {
                java.util.UUID.fromString(barcode)
                return@withContext barcode
            } catch (e: IllegalArgumentException) {
                // UUID değilse normal sorgulamaya geç
            }
            // Şubedeki tüm aktif lokasyonları çekip formatlayarak eşleştir
            val request = QueryRequest(
                table = "warehouse_locations",
                operation = "select",
                filters = listOf(
                    mapOf("type" to "eq", "col" to "branch_id", "val" to branchId),
                    mapOf("type" to "eq", "col" to "is_active", "val" to true)
                )
            )
            val response = ApiClient.apiService.executeQuery(request)
            if (response.error != null) throw Exception("Lokasyon çözülemedi.")
            
            val dataList = response.data as? List<*> ?: return@withContext null
            for (item in dataList) {
                val row = item as? Map<*, *> ?: continue
                val id = row["id"]?.toString() ?: continue
                val zoneCode = row["zone_code"]?.toString() ?: ""
                val aisle = row["aisle"]?.toString() ?: "0"
                val rack = row["rack"]?.toString() ?: "0"
                val level = row["level"]?.toString() ?: "0"
                // UI'daki formatlama kuralları ile eşleştir
                val fullLocCode = "LOC-$zoneCode-$aisle-$rack-$level"
                val shortLocCode = "LOC-$zoneCode"
                if (fullLocCode.equals(barcode, ignoreCase = true) || 
                    shortLocCode.equals(barcode, ignoreCase = true) || 
                    zoneCode.equals(barcode, ignoreCase = true)) {
                    return@withContext id
                }
            }
            null
        } catch (e: Exception) {
            Log.e("WmsRepository", "resolveLocationId hatası", e)
            null
        }
    }

    suspend fun completePutawayTask(
        taskId: String, 
        personnelId: String, 
        targetLocationId: String,
        evidencePhotoUrl: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val params = mutableMapOf<String, Any>(
                "p_task_id" to taskId,
                "p_personnel_id" to personnelId,
                "p_target_location_id" to targetLocationId
            )
            if (evidencePhotoUrl != null) {
                params["p_evidence_photo_url"] = evidencePhotoUrl
            }
            val request = QueryRequest(
                rpc = "complete_warehouse_putaway_task",
                params = params
            )
            val response = ApiClient.apiService.executeQuery(request)
            if (response.error != null) {
                throw Exception(response.error["message"]?.toString() ?: "RPC Hatası")
            }
            true
        } catch (e: Exception) {
            Log.e("WmsRepository", "completePutawayTask hatası", e)
            throw e
        }
    }

    suspend fun completeShipmentTask(
        taskId: String, 
        personnelId: String, 
        pickedQty: Int,
        evidencePhotoUrl: String? = null,
        packageUnitId: String? = null,
        packageQty: Double? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val params = mutableMapOf<String, Any>(
                "p_task_id" to taskId,
                "p_personnel_id" to personnelId,
                "p_picked_qty" to pickedQty
            )
            if (evidencePhotoUrl != null) {
                params["p_evidence_photo_url"] = evidencePhotoUrl
            }
            if (packageUnitId != null) {
                params["p_package_unit_id"] = packageUnitId
            }
            if (packageQty != null) {
                params["p_package_qty"] = packageQty
            }
            val request = QueryRequest(
                rpc = "complete_warehouse_shipment_task",
                params = params
            )
            val response = ApiClient.apiService.executeQuery(request)
            if (response.error != null) {
                throw Exception(response.error["message"]?.toString() ?: "RPC Hatası")
            }
            true
        } catch (e: Exception) {
            Log.e("WmsRepository", "completeShipmentTask hatası", e)
            throw e
        }
    }

    suspend fun queryStock(barcode: String, branchId: String): StockLookupResult? = withContext(Dispatchers.IO) {
        try {
            // 1. Search in stock_items first (either by SKU or barcode)
            val itemRequest = QueryRequest(
                table = "stock_items",
                operation = "select",
                filters = listOf(
                    mapOf("type" to "or", "val" to "sku.eq.$barcode,barcode.eq.$barcode")
                )
            )
            val itemResponse = ApiClient.apiService.executeQuery(itemRequest)
            val itemRows = itemResponse.data as? List<*> ?: emptyList<Any>()
            if (itemRows.isNotEmpty()) {
                val row = itemRows[0] as Map<*, *>
                val itemId = row["id"]?.toString() ?: ""
                val name = row["name"]?.toString() ?: ""
                val sku = row["sku"]?.toString() ?: ""
                val unit = row["unit"]?.toString()
                val imageUrl = row["image_url"]?.toString()

                // Query stock quantities in different locations for this item
                val balanceRequest = QueryRequest(
                    table = "stock_items_balance", // or appropriate ledger/balance view
                    operation = "select",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "stock_item_id", "val" to itemId),
                        mapOf("type" to "eq", "col" to "branch_id", "val" to branchId)
                    )
                )
                val balanceResponse = ApiClient.apiService.executeQuery(balanceRequest)
                val balanceList = balanceResponse.data as? List<*> ?: emptyList<Any>()
                val locations = balanceList.mapNotNull { b ->
                    val r = b as? Map<*, *> ?: return@mapNotNull null
                    val locName = r["location_name"]?.toString() ?: "Bilinmeyen Bölge"
                    val qty = (r["quantity"] as? Number)?.toDouble() ?: 0.0
                    StockLocationDetail(locName, qty)
                }

                return@withContext StockLookupResult(
                    barcode = barcode,
                    name = name,
                    sku = sku,
                    unit = unit,
                    imageUrl = ApiClient.resolveImageUrl(imageUrl),
                    locations = locations
                )
            }

            // 2. Fallback: check if the barcode is a location code itself
            val locRequest = QueryRequest(
                table = "warehouse_locations",
                operation = "select",
                filters = listOf(
                    mapOf("type" to "eq", "col" to "zone_code", "val" to barcode)
                )
            )
            val locResponse = ApiClient.apiService.executeQuery(locRequest)
            val locRows = locResponse.data as? List<*> ?: emptyList<Any>()
            if (locRows.isNotEmpty()) {
                val row = locRows[0] as Map<*, *>
                val zoneCode = row["zone_code"]?.toString() ?: ""
                val aisle = row["aisle"]?.toString() ?: "0"
                val rack = row["rack"]?.toString() ?: "0"
                val level = row["level"]?.toString() ?: "0"
                val bin = row["bin"]?.toString() ?: "0"

                return@withContext StockLookupResult(
                    barcode = barcode,
                    name = "Lokasyon: Zone $zoneCode - Koridor $aisle",
                    sku = "LOC-$zoneCode-$aisle-$rack-$level-$bin",
                    unit = "Lokasyon",
                    imageUrl = null,
                    locations = listOf(StockLocationDetail("Raf $rack - Kat $level - Göz $bin", 1.0))
                )
            }

            null
        } catch (e: Exception) {
            Log.e("WmsRepository", "Network exception in queryStock", e)
            null
        }
    }
}

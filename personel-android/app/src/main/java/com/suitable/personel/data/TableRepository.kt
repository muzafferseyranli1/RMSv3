package com.suitable.personel.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// ─── Data Models ─────────────────────────────────────────────────────────────

data class TableInfo(
    val id: String,
    val tableName: String,
    val tableNumber: String,
    val branchId: String,
    val qrToken: String,
    val hallName: String = "",
    val sectionName: String = ""
)

data class MenuChannel(val id: String, val name: String)

data class MenuCategory(
    val id: String,
    val name: String,
    val parentId: String?,
    val bg: String,
    val textColor: String,
    val imageUrl: String? = null
)

data class OptionItem(
    val id: String,
    val name: String,
    val price: Double
)

data class OptionGroup(
    val id: String,
    val name: String,
    val minSelect: Int,
    val maxSelect: Int,
    val options: List<OptionItem>
)

data class PortionItem(
    val id: String,
    val name: String,
    val priceOffset: Double
)

data class MenuItem(
    val id: String,
    val name: String,
    val standardPrice: Double,
    val channelPrice: Double,
    val channelImage: String?,
    val channelDescription: String?,
    val saleCatL1: String?,
    val saleCatL2: String?,
    val saleCatL3: String?,
    val saleCatL4: String?,
    val saleCatL5: String?,
    val portions: List<PortionItem>,
    // Embedded option groups (sale_items.option_groups JSONB alanından direkt)
    val embeddedOptionGroups: List<OptionGroup>,
    // Legacy: option_groups tablosuna referans (hala kullanılıyorsa)
    val optionGroupIds: List<String>,
    val prepTimeMinutes: Int
)

data class CartItem(
    val localId: String = java.util.UUID.randomUUID().toString(),
    val itemId: String,
    val name: String,
    val unitPrice: Double,
    val qty: Int,
    val portionId: String? = null,
    val portionName: String? = null,
    val selectedOptions: List<SelectedOption> = emptyList()
)

data class SelectedOption(
    val groupId: String,
    val groupName: String,
    val optionId: String,
    val optionName: String,
    val price: Double
)

data class TableOrderLine(
    val id: String,
    val productName: String,
    val portionName: String?,
    val qty: Double,
    val unitPrice: Double,
    val lineTotal: Double,
    val optionsSummary: String?
)

data class TableOrder(
    val id: String,
    val saleDateTime: String,
    val orderNote: String?,
    val grossTotal: Double,
    val status: String,
    val lines: List<TableOrderLine> = emptyList()
)

// ─── QR Payload Parsing ───────────────────────────────────────────────────────

data class QrPayload(val branchId: String?, val tableToken: String)

fun parseQrPayload(raw: String): QrPayload? {
    val trimmed = raw.trim()
    return try {
        // URI formatını dene (http://... veya rms://...)
        val uri = android.net.Uri.parse(trimmed)
        if (uri.isHierarchical) {
            val path = uri.path ?: ""
            // Kısa link desteği: /q/TOKEN
            if (path.startsWith("/q/")) {
                val token = path.substringAfter("/q/")
                if (token.isNotBlank()) return QrPayload(null, token)
            }
            // Standart link desteği
            val branch = uri.getQueryParameter("branch") ?: uri.getQueryParameter("b")
            val token = uri.getQueryParameter("tableToken") ?: uri.getQueryParameter("t")
            if (token != null && token.isNotBlank()) {
                return QrPayload(branch, token)
            }
        }

        // Semicolon (eski) format desteği
        val params = trimmed.split(';').associate { pair ->
            val kv = pair.split('=', limit = 2)
            (kv.getOrNull(0) ?: "") to (kv.getOrNull(1) ?: "")
        }
        val branch = params["branch"]
        val token = params["tableToken"] ?: params["t"]
        if (token != null && token.isNotBlank()) {
            return QrPayload(branch, token)
        }
        null
    } catch (e: Exception) {
        Log.w("TableRepository", "QR parse failed for: $trimmed", e)
        null
    }
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Suppress("UNCHECKED_CAST")
class TableRepository {

    // ─── Masa QR Lookup ──────────────────────────────────────────────────────

    suspend fun lookupTableByQrToken(branchId: String?, tableToken: String): TableInfo? {
        return withContext(Dispatchers.IO) {
            try {
                val filters = mutableListOf<Map<String, Any?>>(
                    mapOf("type" to "eq", "col" to "qr_token", "val" to tableToken),
                    mapOf("type" to "is", "col" to "deleted_at", "val" to null),
                    mapOf("type" to "eq", "col" to "status", "val" to "active"),
                    mapOf("type" to "eq", "col" to "is_active", "val" to true)
                )
                if (!branchId.isNullOrBlank()) {
                    filters.add(mapOf("type" to "eq", "col" to "branch_id", "val" to branchId))
                }

                val req = QueryRequest(
                    table = "pos_tables",
                    filters = filters
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val row = rows.firstOrNull() ?: return@withContext null

                TableInfo(
                    id = row["id"] as? String ?: return@withContext null,
                    tableName = row["table_name"] as? String ?: "",
                    tableNumber = row["table_number"] as? String ?: "",
                    branchId = row["branch_id"] as? String ?: branchId ?: "",
                    qrToken = row["qr_token"] as? String ?: tableToken
                )
            } catch (e: Exception) {
                Log.e("TableRepository", "lookupTableByQrToken error", e)
                null
            }
        }
    }

    suspend fun fetchBranchTables(branchId: String): List<TableInfo> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "pos_tables",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "branch_id", "val" to branchId),
                        mapOf("type" to "is", "col" to "deleted_at", "val" to null),
                        mapOf("type" to "eq", "col" to "status", "val" to "active"),
                        mapOf("type" to "eq", "col" to "is_active", "val" to true),
                        mapOf("type" to "order", "col" to "sort_order", "ascending" to true),
                        mapOf("type" to "order", "col" to "table_number", "ascending" to true)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                rows.mapNotNull { row ->
                    TableInfo(
                        id = row["id"] as? String ?: return@mapNotNull null,
                        tableName = row["table_name"] as? String ?: "",
                        tableNumber = row["table_number"] as? String ?: "",
                        branchId = row["branch_id"] as? String ?: branchId,
                        qrToken = row["qr_token"] as? String ?: ""
                    )
                }
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchBranchTables error", e)
                emptyList()
            }
        }
    }

    suspend fun fetchOpenTicketsForBranch(branchId: String): Map<String, List<*>> {
        return withContext(Dispatchers.IO) {
            try {
                val settingKey = "garson_open_table_tickets_v2"
                val readReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to settingKey))
                )
                val readRes = ApiClient.apiService.executeQuery(readReq)
                val rows = (readRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val existingValue = rows.firstOrNull()?.get("value")

                @Suppress("UNCHECKED_CAST")
                val allState = existingValue as? Map<String, Any> ?: return@withContext emptyMap()
                val branchState = allState[branchId] as? Map<String, Any> ?: return@withContext emptyMap()

                val result = mutableMapOf<String, List<*>>()
                for ((tableId, ticketObj) in branchState) {
                    val ticketMap = ticketObj as? Map<*, *>
                    val cart = ticketMap?.get("cart") as? List<*>
                    if (cart != null && cart.isNotEmpty()) {
                        result[tableId] = cart
                    }
                }
                result
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchOpenTicketsForBranch error", e)
                emptyMap()
            }
        }
    }

    // ─── Servis Talepleri ─────────────────────────────────────────────────────

    suspend fun createServiceRequest(
        tableId: String,
        branchId: String,
        requestType: String, // "call_waiter" | "bill_request"
        customerId: String? = null,
        phone: String? = null
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val payload = mutableMapOf<String, Any>(
                    "id" to java.util.UUID.randomUUID().toString(),
                    "table_id" to tableId,
                    "branch_id" to branchId,
                    "request_type" to requestType,
                    "status" to "pending",
                    "source" to "qr_menu",
                    "requested_at" to java.time.Instant.now().toString(),
                    "created_at" to java.time.Instant.now().toString(),
                    "updated_at" to java.time.Instant.now().toString()
                )
                if (!customerId.isNullOrBlank()) payload["customer_id"] = customerId
                if (!phone.isNullOrBlank()) payload["requested_phone"] = phone

                val req = QueryRequest(
                    table = "table_service_requests",
                    operation = "insert",
                    data = payload
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("TableRepository", "createServiceRequest error", e)
                false
            }
        }
    }

    suspend fun resolveServiceRequests(tableId: String, branchId: String, staffId: String, staffName: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val now = java.time.Instant.now().toString()
                val req = QueryRequest(
                    table = "table_service_requests",
                    operation = "update",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "table_id", "val" to tableId),
                        mapOf("type" to "eq", "col" to "status", "val" to "pending")
                    ),
                    data = mapOf(
                        "status" to "resolved",
                        "acknowledged_at" to now,
                        "resolved_at" to now,
                        "acknowledged_by_staff_id" to staffId,
                        "acknowledged_by_staff_name" to staffName
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("TableRepository", "resolveServiceRequests error", e)
                false
            }
        }
    }

    suspend fun fetchPendingServiceRequests(branchId: String): List<Map<String, Any>> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "table_service_requests",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "branch_id", "val" to branchId),
                        mapOf("type" to "eq", "col" to "status", "val" to "pending")
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchPendingServiceRequests error", e)
                emptyList()
            }
        }
    }

    // ─── Menü Kanalı ──────────────────────────────────────────────────────────
    // QR Menu kanalını önce ara ("qr menu", "qr menü", "qr"), yoksa kiosk'a düş.
    // MobileAppShells.jsx satır 373 ile aynı öncelik sırası.

    suspend fun fetchMenuChannel(): MenuChannel? {
        return withContext(Dispatchers.IO) {
            try {
                // Tüm aktif kanalları çek, sonra önceliğe göre seç
                val req = QueryRequest(
                    table = "sales_channels",
                    filters = listOf<Map<String, Any?>>(
                        mapOf<String, Any?>("type" to "is", "col" to "deleted_at", "val" to null),
                        mapOf<String, Any?>("type" to "eq", "col" to "active", "val" to true)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                fun normalizeChannelName(name: String) = name.lowercase()
                    .replace('ı', 'i').replace('ş', 's').replace('ç', 'c')
                    .replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o')
                    .trim()

                // QR kanalı öncelik sırası (MobileAppShells ile aynı)
                val qrPreferred = listOf("qr menu", "qr menü", "qr")
                // Kiosk fallback
                val kioskPreferred = listOf("kiosk")

                fun findByNames(names: List<String>): Map<String, Any>? {
                    return names.firstNotNullOfOrNull { target ->
                        rows.find { row -> normalizeChannelName(row["name"] as? String ?: "") == normalizeChannelName(target) }
                    }
                }

                val row = findByNames(qrPreferred)
                    ?: findByNames(kioskPreferred)
                    ?: rows.firstOrNull()
                    ?: return@withContext null

                MenuChannel(
                    id = row["id"] as? String ?: return@withContext null,
                    name = row["name"] as? String ?: "QR Menu"
                )
            } catch (e: Exception) {
                Log.w("TableRepository", "fetchMenuChannel error", e)
                null
            }
        }
    }

    // ─── Kategoriler ──────────────────────────────────────────────────────────

    suspend fun fetchCategories(): List<MenuCategory> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "sale_categories",
                    select = "id,name,parent_id,bg,text_color,image_url",
                    filters = listOf<Map<String, Any?>>(
                        mapOf<String, Any?>("type" to "is", "col" to "deleted_at", "val" to null)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val allCats = rows.map { row ->
                    MenuCategory(
                        id = row["id"] as? String ?: "",
                        name = row["name"] as? String ?: "",
                        parentId = row["parent_id"] as? String,
                        bg = row["bg"] as? String ?: "#fef3c7",
                        textColor = row["text_color"] as? String ?: "#92400e",
                        imageUrl = ApiClient.resolveImageUrl(row["image_url"] as? String)
                    )
                }.filter { it.id.isNotBlank() }

                // Combo menü duplikasyon filtresi:
                // "Menüler" / "Menuler" normalleşince aynı olan kategorilerden
                // yalnızca ilkini göster (aynı mantık KioskBig'deki isComboMenuCategory ile aynı)
                val seen = mutableSetOf<String>()
                allCats.filter { cat ->
                    val normalized = cat.name
                        .lowercase()
                        .replace('ı', 'i')
                        .replace('ş', 's')
                        .replace('ç', 'c')
                        .replace('ğ', 'g')
                        .replace('ü', 'u')
                        .replace('ö', 'o')
                        .replace(Regex("[^a-z0-9]+"), "")
                    // Eğer bu normalize isim daha önce eklendiyse, duplikat — atla
                    seen.add(normalized)
                }
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchCategories error", e)
                emptyList()
            }
        }
    }

    // ─── Ürünler ─────────────────────────────────────────────────────────────

    suspend fun fetchProducts(channelId: String?): List<MenuItem> {
        return withContext(Dispatchers.IO) {
            try {
                val filters = mutableListOf<Map<String, Any?>>(
                    mapOf<String, Any?>("type" to "eq", "col" to "active", "val" to true),
                    mapOf<String, Any?>("type" to "is", "col" to "deleted_at", "val" to null)
                )
                // MobileAppShells.jsx MOBILE_PRODUCT_SELECT ile aynı kolonlar
                val req = QueryRequest(
                    table = "sale_items",
                    select = "id,name,short_name,sku,standard_price,channel_prices,portions,option_groups,channel_image,pos_image,channel_description,prep_time_minutes,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5",
                    filters = filters
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                rows.mapNotNull { row ->
                    val id = row["id"] as? String ?: return@mapNotNull null
                    val standardPrice = (row["standard_price"] as? Number)?.toDouble()
                        ?: (row["sale_price"] as? Number)?.toDouble() ?: 0.0

                    // Channel fiyatı hesapla
                    val channelPrice = if (channelId != null) {
                        val channelPricesRaw = row["channel_prices"]
                        val channelPrices = parseJsonList(channelPricesRaw)
                        val match = channelPrices.find { entry ->
                            (entry["channel_id"] as? String) == channelId &&
                                    entry["active"] != false
                        }
                        (match?.get("price") as? Number)?.toDouble() ?: standardPrice
                    } else standardPrice

                    // Yalnızca channel'da aktif ürünleri göster
                    if (channelId != null) {
                        val channelPricesRaw = row["channel_prices"]
                        val channelPrices = parseJsonList(channelPricesRaw)
                        val hasActiveChannelPrice = channelPrices.any { entry ->
                            (entry["channel_id"] as? String) == channelId &&
                                    entry["active"] != false
                        }
                        if (!hasActiveChannelPrice) return@mapNotNull null
                    }

                    // Porsiyonlar
                    val portionsList = parseJsonList(row["portions"]).mapNotNull { p ->
                        val pid = p["id"] as? String ?: return@mapNotNull null
                        PortionItem(
                            id = pid,
                            name = p["name"] as? String ?: "",
                            priceOffset = (p["price_offset"] as? Number)?.toDouble() ?: 0.0
                        )
                    }

                    // Seçenek grup ID'leri (legacy lookup için)
                    val optionGroupIds = parseJsonList(row["option_groups"]).mapNotNull { og ->
                        (og["option_group_id"] as? String) ?: (og["id"] as? String)
                    }

                    // Embedded seçenek grupları (sale_items.option_groups içinden direkt parse)
                    // KioskBig ile aynı yapı: { group_name, min_select, max_select, options: [{id, name, price}] }
                    val embeddedOptionGroups = parseJsonList(row["option_groups"]).mapIndexedNotNull { idx, og ->
                        val rawOptions = parseJsonList(og["options"])
                        // selection_rules meta girdisini ayrıştır
                        val metaRules = rawOptions.find { (it["__meta_type"] as? String) == "selection_rules" }
                        val realOptions = rawOptions.filter { (it["__meta_type"] as? String) != "selection_rules" }

                        // Grup adı: group_name veya name alanı
                        val groupName = (og["group_name"] ?: og["name"]) as? String ?: "Seçenekler"
                        val groupId = (og["option_group_id"] ?: og["id"]) as? String
                            ?: "grp_${id}_$idx"
                        val minSel = (metaRules?.get("min_select") as? Number)?.toInt()
                            ?: (og["min_select"] as? Number)?.toInt() ?: 0
                        val maxSel = (metaRules?.get("max_select") as? Number)?.toInt()
                            ?: (og["max_select"] as? Number)?.toInt() ?: 1

                        if (realOptions.isEmpty()) return@mapIndexedNotNull null

                        OptionGroup(
                            id = groupId,
                            name = groupName,
                            minSelect = minSel,
                            maxSelect = maxSel.coerceAtLeast(1),
                            options = realOptions.mapIndexedNotNull { optIdx, opt ->
                                val oid = (opt["id"] as? String) ?: "opt_${idx}_$optIdx"
                                OptionItem(
                                    id = oid,
                                    name = opt["name"] as? String ?: "",
                                    price = (opt["price"] as? Number)?.toDouble() ?: 0.0
                                )
                            }
                        )
                    }

                    MenuItem(
                        id = id,
                        name = row["name"] as? String ?: "",
                        standardPrice = standardPrice,
                        channelPrice = channelPrice,
                        // Göreli path → tam URL (örn. /api/files/xxx.jpg → https://...)
                        channelImage = ApiClient.resolveImageUrl(
                            (row["channel_image"] as? String)?.ifBlank { null }
                                ?: (row["pos_image"] as? String)?.ifBlank { null }
                        ),
                        channelDescription = row["channel_description"] as? String,
                        saleCatL1 = row["sale_cat_l1"] as? String,
                        saleCatL2 = row["sale_cat_l2"] as? String,
                        saleCatL3 = row["sale_cat_l3"] as? String,
                        saleCatL4 = row["sale_cat_l4"] as? String,
                        saleCatL5 = row["sale_cat_l5"] as? String,
                        portions = portionsList,
                        embeddedOptionGroups = embeddedOptionGroups,
                        optionGroupIds = optionGroupIds,
                        prepTimeMinutes = (row["prep_time_minutes"] as? Number)?.toInt() ?: 0
                    )
                }
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchProducts error", e)
                emptyList()
            }
        }
    }

    // ─── Seçenek Grupları ─────────────────────────────────────────────────────

    suspend fun fetchOptionGroups(ids: List<String>): List<OptionGroup> {
        if (ids.isEmpty()) return emptyList()
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "option_groups",
                    filters = listOf<Map<String, Any?>>(
                        mapOf<String, Any?>("type" to "in", "col" to "id", "val" to ids),
                        mapOf<String, Any?>("type" to "is", "col" to "deleted_at", "val" to null)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                rows.mapNotNull { row ->
                    val id = row["id"] as? String ?: return@mapNotNull null
                    val optionsList = parseJsonList(row["options"])
                    val rules = optionsList.find { (it["__meta_type"] as? String) == "selection_rules" }
                    val actualOptions = optionsList.filter { (it["__meta_type"] as? String) != "selection_rules" }
                    OptionGroup(
                        id = id,
                        name = (row["name"] ?: row["group_name"]) as? String ?: "",
                        minSelect = (rules?.get("min_select") as? Number)?.toInt() ?: 0,
                        maxSelect = (rules?.get("max_select") as? Number)?.toInt() ?: 1,
                        options = actualOptions.mapNotNull { opt ->
                            val oid = opt["id"] as? String ?: return@mapNotNull null
                            OptionItem(
                                id = oid,
                                name = opt["name"] as? String ?: "",
                                price = (opt["price"] as? Number)?.toDouble() ?: 0.0
                            )
                        }
                    )
                }
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchOptionGroups error", e)
                emptyList()
            }
        }
    }

    // ─── Masa Siparişleri ─────────────────────────────────────────────────────

    suspend fun fetchTodayTableOrders(branchId: String, tableNumber: String, sessionStart: Long? = null): List<TableOrder> {
        return withContext(Dispatchers.IO) {
            try {
                // Eğer sessionStart verilmişse (cihaz saati sapmalarına karşı 5 dk geri alıyoruz)
                // Verilmemişse günün başından itibaren al.
                val startTime = if (sessionStart != null) {
                    java.time.Instant.ofEpochMilli(sessionStart - 5 * 60 * 1000).toString()
                } else {
                    java.time.LocalDate.now()
                        .atStartOfDay(java.time.ZoneOffset.UTC)
                        .toInstant()
                        .toString()
                }

                val req = QueryRequest(
                    table = "sales",
                    filters = listOf<Map<String, Any?>>(
                        mapOf<String, Any?>("type" to "eq", "col" to "branch_id", "val" to branchId),
                        mapOf<String, Any?>("type" to "eq", "col" to "kiosk_table_number", "val" to tableNumber),
                        mapOf<String, Any?>("type" to "gte", "col" to "sale_datetime", "val" to startTime),
                        mapOf<String, Any?>("type" to "not_in", "col" to "status", "val" to listOf("cancelled", "refunded")),
                        mapOf<String, Any?>("type" to "is", "col" to "deleted_at", "val" to null)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val tempOrders = rows.mapNotNull { row ->
                    val id = row["id"] as? String ?: return@mapNotNull null
                    val parseDouble = { v: Any? ->
                        when (v) {
                            is Number -> v.toDouble()
                            is String -> v.toDoubleOrNull() ?: 0.0
                            else -> 0.0
                        }
                    }
                    val gross = parseDouble(row["gross_total_after_discount"])
                    val payment = parseDouble(row["payment_total"])
                    val beforeDiscount = parseDouble(row["gross_total_before_discount"])
                    val finalTotal = if (gross != 0.0) gross else if (payment != 0.0) payment else if (beforeDiscount != 0.0) beforeDiscount else 0.0

                    TableOrder(
                        id = id,
                        saleDateTime = row["sale_datetime"] as? String ?: "",
                        orderNote = row["order_note"] as? String,
                        grossTotal = finalTotal,
                        status = row["status"] as? String ?: ""
                    )
                }

                val saleIds = tempOrders.map { it.id }
                val linesMap = fetchSaleLinesForIds(saleIds)

                tempOrders.map { order ->
                    order.copy(lines = linesMap[order.id] ?: emptyList())
                }.sortedByDescending { it.saleDateTime }
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchTodayTableOrders error", e)
                emptyList()
            }
        }
    }

    private suspend fun fetchSaleLinesForIds(saleIds: List<String>): Map<String, List<TableOrderLine>> {
        if (saleIds.isEmpty()) return emptyMap()
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "sale_lines",
                    select = "id,sale_id,product_name,portion_name,qty,unit_gross_after_discount,line_gross_after_discount,options_json",
                    filters = listOf(
                        mapOf("type" to "in", "col" to "sale_id", "val" to saleIds),
                        mapOf("type" to "is", "col" to "deleted_at", "val" to null)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                
                val parseDouble = { v: Any? ->
                    when (v) {
                        is Number -> v.toDouble()
                        is String -> v.toDoubleOrNull() ?: 0.0
                        else -> 0.0
                    }
                }
                
                rows.mapNotNull { row ->
                    val id = row["id"] as? String ?: return@mapNotNull null
                    val saleId = row["sale_id"] as? String ?: return@mapNotNull null
                    val productName = row["product_name"] as? String ?: ""
                    val portionName = row["portion_name"] as? String
                    val qty = parseDouble(row["qty"])
                    val unitPrice = parseDouble(row["unit_gross_after_discount"])
                    val lineTotal = parseDouble(row["line_gross_after_discount"])
                    
                    val optionsJson = row["options_json"]
                    val optionsList = parseJsonList(optionsJson)
                    val optionsSummary = if (optionsList.isNotEmpty()) {
                        optionsList.mapNotNull { opt ->
                            (opt["option_name"] as? String ?: opt["name"] as? String)
                        }.filter { it.isNotBlank() }.joinToString(", ").ifBlank { null }
                    } else null
                    
                    saleId to TableOrderLine(
                        id = id,
                        productName = productName,
                        portionName = portionName,
                        qty = qty,
                        unitPrice = unitPrice,
                        lineTotal = lineTotal,
                        optionsSummary = optionsSummary
                    )
                }.groupBy({ it.first }, { it.second })
            } catch (e: Exception) {
                Log.e("TableRepository", "fetchSaleLinesForIds error", e)
                emptyMap()
            }
        }
    }

    suspend fun isTableOccupied(branchId: String, tableId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val settingKey = "garson_open_table_tickets_v2"
                val readReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to settingKey))
                )
                val readRes = ApiClient.apiService.executeQuery(readReq)
                val rows = (readRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val existingValue = rows.firstOrNull()?.get("value")

                @Suppress("UNCHECKED_CAST")
                val allState: Map<String, Any> = when (existingValue) {
                    is Map<*, *> -> existingValue as Map<String, Any>
                    else -> return@withContext false
                }

                @Suppress("UNCHECKED_CAST")
                val branchState = allState[branchId] as? Map<String, Any> ?: return@withContext false
                val currentTicket = branchState[tableId] as? Map<String, Any> ?: return@withContext false
                val cart = currentTicket["cart"] as? List<*>
                cart != null && cart.isNotEmpty()
            } catch (e: Exception) {
                Log.e("TableRepository", "isTableOccupied error", e)
                false
            }
        }
    }

    suspend fun leaveTable(branchId: String, tableId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val settingKey = "garson_open_table_tickets_v2"
                val readReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to settingKey))
                )
                val readRes = ApiClient.apiService.executeQuery(readReq)
                val rows = (readRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val existingValue = rows.firstOrNull()?.get("value")

                @Suppress("UNCHECKED_CAST")
                val allState: MutableMap<String, Any> = when (existingValue) {
                    is Map<*, *> -> (existingValue as Map<String, Any>).toMutableMap()
                    else -> mutableMapOf()
                }

                @Suppress("UNCHECKED_CAST")
                val branchState: MutableMap<String, Any> = when (val b = allState[branchId]) {
                    is Map<*, *> -> (b as Map<String, Any>).toMutableMap()
                    else -> return@withContext true
                }

                if (branchState.containsKey(tableId)) {
                    branchState.remove(tableId)
                    allState[branchId] = branchState

                    val upsertData = mapOf<String, Any>(
                        "key" to settingKey,
                        "value" to allState
                    )
                    val res = ApiClient.apiService.executeQuery(
                        QueryRequest(table = "settings", operation = "upsert", data = upsertData)
                    )
                    res.error == null
                } else {
                    true
                }
            } catch (e: Exception) {
                Log.e("TableRepository", "leaveTable error", e)
                false
            }
        }
    }

    // ─── Sipariş Gönder ───────────────────────────────────────────────────────

    suspend fun submitOrder(
        tableId: String,
        tableName: String,
        tableNumber: String,
        branchId: String,
        channelId: String?,
        channelName: String?,
        cartItems: List<CartItem>,
        orderNote: String,
        customerId: String?,
        personnelId: String? = null,
        personnelName: String? = null
    ): Result<String> {
        return withContext(Dispatchers.IO) {
            try {
                val now = java.time.Instant.now().toString()
                val saleId = java.util.UUID.randomUUID().toString()

                val grossTotal = cartItems.sumOf { it.unitPrice * it.qty }
                val noteText = buildString {
                    if (orderNote.isNotBlank()) append(orderNote)
                    if (isNotEmpty()) append(" | ")
                    append("Masa: $tableName (No: $tableNumber)")
                }.trim().trimStart('|').trim()

                val saleHeader = mutableMapOf<String, Any>(
                    "id" to saleId,
                    "sale_datetime" to now,
                    "source" to if (!personnelId.isNullOrBlank()) "waiter_app" else "qr_menu",
                    "source_channel_type" to if (!personnelId.isNullOrBlank()) "waiter" else "qr_menu",
                    "branch_id" to branchId,
                    "kiosk_service_type" to "table_service",
                    "kiosk_table_number" to tableNumber,
                    "table_no" to tableNumber,
                    "gross_total_before_discount" to grossTotal,
                    "discount_amount" to 0.0,
                    "gross_total_after_discount" to grossTotal,
                    "net_total_after_discount" to grossTotal,
                    "payment_total" to grossTotal,
                    "cost_total" to 0.0,
                    "change_amount" to 0.0,
                    "status" to "completed",
                    "kds_status" to "pending",
                    "currency_code" to "TRY",
                    "updated_at" to now
                )
                if (!personnelId.isNullOrBlank()) {
                    saleHeader["personnel_id"] = personnelId
                    saleHeader["personnel_name"] = personnelName ?: "Garson"
                }
                if (!channelId.isNullOrBlank()) {
                    saleHeader["sales_channel_id"] = channelId
                    saleHeader["sales_channel_name"] = channelName ?: "QR Menü"
                }
                if (!customerId.isNullOrBlank()) saleHeader["customer_id"] = customerId
                if (noteText.isNotBlank()) saleHeader["order_note"] = noteText

                // 1) Sales insert
                val saleReq = QueryRequest(
                    table = "sales",
                    operation = "insert",
                    data = saleHeader
                )
                val saleRes = ApiClient.apiService.executeQuery(saleReq)
                if (saleRes.error != null) {
                    return@withContext Result.failure(Exception("Sipariş kaydedilemedi: ${saleRes.error}"))
                }

                // 2) Sale lines insert
                val lines = cartItems.mapIndexed { idx, item ->
                    val lineGross = item.unitPrice * item.qty
                    val optionsJson = item.selectedOptions.map { opt ->
                        mapOf(
                            "group_id" to opt.groupId,
                            "group_name" to opt.groupName,
                            "option_id" to opt.optionId,
                            "option_name" to opt.optionName,
                            "price" to opt.price
                        )
                    }
                    val lineMap = mutableMapOf<String, Any>(
                        "id" to java.util.UUID.randomUUID().toString(),
                        "sale_id" to saleId,
                        "line_no" to (idx + 1),
                        "product_id" to item.itemId,
                        "product_name" to item.name,
                        "qty" to item.qty,
                        "unit_gross_before_discount" to item.unitPrice,
                        "line_gross_before_discount" to lineGross,
                        "discount_allocated_amount" to 0.0,
                        "unit_gross_after_discount" to item.unitPrice,
                        "line_gross_after_discount" to lineGross,
                        "line_net_after_discount" to lineGross,
                        "tax_rate" to 0.0,
                        "unit_cost_snapshot" to 0.0,
                        "line_cost_total" to 0.0,
                        "kds_completed" to false,
                        "options_json" to optionsJson,
                        "branch_id" to branchId,
                        "sale_datetime" to now
                    )
                    if (!channelId.isNullOrBlank()) lineMap["sales_channel_id"] = channelId
                    if (!item.portionId.isNullOrBlank()) lineMap["portion_id"] = item.portionId!!
                    if (!item.portionName.isNullOrBlank()) lineMap["portion_name"] = item.portionName!!
                    lineMap
                }

                for (line in lines) {
                    val lineReq = QueryRequest(
                        table = "sale_lines",
                        operation = "insert",
                        data = line
                    )
                    val lineRes = ApiClient.apiService.executeQuery(lineReq)
                    if (lineRes.error != null) {
                        Log.w("TableRepository", "sale_line insert error: ${lineRes.error}")
                    }
                }

                // 3) Sale payment insert (masa hesabı → "table" ödeme yöntemi)
                val paymentMap: Map<String, Any> = mapOf(
                    "id" to java.util.UUID.randomUUID().toString(),
                    "sale_id" to saleId,
                    "payment_method" to "table",
                    "payment_method_label" to "Masa Hesabı",
                    "amount" to grossTotal,
                    "payment_datetime" to now
                )
                val payReq = QueryRequest(
                    table = "sale_payments",
                    operation = "insert",
                    data = paymentMap
                )
                ApiClient.apiService.executeQuery(payReq)


                // 4) Garson Ekranı için açık adisyona ürün ekle (posTablePersistence.js ile aynı mantık)
                // settings tablosundaki "garson_open_table_tickets_v2" key'ini güncelle
                // Garson.jsx bu key'i polling ile okur → siparişler anlık görünür
                try {
                    appendToOpenTableTicket(
                        branchId = branchId,
                        tableId  = tableId,
                        cartItems = cartItems,
                        orderNote = noteText,
                        channelId = channelId,
                        customerId = customerId
                    )
                } catch (e2: Exception) {
                    Log.w("TableRepository", "appendToOpenTableTicket error (non-fatal)", e2)
                }

                Result.success(saleId)
            } catch (e: Exception) {
                Log.e("TableRepository", "submitOrder error", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Garson ekranının adisyon sistemine ürün ekle.
     * posTablePersistence.js → appendItemsToOpenTableTicket ile AYNI MANTIK:
     *   settings[garson_open_table_tickets_v2][branchId][tableId].cart += items
     */
    private suspend fun appendToOpenTableTicket(
        branchId: String,
        tableId: String,
        cartItems: List<CartItem>,
        orderNote: String,
        channelId: String?,
        customerId: String?
    ) {
        val settingKey = "garson_open_table_tickets_v2"

        // Mevcut settings değerini oku
        val readReq = QueryRequest(
            table = "settings",
            select = "value",
            filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to settingKey))
        )
        val readRes = ApiClient.apiService.executeQuery(readReq)
        val rows = (readRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
        val existingValue = rows.firstOrNull()?.get("value")

        // Mevcut state'i parse et: { branchId: { tableId: { cart: [], orderNote: "" } } }
        @Suppress("UNCHECKED_CAST")
        val allState: MutableMap<String, Any> = when (existingValue) {
            is Map<*, *> -> (existingValue as Map<String, Any>).toMutableMap()
            else -> mutableMapOf()
        }

        @Suppress("UNCHECKED_CAST")
        val branchState: MutableMap<String, Any> = when (val b = allState[branchId]) {
            is Map<*, *> -> (b as Map<String, Any>).toMutableMap()
            else -> mutableMapOf()
        }

        @Suppress("UNCHECKED_CAST")
        val currentTicket: MutableMap<String, Any> = when (val t = branchState[tableId]) {
            is Map<*, *> -> (t as Map<String, Any>).toMutableMap()
            else -> mutableMapOf("cart" to listOf<Any>(), "orderNote" to "")
        }

        // Müşteri bilgisi varsa, open ticket içine ekle ki garson ekranında loyalty aktif olsun
        if (!customerId.isNullOrBlank()) {
            try {
                val custReq = QueryRequest(
                    table = "musteriler",
                    filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to customerId))
                )
                val custRes = ApiClient.apiService.executeQuery(custReq)
                val custRow = (custRes.data as? List<*>)?.firstOrNull() as? Map<String, Any>
                if (custRow != null) {
                    val customerData = mapOf(
                        "id" to customerId,
                        "customerId" to customerId,
                        "customerName" to (custRow["ad_soyad"] as? String ?: ""),
                        "phone" to (custRow["telefon"] as? String ?: ""),
                        "customerCategoryIds" to emptyList<String>(),
                        "customerCreatedAt" to (custRow["created_at"] as? String ?: ""),
                        "customerFirstOrderAt" to (custRow["first_order_at"] as? String ?: ""),
                        "tierPointsMultiplier" to 1
                    )
                    currentTicket["customer"] = customerData
                }
            } catch (e: Exception) {
                Log.w("TableRepository", "Failed to fetch customer for ticket append", e)
            }
        }

        val productIds = cartItems.map { it.itemId }.distinct()
        val productMap = try {
            val prodReq = QueryRequest(
                table = "sale_items",
                select = "id,name,pos_image,channel_image,pos_color,pos_text_color",
                filters = listOf(mapOf("type" to "in", "col" to "id", "val" to productIds))
            )
            val prodRes = ApiClient.apiService.executeQuery(prodReq)
            val prodRows = (prodRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
            prodRows.associateBy { it["id"] as? String ?: "" }
        } catch (e: Exception) {
            Log.w("TableRepository", "Failed to fetch sale_items details for ticket append", e)
            emptyMap()
        }

        @Suppress("UNCHECKED_CAST")
        val currentCart: MutableList<Any> = when (val c = currentTicket["cart"]) {
            is List<*> -> c.filterNotNull().toMutableList()
            else -> mutableListOf()
        }

        // Cart item'ları posTablePersistence formatına çevir
        val newItems = cartItems.map { item ->
            val itemId = "qr${System.currentTimeMillis().toString(36)}${(Math.random() * 0xFFFF).toInt().toString(36)}"
            val optionsList = item.selectedOptions.map { opt ->
                mapOf(
                    "group_id" to opt.groupId,
                    "group_name" to opt.groupName,
                    "option_id" to opt.optionId,
                    "option_name" to opt.optionName,
                    "name" to opt.optionName,
                    "price" to opt.price
                )
            }
            val dbProd = productMap[item.itemId] ?: emptyMap()
            val prodObj = mapOf(
                "id" to item.itemId,
                "name" to (dbProd["name"] as? String ?: item.name),
                "pos_image" to (ApiClient.resolveImageUrl(dbProd["pos_image"] as? String) ?: ""),
                "channel_image" to (ApiClient.resolveImageUrl(dbProd["channel_image"] as? String) ?: ""),
                "pos_color" to (dbProd["pos_color"] ?: "#1e293b"),
                "pos_text_color" to (dbProd["pos_text_color"] ?: "#ffffff")
            )
            val portionObj = if (!item.portionId.isNullOrBlank()) {
                mapOf("id" to item.portionId, "name" to (item.portionName ?: ""))
            } else null

            mutableMapOf<String, Any?>(
                "id" to itemId,
                "itemId" to item.itemId,
                "name" to item.name,
                "qty" to item.qty,
                "unitPrice" to item.unitPrice,
                "portionId" to item.portionId,
                "portionName" to item.portionName,
                "portion" to portionObj,
                "selectedOptions" to optionsList,
                "options" to optionsList,
                "prod" to prodObj,
                "sourceChannel" to "qr",
                "sourceLabel" to "QR Siparişi",
                "createdFromQr" to true
            ).filterValues { it != null }
        }

        currentCart.addAll(newItems)

        // orderNote birleştir (aynı notu iki kez ekleme)
        val existingNote = currentTicket["orderNote"] as? String ?: ""
        val combinedNote = listOf(existingNote.trim(), orderNote.trim())
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(" | ")

        currentTicket["cart"] = currentCart
        currentTicket["orderNote"] = combinedNote
        currentTicket["updatedAt"] = java.time.Instant.now().toString()

        branchState[tableId] = currentTicket
        allState[branchId] = branchState

        // settings'e upsert et
        val upsertData = mapOf<String, Any>(
            "key" to settingKey,
            "value" to allState
        )
        ApiClient.apiService.executeQuery(
            QueryRequest(table = "settings", operation = "upsert", data = upsertData)
        )
    }

    /**
     * Masa değiştirme durumunda eski masanın adisyonunu yeni masaya taşır.
     * settings[garson_open_table_tickets_v2][branchId][oldTableId] -> newTableId
     */
    suspend fun transferTableTicket(branchId: String, oldTableId: String, newTableId: String): Boolean {
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val settingKey = "garson_open_table_tickets_v2"
                val readReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to settingKey))
                )
                val readRes = ApiClient.apiService.executeQuery(readReq)
                val rows = (readRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val existingValue = rows.firstOrNull()?.get("value")

                @Suppress("UNCHECKED_CAST")
                val allState: MutableMap<String, Any> = when (existingValue) {
                    is Map<*, *> -> (existingValue as Map<String, Any>).toMutableMap()
                    else -> mutableMapOf()
                }

                @Suppress("UNCHECKED_CAST")
                val branchState: MutableMap<String, Any> = when (val b = allState[branchId]) {
                    is Map<*, *> -> (b as Map<String, Any>).toMutableMap()
                    else -> return@withContext false
                }

                val oldTicket = branchState[oldTableId] ?: return@withContext false

                // Transfer ticket
                branchState[newTableId] = oldTicket
                branchState.remove(oldTableId)
                allState[branchId] = branchState

                // settings'e upsert et
                val upsertData = mapOf<String, Any>(
                    "key" to settingKey,
                    "value" to allState
                )
                ApiClient.apiService.executeQuery(
                    QueryRequest(table = "settings", operation = "upsert", data = upsertData)
                )
                true
            } catch (e: Exception) {
                Log.e("TableRepository", "transferTableTicket error", e)
                false
            }
        }
    }

    // ─── Yardımcılar ─────────────────────────────────────────────────────────

    @Suppress("UNCHECKED_CAST")
    private fun parseJsonList(raw: Any?): List<Map<String, Any>> {
        if (raw == null) return emptyList()
        return when (raw) {
            is List<*> -> raw.mapNotNull { it as? Map<String, Any> }
            is String -> {
                try {
                    val parsed = ApiClient.gson.fromJson(raw, List::class.java)
                    (parsed as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                } catch (_: Exception) { emptyList() }
            }
            else -> emptyList()
        }
    }
}


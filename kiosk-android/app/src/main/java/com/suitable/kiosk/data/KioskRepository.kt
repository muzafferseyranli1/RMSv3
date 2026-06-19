package com.suitable.kiosk.data

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.suitable.kiosk.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

/**
 * Tüm API çağrılarının yapıldığı veri katmanı.
 *
 * Web'deki src/lib/db.js ile aynı Railway /api/query endpoint'ini kullanır.
 * Supabase veya AWS'ye bağlanmaz.
 */
class KioskRepository(private val api: ApiService) {

    private val gson = Gson()

    // ─── Eşleme ─────────────────────────────────────────────────────────────

    suspend fun pairDevice(stationCode: String): PairingResult {
        return try {
            val body = buildQuery(
                table = "pos_terminals",
                operation = "select",
                filters = mapOf("activation_code" to stationCode.uppercase().trim()),
                select = "id,activation_code,device_type,branch_id,terminal_name,is_active,config_data"
            )
            val response = api.query(body)
            if (response.has("error") && !response.get("error").isJsonNull) {
                val errorObj = response.getAsJsonObject("error")
                val errorMsg = errorObj?.str("message") ?: "API Hatası"
                return PairingResult.Error(errorMsg)
            }
            val rows = if (response.has("data") && response.get("data").isJsonArray) {
                response.getAsJsonArray("data")
            } else {
                JsonArray()
            }
            if (rows.size() == 0) return PairingResult.NotFound

            val terminal = rows[0].asJsonObject
            val deviceType = terminal.str("device_type")
            val mode = KioskMode.fromTerminalType(deviceType)
                ?: return PairingResult.UnknownType(deviceType)
            if (terminal.bool("is_active") == false) return PairingResult.Inactive

            PairingResult.Success(
                mode = mode,
                stationCode = terminal.str("activation_code") ?: stationCode,
                terminalId = terminal.str("id") ?: "",
                branchId = terminal.str("branch_id"),
                label = terminal.str("terminal_name"),
            )
        } catch (e: Exception) {
            PairingResult.Error(e.message ?: "Bilinmeyen hata")
        }
    }

    // ─── Menü yükleme ────────────────────────────────────────────────────────

    /**
     * Tüm menü verisini yükler.
     * Ağ yoksa [MenuLoadState.Offline] döner.
     */
    suspend fun loadMenuData(branchId: String, terminalId: String): MenuLoadState {
        return try {
            val categories = loadCategories()
            val items = loadSaleItems()
            val channel = loadKioskChannel()
            val optionGroups = loadOptionGroups()
            val operatingRules = loadOperatingRules(branchId)
            val terminalRules = loadTerminalRules()
            val branchName = loadBranchName(branchId)

            MenuLoadState.Ready(
                MenuData(
                    categories = categories,
                    items = items,
                    kioskChannel = channel,
                    optionGroups = optionGroups,
                    operatingRules = operatingRules,
                    terminalRules = terminalRules,
                    branchName = branchName,
                )
            )
        } catch (e: java.net.UnknownHostException) {
            MenuLoadState.Offline
        } catch (e: java.net.SocketTimeoutException) {
            MenuLoadState.Offline
        } catch (e: Exception) {
            MenuLoadState.Error(e.message ?: "Menü yüklenemedi")
        }
    }

    private suspend fun loadBranchName(branchId: String): String? {
        return try {
            val body = buildQuery(
                table = "branches",
                operation = "select",
                select = "name",
                filters = mapOf("id" to branchId),
            )
            val response = api.query(body)
            if (response.has("data") && response.get("data").isJsonArray) {
                val arr = response.getAsJsonArray("data")
                if (arr.size() > 0) {
                    arr[0].asJsonObject.get("name")?.asString
                } else null
            } else null
        } catch (_: Exception) { null }
    }

    private suspend fun loadCategories(): List<SaleCategory> {
        val body = buildQuery(
            table = "sale_categories",
            operation = "select",
            select = "id,name,parent_id,image_url,bg,text_color,deleted_at",
            nullFilters = listOf("deleted_at"),
        )
        return parseList(api.query(body))
    }

    private suspend fun loadSaleItems(): List<SaleItem> {
        val body = buildQuery(
            table = "sale_items",
            operation = "select",
            select = "id,name,sku,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,channel_prices,portions,option_groups,channel_image,channel_description,prep_time_minutes,tax_id,active,deleted_at",
            filters = mapOf("active" to true),
            nullFilters = listOf("deleted_at"),
        )
        return parseList(api.query(body))
    }

    private suspend fun loadKioskChannel(): SalesChannel? {
        val body = buildQuery(
            table = "sales_channels",
            operation = "select",
            select = "id,name",
            ilikeFilters = mapOf("name" to "kiosk"),
            nullFilters = listOf("deleted_at"),
        )
        return parseList<SalesChannel>(api.query(body)).firstOrNull()
    }

    private suspend fun loadOptionGroups(): List<OptionGroup> {
        val body = buildQuery(
            table = "option_groups",
            operation = "select",
            select = "id,name,options,min_select,max_select,deleted_at",
            nullFilters = listOf("deleted_at"),
        )
        return parseList(api.query(body))
    }

    private suspend fun loadOperatingRules(branchId: String): List<OperatingHoursRule> {
        val body = buildQuery(
            table = "kiosk_operating_hours_rules",
            operation = "select",
            select = "*",
            filters = mapOf("branch_id" to branchId),
        )
        return parseList(api.query(body))
    }

    private suspend fun loadTerminalRules(): List<TerminalOperatingRule> {
        val body = buildQuery(
            table = "kiosk_terminal_operating_rules",
            operation = "select",
            select = "terminal_id,rule_id",
        )
        return parseList(api.query(body))
    }

    // ─── Kiosk ayarları ──────────────────────────────────────────────────────

    suspend fun loadKioskSettingsJson(): JsonObject? {
        return try {
            val body = buildQuery(
                table = "settings",
                operation = "select",
                select = "value",
                filters = mapOf("key" to "kiosk_settings_v2"),
            )
            val response = api.query(body)
            val rows = if (response.has("data") && response.get("data").isJsonArray) {
                response.getAsJsonArray("data")
            } else null
            if (rows == null || rows.size() == 0) return null
            rows[0].asJsonObject.getAsJsonObject("value")
        } catch (_: Exception) { null }
    }

    suspend fun loadComboMenusJson(): JsonArray? {
        return try {
            val body = buildQuery(
                table = "settings",
                operation = "select",
                select = "value",
                filters = mapOf("key" to "combo_menus_v1"),
            )
            val response = api.query(body)
            val rows = if (response.has("data") && response.get("data").isJsonArray) {
                response.getAsJsonArray("data")
            } else null
            if (rows == null || rows.size() == 0) return null
            val value = rows[0].asJsonObject.get("value")
            val element = if (value != null && value.isJsonPrimitive && value.asJsonPrimitive.isString) {
                try {
                    com.google.gson.JsonParser.parseString(value.asString)
                } catch (_: Exception) { value }
            } else {
                value
            }

            val rawArr = if (element != null && element.isJsonArray) {
                element.asJsonArray
            } else if (element != null && element.isJsonObject && element.asJsonObject.has("records")) {
                element.asJsonObject.getAsJsonArray("records")
            } else null

            if (rawArr != null) {
                val normalizedArr = JsonArray()
                for (el in rawArr) {
                    if (!el.isJsonObject) continue
                    val obj = el.asJsonObject
                    if (obj.has("groups") && obj.get("groups").isJsonArray) {
                        normalizedArr.add(obj)
                    } else if (obj.has("items") && obj.get("items").isJsonArray) {
                        val newObj = JsonObject()
                        newObj.addProperty("id", obj.get("id")?.asString ?: "")
                        newObj.addProperty("name", obj.get("name")?.asString ?: "")
                        newObj.addProperty("sku", obj.get("sku")?.asString ?: "")
                        newObj.addProperty("active", obj.get("active")?.asBoolean != false)
                        newObj.addProperty("deleted", obj.get("deleted")?.asBoolean == true)

                        val form = JsonObject()
                        form.addProperty("name", obj.get("name")?.asString ?: "")
                        form.addProperty("sku", obj.get("sku")?.asString ?: "")
                        form.addProperty("pricingStrategy", "set-price")
                        val comboPrice = obj.get("combo_price")?.asDouble ?: 0.0
                        form.addProperty("defaultComboPrice", comboPrice)
                        newObj.add("form", form)

                        newObj.add("channelConfig", JsonObject())

                        val groups = JsonArray()
                        val items = obj.getAsJsonArray("items")
                        items.forEachIndexed { idx, itemEl ->
                            if (itemEl.isJsonObject) {
                                val itemObj = itemEl.asJsonObject
                                val group = JsonObject()
                                val groupId = "g-$idx"
                                group.addProperty("id", groupId)
                                group.addProperty("name", itemObj.get("name")?.asString ?: "Seçim")
                                group.addProperty("primaryItemId", itemObj.get("sale_item_id")?.asString ?: "")
                                group.add("alternatives", JsonArray())
                                group.add("optionGroups", JsonArray())
                                groups.add(group)
                            }
                        }
                        newObj.add("groups", groups)
                        normalizedArr.add(newObj)
                    } else {
                        normalizedArr.add(obj)
                    }
                }
                normalizedArr
            } else null
        } catch (_: Exception) { null }
    }

    // ─── Sonraki display numarası ────────────────────────────────────────────

    suspend fun getNextDisplayNo(branchId: String): Int {
        return try {
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            val body = JsonObject().apply {
                addProperty("table", "sales")
                addProperty("operation", "select")
                addProperty("select", "kiosk_display_no")
                val filterArray = JsonArray().apply {
                    add(JsonObject().apply {
                        addProperty("type", "eq")
                        addProperty("col", "branch_id")
                        addProperty("val", branchId)
                    })
                    add(JsonObject().apply {
                        addProperty("type", "eq")
                        addProperty("col", "source")
                        addProperty("val", "kiosk")
                    })
                    add(JsonObject().apply {
                        addProperty("type", "gte")
                        addProperty("col", "sale_datetime")
                        addProperty("val", today)
                    })
                    add(JsonObject().apply {
                        addProperty("type", "order")
                        addProperty("col", "kiosk_display_no")
                        addProperty("ascending", false)
                    })
                    add(JsonObject().apply {
                        addProperty("type", "limit")
                        addProperty("val", 1)
                    })
                }
                add("filters", filterArray)
            }
            val response = api.query(body)
            val rows = if (response.has("data") && response.get("data").isJsonArray) {
                response.getAsJsonArray("data")
            } else {
                JsonArray()
            }
            val max = if (rows.size() > 0) {
                rows[0].asJsonObject.get("kiosk_display_no")?.let {
                    if (it.isJsonNull) null else it.asInt
                } ?: 0
            } else 0
            max + 1
        } catch (_: Exception) { 1 }
    }

    // ─── Sipariş gönderme ────────────────────────────────────────────────────

    suspend fun submitOrder(
        header: OrderHeader,
        lines: List<OrderLine>,
        payment: OrderPayment,
    ): OrderSubmitState {
        return try {
            // 1. Sales insert
            val headerJson = gson.toJsonTree(header).asJsonObject
            val saleResponse = api.query(JsonObject().apply {
                addProperty("table", "sales")
                addProperty("operation", "insert")
                add("data", headerJson)
                addProperty("select", "id")
            })
            val saleRows = if (saleResponse.has("data") && saleResponse.get("data").isJsonArray) {
                saleResponse.getAsJsonArray("data")
            } else {
                JsonArray()
            }
            if (saleRows.size() == 0) return OrderSubmitState.Error("Sipariş kaydedilemedi")
            val saleId = saleRows[0].asJsonObject.str("id")
                ?: return OrderSubmitState.Error("Sipariş ID alınamadı")

            // Kiosk özel alanlar (migration opsiyonel)
            try {
                api.query(JsonObject().apply {
                    addProperty("table", "sales")
                    addProperty("operation", "update")
                    add("filters", JsonArray().apply {
                        add(JsonObject().apply {
                            addProperty("type", "eq")
                            addProperty("col", "id")
                            addProperty("val", saleId)
                        })
                    })
                    add("data", JsonObject().apply {
                        addProperty("kds_status", "pending")
                        addProperty("pickup_called", false)
                        addProperty("kiosk_service_type", header.kioskServiceType)
                        header.kioskDisplayNo?.let { addProperty("kiosk_display_no", it) }
                    })
                })
            } catch (_: Exception) {}

            // 2. sale_lines insert
            val linesArray = JsonArray()
            lines.map { it.copy(saleId = saleId) }.forEach { line ->
                linesArray.add(gson.toJsonTree(line))
            }
            val linesResp = api.query(JsonObject().apply {
                addProperty("table", "sale_lines")
                addProperty("operation", "insert")
                add("data", linesArray)
            })
            if (linesResp.has("error") && !linesResp.get("error").isJsonNull)
                return OrderSubmitState.Error("Sipariş satırları kaydedilemedi")

            // 3. sale_payments insert
            val payJson = gson.toJsonTree(payment.copy(saleId = saleId)).asJsonObject
            val payResp = api.query(JsonObject().apply {
                addProperty("table", "sale_payments")
                addProperty("operation", "insert")
                add("data", payJson)
            })
            if (payResp.has("error") && !payResp.get("error").isJsonNull)
                return OrderSubmitState.Error("Ödeme kaydedilemedi")

            OrderSubmitState.Success(saleId = saleId, displayNo = header.kioskDisplayNo)
        } catch (e: Exception) {
            OrderSubmitState.Error(e.message ?: "Bilinmeyen hata")
        }
    }

    // ─── Yardımcı query builder ──────────────────────────────────────────────

    private fun buildQuery(
        table: String,
        operation: String,
        select: String? = null,
        filters: Map<String, Any?> = emptyMap(),
        nullFilters: List<String> = emptyList(),    // IS NULL filtreler
        ilikeFilters: Map<String, String> = emptyMap(),
        order: String? = null,
        limit: Int? = null,
    ): JsonObject = JsonObject().apply {
        addProperty("table", table)
        addProperty("operation", operation)
        if (select != null) addProperty("select", select)

        val filterArray = JsonArray()

        // 1. Equality filters (eq)
        filters.forEach { (k, v) ->
            val f = JsonObject().apply {
                addProperty("type", "eq")
                addProperty("col", k)
                when (v) {
                    null       -> add("val", null)
                    is String  -> addProperty("val", v)
                    is Number  -> addProperty("val", v)
                    is Boolean -> addProperty("val", v)
                    else       -> addProperty("val", v.toString())
                }
            }
            filterArray.add(f)
        }

        // 2. IS NULL filters (is)
        nullFilters.forEach { col ->
            val f = JsonObject().apply {
                addProperty("type", "is")
                addProperty("col", col)
                add("val", com.google.gson.JsonNull.INSTANCE)
            }
            filterArray.add(f)
        }

        // 3. ILIKE filters (ilike)
        ilikeFilters.forEach { (col, value) ->
            val f = JsonObject().apply {
                addProperty("type", "ilike")
                addProperty("col", col)
                addProperty("val", "%$value%")
            }
            filterArray.add(f)
        }

        // 4. Order filter
        if (order != null) {
            val parts = order.split('.')
            val col = parts[0]
            val ascending = if (parts.size > 1) parts[1].lowercase() != "desc" else true
            val f = JsonObject().apply {
                addProperty("type", "order")
                addProperty("col", col)
                addProperty("ascending", ascending)
            }
            filterArray.add(f)
        }

        // 5. Limit filter
        if (limit != null) {
            val f = JsonObject().apply {
                addProperty("type", "limit")
                addProperty("val", limit)
            }
            filterArray.add(f)
        }

        add("filters", filterArray)
    }

    private inline fun <reified T> parseList(response: JsonObject): List<T> {
        if (!response.has("data") || !response.get("data").isJsonArray) return emptyList()
        val rows = response.getAsJsonArray("data")
        val type = object : TypeToken<List<T>>() {}.type
        return gson.fromJson(rows, type) ?: emptyList()
    }

    companion object {
        fun create(baseUrl: String): KioskRepository {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            val client = OkHttpClient.Builder()
                .addInterceptor(logging)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()
            val retrofit = Retrofit.Builder()
                .baseUrl(baseUrl.trimEnd('/') + "/")
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
            return KioskRepository(retrofit.create(ApiService::class.java))
        }
    }
}

// ─── Uzantılar ───────────────────────────────────────────────────────────────

private fun JsonObject.str(key: String): String? =
    if (has(key) && !get(key).isJsonNull) get(key).asString else null

private fun JsonObject.bool(key: String): Boolean? =
    if (has(key) && !get(key).isJsonNull) get(key).asBoolean else null

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
                filters = mapOf("station_code" to stationCode.uppercase().trim()),
                select = "id,station_code,terminal_type,branch_id,label,is_active,config_data"
            )
            val response = api.query(body)
            val rows = response.getAsJsonArray("data") ?: JsonArray()
            if (rows.size() == 0) return PairingResult.NotFound

            val terminal = rows[0].asJsonObject
            val terminalType = terminal.str("terminal_type")
            val mode = KioskMode.fromTerminalType(terminalType)
                ?: return PairingResult.UnknownType(terminalType)
            if (terminal.bool("is_active") == false) return PairingResult.Inactive

            PairingResult.Success(
                mode = mode,
                stationCode = terminal.str("station_code") ?: stationCode,
                terminalId = terminal.str("id") ?: "",
                branchId = terminal.str("branch_id"),
                label = terminal.str("label"),
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

            MenuLoadState.Ready(
                MenuData(
                    categories = categories,
                    items = items,
                    kioskChannel = channel,
                    optionGroups = optionGroups,
                    operatingRules = operatingRules,
                    terminalRules = terminalRules,
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

    private suspend fun loadCategories(): List<SaleCategory> {
        val body = buildQuery(
            table = "sale_categories",
            operation = "select",
            select = "id,name,parent_id,image_url,bg,text_color",
            nullFilters = listOf("deleted_at"),
        )
        return parseList(api.query(body))
    }

    private suspend fun loadSaleItems(): List<SaleItem> {
        val body = buildQuery(
            table = "sale_items",
            operation = "select",
            select = "id,name,sku,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,channel_prices,portions,option_groups,channel_image,channel_description,prep_time_minutes,tax_id,active",
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
            select = "id,name,options,min_select,max_select",
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
            val rows = response.getAsJsonArray("data") ?: return null
            if (rows.size() == 0) return null
            rows[0].asJsonObject.getAsJsonObject("value")
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
                addProperty("order", "kiosk_display_no.desc")
                addProperty("limit", 1)
                add("filters", JsonObject().apply {
                    addProperty("branch_id", branchId)
                    addProperty("source", "kiosk")
                    addProperty("sale_datetime[gte]", today)
                })
            }
            val response = api.query(body)
            val rows = response.getAsJsonArray("data") ?: JsonArray()
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
            val saleRows = saleResponse.getAsJsonArray("data") ?: JsonArray()
            if (saleRows.size() == 0) return OrderSubmitState.Error("Sipariş kaydedilemedi")
            val saleId = saleRows[0].asJsonObject.str("id")
                ?: return OrderSubmitState.Error("Sipariş ID alınamadı")

            // Kiosk özel alanlar (migration opsiyonel)
            try {
                api.query(JsonObject().apply {
                    addProperty("table", "sales")
                    addProperty("operation", "update")
                    add("filters", JsonObject().apply { addProperty("id", saleId) })
                    add("data", JsonObject().apply {
                        addProperty("kds_status", "pending")
                        addProperty("pickup_called", false)
                        addProperty("kiosk_service_type", header.kioskServiceType)
                        header.kioskDisplayNo?.let { addProperty("kiosk_display_no", it) }
                        header.kioskStationCode?.let { addProperty("kiosk_station_code", it) }
                        header.kioskStationName?.let { addProperty("kiosk_station_name", it) }
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
        if (order != null) addProperty("order", order)
        if (limit != null) addProperty("limit", limit)

        val filterObj = JsonObject()
        filters.forEach { (k, v) ->
            when (v) {
                null       -> filterObj.add(k, null)
                is String  -> filterObj.addProperty(k, v)
                is Number  -> filterObj.addProperty(k, v)
                is Boolean -> filterObj.addProperty(k, v)
                else       -> filterObj.addProperty(k, v.toString())
            }
        }
        nullFilters.forEach { col -> filterObj.add("${col}[is]", null) }
        ilikeFilters.forEach { (col, value) -> filterObj.addProperty("${col}[ilike]", "%$value%") }

        if (filterObj.size() > 0) add("filters", filterObj)
    }

    private inline fun <reified T> parseList(response: JsonObject): List<T> {
        val rows = response.getAsJsonArray("data") ?: return emptyList()
        val type = object : TypeToken<List<T>>() {}.type
        return gson.fromJson(rows, type) ?: emptyList()
    }

    companion object {
        fun create(baseUrl: String): KioskRepository {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
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

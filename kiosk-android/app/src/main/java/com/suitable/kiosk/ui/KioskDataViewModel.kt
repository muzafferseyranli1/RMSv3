package com.suitable.kiosk.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.suitable.kiosk.data.KioskRepository
import com.suitable.kiosk.data.model.*
import com.suitable.kiosk.prefs.KioskPrefs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import java.text.SimpleDateFormat
import java.util.*

/**
 * Kiosk uygulamasının ana ViewModel'i.
 *
 * BigScreen ve Tablet modları bu ViewModel'i paylaşır.
 * Menü verisi (kategoriler, ürünler, seçenek grupları) burada yüklenir ve
 * sepet işlemleri burada yönetilir.
 */
class KioskDataViewModel(
    private val prefs: KioskPrefs,
    private val repository: KioskRepository,
) : ViewModel() {

    val baseUrl: String get() = prefs.getApiUrl()

    // ─── Menü durumu ─────────────────────────────────────────────────────────

    private val _menuState = MutableStateFlow<MenuLoadState>(MenuLoadState.Loading)
    val menuState: StateFlow<MenuLoadState> = _menuState.asStateFlow()

    // ─── Seçili kategori ─────────────────────────────────────────────────────

    private val _selectedCategoryId = MutableStateFlow<String?>(null)
    val selectedCategoryId: StateFlow<String?> = _selectedCategoryId.asStateFlow()

    // ─── Sepet ───────────────────────────────────────────────────────────────

    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart.asStateFlow()

    val cartTotal: Double get() = _cart.value.sumOf { it.lineTotal }
    val cartItemCount: Int get() = _cart.value.sumOf { it.quantity }

    // ─── Sipariş durumu ──────────────────────────────────────────────────────

    private val _orderState = MutableStateFlow<OrderSubmitState>(OrderSubmitState.Idle)
    val orderState: StateFlow<OrderSubmitState> = _orderState.asStateFlow()

    // ─── Çalışma saati ───────────────────────────────────────────────────────

    private val _isOpen = MutableStateFlow<Boolean?>(null)  // null = bilinmiyor
    val isOpen: StateFlow<Boolean?> = _isOpen.asStateFlow()

    // ─── Kiosk ayarları JSON ─────────────────────────────────────────────────

    private val _settingsJson = MutableStateFlow<com.google.gson.JsonObject?>(null)
    val settingsJson: StateFlow<com.google.gson.JsonObject?> = _settingsJson.asStateFlow()

    // ─── Combo Menü ayarları JSON ─────────────────────────────────────────────

    private val _comboMenusJson = MutableStateFlow<com.google.gson.JsonArray?>(null)
    val comboMenusJson: StateFlow<com.google.gson.JsonArray?> = _comboMenusJson.asStateFlow()

    // ─── Init ─────────────────────────────────────────────────────────────────

    init {
        loadAll()
    }

    // ─── Veri Yükleme ────────────────────────────────────────────────────────

    fun loadAll() {
        val branchId = prefs.getBranchId() ?: return
        val terminalId = prefs.getTerminalId() ?: return

        viewModelScope.launch {
            _menuState.value = MenuLoadState.Loading

            val menuDeferred = async { repository.loadMenuData(branchId, terminalId) }
            val settingsDeferred = async { repository.loadKioskSettingsJson() }
            val comboDeferred = async { repository.loadComboMenusJson() }

            val state = menuDeferred.await()
            val settings = settingsDeferred.await()
            val comboJson = comboDeferred.await()

            _settingsJson.value = settings
            _comboMenusJson.value = comboJson

            if (state is MenuLoadState.Ready) {
                val data = state.data
                val comboCategoryId = resolveComboMenuCategoryId(data.categories)
                val comboProducts = buildKioskComboProducts(
                    comboDefinitions = comboJson,
                    products = data.items,
                    channelId = data.kioskChannel?.id,
                    comboCategoryId = comboCategoryId
                )
                println("KioskDataViewModel: comboCategoryId=$comboCategoryId, channelId=${data.kioskChannel?.id}")
                println("KioskDataViewModel: comboProducts size=${comboProducts.size}")
                comboProducts.forEach { item ->
                    println("KioskDataViewModel: Combo item name=${item.name}, id=${item.id}, catL5=${item.catL5}, price=${item.priceForChannel(data.kioskChannel?.id)}, categoryIds=${item.categoryIds}")
                }
                val mergedItems = data.items + comboProducts
                val updatedData = data.copy(items = mergedItems)

                _menuState.value = MenuLoadState.Ready(updatedData)

                // İlk kategoriyi seç
                val topLevel = updatedData.categories
                    .filter { it.parentId == null && it.deletedAt == null }
                if (_selectedCategoryId.value == null && topLevel.isNotEmpty()) {
                    _selectedCategoryId.value = topLevel.first().id
                }
                // Çalışma saati hesapla
                _isOpen.value = resolveIsOpen(
                    rules = updatedData.operatingRules,
                    terminalRules = updatedData.terminalRules,
                    terminalId = terminalId,
                    settings = settings,
                )
            } else {
                _menuState.value = state
            }
        }
    }

    // ─── Kategori seçimi ─────────────────────────────────────────────────────

    fun selectCategory(categoryId: String) {
        _selectedCategoryId.value = categoryId
    }

    // ─── Sepet işlemleri ─────────────────────────────────────────────────────

    fun addToCart(item: CartItem) {
        _cart.update { current ->
            val idx = current.indexOfFirst { it.cartKey == item.cartKey }
            if (idx >= 0) {
                current.toMutableList().apply {
                    this[idx] = this[idx].copy(quantity = this[idx].quantity + item.quantity)
                }
            } else {
                current + item
            }
        }
    }

    fun increaseQty(cartKey: String) {
        _cart.update { current ->
            current.map { if (it.cartKey == cartKey) it.copy(quantity = it.quantity + 1) else it }
        }
    }

    fun decreaseQty(cartKey: String) {
        _cart.update { current ->
            val updated = current.map {
                if (it.cartKey == cartKey) it.copy(quantity = it.quantity - 1) else it
            }
            updated.filter { it.quantity > 0 }
        }
    }

    fun removeFromCart(cartKey: String) {
        _cart.update { current -> current.filter { it.cartKey != cartKey } }
    }

    fun clearCart() {
        _cart.value = emptyList()
    }

    // ─── Sipariş gönderme ────────────────────────────────────────────────────

    fun submitOrder() {
        val cartItems = _cart.value
        if (cartItems.isEmpty()) return

        val branchId   = prefs.getBranchId()
        val stationCode = prefs.getStationCode()
        val menuData = (_menuState.value as? MenuLoadState.Ready)?.data ?: return
        val channel = menuData.kioskChannel

        viewModelScope.launch {
            _orderState.value = OrderSubmitState.Submitting

            val now = nowIso()
            val displayNo = repository.getNextDisplayNo(branchId ?: "")
            val subtotal = cartTotal

            val header = OrderHeader(
                saleDatetime               = now,
                salesChannelId             = channel?.id,
                salesChannelName           = channel?.name ?: "Kiosk",
                branchId                   = branchId,
                branchName                 = null,
                grossTotalBeforeDiscount   = subtotal,
                grossTotalAfterDiscount    = subtotal,
                netTotalAfterDiscount      = subtotal,
                paymentTotal               = subtotal,
                updatedAt                  = now,
                kioskDisplayNo             = displayNo,
            )

            val lines = mutableListOf<OrderLine>()
            var lineNo = 1
            for (cartItem in cartItems) {
                val qty = Math.max(1, cartItem.quantity)
                for (unitIndex in 0 until qty) {
                    val comboBundle = cartItem.comboBundle
                    if (cartItem.saleItem.isComboMenu && comboBundle != null) {
                        for (line in comboBundle.expandedLines) {
                            lines.add(
                                OrderLine(
                                    saleId = "",
                                    lineNo = lineNo++,
                                    productId = line.productId,
                                    productName = line.productName,
                                    productSku = line.productSku,
                                    qty = 1,
                                    unitGrossBeforeDiscount = line.unitPrice,
                                    lineGrossBeforeDiscount = line.unitPrice,
                                    unitGrossAfterDiscount = line.unitPrice,
                                    lineGrossAfterDiscount = line.unitPrice,
                                    taxId = cartItem.saleItem.taxId,
                                    lineNetAfterDiscount = line.unitPrice,
                                    optionsJson = line.options.map { opt ->
                                        mapOf(
                                            "group_id" to opt.groupId,
                                            "group_name" to opt.groupName,
                                            "option_id" to opt.optionId,
                                            "option_name" to opt.optionName,
                                            "price_modifier" to opt.priceModifier,
                                        )
                                    },
                                    portionId = null,
                                    portionName = null,
                                    branchId = branchId,
                                    branchName = null,
                                    saleDatetime = now,
                                    salesChannelId = channel?.id,
                                    prepTimeMinutes = line.prepTimeMinutes,
                                )
                            )
                        }
                    } else {
                        val unitPrice = cartItem.unitPrice
                        lines.add(
                            OrderLine(
                                saleId = "",
                                lineNo = lineNo++,
                                productId = cartItem.saleItem.id,
                                productName = cartItem.saleItem.name,
                                productSku = cartItem.saleItem.sku,
                                qty = 1,
                                unitGrossBeforeDiscount = unitPrice,
                                lineGrossBeforeDiscount = unitPrice,
                                unitGrossAfterDiscount = unitPrice,
                                lineGrossAfterDiscount = unitPrice,
                                taxId = cartItem.saleItem.taxId,
                                lineNetAfterDiscount = unitPrice,
                                optionsJson = cartItem.selectedOptions.map { opt ->
                                    mapOf(
                                        "group_id" to opt.groupId,
                                        "group_name" to opt.groupName,
                                        "option_id" to opt.optionId,
                                        "option_name" to opt.optionName,
                                        "price_modifier" to opt.priceModifier,
                                    )
                                },
                                portionId = cartItem.portionId,
                                portionName = cartItem.portionName,
                                branchId = branchId,
                                branchName = null,
                                saleDatetime = now,
                                salesChannelId = channel?.id,
                                prepTimeMinutes = cartItem.saleItem.prepTimeMinutes,
                            )
                        )
                    }
                }
            }

            val payment = OrderPayment(
                saleId          = "",           // submitOrder içinde doldurulacak
                paymentMethod   = "card",
                paymentMethodLabel = "Kart",
                amount          = subtotal,
                paymentDatetime = now,
            )

            val result = repository.submitOrder(header, lines, payment)
            _orderState.value = result

            if (result is OrderSubmitState.Success) {
                clearCart()
            }
        }
    }

    fun resetOrderState() {
        _orderState.value = OrderSubmitState.Idle
    }

    // ─── Çalışma saati hesaplama ─────────────────────────────────────────────

    /**
     * Terminale atanmış kuralları bulur; kural yoksa şube genelini kullanır.
     * Bugünün gün kodu + şu anki saat ile karşılaştırır.
     */
    private fun resolveIsOpen(
        rules: List<OperatingHoursRule>,
        terminalRules: List<TerminalOperatingRule>,
        terminalId: String,
        settings: JsonObject?,
    ): Boolean {
        // operating_hours_enabled kontrolü (true değilse saat kuralı devre dışıdır ve her zaman açıktır)
        val hoursEnabled = settings?.get("operating_hours_enabled")?.asBoolean ?: false
        if (!hoursEnabled) return true

        if (rules.isEmpty()) return true  // Kural tanımlanmamış → açık kabul et

        val assignedRuleIds = terminalRules
            .filter { it.terminalId == terminalId }
            .map { it.ruleId }
            .toSet()

        val applicableRules = if (assignedRuleIds.isNotEmpty())
            rules.filter { it.id in assignedRuleIds }
        else
            rules  // terminal özel kuralı yoksa tüm şube kuralları

        if (applicableRules.isEmpty()) return true

        val cal = Calendar.getInstance()
        val dayCode = DAY_CODES[cal.get(Calendar.DAY_OF_WEEK) - 1]
        val hhmm = String.format("%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE))

        return applicableRules.any { rule ->
            // days listesi boşsa her gün geçerli (web uygulamasıyla aynı mantık)
            val matchesDay = rule.days.isEmpty() || dayCode in rule.days
            val start = rule.startTime
            val end   = rule.endTime
            // Gece yarısını aşan saatler için (örn: 22:00-04:00)
            val matchesTime = if (start <= end) {
                hhmm >= start && hhmm <= end
            } else {
                hhmm >= start || hhmm <= end
            }
            matchesDay && matchesTime
        }
    }

    // ─── Yardımcılar ─────────────────────────────────────────────────────────

    private fun resolveComboMenuCategoryId(categories: List<SaleCategory>): String? {
        return categories.firstOrNull {
            if (it.deletedAt != null) false else {
                val name = it.name.lowercase(Locale.getDefault())
                    .replace("ı", "i")
                    .replace("ğ", "g")
                    .replace("ü", "u")
                    .replace("ş", "s")
                    .replace("ö", "o")
                    .replace("ç", "c")
                name == "menuler"
            }
        }?.id
    }

    private fun buildKioskComboProducts(
        comboDefinitions: JsonArray?,
        products: List<SaleItem>,
        channelId: String?,
        comboCategoryId: String?,
    ): List<SaleItem> {
        if (comboDefinitions == null) return emptyList()
        val productMap = products.associateBy { it.id }
        val comboItems = mutableListOf<SaleItem>()

        for (el in comboDefinitions) {
            if (!el.isJsonObject) continue
            val combo = el.asJsonObject
            if (combo.get("active")?.asBoolean == false || combo.get("deleted")?.asBoolean == true) continue

            val id = combo.get("id")?.asString ?: continue
            val form = combo.getAsJsonObject("form") ?: JsonObject()
            val groups = combo.getAsJsonArray("groups") ?: JsonArray()
            val channelConfig = combo.getAsJsonObject("channelConfig")
            val config = if (channelId != null && channelConfig != null) {
                channelConfig.getAsJsonObject(channelId) ?: JsonObject()
            } else {
                JsonObject()
            }

            var baseTotal = 0.0
            for (gEl in groups) {
                if (!gEl.isJsonObject) continue
                val group = gEl.asJsonObject
                val primaryItemId = group.get("primaryItemId")?.asString ?: ""
                val item = productMap[primaryItemId]
                if (item != null) {
                    baseTotal += item.priceForChannel(channelId)
                }
            }

            val pricingStrategy = form.get("pricingStrategy")?.asString ?: "set-price"
            var price = baseTotal
            when (pricingStrategy) {
                "percent" -> {
                    val percent = config.get("percent")?.asDouble
                        ?: form.get("defaultPercent")?.asDouble
                        ?: 0.0
                    price = Math.max(baseTotal * (1.0 - percent / 100.0), 0.0)
                }
                "fixed" -> {
                    val fixed = config.get("fixed")?.asDouble
                        ?: form.get("defaultFixed")?.asDouble
                        ?: 0.0
                    price = Math.max(baseTotal - fixed, 0.0)
                }
                else -> {
                    price = config.get("comboPrice")?.asDouble
                        ?: form.get("defaultComboPrice")?.asDouble
                        ?: 0.0
                }
            }

            val channelPricesJson = JsonArray().apply {
                if (channelId != null) {
                    add(JsonObject().apply {
                        addProperty("channel_id", channelId)
                        addProperty("price", price)
                        addProperty("active", config.get("active")?.asBoolean != false)
                    })
                }
            }

            val name = combo.get("name")?.asString ?: form.get("name")?.asString ?: "Combo Menu"
            val sku = combo.get("sku")?.asString ?: form.get("sku")?.asString ?: ""
            val imageUrl = form.get("channel_image")?.asString

            val comboItem = SaleItem(
                id = "combo-$id",
                name = name,
                sku = sku,
                catL5 = comboCategoryId,
                channelPricesRaw = channelPricesJson,
                portions = null,
                optionGroupsRaw = null,
                channelImageRaw = if (imageUrl != null) com.google.gson.JsonPrimitive(imageUrl) else null,
                channelDescriptionRaw = form.get("channel_description"),
                prepTimeMinutes = 0,
                active = true,
                isComboMenu = true,
                comboDefinitionId = id,
            )
            comboItems.add(comboItem)
        }
        return comboItems
    }

    private fun nowIso(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())

    companion object {
        /** Pazartesi = 0 ... Pazar = 6 — Calendar.DAY_OF_WEEK = 1(Sun)..7(Sat) */
        private val DAY_CODES = arrayOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
    }
}

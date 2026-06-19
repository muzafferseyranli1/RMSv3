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
            val state = repository.loadMenuData(branchId, terminalId)
            _menuState.value = state

            if (state is MenuLoadState.Ready) {
                // İlk kategoriyi seç
                val topLevel = state.data.categories
                    .filter { it.parentId == null && it.deletedAt == null }
                if (_selectedCategoryId.value == null && topLevel.isNotEmpty()) {
                    _selectedCategoryId.value = topLevel.first().id
                }
                // Çalışma saati hesapla
                _isOpen.value = resolveIsOpen(
                    rules = state.data.operatingRules,
                    terminalRules = state.data.terminalRules,
                    terminalId = terminalId,
                )
            }
        }

        viewModelScope.launch {
            _settingsJson.value = repository.loadKioskSettingsJson()
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
                kioskStationCode           = stationCode,
            )

            val lines = cartItems.mapIndexed { idx, cartItem ->
                val lineTotal = cartItem.lineTotal
                OrderLine(
                    saleId                    = "",   // submitOrder içinde doldurulacak
                    lineNo                    = idx + 1,
                    productId                 = cartItem.saleItem.id,
                    productName               = cartItem.saleItem.name,
                    productSku                = cartItem.saleItem.sku,
                    qty                       = cartItem.quantity,
                    unitGrossBeforeDiscount   = cartItem.unitPrice,
                    lineGrossBeforeDiscount   = lineTotal,
                    unitGrossAfterDiscount    = cartItem.unitPrice,
                    lineGrossAfterDiscount    = lineTotal,
                    taxId                     = cartItem.saleItem.taxId,
                    lineNetAfterDiscount      = lineTotal,
                    optionsJson               = cartItem.selectedOptions.map { opt ->
                        mapOf(
                            "group_id"       to opt.groupId,
                            "group_name"     to opt.groupName,
                            "option_id"      to opt.optionId,
                            "option_name"    to opt.optionName,
                            "price_modifier" to opt.priceModifier,
                        )
                    },
                    portionId     = cartItem.portionId,
                    portionName   = cartItem.portionName,
                    branchId      = branchId,
                    branchName    = null,
                    saleDatetime  = now,
                    salesChannelId = channel?.id,
                    prepTimeMinutes = cartItem.saleItem.prepTimeMinutes,
                )
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
    ): Boolean {
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
            rule.isOpen &&
            dayCode in rule.dayCodes &&
            hhmm >= rule.startTime &&
            hhmm <= rule.endTime
        }
    }

    // ─── Yardımcılar ─────────────────────────────────────────────────────────

    private fun nowIso(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())

    companion object {
        /** Pazartesi = 0 ... Pazar = 6 — Calendar.DAY_OF_WEEK = 1(Sun)..7(Sat) */
        private val DAY_CODES = arrayOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
    }
}

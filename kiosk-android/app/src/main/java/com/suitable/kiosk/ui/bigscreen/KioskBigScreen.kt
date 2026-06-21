package com.suitable.kiosk.ui.bigscreen

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.suitable.kiosk.data.model.*
import com.suitable.kiosk.ui.KioskDataViewModel
import com.suitable.kiosk.ui.shared.ClosedOverlay
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import com.suitable.kiosk.ui.shared.ComboBuilderModal
import com.suitable.kiosk.ui.shared.SuggestionModal
import com.suitable.kiosk.ui.shared.KioskSuggestion
import com.suitable.kiosk.ui.shared.SuggestionEvaluator
import com.suitable.kiosk.ui.shared.IdleScreen
import kotlin.math.roundToInt

private data class FlyParticle(
    val startX: Float,
    val startY: Float,
    val id: Long = System.nanoTime()
)

private sealed class ProductGridItem {
    data class Header(val category: SaleCategory) : ProductGridItem()
    data class Product(val item: SaleItem) : ProductGridItem()
}

// ─── Renk paleti ──────────────────────────────────────────────────────────────
private val BgDark       = Color(0xFF0A0A14)
private val BgCard       = Color(0xFF13131F)
private val BgSidebar    = Color(0xFF0E0E1A)
private val Accent       = Color(0xFF6C63FF)
private val AccentLight  = Color(0xFF8B84FF)
private val TextPrimary  = Color(0xFFEEEEFF)
private val TextSecond   = Color(0xFF9090C0)
private val TextMuted    = Color(0xFF4A4A70)
private val DividerColor = Color(0xFF1E1E30)
private val CartRed      = Color(0xFFEF4444)
private val SuccessGreen = Color(0xFF22C55E)

// ─── Ana ekran ────────────────────────────────────────────────────────────────

/**
 * BigScreen (Kiosk TV/büyük ekran) modu — Faz 3 tam UI
 *
 * Layout:
 *  - Sol: Kategori paneli (200dp sabit)
 *  - Sağ: 3 sütunlu ürün grid
 *  - Floating: CartFab (sağ alt, yüzen animasyonlu)
 *
 * Modal katmanlar (üste çıkar):
 *  - ProductDetailSheet (seçenekler + miktar)
 *  - CartFullScreen (sepet özeti)
 *  - PaymentConfirmScreen (ödeme)
 *  - ClosedOverlay (kapalı saat)
 */
@Composable
fun KioskBigScreen(
    stationCode: String,
    viewModel: KioskDataViewModel,
    onSecretUnlock: () -> Unit,
) {
    val menuState      by viewModel.menuState.collectAsState()
    val selectedCatId  by viewModel.selectedCategoryId.collectAsState()
    val cart           by viewModel.cart.collectAsState()
    val orderState     by viewModel.orderState.collectAsState()
    val isOpen         by viewModel.isOpen.collectAsState()

    val settings by viewModel.settingsJson.collectAsState()
    val rawBgImage = settings?.get("kiosk_bg_image")?.asString
    val resolvedBgUrl = remember(rawBgImage, viewModel.baseUrl) {
        if (!rawBgImage.isNullOrBlank()) {
            if (rawBgImage.startsWith("http://") || rawBgImage.startsWith("https://") || rawBgImage.startsWith("data:")) {
                rawBgImage
            } else {
                "${viewModel.baseUrl.trimEnd('/')}/${rawBgImage.trimStart('/')}"
            }
        } else null
    }

    // Ekran durumu: idle | menu | cart | payment
    var screen by remember { mutableStateOf("idle") }

    // Seçili ürün (detay modalı için)
    var selectedItem by remember { mutableStateOf<SaleItem?>(null) }
    var selectedComboProduct by remember { mutableStateOf<SaleItem?>(null) }

    // Öneriler
    var activeSuggestion by remember { mutableStateOf<KioskSuggestion?>(null) }
    val productSuggestionHits = remember { mutableStateMapOf<String, Int>() }
    val checkoutSuggestionHits = remember { mutableStateMapOf<String, Int>() }

    // CartFab pulse tetikleyici
    var cartPulseKey by remember { mutableIntStateOf(0) }

    // Baştan başla onay ekranı ve geri sayım
    var showResetDialog by remember { mutableStateOf(false) }
    var resetCountdown by remember { mutableIntStateOf(5) }

    // Touch tracking ve fly particles
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var cartDockY by remember { mutableStateOf(400.dp) }
    val cartDockYAnim by animateDpAsState(
        targetValue = cartDockY,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "cdy"
    )
    var flyParticles by remember { mutableStateOf<List<FlyParticle>>(emptyList()) }
    var cartBallPosInRoot by remember { mutableStateOf(Offset.Zero) }
    var outerBoxPosInRoot by remember { mutableStateOf(Offset.Zero) }

    var productClickOffset by remember { mutableStateOf(Offset.Zero) }
    var comboClickOffset by remember { mutableStateOf(Offset.Zero) }

    fun triggerFly(sourceRootPos: Offset) {
        if (sourceRootPos == Offset.Zero) return
        val p = FlyParticle(startX = sourceRootPos.x, startY = sourceRootPos.y)
        flyParticles = flyParticles + p
        scope.launch {
            kotlinx.coroutines.delay(900)
            flyParticles = flyParticles.filter { it.id != p.id }
        }
    }

    LaunchedEffect(showResetDialog) {
        if (showResetDialog) {
            resetCountdown = 5
            while (resetCountdown > 0) {
                kotlinx.coroutines.delay(1000)
                resetCountdown--
            }
            viewModel.clearCart()
            screen = "idle"
            showResetDialog = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .onGloballyPositioned { outerBoxPosInRoot = it.positionInRoot() },
    ) {
        when (val state = menuState) {
            is MenuLoadState.Loading -> LoadingScreen()
            is MenuLoadState.Offline -> OfflineScreen { viewModel.loadAll() }
            is MenuLoadState.Error   -> ErrorScreen(state.message) { viewModel.loadAll() }
            is MenuLoadState.Ready   -> {
                val data = state.data
                val channelId = data.kioskChannel?.id
                val settings by viewModel.settingsJson.collectAsState()

                val maybeShowProductSuggestion = remember(settings, data.items) {
                    { prod: SaleItem ->
                        val settingsObj = settings
                        if (settingsObj != null) {
                            val list = settingsObj.getAsJsonArray("product_suggestions")
                            val limits = settingsObj.getAsJsonObject("suggestion_limits")
                            val limit = limits?.get("productFlow")?.asInt ?: 2

                            val matchRule = list?.mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
                                ?.firstOrNull { rule ->
                                    val ruleId = rule.get("id")?.asString ?: ""
                                    val hits = productSuggestionHits[ruleId] ?: 0
                                    hits < limit && SuggestionEvaluator.matchProductSuggestion(rule, prod, data.items)
                                }

                            if (matchRule != null) {
                                val sug = SuggestionEvaluator.buildSuggestion(matchRule, "product", data.items)
                                if (sug != null) {
                                    val ruleId = matchRule.get("id")?.asString ?: ""
                                    productSuggestionHits[ruleId] = (productSuggestionHits[ruleId] ?: 0) + 1
                                    activeSuggestion = sug
                                }
                            }
                        }
                    }
                }

                val bannerImg = settings?.get("main_banner_image")?.asString
                val resolvedBannerUrl = remember(bannerImg, viewModel.baseUrl) {
                    if (!bannerImg.isNullOrBlank()) {
                        if (bannerImg.startsWith("http://") || bannerImg.startsWith("https://") || bannerImg.startsWith("data:")) {
                            bannerImg
                        } else {
                            "${viewModel.baseUrl.trimEnd('/')}/${bannerImg.trimStart('/')}"
                        }
                    } else null
                }
                val bannerTitle = settings?.get("main_banner_title")?.asString ?: ""
                val bannerSubtitle = settings?.get("main_banner_subtitle")?.asString ?: ""

                // Kategoriler — sadece üst seviye, silinmemiş
                val topCategories = remember(data.categories) {
                    data.categories.filter { it.parentId == null && it.deletedAt == null }
                }

                val flatGridItems = remember(topCategories, data.items, channelId) {
                    val list = mutableListOf<ProductGridItem>()
                    topCategories.forEach { cat ->
                        val catItems = data.items.filter { item ->
                            item.deletedAt == null &&
                            item.active &&
                            cat.id in item.categoryIds &&
                            item.priceForChannel(channelId) > 0
                        }
                        if (catItems.isNotEmpty()) {
                            list.add(ProductGridItem.Header(cat))
                            catItems.forEach { list.add(ProductGridItem.Product(it)) }
                        }
                    }
                    list
                }

                val gridState = rememberLazyGridState()

                val currentVisibleCategoryIndex by remember {
                    derivedStateOf {
                        val firstVisibleIndex = gridState.firstVisibleItemIndex
                        val bannerOffset = if (!resolvedBannerUrl.isNullOrBlank() || !bannerTitle.isBlank()) 1 else 0
                        val itemIndex = firstVisibleIndex - bannerOffset
                        if (itemIndex in flatGridItems.indices) {
                            var activeCatId: String? = null
                            for (i in itemIndex downTo 0) {
                                if (i in flatGridItems.indices && flatGridItems[i] is ProductGridItem.Header) {
                                    activeCatId = (flatGridItems[i] as ProductGridItem.Header).category.id
                                    break
                                }
                            }
                            activeCatId
                        } else {
                            topCategories.firstOrNull()?.id
                        }
                    }
                }

                val activeCatId = currentVisibleCategoryIndex ?: selectedCatId

                LaunchedEffect(selectedCatId) {
                    if (selectedCatId != currentVisibleCategoryIndex) {
                        val targetIndex = flatGridItems.indexOfFirst {
                            it is ProductGridItem.Header && it.category.id == selectedCatId
                        }
                        if (targetIndex != -1) {
                            val bannerOffset = if (!resolvedBannerUrl.isNullOrBlank() || !bannerTitle.isBlank()) 1 else 0
                            gridState.scrollToItem(targetIndex + bannerOffset, 0)
                        }
                    }
                }

                // 15% Opacity Background Image (Ana katalog/menü ekranında arka plan resmi)
                if (screen != "idle" && !resolvedBgUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = resolvedBgUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = 0.15f }
                    )
                }

                if (screen == "idle") {
                    IdleScreen(
                        branchName = data.branchName ?: "Kadıköy Şubesi",
                        settings = settings,
                        baseUrl = viewModel.baseUrl,
                        onStart = { screen = "menu" }
                    )
                } else {
                    // Menü ekranı
                    Row(modifier = Modifier.fillMaxSize()) {
                        // ── Sol: Kategori paneli (Daraltılmış, görsel kartlı ve branch bilgisiz) ──
                        CategorySidePanel(
                            categories   = topCategories,
                            selectedId   = activeCatId,
                            onSelect     = { catId ->
                                viewModel.selectCategory(catId)
                                val targetIndex = flatGridItems.indexOfFirst {
                                    it is ProductGridItem.Header && it.category.id == catId
                                }
                                if (targetIndex != -1) {
                                    val bannerOffset = if (!resolvedBannerUrl.isNullOrBlank() || !bannerTitle.isBlank()) 1 else 0
                                    scope.launch {
                                        gridState.animateScrollToItem(targetIndex + bannerOffset, 0)
                                    }
                                }
                            },
                            stationCode  = stationCode,
                            cart         = cart,
                            onResetClick = {
                                if (cart.isNotEmpty()) {
                                    showResetDialog = true
                                } else {
                                    viewModel.clearCart()
                                    screen = "idle"
                                }
                            },
                            onLongPress  = onSecretUnlock,
                            baseUrl      = viewModel.baseUrl,
                        )

                        // ── Sağ: Ürün grid ──
                        Box(modifier = Modifier.fillMaxSize()) {
                            if (flatGridItems.isEmpty()) {
                                EmptyCategoryPlaceholder()
                            } else {
                                ProductGrid(
                                    flatGridItems = flatGridItems,
                                    gridState = gridState,
                                    channelId = channelId,
                                    baseUrl   = viewModel.baseUrl,
                                    resolvedBannerUrl = resolvedBannerUrl,
                                    bannerTitle = bannerTitle,
                                    bannerSubtitle = bannerSubtitle,
                                    onItemClick = { item, clickOffset ->
                                        if (item.isComboMenu) {
                                            selectedComboProduct = item
                                            comboClickOffset = clickOffset
                                        } else {
                                            val needsOptionsModal = try {
                                                val linkedIds = item.optionGroupsRaw?.asJsonArray?.size() ?: 0
                                                val portionsCount = item.portions?.asJsonArray?.size() ?: 0
                                                linkedIds > 0 || portionsCount > 1
                                            } catch (_: Exception) { false }

                                            if (needsOptionsModal) {
                                                selectedItem = item
                                                productClickOffset = clickOffset
                                            } else {
                                                viewModel.addToCart(CartItem(item, 1, unitPrice = item.priceForChannel(channelId)))
                                                cartPulseKey++
                                                triggerFly(clickOffset)
                                            }
                                        }
                                    },
                                )
                            }

                            // ── Floating Cart FAB (Y-axis Drag Tracking) ──
                            CartFab(
                                itemCount  = viewModel.cartItemCount,
                                total      = viewModel.cartTotal,
                                pulseKey   = cartPulseKey,
                                hasItems   = cart.isNotEmpty(),
                                onClick    = { if (cart.isNotEmpty()) screen = "cart" },
                                modifier   = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(y = cartDockYAnim - 40.dp)
                                    .pointerInput(Unit) {
                                        detectVerticalDragGestures { change, dragAmount ->
                                            change.consume()
                                            val dragAmountDp = with(density) { dragAmount.toDp() }
                                            cartDockY = (cartDockY + dragAmountDp).coerceIn(120.dp, 750.dp)
                                        }
                                    }
                                    .padding(end = 24.dp)
                                    .onGloballyPositioned { coords ->
                                        val p = coords.positionInRoot()
                                        cartBallPosInRoot = Offset(p.x + coords.size.width / 2f, p.y + coords.size.height / 2f)
                                    },
                            )
                        }
                    }
                }

                // ── Ürün detay modalı (Sağdan kayarak açılan drawer) ──
                selectedItem?.let { item ->
                    val optionGroups = remember(item, data.optionGroups) {
                        val linkedIds = try {
                            item.optionGroupsRaw?.asJsonArray
                                ?.mapNotNull { el ->
                                     el.asJsonObject?.get("group_id")?.asString
                                } ?: emptyList()
                        } catch (_: Exception) { emptyList() }
                        data.optionGroups.filter { it.id in linkedIds && it.deletedAt == null }
                    }
                    ProductDetailSheet(
                        item         = item,
                        channelId    = channelId,
                        optionGroups = optionGroups,
                        baseUrl      = viewModel.baseUrl,
                        cartDockY    = cartDockYAnim,
                        onDismiss    = { selectedItem = null },
                        onAddToCart  = { cartItem ->
                            viewModel.addToCart(cartItem)
                            cartPulseKey++
                            selectedItem = null
                            maybeShowProductSuggestion(item)
                            triggerFly(productClickOffset)
                        },
                    )
                }

                // ── Combo Builder Modalı ──
                selectedComboProduct?.let { comboProd ->
                    val comboDefinitions by viewModel.comboMenusJson.collectAsState()
                    val comboDef = remember(comboProd, comboDefinitions) {
                        val defId = comboProd.comboDefinitionId
                        comboDefinitions?.mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
                            ?.firstOrNull { it.get("id")?.asString == defId }
                    }
                    if (comboDef != null) {
                        ComboBuilderModal(
                            comboProduct = comboProd,
                            comboDefinition = comboDef,
                            saleItems = data.items,
                            optionGroupDefs = data.optionGroups,
                            channelId = channelId,
                            baseUrl = viewModel.baseUrl,
                            onDismiss = { selectedComboProduct = null },
                            onConfirm = { cartItem ->
                                viewModel.addToCart(cartItem)
                                cartPulseKey++
                                selectedComboProduct = null
                                maybeShowProductSuggestion(comboProd)
                                triggerFly(comboClickOffset)
                            }
                        )
                    }
                }

                // ── Öneri Modalı ──
                activeSuggestion?.let { sug ->
                    SuggestionModal(
                        suggestion = sug,
                        onClose = {
                            val stage = activeSuggestion?.stage
                            activeSuggestion = null
                            if (stage == "checkout") {
                                screen = "payment"
                            }
                        },
                        onAction = {
                            activeSuggestion?.let { s ->
                                if (s.suggestionType == "product" && s.targetId != null) {
                                    val prod = data.items.firstOrNull { it.id == s.targetId }
                                    if (prod != null) {
                                        if (prod.isComboMenu) {
                                            selectedComboProduct = prod
                                        } else {
                                            val needsOptionsModal = try {
                                                val linkedIds = prod.optionGroupsRaw?.asJsonArray?.size() ?: 0
                                                val portionsCount = prod.portions?.asJsonArray?.size() ?: 0
                                                linkedIds > 0 || portionsCount > 1
                                            } catch (_: Exception) { false }

                                            if (needsOptionsModal) {
                                                selectedItem = prod
                                            } else {
                                                viewModel.addToCart(CartItem(prod, 1, unitPrice = prod.priceForChannel(channelId)))
                                                cartPulseKey++
                                            }
                                        }
                                    }
                                } else if (s.suggestionType == "category" && s.targetId != null) {
                                    viewModel.selectCategory(s.targetId)
                                    screen = "menu"
                                }
                            }
                            activeSuggestion = null
                        }
                    )
                }

                // ── Sepet tam ekranı ──
                if (screen == "cart") {
                    CartFullScreen(
                        cart      = cart,
                        total     = viewModel.cartTotal,
                        onBack    = { screen = "menu" },
                        onIncrease = { viewModel.increaseQty(it) },
                        onDecrease = { viewModel.decreaseQty(it) },
                        onRemove  = { viewModel.removeFromCart(it) },
                        onClear   = { viewModel.clearCart() },
                        onPay     = {
                            val settingsObj = settings
                            val checkoutSuggestions = settingsObj?.getAsJsonArray("checkout_suggestions")
                            val limit = settingsObj?.getAsJsonObject("suggestion_limits")?.get("checkout")?.asInt ?: 1
                            val matchRule = checkoutSuggestions?.mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
                                ?.firstOrNull { rule ->
                                    val ruleId = rule.get("id")?.asString ?: ""
                                    val hits = checkoutSuggestionHits[ruleId] ?: 0
                                    hits < limit && SuggestionEvaluator.evaluateCheckoutSuggestion(rule, cart, data.items, viewModel.cartTotal)
                                }
                            if (matchRule != null) {
                                val sug = SuggestionEvaluator.buildSuggestion(matchRule, "checkout", data.items)
                                if (sug != null) {
                                    val ruleId = matchRule.get("id")?.asString ?: ""
                                    checkoutSuggestionHits[ruleId] = (checkoutSuggestionHits[ruleId] ?: 0) + 1
                                    activeSuggestion = sug
                                } else {
                                    screen = "payment"
                                }
                            } else {
                                screen = "payment"
                            }
                        },
                    )
                }

                // ── Ödeme ekranı ──
                if (screen == "payment") {
                    PaymentConfirmScreen(
                        total      = viewModel.cartTotal,
                        orderState = orderState,
                        onConfirm  = { viewModel.submitOrder() },
                        onBack     = {
                            viewModel.resetOrderState()
                            screen = "cart"
                        },
                        onSuccess  = {
                            viewModel.resetOrderState()
                            screen = "idle"
                        },
                    )
                }

                // ── Kapalı overlay ──
                if (isOpen == false) {
                    ClosedOverlay()
                }

                // ── Baştan Başla / Yeni Sipariş Onay Dialogu ──
                if (showResetDialog) {
                    Dialog(
                        onDismissRequest = { showResetDialog = false },
                        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = true)
                    ) {
                        Card(
                            modifier = Modifier
                                .width(340.dp)
                                .wrapContentHeight(),
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF13131F)),
                            border = BorderStroke(1.dp, DividerColor)
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("🗑️", fontSize = 48.sp)
                                Spacer(Modifier.height(16.dp))
                                Text(
                                    text = "Yeni Sipariş",
                                    color = TextPrimary,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    text = "Tüm sepet boşaltılacaktır.",
                                    color = TextSecond,
                                    fontSize = 14.sp,
                                    textAlign = TextAlign.Center
                                )
                                Spacer(Modifier.height(24.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    OutlinedButton(
                                        onClick = { showResetDialog = false },
                                        modifier = Modifier.weight(1f),
                                        border = BorderStroke(1.dp, DividerColor),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecond)
                                    ) {
                                        Text("Vazgeç", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Button(
                                        onClick = {
                                            viewModel.clearCart()
                                            screen = "idle"
                                            showResetDialog = false
                                        },
                                        modifier = Modifier.weight(1f),
                                        colors = ButtonDefaults.buttonColors(containerColor = CartRed)
                                    ) {
                                        Text(
                                            text = "Devam Et ($resetCountdown)",
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Uçan Dot Animasyonları ──
                flyParticles.forEach { p ->
                    key(p.id) {
                        FlyDotAnimation(
                            startX = p.startX - outerBoxPosInRoot.x,
                            startY = p.startY - outerBoxPosInRoot.y,
                            endX   = cartBallPosInRoot.x - outerBoxPosInRoot.x,
                            endY   = cartBallPosInRoot.y - outerBoxPosInRoot.y
                        )
                    }
                }
            }
        }
    }
}

// ─── Yükleme / Hata / Offline ekranları ──────────────────────────────────────

@Composable
private fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = Accent, strokeWidth = 3.dp)
            Spacer(Modifier.height(16.dp))
            Text("Menü yükleniyor…", color = TextSecond, fontSize = 15.sp)
        }
    }
}

@Composable
private fun OfflineScreen(onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("📡", fontSize = 48.sp)
            Spacer(Modifier.height(12.dp))
            Text("Bağlantı Yok", color = CartRed, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("İnternet bağlantısı kontrol edin.", color = TextSecond, fontSize = 14.sp)
            Spacer(Modifier.height(20.dp))
            OutlinedButton(onClick = onRetry, border = BorderStroke(1.dp, Accent)) {
                Text("Yeniden Dene", color = Accent)
            }
        }
    }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Text("⚠️", fontSize = 48.sp)
            Spacer(Modifier.height(12.dp))
            Text("Hata", color = CartRed, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(message, color = TextSecond, fontSize = 13.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(20.dp))
            OutlinedButton(onClick = onRetry, border = BorderStroke(1.dp, Accent)) {
                Text("Yeniden Dene", color = Accent)
            }
        }
    }
}

// ─── Kategori Paneli ──────────────────────────────────────────────────────────

@Composable
private fun CategorySidePanel(
    categories: List<SaleCategory>,
    selectedId: String?,
    onSelect: (String) -> Unit,
    stationCode: String,
    cart: List<CartItem>,
    onResetClick: () -> Unit,
    onLongPress: () -> Unit,
    baseUrl: String,
) {
    var lastTapTime by remember { mutableLongStateOf(0L) }
    var tapCount by remember { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .width(90.dp)
            .fillMaxHeight()
            .background(BgSidebar)
            .border(BorderStroke(1.dp, DividerColor), RoundedCornerShape(0.dp)),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Baştan Başla / Yeni Sipariş Butonu
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp, horizontal = 6.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Accent.copy(alpha = 0.15f))
                .border(BorderStroke(1.dp, Accent.copy(alpha = 0.35f)), RoundedCornerShape(12.dp))
                .clickable {
                    val now = System.currentTimeMillis()
                    if (now - lastTapTime < 4000) {
                        tapCount++
                    } else {
                        tapCount = 1
                    }
                    lastTapTime = now
                    if (tapCount >= 7) {
                        tapCount = 0
                        onLongPress()
                    } else {
                        onResetClick()
                    }
                }
                .padding(vertical = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Yeni Sipariş",
                    tint = AccentLight,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "YENİ\nSİPARİŞ",
                    color = AccentLight,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    lineHeight = 10.sp
                )
            }
        }

        HorizontalDivider(color = DividerColor, thickness = 1.dp)

        // Kategori listesi
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(vertical = 8.dp, horizontal = 6.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            items(categories, key = { it.id }) { cat ->
                val isSelected = cat.id == selectedId
                val catImage = cat.imageUrlResolved(baseUrl)

                Card(
                    modifier = Modifier
                        .size(74.dp)
                        .clickable { onSelect(cat.id) },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = BgCard),
                    border = BorderStroke(
                        width = if (isSelected) 2.5.dp else 1.dp,
                        color = if (isSelected) AccentLight else DividerColor
                    )
                ) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        if (!catImage.isNullOrBlank()) {
                            AsyncImage(
                                model = catImage,
                                contentDescription = cat.name,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(Color(0xFF1E1E30), Color(0xFF0F0F1E))
                                        )
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = String(cat.name.take(1).toCharArray()).uppercase(),
                                    color = TextSecond,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        // Gradient overlay for text readability
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .fillMaxHeight(0.6f)
                                .align(Alignment.BottomCenter)
                                .background(
                                    Brush.verticalGradient(
                                        listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))
                                    )
                                )
                        )

                        // Name overlay
                        Text(
                            text = cat.name,
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            lineHeight = 11.sp,
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(horizontal = 4.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }
    }
}

// ─── Promo Banner ─────────────────────────────────────────────────────────────

@Composable
private fun PromoBanner(
    imageUrl: String?,
    title: String,
    subtitle: String
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(140.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        colors = CardDefaults.cardColors(containerColor = BgCard),
        border = BorderStroke(1.dp, DividerColor)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                listOf(Accent.copy(alpha = 0.3f), Color(0xFF0F0F1E))
                            )
                        )
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.horizontalGradient(
                            listOf(Color.Black.copy(alpha = 0.85f), Color.Black.copy(alpha = 0.2f))
                        )
                    )
            )

            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .align(Alignment.CenterStart)
                    .padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.Center
            ) {
                if (!title.isBlank()) {
                    Text(
                        text = title,
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
                if (!subtitle.isBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = subtitle,
                        color = AccentLight,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

// ─── Ürün Grid ────────────────────────────────────────────────────────────────

@Composable
private fun CategoryHeaderRow(
    category: SaleCategory,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = category.name.uppercase(),
                color = AccentLight,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(end = 12.dp)
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(DividerColor)
            )
        }
    }
}

@Composable
private fun ProductGrid(
    flatGridItems: List<ProductGridItem>,
    gridState: LazyGridState,
    channelId: String?,
    baseUrl: String,
    resolvedBannerUrl: String?,
    bannerTitle: String,
    bannerSubtitle: String,
    onItemClick: (SaleItem, Offset) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        state = gridState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!resolvedBannerUrl.isNullOrBlank() || !bannerTitle.isBlank()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                PromoBanner(
                    imageUrl = resolvedBannerUrl,
                    title = bannerTitle,
                    subtitle = bannerSubtitle
                )
            }
        }

        flatGridItems.forEach { gridItem ->
            when (gridItem) {
                is ProductGridItem.Header -> {
                    item(
                        key = "header_${gridItem.category.id}",
                        span = { GridItemSpan(maxLineSpan) }
                    ) {
                        CategoryHeaderRow(category = gridItem.category)
                    }
                }
                is ProductGridItem.Product -> {
                    item(key = "product_${gridItem.item.id}") {
                        ProductCard(
                            item      = gridItem.item,
                            channelId = channelId,
                            baseUrl   = baseUrl,
                            onClick   = { offset -> onItemClick(gridItem.item, offset) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductCard(
    item: SaleItem,
    channelId: String?,
    baseUrl: String,
    onClick: (Offset) -> Unit,
) {
    val price    = item.priceForChannel(channelId)
    val imageUrl = item.imageUrlForChannel(channelId, baseUrl)
    val hasOptions = item.optionGroupsRaw?.let {
        try { it.asJsonArray.size() > 0 } catch (_: Exception) { false }
    } ?: false

    var cardCenterInRoot by remember { mutableStateOf(Offset.Zero) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.85f)
            .onGloballyPositioned { coords ->
                val pos = coords.positionInRoot()
                cardCenterInRoot = Offset(pos.x + coords.size.width / 2f, pos.y + coords.size.height / 2f)
            }
            .clickable { onClick(cardCenterInRoot) },
        shape  = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = BgCard),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model              = imageUrl,
                    contentDescription = item.name,
                    contentScale       = ContentScale.Crop,
                    modifier           = Modifier.fillMaxSize(),
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                listOf(Color(0xFF1A1A2E), Color(0xFF0F0F1E))
                            )
                        ),
                      contentAlignment = Alignment.Center,
                ) {
                    Text("🍽️", fontSize = 32.sp)
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.6f)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f))
                        )
                    )
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomStart)
                    .padding(12.dp),
            ) {
                Text(
                    text     = item.name,
                    color    = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text     = "₺${String.format("%.2f", price)}",
                    color    = AccentLight,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Black,
                )
            }

            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(Accent)
                    .clickable { onClick(cardCenterInRoot) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector        = if (hasOptions) Icons.Default.Tune else Icons.Default.Add,
                    contentDescription = if (hasOptions) "Seçenekler" else "Ekle",
                    tint               = Color.White,
                    modifier           = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun EmptyCategoryPlaceholder() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🍽️", fontSize = 40.sp)
            Spacer(Modifier.height(12.dp))
            Text("Bu kategoride ürün yok", color = TextMuted, fontSize = 14.sp)
        }
    }
}

// ─── Floating Cart FAB ────────────────────────────────────────────────────────

@Composable
private fun CartFab(
    itemCount: Int,
    total: Double,
    pulseKey: Int,
    hasItems: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "cart_float")
    val floatY by infiniteTransition.animateFloat(
        initialValue   = 0f,
        targetValue    = -4f,
        animationSpec  = infiniteRepeatable(
            animation  = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "float_y",
    )

    val waveTransition = rememberInfiniteTransition(label = "wave")
    val wave1 by waveTransition.animateFloat(
        initialValue  = 0.78f,
        targetValue   = 1.5f,
        animationSpec = infiniteRepeatable(
            animation  = tween(2000, easing = LinearOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave1",
    )
    val wave1Alpha by waveTransition.animateFloat(
        initialValue  = if (hasItems) 0.3f else 0f,
        targetValue   = 0f,
        animationSpec = infiniteRepeatable(
            animation  = tween(2000),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave1a",
    )

    var isPulsing by remember { mutableStateOf(false) }
    val pulseScale by animateFloatAsState(
        targetValue   = if (isPulsing) 1.22f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        finishedListener = { isPulsing = false },
        label = "pulse_scale",
    )
    LaunchedEffect(pulseKey) {
        if (pulseKey > 0) isPulsing = true
    }

    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer { scaleX = wave1; scaleY = wave1 }
                .clip(CircleShape)
                .border(BorderStroke(2.dp, Accent.copy(alpha = if (hasItems) wave1Alpha else 0f)), CircleShape)
                .align(Alignment.Center),
        )

        Box(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer { translationY = floatY }
                .scale(pulseScale)
                .clip(CircleShape)
                .background(
                    if (hasItems)
                        Brush.verticalGradient(listOf(AccentLight, Accent, Color(0xFF4C44CC)))
                    else
                        Brush.verticalGradient(listOf(TextMuted, TextMuted))
                )
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.White.copy(alpha = 0.15f), Color.Transparent)
                        )
                    ),
            )
            Icon(
                imageVector        = Icons.Default.ShoppingBasket,
                contentDescription = "Sepet",
                tint               = Color.White,
                modifier           = Modifier.size(30.dp),
            )
        }

        if (hasItems) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 2.dp, y = (-2).dp)
                    .defaultMinSize(minWidth = 24.dp, minHeight = 24.dp)
                    .clip(CircleShape)
                    .background(CartRed)
                    .padding(horizontal = 5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text       = itemCount.toString(),
                    color      = Color.White,
                    fontSize   = 11.sp,
                    fontWeight = FontWeight.Black,
                )
            }
        }
    }
}

// ─── Ürün Detay Modalı (Sağdan Kayarak Açılan Drawer Panel) ────────────────────

@Composable
private fun ProductDetailSheet(
    item: SaleItem,
    channelId: String?,
    optionGroups: List<OptionGroup>,
    baseUrl: String,
    cartDockY: Dp,
    onDismiss: () -> Unit,
    onAddToCart: (CartItem) -> Unit,
) {
    val basePrice = item.priceForChannel(channelId)
    var quantity  by remember { mutableIntStateOf(1) }

    val selectedOptions = remember {
        mutableStateMapOf<String, String>()
    }

    val optionExtra = remember(selectedOptions.toMap()) {
        selectedOptions.values.sumOf { optId ->
            optionGroups.flatMap { it.options }
                .find { it.id == optId }?.priceModifier ?: 0.0
        }
    }
    val unitPrice = basePrice + optionExtra
    val totalPrice = unitPrice * quantity

    val requiredGroups = optionGroups.filter { it.minSelect > 0 }
    val allRequiredFilled = requiredGroups.all { group ->
        selectedOptions.containsKey(group.id)
    }

    val slideAnim = remember { Animatable(1f) }
    LaunchedEffect(Unit) {
        slideAnim.animateTo(0f, spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow))
    }
    val scope = rememberCoroutineScope()
    fun closeWith(action: () -> Unit) {
        scope.launch {
            slideAnim.animateTo(1f, tween(200, easing = FastOutLinearInEasing))
            action()
        }
    }

    Dialog(
        onDismissRequest = { closeWith { onDismiss() } },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = (0.55f * (1f - slideAnim.value)).coerceIn(0f, 0.55f)))
                .clickable(remember { MutableInteractionSource() }, null) { closeWith { onDismiss() } },
        ) {
            var drawerHeightPx by remember { mutableStateOf(0) }
            val density = LocalDensity.current
            val drawerHeightDp = with(density) { drawerHeightPx.toDp() }
            val screenHeight = with(LocalConfiguration.current) { screenHeightDp.dp }

            val verticalOffset = remember(cartDockY, drawerHeightDp, screenHeight) {
                if (drawerHeightDp > 0.dp) {
                    (cartDockY - (drawerHeightDp / 2)).coerceIn(16.dp, screenHeight - drawerHeightDp - 16.dp)
                } else {
                    cartDockY
                }
            }

            Card(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .width(400.dp)
                    .offset(y = verticalOffset)
                    .alpha(if (drawerHeightPx > 0) 1f else 0f)
                    .graphicsLayer { translationX = size.width * slideAnim.value }
                    .onGloballyPositioned { coords ->
                        drawerHeightPx = coords.size.height
                    }
                    .clickable(remember { MutableInteractionSource() }, null) { },
                shape  = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            ) {
                Column(
                    modifier = Modifier
                        .wrapContentHeight()
                        .heightIn(max = 720.dp)
                ) {
                    val imageUrl = item.imageUrlForChannel(channelId, baseUrl)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .background(Color(0xFFF1F5F9)),
                    ) {
                        if (!imageUrl.isNullOrBlank()) {
                            AsyncImage(
                                model              = imageUrl,
                                contentDescription = item.name,
                                contentScale       = ContentScale.Crop,
                                modifier           = Modifier.fillMaxSize(),
                            )
                        } else {
                            Box(
                                Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("🍽️", fontSize = 48.sp)
                            }
                        }
                        IconButton(
                            onClick = { closeWith { onDismiss() } },
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(8.dp)
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(Color.White),
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Kapat", tint = Color(0xFF0F172A), modifier = Modifier.size(16.dp))
                        }
                    }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                            .padding(20.dp)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        Text(item.name, color = Color(0xFF0F172A), fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "₺${String.format("%.2f", unitPrice)}",
                            color = Accent,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                        )

                        optionGroups.forEach { group ->
                            Spacer(Modifier.height(16.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = group.name,
                                    color = Color(0xFF0F172A),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                if (group.minSelect > 0) {
                                    Spacer(Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Accent.copy(alpha = 0.18f))
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                    ) {
                                        Text("Zorunlu", color = Accent, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                                    }
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            group.options
                                .filter { it.isActive }
                                .sortedBy { it.sortOrder }
                                .forEach { option ->
                                    val isSelected = selectedOptions[group.id] == option.id
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(
                                                if (isSelected) Accent.copy(alpha = 0.12f)
                                                else Color(0xFFF8FAFC)
                                            )
                                            .border(
                                                BorderStroke(
                                                    if (isSelected) 2.dp else 1.dp,
                                                    if (isSelected) Accent
                                                    else Color(0xFFE2E8F0),
                                                ),
                                                RoundedCornerShape(10.dp),
                                            )
                                            .clickable {
                                                selectedOptions[group.id] = option.id
                                            }
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            option.name,
                                            color = if (isSelected) Accent else Color(0xFF334155),
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                        )
                                        if (option.priceModifier != 0.0) {
                                            Text(
                                                "+₺${String.format("%.2f", option.priceModifier)}",
                                                color = if (isSelected) Accent else Color(0xFF64748B),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Medium,
                                            )
                                        }
                                    }
                                    Spacer(Modifier.height(6.dp))
                                }
                        }
                    }

                    // Divider at the top of bottom bar
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(Color(0xFFE2E8F0))
                    )

                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color.White,
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                IconButton(
                                    onClick = { if (quantity > 1) quantity-- },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFFE2E8F0)),
                                ) {
                                    Icon(Icons.Default.Remove, contentDescription = "Azalt", tint = Color(0xFF0F172A), modifier = Modifier.size(16.dp))
                                }
                                Text(
                                    text = quantity.toString(),
                                    color = Color(0xFF0F172A),
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                IconButton(
                                    onClick = { quantity++ },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Accent.copy(alpha = 0.2f)),
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "Artır", tint = Accent, modifier = Modifier.size(16.dp))
                                }
                            }

                            Button(
                                onClick = {
                                    val opts = selectedOptions.entries.mapNotNull { (groupId, optionId) ->
                                        val group = optionGroups.find { it.id == groupId } ?: return@mapNotNull null
                                        val opt   = group.options.find { it.id == optionId } ?: return@mapNotNull null
                                        SelectedOption(
                                            groupId       = groupId,
                                            groupName     = group.name,
                                            optionId      = optionId,
                                            optionName    = opt.name,
                                            priceModifier = opt.priceModifier,
                                        )
                                    }
                                    onAddToCart(
                                        CartItem(
                                            saleItem        = item,
                                            quantity        = quantity,
                                            selectedOptions = opts,
                                            unitPrice       = unitPrice,
                                        )
                                    )
                                },
                                enabled = allRequiredFilled,
                                colors  = ButtonDefaults.buttonColors(containerColor = Accent),
                                shape   = RoundedCornerShape(12.dp),
                            ) {
                                Text(
                                    text = "Sepete Ekle  ₺${String.format("%.2f", totalPrice)}",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Sepet Tam Ekranı ─────────────────────────────────────────────────────────

@Composable
private fun CartFullScreen(
    cart: List<CartItem>,
    total: Double,
    onBack: () -> Unit,
    onIncrease: (String) -> Unit,
    onDecrease: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
    onPay: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF4F3EE)),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Başlık bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFF1F5F9)),
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri", modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "Sepet Özeti",
                    fontWeight = FontWeight.Black,
                    fontSize = 17.sp,
                    color = Color(0xFF0F172A),
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onClear) {
                    Text("Temizle", color = CartRed, fontWeight = FontWeight.Bold)
                }
            }

            // Sepet kalemleri
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(cart, key = { it.cartKey }) { cartItem ->
                    CartItemRow(
                        cartItem   = cartItem,
                        onIncrease = { onIncrease(cartItem.cartKey) },
                        onDecrease = { onDecrease(cartItem.cartKey) },
                        onRemove   = { onRemove(cartItem.cartKey) },
                    )
                }
            }

            // Alt toplam + Ödeme butonu
            Surface(
                shadowElevation = 8.dp,
                color = Color.White,
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Toplam", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Color(0xFF334155))
                        Text(
                            "₺${String.format("%.2f", total)}",
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                            color = Accent,
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = onPay,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    ) {
                        Icon(Icons.Default.CreditCard, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Text("Ödemeye Geç", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun CartItemRow(
    cartItem: CartItem,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        shape  = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    cartItem.saleItem.name,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = Color(0xFF0F172A),
                )
                if (cartItem.selectedOptions.isNotEmpty()) {
                    Spacer(Modifier.height(3.dp))
                    Text(
                        cartItem.selectedOptions.joinToString(" · ") { it.optionName },
                        fontSize = 11.sp,
                        color = Color(0xFF64748B),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "₺${String.format("%.2f", cartItem.lineTotal)}",
                    color = Accent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                )
            }
            Spacer(Modifier.width(12.dp))
            // Miktar kontrolü
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = if (cartItem.quantity > 1) onDecrease else onRemove,
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFF1F5F9)),
                ) {
                    Icon(
                        if (cartItem.quantity > 1) Icons.Default.Remove else Icons.Default.Delete,
                        contentDescription = "Azalt",
                        modifier = Modifier.size(14.dp),
                        tint = if (cartItem.quantity > 1) Color(0xFF475569) else CartRed,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Text(
                    cartItem.quantity.toString(),
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = Color(0xFF0F172A),
                )
                Spacer(Modifier.width(10.dp))
                IconButton(
                    onClick = onIncrease,
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(Accent.copy(alpha = 0.15f)),
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Artır", modifier = Modifier.size(14.dp), tint = Accent)
                }
            }
        }
    }
}

// ─── Ödeme Ekranı ─────────────────────────────────────────────────────────────

@Composable
private fun PaymentConfirmScreen(
    total: Double,
    orderState: OrderSubmitState,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
    onSuccess: () -> Unit,
) {
    // Başarı durumunda otomatik menüye dön
    LaunchedEffect(orderState) {
        if (orderState is OrderSubmitState.Success) {
            kotlinx.coroutines.delay(2500)
            onSuccess()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark),
        contentAlignment = Alignment.Center,
    ) {
        when (orderState) {
            is OrderSubmitState.Idle -> {
                // Ödeme bekleme ekranı
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(40.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.verticalGradient(listOf(AccentLight, Accent))
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.CreditCard,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(56.dp),
                        )
                    }
                    Spacer(Modifier.height(32.dp))
                    Text(
                        "Kartınızı okutun",
                        color = TextPrimary,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "₺${String.format("%.2f", total)}",
                        color = Accent,
                        fontSize = 36.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(48.dp))
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier
                            .fillMaxWidth(0.5f)
                            .height(56.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    ) {
                        Text("Ödemeyi Onayla", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(16.dp))
                    TextButton(onClick = onBack) {
                        Text("← Sepete Dön", color = TextSecond)
                    }
                }
            }

            is OrderSubmitState.Submitting -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Accent, strokeWidth = 4.dp, modifier = Modifier.size(64.dp))
                    Spacer(Modifier.height(24.dp))
                    Text("Sipariş işleniyor…", color = TextSecond, fontSize = 16.sp)
                }
            }

            is OrderSubmitState.Success -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(40.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.verticalGradient(listOf(Color(0xFF34D399), SuccessGreen))
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(60.dp),
                        )
                    }
                    Spacer(Modifier.height(24.dp))
                    Text(
                        "Ödeme Başarılı!",
                        color = SuccessGreen,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black,
                    )
                    orderState.displayNo?.let { no ->
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Sipariş No: #$no",
                            color = TextPrimary,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Teşekkür ederiz! Siparişiniz hazırlanıyor.",
                        color = TextSecond,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            is OrderSubmitState.Error -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(40.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .clip(CircleShape)
                            .background(CartRed.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.ErrorOutline,
                            contentDescription = null,
                            tint = CartRed,
                            modifier = Modifier.size(52.dp),
                        )
                    }
                    Spacer(Modifier.height(20.dp))
                    Text("Sipariş Gönderilemedi", color = CartRed, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(orderState.message, color = TextSecond, fontSize = 13.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(28.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(
                            onClick = onBack,
                            border = BorderStroke(1.dp, TextMuted),
                        ) {
                            Text("Sepete Dön", color = TextSecond)
                        }
                        Button(
                            onClick = onConfirm,
                            colors = ButtonDefaults.buttonColors(containerColor = Accent),
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            Text("Tekrar Dene", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FlyDotAnimation(startX: Float, startY: Float, endX: Float, endY: Float) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(900, easing = CubicBezierEasing(0.25f, 0.46f, 0.45f, 0.94f)))
    }
    val p = progress.value
    val cx = (startX + endX) / 2f
    val cy = minOf(startY, endY) - 100f
    val x = (1-p)*(1-p)*startX + 2*(1-p)*p*cx + p*p*endX
    val y = (1-p)*(1-p)*startY + 2*(1-p)*p*cy + p*p*endY
    val dotSizeDp = (28f * (1f - p * 0.80f)).coerceAtLeast(5.6f)
    val alpha = if (p < 0.72f) 1f else (1f - (p - 0.72f) / 0.28f).coerceAtLeast(0f)

    Box(
        modifier = Modifier
            .offset { IntOffset((x - (dotSizeDp / 2f).dp.toPx()).roundToInt(), (y - (dotSizeDp / 2f).dp.toPx()).roundToInt()) }
            .size(dotSizeDp.dp)
            .graphicsLayer { this.alpha = alpha }
            .clip(CircleShape)
            .background(Color(0xFFEF4444))
    )
}

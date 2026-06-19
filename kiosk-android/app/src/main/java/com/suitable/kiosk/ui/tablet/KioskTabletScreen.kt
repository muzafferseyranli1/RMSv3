package com.suitable.kiosk.ui.tablet

import android.content.res.Configuration
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
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
import com.suitable.kiosk.ui.shared.IdleScreen
import com.suitable.kiosk.ui.shared.ComboBuilderModal
import com.suitable.kiosk.ui.shared.SuggestionModal
import com.suitable.kiosk.ui.shared.KioskSuggestion
import com.suitable.kiosk.ui.shared.SuggestionEvaluator

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

// ─── Tablet Ekranı ────────────────────────────────────────────────────────────

@Composable
fun KioskTabletScreen(
    stationCode: String,
    viewModel: KioskDataViewModel,
    onSecretUnlock: () -> Unit,
) {
    val menuState      by viewModel.menuState.collectAsState()
    val selectedCatId  by viewModel.selectedCategoryId.collectAsState()
    val cart           by viewModel.cart.collectAsState()
    val orderState     by viewModel.orderState.collectAsState()
    val isOpen         by viewModel.isOpen.collectAsState()

    // Ekran durumu: idle | menu | payment
    var screen by remember { mutableStateOf("idle") }

    // Seçili ürün (detay modalı için)
    var selectedItem by remember { mutableStateOf<SaleItem?>(null) }
    var selectedComboProduct by remember { mutableStateOf<SaleItem?>(null) }

    // Öneriler
    var activeSuggestion by remember { mutableStateOf<KioskSuggestion?>(null) }
    val productSuggestionHits = remember { mutableStateMapOf<String, Int>() }
    val checkoutSuggestionHits = remember { mutableStateMapOf<String, Int>() }

    // Dikey modda sepet modalı açık mı?
    var isCartDrawerOpen by remember { mutableStateOf(false) }

    // Yönelim (Orientation) algılama
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark),
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

                val topCategories = remember(data.categories) {
                    data.categories.filter { it.parentId == null && it.deletedAt == null }
                }

                val visibleItems = remember(data.items, selectedCatId, channelId) {
                    val catId = selectedCatId ?: return@remember emptyList()
                    data.items.filter { item ->
                        item.deletedAt == null &&
                        item.active &&
                        catId in item.categoryIds &&
                        item.priceForChannel(channelId) > 0
                    }
                }

                if (screen == "idle") {
                    IdleScreen(
                        branchName = data.branchName ?: "Kadıköy Şubesi",
                        settings = settings,
                        baseUrl = viewModel.baseUrl,
                        onStart = { screen = "menu" }
                    )
                } else {
                    // Ana düzen
                    Row(modifier = Modifier.fillMaxSize()) {
                        // ── Sol: Kategori paneli (Yatayda dar, dikeyde BigScreen ile benzer) ──
                        val sidebarWidth = if (isLandscape) 140.dp else 180.dp
                        CategorySidePanel(
                            categories   = topCategories,
                            selectedId   = selectedCatId,
                            onSelect     = { viewModel.selectCategory(it) },
                            stationCode  = stationCode,
                            width        = sidebarWidth,
                            onLongPress  = onSecretUnlock,
                        )

                        // ── Orta: Ürün gridi ──
                        val gridCols = if (isLandscape) 3 else 2
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                        ) {
                            if (visibleItems.isEmpty()) {
                                EmptyCategoryPlaceholder()
                            } else {
                                ProductGrid(
                                    items     = visibleItems,
                                    channelId = channelId,
                                    cols      = gridCols,
                                    baseUrl   = viewModel.baseUrl,
                                    onItemClick = { item ->
                                        if (item.isComboMenu) {
                                            selectedComboProduct = item
                                        } else {
                                            selectedItem = item
                                        }
                                    },
                                )
                            }

                            // Dikey modda sağ altta sepet topu (FAB)
                            if (!isLandscape) {
                                CartFab(
                                    itemCount  = viewModel.cartItemCount,
                                    hasItems   = cart.isNotEmpty(),
                                    onClick    = { if (cart.isNotEmpty()) isCartDrawerOpen = true },
                                    modifier   = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(20.dp),
                                )
                            }
                        }

                        // ── Sağ: Yatay modda sürekli açık sepet paneli (Split Layout) ──
                        if (isLandscape) {
                            TabletCartPanel(
                                cart      = cart,
                                total     = viewModel.cartTotal,
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
                                modifier   = Modifier
                                    .width(320.dp)
                                    .fillMaxHeight()
                                    .background(BgSidebar)
                                    .border(BorderStroke(1.dp, DividerColor), RoundedCornerShape(0.dp)),
                            )
                        }
                    }
                }

                // ── Ürün detay modalı ──
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
                        onDismiss    = { selectedItem = null },
                        onAddToCart  = { cartItem ->
                            viewModel.addToCart(cartItem)
                            selectedItem = null
                            maybeShowProductSuggestion(item)
                        },
                    )
                }

                // ── Dikey mod sepet çekmecesi ──
                if (!isLandscape && isCartDrawerOpen) {
                    CartFullScreenDialog(
                        cart      = cart,
                        total     = viewModel.cartTotal,
                        onDismiss = { isCartDrawerOpen = false },
                        onIncrease = { viewModel.increaseQty(it) },
                        onDecrease = { viewModel.decreaseQty(it) },
                        onRemove  = { viewModel.removeFromCart(it) },
                        onClear   = { viewModel.clearCart() },
                        onPay     = {
                            isCartDrawerOpen = false
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
                                selectedComboProduct = null
                                maybeShowProductSuggestion(comboProd)
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

                // ── Ödeme ekranı ──
                if (screen == "payment") {
                    PaymentConfirmScreen(
                        total      = viewModel.cartTotal,
                        orderState = orderState,
                        onConfirm  = { viewModel.submitOrder() },
                        onBack     = {
                            viewModel.resetOrderState()
                            screen = "menu"
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
    width: androidx.compose.ui.unit.Dp,
    onLongPress: () -> Unit,
) {
    var lastTapTime by remember { mutableLongStateOf(0L) }
    var tapCount by remember { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .width(width)
            .fillMaxHeight()
            .background(BgSidebar)
            .border(BorderStroke(1.dp, DividerColor), RoundedCornerShape(0.dp)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
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
                    }
                }
                .padding(vertical = 18.dp, horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text       = "KIOSK",
                    color      = Accent,
                    fontSize   = 16.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 3.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text     = stationCode,
                    color    = TextMuted,
                    fontSize = 9.sp,
                )
            }
        }

        HorizontalDivider(color = DividerColor, thickness = 1.dp)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(vertical = 6.dp),
        ) {
            items(categories, key = { it.id }) { cat ->
                val isSelected = cat.id == selectedId
                val bgColor = if (isSelected)
                    Brush.horizontalGradient(listOf(Accent.copy(alpha = 0.18f), Color.Transparent))
                else
                    Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bgColor)
                        .clickable { onSelect(cat.id) }
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .width(3.dp)
                                .height(16.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(if (isSelected) Accent else Color.Transparent),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text       = cat.name,
                            color      = if (isSelected) AccentLight else TextSecond,
                            fontSize   = 12.sp,
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines   = 2,
                            overflow   = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

// ─── Ürün Gridi ──────────────────────────────────────────────────────────────

@Composable
private fun ProductGrid(
    items: List<SaleItem>,
    channelId: String?,
    cols: Int,
    baseUrl: String,
    onItemClick: (SaleItem) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(cols),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(items, key = { it.id }) { item ->
            ProductCard(
                item      = item,
                channelId = channelId,
                baseUrl   = baseUrl,
                onClick   = { onItemClick(item) },
            )
        }
    }
}

@Composable
private fun ProductCard(
    item: SaleItem,
    channelId: String?,
    baseUrl: String,
    onClick: () -> Unit,
) {
    val price    = item.priceForChannel(channelId)
    val imageUrl = item.imageUrlForChannel(channelId, baseUrl)
    val hasOptions = item.optionGroupsRaw?.let {
        try { it.asJsonArray.size() > 0 } catch (_: Exception) { false }
    } ?: false

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.85f)
            .clickable(onClick = onClick),
        shape  = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = BgCard),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(Color(0xFF0F0F1E)),
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
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color(0xFF1A1A2E), Color(0xFF0F0F1E))
                                )
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("🍽️", fontSize = 28.sp)
                    }
                }
                if (hasOptions) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(6.dp)
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(Accent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector        = Icons.Default.Tune,
                            contentDescription = "Seçenekli",
                            tint               = Color.White,
                            modifier           = Modifier.size(10.dp),
                        )
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
            ) {
                Text(
                    text     = item.name,
                    color    = TextPrimary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text     = "₺${String.format("%.2f", price)}",
                    color    = Accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun EmptyCategoryPlaceholder() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🍽️", fontSize = 36.sp)
            Spacer(Modifier.height(10.dp))
            Text("Bu kategoride ürün yok", color = TextMuted, fontSize = 13.sp)
        }
    }
}

// ─── Floating Cart FAB ───

@Composable
private fun CartFab(
    itemCount: Int,
    hasItems: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!hasItems) return

    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(Brush.verticalGradient(listOf(AccentLight, Accent)))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector        = Icons.Default.ShoppingBasket,
                contentDescription = "Sepet",
                tint               = Color.White,
                modifier           = Modifier.size(24.dp),
            )
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 2.dp, y = (-2).dp)
                .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
                .clip(CircleShape)
                .background(CartRed)
                .padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text       = itemCount.toString(),
                color      = Color.White,
                fontSize   = 10.sp,
                fontWeight = FontWeight.Black,
            )
        }
    }
}

// ─── Tablet Cart Panel (Sürekli Açık Sağ Panel) ──────────────────────────────

@Composable
private fun TabletCartPanel(
    cart: List<CartItem>,
    total: Double,
    onIncrease: (String) -> Unit,
    onDecrease: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
    onPay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        // Başlık kısmı
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Sipariş Özeti", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            if (cart.isNotEmpty()) {
                TextButton(onClick = onClear, contentPadding = PaddingValues(0.dp)) {
                    Text("Temizle", color = CartRed, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        HorizontalDivider(color = DividerColor, thickness = 1.dp)

        if (cart.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🛒", fontSize = 32.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Sepetiniz boş", color = TextMuted, fontSize = 12.sp)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(cart, key = { it.cartKey }) { cartItem ->
                    TabletCartItemRow(
                        cartItem   = cartItem,
                        onIncrease = { onIncrease(cartItem.cartKey) },
                        onDecrease = { onDecrease(cartItem.cartKey) },
                        onRemove   = { onRemove(cartItem.cartKey) },
                    )
                }
            }
        }

        HorizontalDivider(color = DividerColor, thickness = 1.dp)

        // Alt Toplam + Ödeme Butonu
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Toplam", color = TextSecond, fontSize = 13.sp)
                Text(
                    "₺${String.format("%.2f", total)}",
                    color = AccentLight,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                )
            }
            Spacer(Modifier.height(10.dp))
            Button(
                onClick   = onPay,
                enabled   = cart.isNotEmpty(),
                modifier  = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                shape     = RoundedCornerShape(10.dp),
                colors    = ButtonDefaults.buttonColors(
                    containerColor = Accent,
                    disabledContainerColor = DividerColor,
                ),
            ) {
                Icon(Icons.Default.CreditCard, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Ödemeye Geç", fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun TabletCartItemRow(
    cartItem: CartItem,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        shape  = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = BgCard),
        border = BorderStroke(1.dp, DividerColor),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp)
        ) {
            Text(
                cartItem.saleItem.name,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (cartItem.selectedOptions.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    cartItem.selectedOptions.joinToString(" · ") { it.optionName },
                    fontSize = 10.sp,
                    color = TextSecond,
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "₺${String.format("%.2f", cartItem.lineTotal)}",
                    color = Accent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = if (cartItem.quantity > 1) onDecrease else onRemove,
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(DividerColor),
                    ) {
                        Icon(
                            if (cartItem.quantity > 1) Icons.Default.Remove else Icons.Default.Delete,
                            contentDescription = "Azalt",
                            modifier = Modifier.size(12.dp),
                            tint = if (cartItem.quantity > 1) TextPrimary else CartRed,
                        )
                    }
                    Text(
                        cartItem.quantity.toString(),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = TextPrimary,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                    IconButton(
                        onClick = onIncrease,
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(Accent.copy(alpha = 0.2f)),
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Artır", modifier = Modifier.size(12.dp), tint = Accent)
                    }
                }
            }
        }
    }
}

// ─── Dikey Mod Sepet Dialog (Tam Ekran Drawer Benzeri) ─────────────────────────

@Composable
private fun CartFullScreenDialog(
    cart: List<CartItem>,
    total: Double,
    onDismiss: () -> Unit,
    onIncrease: (String) -> Unit,
    onDecrease: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
    onPay: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.85f)
                    .clickable(onClick = {}), // alt tıklamayı kes
                shape  = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                colors = CardDefaults.cardColors(containerColor = BgDark),
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Header
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Kapat", tint = TextPrimary)
                        }
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "Sepetiniz",
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = onClear) {
                            Text("Temizle", color = CartRed, fontWeight = FontWeight.Bold)
                        }
                    }

                    HorizontalDivider(color = DividerColor)

                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(cart, key = { it.cartKey }) { cartItem ->
                            TabletCartItemRow(
                                cartItem   = cartItem,
                                onIncrease = { onIncrease(cartItem.cartKey) },
                                onDecrease = { onDecrease(cartItem.cartKey) },
                                onRemove   = { onRemove(cartItem.cartKey) },
                            )
                        }
                    }

                    HorizontalDivider(color = DividerColor)

                    // Footer
                    Column(modifier = Modifier.padding(20.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Toplam", color = TextSecond, fontSize = 15.sp)
                            Text(
                                "₺${String.format("%.2f", total)}",
                                color = AccentLight,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick   = onPay,
                            modifier  = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape     = RoundedCornerShape(12.dp),
                            colors    = ButtonDefaults.buttonColors(containerColor = Accent),
                        ) {
                            Icon(Icons.Default.CreditCard, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Ödemeye Geç", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

// ─── Ürün Detay Modalı ────────────────────────────────────────────────────────

@Composable
private fun ProductDetailSheet(
    item: SaleItem,
    channelId: String?,
    optionGroups: List<OptionGroup>,
    baseUrl: String,
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

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth(0.85f)
                    .clickable(onClick = {})
                    .navigationBarsPadding(),
                shape  = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                colors = CardDefaults.cardColors(containerColor = BgCard),
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    val imageUrl = item.imageUrlForChannel(channelId, baseUrl)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                            .background(Color(0xFF0F0F1E)),
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
                                Text("🍽️", fontSize = 40.sp)
                            }
                        }
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(8.dp)
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.5f)),
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Kapat", tint = Color.White, modifier = Modifier.size(14.dp))
                        }
                    }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        Text(item.name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "₺${String.format("%.2f", unitPrice)}",
                            color = Accent,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )

                        optionGroups.forEach { group ->
                            Spacer(Modifier.height(12.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = group.name,
                                    color = TextPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                if (group.minSelect > 0) {
                                    Spacer(Modifier.width(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Accent.copy(alpha = 0.18f))
                                            .padding(horizontal = 4.dp, vertical = 1.dp),
                                    ) {
                                        Text("Zorunlu", color = Accent, fontSize = 9.sp, fontWeight = FontWeight.Medium)
                                    }
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            group.options
                                .filter { it.isActive }
                                .sortedBy { it.sortOrder }
                                .forEach { option ->
                                    val isSelected = selectedOptions[group.id] == option.id
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(
                                                if (isSelected) Accent.copy(alpha = 0.15f)
                                                else Color.Transparent
                                            )
                                            .border(
                                                BorderStroke(
                                                    1.dp,
                                                    if (isSelected) Accent.copy(alpha = 0.5f)
                                                    else DividerColor,
                                                ),
                                                RoundedCornerShape(8.dp),
                                            )
                                            .clickable {
                                                selectedOptions[group.id] = option.id
                                            }
                                            .padding(horizontal = 10.dp, vertical = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            option.name,
                                            color = if (isSelected) AccentLight else TextSecond,
                                            fontSize = 11.sp,
                                        )
                                        if (option.priceModifier != 0.0) {
                                            Text(
                                                "+₺${String.format("%.2f", option.priceModifier)}",
                                                color = if (isSelected) Accent else TextMuted,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Medium,
                                            )
                                        }
                                    }
                                    Spacer(Modifier.height(4.dp))
                                }
                        }

                        Spacer(Modifier.height(16.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                IconButton(
                                    onClick = { if (quantity > 1) quantity-- },
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(DividerColor),
                                ) {
                                    Icon(Icons.Default.Remove, contentDescription = "Azalt", tint = TextPrimary, modifier = Modifier.size(14.dp))
                                }
                                Text(
                                    text = quantity.toString(),
                                    color = TextPrimary,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                IconButton(
                                    onClick = { quantity++ },
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(Accent.copy(alpha = 0.2f)),
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "Artır", tint = Accent, modifier = Modifier.size(14.dp))
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
                                shape   = RoundedCornerShape(10.dp),
                            ) {
                                Text(
                                    text = "Ekle  ₺${String.format("%.2f", totalPrice)}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
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
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(90.dp)
                            .clip(CircleShape)
                            .background(Brush.verticalGradient(listOf(AccentLight, Accent))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.CreditCard,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(44.dp),
                        )
                    }
                    Spacer(Modifier.height(24.dp))
                    Text(
                        "Kartınızı okutun",
                        color = TextPrimary,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "₺${String.format("%.2f", total)}",
                        color = Accent,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(36.dp))
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier
                            .fillMaxWidth(0.4f)
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    ) {
                        Text("Ödemeyi Onayla", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(12.dp))
                    TextButton(onClick = onBack) {
                        Text("← Vazgeç", color = TextSecond)
                    }
                }
            }

            is OrderSubmitState.Submitting -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Accent, strokeWidth = 3.dp, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(18.dp))
                    Text("Sipariş gönderiliyor…", color = TextSecond, fontSize = 14.sp)
                }
            }

            is OrderSubmitState.Success -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(90.dp)
                            .clip(CircleShape)
                            .background(Brush.verticalGradient(listOf(Color(0xFF34D399), SuccessGreen))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(48.dp),
                        )
                    }
                    Spacer(Modifier.height(18.dp))
                    Text(
                        "Ödeme Başarılı!",
                        color = SuccessGreen,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                    )
                    orderState.displayNo?.let { no ->
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Sipariş No: #$no",
                            color = TextPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Teşekkür ederiz! Siparişiniz hazırlanıyor.",
                        color = TextSecond,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            is OrderSubmitState.Error -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .clip(CircleShape)
                            .background(CartRed.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.ErrorOutline,
                            contentDescription = null,
                            tint = CartRed,
                            modifier = Modifier.size(40.dp),
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    Text("Sipariş Gönderilemedi", color = CartRed, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text(orderState.message, color = TextSecond, fontSize = 12.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(24.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(
                            onClick = onBack,
                            border = BorderStroke(1.dp, TextMuted),
                        ) {
                            Text("Geri", color = TextSecond)
                        }
                        Button(
                            onClick = onConfirm,
                            colors = ButtonDefaults.buttonColors(containerColor = Accent),
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text("Tekrar Dene", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

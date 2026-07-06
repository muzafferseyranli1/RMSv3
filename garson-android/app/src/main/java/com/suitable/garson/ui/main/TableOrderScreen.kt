package com.suitable.garson.ui.main

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.suitable.garson.data.*
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// ─── Renkler ──────────────────────────────────────────────────────────────────

private val OrderBg         = Color(0xFF090E1A)
private val OrderSideBg     = Color(0xFF0D1627)
private val OrderCardBg     = Color(0xFF141E2E)
private val OrderCardBorder = Color(0xFF1E2D42)
private val OrderAccent     = Color(0xFFFF8C42)
private val OrderAccentBlue = Color(0xFF3B82F6)
private val OrderTextPrimary   = Color(0xFFF1F5F9)
private val OrderTextSecondary = Color(0xFF94A3B8)
private val OrderGreen = Color(0xFF10B981)

// ─── Durum ────────────────────────────────────────────────────────────────────

private enum class OrderScreenState { MENU, CART_REVIEW, SUCCESS }

private data class FlyParticle(
    val startX: Float,
    val startY: Float,
    val id: Long = System.nanoTime()
)

private sealed class ScrollItem {
    data class Header(val categoryId: String, val name: String, val showDivider: Boolean) : ScrollItem()
    data class ProductRow(val categoryId: String, val products: List<MenuItem>) : ScrollItem()
}

private data class CategoryWithProducts(
    val category: MenuCategory,
    val products: List<MenuItem>
)

// ─── TableOrderScreen ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableOrderScreen(
    config: AppConfig?,
    staffSession: StaffSession?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    val tableId     = sharedPref.getString("tableId", null)
    val tableName   = sharedPref.getString("tableName", null) ?: "Masa"
    val tableNumber = sharedPref.getString("tableNumber", null) ?: ""
    val branchId    = sharedPref.getString("tableBranchId", null) ?: ""

    val gridColumns = remember {
        ((config?.branding?.get("table_order_columns") as? Number)?.toInt() ?: 2).coerceIn(2, 3)
    }

    val repo  = remember { TableRepository() }
    val scope = rememberCoroutineScope()

    // ── Menü verileri ──────────────────────────────────────────────────────────
    var isLoadingMenu by remember { mutableStateOf(true) }
    var menuError     by remember { mutableStateOf<String?>(null) }
    var categories    by remember { mutableStateOf<List<MenuCategory>>(emptyList()) }
    var products      by remember { mutableStateOf<List<MenuItem>>(emptyList()) }
    var channelId     by remember { mutableStateOf<String?>(null) }
    var channelName   by remember { mutableStateOf<String?>(null) }

    // ── UI durumu ──────────────────────────────────────────────────────────────
    var selectedCategoryId by remember { mutableStateOf<String?>(null) }
    var cart          by remember { mutableStateOf<List<CartItem>>(emptyList()) }
    var orderNote     by remember { mutableStateOf("") }
    var screenState   by remember { mutableStateOf(OrderScreenState.MENU) }
    var isSubmitting  by remember { mutableStateOf(false) }
    var submitError   by remember { mutableStateOf<String?>(null) }
    var optionDrawerProduct by remember { mutableStateOf<MenuItem?>(null) }
    var optionDrawerStartPos by remember { mutableStateOf(Offset.Zero) }

    // ── Floating Cart ──────────────────────────────────────────────────────────
    val density = LocalDensity.current
    var cartDockY by remember { mutableStateOf(240.dp) }
    val cartDockYAnim by animateDpAsState(
        targetValue = cartDockY,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "cdy"
    )
    var cartCheckVisible  by remember { mutableStateOf(false) }
    var cartFeedbackToken by remember { mutableStateOf(0) }
    var flyParticles      by remember { mutableStateOf<List<FlyParticle>>(emptyList()) }

    // Sepet topunun ROOT koordinatındaki merkezi
    var cartBallPosInRoot by remember { mutableStateOf(Offset.Zero) }
    // Outer Box'ın ROOT koordinatındaki başlangıcı (fly offset düzeltmesi için)
    var outerBoxPosInRoot by remember { mutableStateOf(Offset.Zero) }

    // ── Menü yükleme ──────────────────────────────────────────────────────────
    LaunchedEffect(branchId) {
        isLoadingMenu = true; menuError = null
        try {
            val ch = repo.fetchMenuChannel()
            channelId = ch?.id; channelName = ch?.name
            categories = repo.fetchCategories()
            products   = repo.fetchProducts(ch?.id)
            // selectedCategoryId başlangıcı: LaunchedEffect(visibleCategories) ile yapılıyor
        } catch (e: Exception) { menuError = "Menü yüklenemedi: ${e.message}" }
        isLoadingMenu = false
    }

    val rootCategories   = remember(categories) { categories.filter { it.parentId == null } }
    val categoryChildren = remember(categories) { categories.groupBy { it.parentId } }

    // Tüm kategoriler (alt kategoriler dahil), sadece doğrudan ürünü olanlar göster
    // MobileAppShells satır 380-382 ile aynı mantık
    val visibleCategories = remember(categories, products) {
        categories.filter { cat ->
            products.any { p ->
                listOfNotNull(p.saleCatL1, p.saleCatL2, p.saleCatL3, p.saleCatL4, p.saleCatL5)
                    .contains(cat.id)
            }
        }
    }

    // İlk yüklemede (visibleCategories oluştuğunda) ilk kategoriye git
    LaunchedEffect(visibleCategories) {
        if (selectedCategoryId == null && visibleCategories.isNotEmpty()) {
            selectedCategoryId = visibleCategories.first().id
        }
    }

    val categoriesWithProducts = remember(visibleCategories, products) {
        visibleCategories.map { cat ->
            val catProds = products.filter { p ->
                listOfNotNull(p.saleCatL1, p.saleCatL2, p.saleCatL3, p.saleCatL4, p.saleCatL5).contains(cat.id)
            }
            CategoryWithProducts(cat, catProds)
        }
    }

    val scrollItems = remember(categoriesWithProducts, gridColumns) {
        val items = mutableListOf<ScrollItem>()
        categoriesWithProducts.forEachIndexed { index, catWithProds ->
            items.add(
                ScrollItem.Header(
                    categoryId = catWithProds.category.id,
                    name = catWithProds.category.name,
                    showDivider = index > 0
                )
            )
            val chunks = catWithProds.products.chunked(gridColumns)
            chunks.forEach { chunk ->
                items.add(
                    ScrollItem.ProductRow(
                        categoryId = catWithProds.category.id,
                        products = chunk
                    )
                )
            }
        }
        items
    }

    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val railState = androidx.compose.foundation.lazy.rememberLazyListState()

    // Scroll değiştikçe sol tarafı seçili yap
    val isScrollInProgress = listState.isScrollInProgress
    LaunchedEffect(listState, scrollItems, isScrollInProgress) {
        if (isScrollInProgress) {
            androidx.compose.runtime.snapshotFlow { listState.firstVisibleItemIndex }
                .collect { firstIndex ->
                    if (firstIndex in scrollItems.indices) {
                        val item = scrollItems[firstIndex]
                        val catId = when (item) {
                            is ScrollItem.Header -> item.categoryId
                            is ScrollItem.ProductRow -> item.categoryId
                        }
                        if (selectedCategoryId != catId) {
                            selectedCategoryId = catId
                        }
                    }
                }
        }
    }

    val cartTotal     = remember(cart) { cart.sumOf { it.unitPrice * it.qty } }
    val cartItemCount = remember(cart) { cart.sumOf { it.qty } }

    fun flashCartFeedback() {
        cartFeedbackToken++; cartCheckVisible = true
        scope.launch { kotlinx.coroutines.delay(700); cartCheckVisible = false }
    }

    fun triggerFly(sourceRootPos: Offset, onEnd: () -> Unit) {
        if (sourceRootPos == Offset.Zero) { onEnd(); return }
        val p = FlyParticle(startX = sourceRootPos.x, startY = sourceRootPos.y)
        flyParticles = flyParticles + p
        scope.launch {
            kotlinx.coroutines.delay(900)
            flyParticles = flyParticles.filter { it.id != p.id }
            onEnd()
        }
    }

    fun addToCart(
        product: MenuItem,
        qty: Int = 1,
        portionId: String? = null,
        portionName: String? = null,
        options: List<SelectedOption> = emptyList(),
        sourceRootPos: Offset = Offset.Zero
    ) {
        val unitPrice = if (portionId != null)
            product.channelPrice + (product.portions.find { it.id == portionId }?.priceOffset ?: 0.0)
        else product.channelPrice
        val total = unitPrice + options.sumOf { it.price }

        val existing = cart.indexOfFirst {
            it.itemId == product.id && it.portionId == portionId &&
                    it.selectedOptions.map { o -> o.optionId }.sorted() == options.map { o -> o.optionId }.sorted()
        }
        cart = if (existing >= 0)
            cart.mapIndexed { i, item -> if (i == existing) item.copy(qty = item.qty + qty) else item }
        else
            cart + CartItem(
                itemId = product.id,
                name = if (!portionName.isNullOrBlank()) "${product.name} ($portionName)" else product.name,
                unitPrice = total, qty = qty,
                portionId = portionId, portionName = portionName, selectedOptions = options
            )

        triggerFly(sourceRootPos) { flashCartFeedback() }
    }

    fun removeFromCart(id: String) { cart = cart.filter { it.localId != id } }
    fun updateQty(id: String, delta: Int) {
        cart = cart.mapNotNull { item ->
            if (item.localId != id) item
            else { val nq = item.qty + delta; if (nq <= 0) null else item.copy(qty = nq) }
        }
    }
    fun submitOrder() {
        if (cart.isEmpty() || branchId.isBlank()) return
        isSubmitting = true; submitError = null
        scope.launch {
            val r = repo.submitOrder(
                tableId = tableId ?: "",
                tableName = tableName,
                tableNumber = tableNumber,
                branchId = branchId,
                channelId = channelId,
                channelName = channelName,
                cartItems = cart,
                orderNote = orderNote,
                customerId = null,
                personnelId = staffSession?.id,
                personnelName = staffSession?.getDisplayName()
            )
            isSubmitting = false
            if (r.isSuccess) {
                sharedPref.edit().putBoolean("hasPlacedOrder", true).apply()
                screenState = OrderScreenState.SUCCESS
            }
            else submitError = "Sipariş gönderilemedi: ${r.exceptionOrNull()?.message}"
        }
    }

    // ── ROOT OUTER BOX ────────────────────────────────────────────────────────
    // Tüm ekranı kaplar. Floating cart ve fly animasyonları BURADA (Scaffold dışında)
    // tanımlandığı için garantili her şeyin üstünde.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .onGloballyPositioned { outerBoxPosInRoot = it.positionInRoot() }
            // Parmak hareketini takip et → sepet topunu kaydır (tüketme, child'lara ilet)
            .pointerInput(screenState, optionDrawerProduct) {
                if (screenState != OrderScreenState.MENU || optionDrawerProduct != null) return@pointerInput
                awaitPointerEventScope {
                    while (true) {
                        val ev = awaitPointerEvent(PointerEventPass.Initial)
                        val pos = ev.changes.firstOrNull()?.position ?: continue
                        val ty = with(density) { pos.y.toDp() } - 30.dp
                        cartDockY = ty.coerceIn(120.dp, 700.dp)
                    }
                }
            }
    ) {
        // ── Ekran durumuna göre içerik ────────────────────────────────────────
        when (screenState) {
            OrderScreenState.SUCCESS -> OrderSuccessScreen(tableName) { onNavigate("table") }

            OrderScreenState.CART_REVIEW -> CartReviewScreen(
                cart = cart, orderNote = orderNote, cartTotal = cartTotal,
                isSubmitting = isSubmitting, submitError = submitError,
                onNoteChange = { orderNote = it }, onRemove = { removeFromCart(it) },
                onUpdateQty = { id, d -> updateQty(id, d) },
                onBack = { screenState = OrderScreenState.MENU }, onSubmit = { submitOrder() }
            )

            OrderScreenState.MENU -> {
                // Scaffold — bottomBar YOK (yüzen sepet yeterli)
                Scaffold(
                    containerColor = OrderBg,
                    topBar = {
                        TopAppBar(
                            title = {
                                Column {
                                    Text("Sipariş Ver", color = OrderTextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                                    Text("$tableName · No: $tableNumber", color = OrderTextSecondary, fontSize = 11.sp)
                                }
                            },
                            navigationIcon = {
                                IconButton(onClick = { onNavigate("table") }) {
                                    Icon(Icons.Default.ArrowBack, "Geri", tint = OrderTextPrimary)
                                }
                            },
                            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1627))
                        )
                    }
                ) { innerPad ->
                    Box(Modifier.fillMaxSize().padding(innerPad)) {
                        when {
                            isLoadingMenu -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    CircularProgressIndicator(color = OrderAccent, modifier = Modifier.size(48.dp))
                                    Text("Menü yükleniyor...", color = OrderTextSecondary, fontSize = 14.sp)
                                }
                            }
                            menuError != null -> Box(Modifier.fillMaxSize().padding(32.dp), Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    Icon(Icons.Default.Warning, null, tint = Color(0xFFEF4444), modifier = Modifier.size(48.dp))
                                    Text(menuError ?: "", color = OrderTextSecondary, textAlign = TextAlign.Center)
                                }
                            }
                            else -> Row(Modifier.fillMaxSize()) {
                                CategoryRail(
                                    categories = visibleCategories,
                                    selectedCategoryId = selectedCategoryId,
                                    listState = railState,
                                    onSelect = { catId ->
                                        selectedCategoryId = catId
                                        val targetIndex = scrollItems.indexOfFirst {
                                            it is ScrollItem.Header && it.categoryId == catId
                                        }
                                        if (targetIndex >= 0) {
                                            scope.launch {
                                                val currentIndex = listState.firstVisibleItemIndex
                                                val diff = kotlin.math.abs(targetIndex - currentIndex)
                                                if (diff > 3) {
                                                    val proxyIndex = if (targetIndex > currentIndex) {
                                                        (targetIndex - 2).coerceAtLeast(0)
                                                    } else {
                                                        (targetIndex + 2).coerceAtLeast(0)
                                                    }
                                                    listState.scrollToItem(proxyIndex)
                                                }
                                                listState.animateScrollToItem(targetIndex)
                                            }
                                        }
                                    }
                                )
                                ProductScrollablePanel(
                                    scrollItems = scrollItems,
                                    listState = listState,
                                    gridColumns = gridColumns,
                                    modifier = Modifier.weight(1f),
                                    onProductClick = { product, srcPos ->
                                        val hasOpts = product.embeddedOptionGroups.isNotEmpty() || product.portions.size > 1
                                        if (!hasOpts) addToCart(product, sourceRootPos = srcPos)
                                        else {
                                            optionDrawerProduct = product
                                            optionDrawerStartPos = srcPos
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        // ── Floating Cart Ball ─────────────────────────────────────────────────
        // Scaffold'un DIŞINDA → garantili her şeyin üstünde
        if (screenState == OrderScreenState.MENU) {
            FloatingCartBall(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = 8.dp)
                    .offset(y = cartDockYAnim)
                    .onGloballyPositioned { coords ->
                        val p = coords.positionInRoot()
                        cartBallPosInRoot = Offset(p.x + coords.size.width / 2f, p.y + coords.size.height / 2f)
                    },
                itemCount = cartItemCount,
                checkVisible = cartCheckVisible,
                feedbackToken = cartFeedbackToken,
                onClick = { if (cartItemCount > 0) screenState = OrderScreenState.CART_REVIEW }
            )

            // ── Uçan Dot'lar ──────────────────────────────────────────────────
            // outerBoxPosInRoot ile root koordinatları local'e dönüştür
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

        // ── Seçenek Drawer (overlay) ──────────────────────────────────────────
        optionDrawerProduct?.let { product ->
            OptionDrawer(
                product = product,
                onDismiss = { optionDrawerProduct = null },
                onConfirm = { qty, portionId, portionName, options, _ ->
                    addToCart(product, qty, portionId, portionName, options, optionDrawerStartPos)
                    optionDrawerProduct = null
                }
            )
        }
    }
}

// ─── Floating Cart Ball ───────────────────────────────────────────────────────

@Composable
private fun FloatingCartBall(
    modifier: Modifier,
    itemCount: Int,
    checkVisible: Boolean,
    feedbackToken: Int,
    onClick: () -> Unit
) {
    Box(modifier = modifier.size(64.dp)) {
        // Dalga halkası
        val wAlpha by rememberInfiniteTransition(label = "wa").animateFloat(
            initialValue = 0.5f, targetValue = 0f,
            animationSpec = infiniteRepeatable(tween(2000), RepeatMode.Restart), label = "wa2"
        )
        val wScale by rememberInfiniteTransition(label = "ws").animateFloat(
            initialValue = 1f, targetValue = 1.65f,
            animationSpec = infiniteRepeatable(tween(2000), RepeatMode.Restart), label = "ws2"
        )
        Box(Modifier.fillMaxSize().graphicsLayer { scaleX = wScale; scaleY = wScale; alpha = wAlpha }.clip(CircleShape).border(2.dp, OrderAccent.copy(alpha = 0.4f), CircleShape))

        val floatY by rememberInfiniteTransition(label = "fy").animateFloat(
            initialValue = -3f, targetValue = 3f,
            animationSpec = infiniteRepeatable(tween(2200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "fy2"
        )
        Box(
            modifier = Modifier.fillMaxSize().offset(y = floatY.dp)
                .shadow(18.dp, CircleShape).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color(0xFFFFB347), OrderAccent, Color(0xFFE05500))))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.fillMaxWidth().fillMaxHeight(0.5f).align(Alignment.TopCenter).clip(RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)).background(Color.White.copy(alpha = 0.18f)))
            key(feedbackToken) {
                Crossfade(targetState = checkVisible, animationSpec = tween(200), label = "ci") { showCheck ->
                    if (showCheck) Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(28.dp))
                    else Icon(Icons.Default.ShoppingCart, "Sepet", tint = Color.White, modifier = Modifier.size(26.dp))
                }
            }
        }
        if (itemCount > 0) {
            Box(
                modifier = Modifier.align(Alignment.TopEnd).offset(x = 5.dp, y = (-5).dp)
                    .defaultMinSize(minWidth = 22.dp, minHeight = 22.dp)
                    .clip(CircleShape).background(Color(0xFFEF4444)).padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center
            ) { Text("$itemCount", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold) }
        }
    }
}

// ─── Uçan Dot Animasyonu ─────────────────────────────────────────────────────
// Koordinatlar outer Box'a göre LOCAL (root - outerBoxPos)

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

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

private fun getAllChildCategoryIds(catId: String, childMap: Map<String?, List<MenuCategory>>): Set<String> {
    val result = mutableSetOf<String>()
    val queue = ArrayDeque<String>().apply { add(catId) }
    while (queue.isNotEmpty()) {
        val cur = queue.removeFirst()
        childMap[cur]?.forEach { child -> if (result.add(child.id)) queue.add(child.id) }
    }
    return result
}

// ─── Kategori Rail ────────────────────────────────────────────────────────────

@Composable
private fun CategoryRail(
    categories: List<MenuCategory>,
    selectedCategoryId: String?,
    listState: androidx.compose.foundation.lazy.LazyListState,
    onSelect: (String) -> Unit
) {
    LaunchedEffect(selectedCategoryId) {
        selectedCategoryId?.let { catId ->
            val index = categories.indexOfFirst { it.id == catId }
            if (index >= 0) {
                val layoutInfo = listState.layoutInfo
                val visibleItems = layoutInfo.visibleItemsInfo
                val visibleItem = visibleItems.find { it.index == index }
                val isFullyVisible = if (visibleItem != null) {
                    val start = visibleItem.offset
                    val end = visibleItem.offset + visibleItem.size
                    start >= 0 && end <= layoutInfo.viewportEndOffset - layoutInfo.afterContentPadding
                } else {
                    false
                }
                if (!isFullyVisible) {
                    listState.animateScrollToItem(index)
                }
            }
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.width(80.dp).fillMaxHeight().background(OrderSideBg),
        contentPadding = PaddingValues(vertical = 8.dp, horizontal = 5.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(categories, key = { it.id }) { cat ->
            val isSel = cat.id == selectedCategoryId
            val scale by animateFloatAsState(if (isSel) 1.04f else 1f, spring(stiffness = Spring.StiffnessMediumLow), label = "cs")
            val hasImage = !cat.imageUrl.isNullOrBlank()
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (isSel) OrderAccent.copy(alpha = 0.18f) else Color.Transparent)
                    .border(if (isSel) 1.dp else 0.dp, if (isSel) OrderAccent.copy(alpha = 0.6f) else Color.Transparent, RoundedCornerShape(14.dp))
                    .clickable { onSelect(cat.id) }
                    .padding(vertical = 8.dp, horizontal = 3.dp)
                    .graphicsLayer { scaleX = scale; scaleY = scale }
            ) {
                Box(
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(
                        if (!cat.bg.startsWith("#")) Color(0xFF1E293B)
                        else try { Color(android.graphics.Color.parseColor(cat.bg)) } catch (_: Exception) { Color(0xFF1E293B) }
                    ), contentAlignment = Alignment.Center
                ) {
                    if (hasImage) {
                        AsyncImage(
                            model = cat.imageUrl,
                            contentDescription = cat.name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp))
                        )
                    } else {
                        // Resim yoksa baş harf
                        Text(cat.name.take(1).uppercase(), color = if (isSel) OrderAccent else OrderTextSecondary, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    }
                    if (isSel) Box(Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)).background(OrderAccent.copy(alpha = 0.22f)))
                }
                // Resim varsa isim gösterme, yoksa göster
                if (!hasImage) {
                    Spacer(Modifier.height(5.dp))
                    Text(
                        text = cat.name,
                        color = if (isSel) OrderAccent else OrderTextSecondary,
                        fontSize = 9.sp,
                        fontWeight = if (isSel) FontWeight.ExtraBold else FontWeight.Medium,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 11.sp
                    )
                }
            }
        }
    }
}

// ─── Ürün Grid ────────────────────────────────────────────────────────────────

@Composable
private fun ProductScrollablePanel(
    scrollItems: List<ScrollItem>,
    listState: androidx.compose.foundation.lazy.LazyListState,
    gridColumns: Int,
    modifier: Modifier = Modifier,
    onProductClick: (MenuItem, Offset) -> Unit
) {
    if (scrollItems.isEmpty()) {
        Box(modifier.fillMaxSize(), Alignment.Center) { Text("Ürün bulunamadı", color = OrderTextSecondary, fontSize = 13.sp) }
        return
    }
    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().background(OrderBg),
        contentPadding = PaddingValues(bottom = 120.dp, start = 8.dp, end = 8.dp, top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(scrollItems) { item ->
            when (item) {
                is ScrollItem.Header -> {
                    Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp)) {
                        if (item.showDivider) {
                            HorizontalDivider(
                                color = OrderCardBorder.copy(alpha = 0.4f),
                                thickness = 1.dp,
                                modifier = Modifier.padding(bottom = 16.dp, start = 4.dp, end = 4.dp)
                            )
                        }
                        Text(
                            text = item.name,
                            color = OrderAccent,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier.padding(horizontal = 8.dp)
                        )
                    }
                }
                is ScrollItem.ProductRow -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item.products.forEach { product ->
                            Box(modifier = Modifier.weight(1f)) {
                                ProductCard(product) { offset -> onProductClick(product, offset) }
                            }
                        }
                        val emptySlots = gridColumns - item.products.size
                        repeat(emptySlots) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

// ─── Ürün Kartı ───────────────────────────────────────────────────────────────

@Composable
private fun ProductCard(product: MenuItem, onClick: (Offset) -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(if (isPressed) 0.94f else 1f, spring(stiffness = Spring.StiffnessMedium), label = "ps")
    var cardCenterInRoot by remember { mutableStateOf(Offset.Zero) }
    val hasOpts = product.embeddedOptionGroups.isNotEmpty() || product.portions.size > 1
    // channelDescription isimden farklıysa göster (aynıysa duplicate olur)
    val showDesc = !product.channelDescription.isNullOrBlank() &&
            product.channelDescription.trim() != product.name.trim()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(190.dp)   // ← Sabit yükseklik: tüm kartlar aynı boyut
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(6.dp, RoundedCornerShape(16.dp))
            .onGloballyPositioned { coords ->
                val pos = coords.positionInRoot()
                cardCenterInRoot = Offset(pos.x + coords.size.width / 2f, pos.y + coords.size.height * 0.3f)
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick(cardCenterInRoot) },
        colors = CardDefaults.cardColors(containerColor = OrderCardBg),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, OrderCardBorder)
    ) {
        Column {
            // Resim alanı — sabit 110dp
            Box(modifier = Modifier.fillMaxWidth().height(110.dp).background(Color(0xFF1A2744)), contentAlignment = Alignment.Center) {
                if (!product.channelImage.isNullOrBlank()) {
                    AsyncImage(
                        model = product.channelImage,
                        contentDescription = product.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                    )
                    Box(Modifier.fillMaxSize().clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xFF0A1525).copy(alpha = 0.5f)), 0.4f * 110f, 110f)))
                } else {
                    Text(product.name.take(1).uppercase(), color = OrderTextSecondary, fontWeight = FontWeight.ExtraBold, fontSize = 36.sp)
                }
                if (hasOpts) {
                    Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(22.dp).clip(CircleShape).background(OrderAccentBlue.copy(alpha = 0.9f)), Alignment.Center) {
                        Icon(Icons.Default.Tune, null, tint = Color.White, modifier = Modifier.size(13.dp))
                    }
                } else {
                    Box(Modifier.align(Alignment.BottomEnd).padding(6.dp).size(28.dp).clip(CircleShape)
                        .background(Brush.radialGradient(listOf(Color(0xFFFFB347), OrderAccent))), Alignment.Center) {
                        Icon(Icons.Default.Add, "Ekle", tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
            }
            // Metin alanı — kalan yükseklik (80dp)
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 7.dp), verticalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(product.name, color = OrderTextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 15.sp)
                    if (showDesc)
                        Text(product.channelDescription!!, color = OrderTextSecondary, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("₺${String.format("%.2f", product.channelPrice)}", color = OrderAccent, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
            }
        }
    }
}

// ─── Seçenek Drawer ───────────────────────────────────────────────────────────

@Composable
private fun OptionDrawer(
    product: MenuItem,
    onDismiss: () -> Unit,
    onConfirm: (qty: Int, portionId: String?, portionName: String?, options: List<SelectedOption>, srcPos: Offset) -> Unit
) {
    var qty by remember { mutableStateOf(1) }
    var selectedPortionId by remember { mutableStateOf(product.portions.firstOrNull()?.id) }

    // KioskBig mantığı: her seçenek için COUNT (aynı opsiyonu birden fazla ekleyebilir)
    // "groupId:optionId" -> count
    val optionCounts = remember { mutableStateMapOf<String, Int>() }

    val optionGroups = product.embeddedOptionGroups

    fun groupTotal(groupId: String) = optionCounts.entries.filter { it.key.startsWith("$groupId:") }.sumOf { it.value }

    fun buildOptions(): List<SelectedOption> = optionCounts.entries.flatMap { (key, count) ->
        if (count <= 0) return@flatMap emptyList()
        val parts = key.split(":", limit = 2)
        if (parts.size != 2) return@flatMap emptyList()
        val (gId, oId) = parts
        val grp = optionGroups.find { it.id == gId } ?: return@flatMap emptyList()
        val opt = grp.options.find { it.id == oId } ?: return@flatMap emptyList()
        (1..count).map { SelectedOption(gId, grp.name, oId, opt.name, opt.price) }
    }

    val slideAnim = remember { Animatable(1f) }
    LaunchedEffect(Unit) {
        slideAnim.animateTo(0f, spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow))
    }
    val scope = rememberCoroutineScope()

    var addBtnPosInRoot by remember { mutableStateOf(Offset.Zero) }

    fun closeWith(action: () -> Unit) {
        scope.launch {
            slideAnim.animateTo(1f, tween(200, easing = FastOutLinearInEasing))
            action()
        }
    }

    fun checkAutoClose() {
        if (optionGroups.isEmpty()) return
        val allMax = optionGroups.all { grp -> groupTotal(grp.id) >= grp.maxSelect }
        if (allMax) {
            val portion = product.portions.find { it.id == selectedPortionId }
            closeWith { onConfirm(qty, selectedPortionId, portion?.name, buildOptions(), addBtnPosInRoot) }
        }
    }

    // Overlay arka plan
    Box(
        Modifier.fillMaxSize()
            .background(Color.Black.copy(alpha = (0.55f * (1f - slideAnim.value)).coerceIn(0f, 0.55f)))
            .clickable(remember { MutableInteractionSource() }, null) { closeWith { onDismiss() } }
    )

    // Drawer paneli (sağdan açılır, içeriğe göre boy değişir, dikey ortalanır)
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.88f)
                .wrapContentHeight()
                .heightIn(max = 720.dp)
                .graphicsLayer { translationX = size.width * slideAnim.value }
                .shadow(28.dp, RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp))
                .clip(RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp))
                .background(Color(0xFF141E2E))
                .border(
                    width = 1.5.dp,
                    brush = Brush.verticalGradient(listOf(OrderAccent.copy(alpha = 0.55f), OrderAccentBlue.copy(alpha = 0.35f), OrderAccent.copy(alpha = 0.2f))),
                    shape = RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp)
                )
                .clickable(remember { MutableInteractionSource() }, null) { }
        ) {
            Column {
                // Başlık
                Row(
                    Modifier.fillMaxWidth().background(Color(0xFF0D1627)).padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { closeWith { onDismiss() } }, Modifier.size(34.dp)) {
                        Icon(Icons.Default.Close, null, tint = OrderTextSecondary)
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(product.name, color = OrderTextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("₺${String.format("%.2f", product.channelPrice)}", color = OrderAccent, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
                HorizontalDivider(color = OrderAccent.copy(alpha = 0.25f), thickness = 1.dp)

                // İçerik
                LazyColumn(
                    modifier = Modifier.weight(1f, fill = false),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    // Porsiyon seçimi
                    if (product.portions.size > 1) {
                        item {
                            DrawerSection("Boyut Seçimi", "1 seçin", OrderAccentBlue) {
                                product.portions.forEach { portion ->
                                    val isSel = selectedPortionId == portion.id
                                    DrawerRadioRow(
                                        label = portion.name,
                                        price = if (portion.priceOffset != 0.0) "+₺${String.format("%.2f", portion.priceOffset)}" else null,
                                        isSelected = isSel,
                                        onClick = {
                                            selectedPortionId = portion.id
                                            if (optionGroups.isEmpty()) {
                                                closeWith { onConfirm(qty, portion.id, portion.name, buildOptions(), addBtnPosInRoot) }
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Seçenek grupları
                    items(optionGroups) { grp ->
                        val gTotal = groupTotal(grp.id)
                        val isSingle = grp.maxSelect == 1
                        val badgeColor = when {
                            gTotal >= grp.maxSelect -> OrderGreen
                            grp.minSelect > 0 && gTotal < grp.minSelect -> Color(0xFFEF4444)
                            else -> OrderAccentBlue
                        }
                        DrawerSection(
                            title = grp.name,
                            badge = "$gTotal/${grp.maxSelect}",
                            badgeColor = badgeColor,
                            subtitle = if (grp.minSelect > 0 && !isSingle) "En az ${grp.minSelect} seçim gerekli" else null
                        ) {
                            grp.options.forEach { opt ->
                                val key = "${grp.id}:${opt.id}"
                                val count = optionCounts[key] ?: 0

                                if (isSingle) {
                                    // Radio davranışı
                                    DrawerRadioRow(
                                        label = opt.name,
                                        price = if (opt.price > 0) "+₺${String.format("%.2f", opt.price)}" else null,
                                        isSelected = count > 0,
                                        onClick = {
                                            // Gruptaki tüm seçimleri sil
                                            optionCounts.keys.filter { it.startsWith("${grp.id}:") }.forEach { optionCounts.remove(it) }
                                            if (count == 0) { optionCounts[key] = 1 }
                                            checkAutoClose()
                                        }
                                    )
                                } else {
                                    // Multi-select: count stepper — KioskBig gibi aynı opsiyonu birden ekleyebilir
                                    val atMax = gTotal >= grp.maxSelect && count == 0
                                    DrawerCountRow(
                                        label = opt.name,
                                        price = if (opt.price > 0) "+₺${String.format("%.2f", opt.price)}" else null,
                                        count = count,
                                        canAdd = gTotal < grp.maxSelect,
                                        canRemove = count > 0,
                                        onAdd = {
                                            if (gTotal < grp.maxSelect) {
                                                optionCounts[key] = count + 1
                                                checkAutoClose()
                                            }
                                        },
                                        onRemove = {
                                            if (count > 0) {
                                                if (count == 1) optionCounts.remove(key)
                                                else optionCounts[key] = count - 1
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Adet
                    item {
                        DrawerSection("Adet", null, Color.Transparent) {
                            Row(Modifier.fillMaxWidth(), Arrangement.Center, Alignment.CenterVertically) {
                                IconButton({ if (qty > 1) qty-- }, Modifier.size(44.dp).clip(CircleShape).background(OrderCardBorder)) {
                                    Icon(Icons.Default.Remove, null, tint = OrderTextPrimary)
                                }
                                Text("$qty", color = OrderTextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, modifier = Modifier.padding(horizontal = 28.dp))
                                IconButton({ qty++ }, Modifier.size(44.dp).clip(CircleShape).background(OrderAccent)) {
                                    Icon(Icons.Default.Add, null, tint = Color.White)
                                }
                            }
                        }
                    }
                }

                // Sepete Ekle
                val portion = product.portions.find { it.id == selectedPortionId }
                val optTotal = buildOptions().sumOf { it.price }
                val totalPrice = (product.channelPrice + (portion?.priceOffset ?: 0.0) + optTotal) * qty
                val allMinsMet = optionGroups.all { g -> groupTotal(g.id) >= g.minSelect }

                Box(
                    Modifier.fillMaxWidth().background(Color(0xFF0D1627)).padding(14.dp)
                        .onGloballyPositioned { coords ->
                            val pos = coords.positionInRoot()
                            addBtnPosInRoot = Offset(pos.x + coords.size.width / 2f, pos.y + coords.size.height / 2f)
                        }
                ) {
                    Button(
                        onClick = { closeWith { onConfirm(qty, selectedPortionId, portion?.name, buildOptions(), addBtnPosInRoot) } },
                        enabled = allMinsMet,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = OrderAccent, disabledContainerColor = OrderAccent.copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ShoppingCart, null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Text("Sepete Ekle  ·  ₺${String.format("%.2f", totalPrice)}", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                        }
                    }
                }
            }
        }
    }
}

// ─── Drawer Helper Composables ────────────────────────────────────────────────

@Composable
private fun DrawerSection(title: String, badge: String?, badgeColor: Color, subtitle: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = OrderTextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                if (subtitle != null) Text(subtitle, color = OrderTextSecondary, fontSize = 11.sp)
            }
            if (badge != null) {
                Box(Modifier.clip(RoundedCornerShape(7.dp)).background(badgeColor.copy(alpha = 0.15f)).border(1.dp, badgeColor.copy(alpha = 0.4f), RoundedCornerShape(7.dp)).padding(horizontal = 7.dp, vertical = 3.dp)) {
                    Text(badge, color = badgeColor, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { content() }
    }
}

@Composable
private fun DrawerRadioRow(label: String, price: String?, isSelected: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(if (isSelected) OrderAccent.copy(alpha = 0.12f) else Color.Transparent, tween(150), label = "rb")
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(bg)
            .border(if (isSelected) 1.dp else 0.5.dp, if (isSelected) OrderAccent.copy(alpha = 0.5f) else OrderCardBorder, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(18.dp).clip(CircleShape).border(2.dp, if (isSelected) OrderAccent else OrderTextSecondary, CircleShape).background(if (isSelected) OrderAccent else Color.Transparent), Alignment.Center) {
            if (isSelected) Box(Modifier.size(7.dp).clip(CircleShape).background(Color.White))
        }
        Spacer(Modifier.width(10.dp))
        Text(label, color = OrderTextPrimary, fontSize = 13.sp, modifier = Modifier.weight(1f))
        if (price != null) Text(price, color = OrderAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

// Multi-select satırı: [label] [count?] [-][+]
@Composable
private fun DrawerCountRow(label: String, price: String?, count: Int, canAdd: Boolean, canRemove: Boolean, onAdd: () -> Unit, onRemove: () -> Unit) {
    val isSelected = count > 0
    val bg by animateColorAsState(if (isSelected) OrderAccent.copy(alpha = 0.12f) else Color.Transparent, tween(150), label = "cb")
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(bg)
            .border(if (isSelected) 1.dp else 0.5.dp, if (isSelected) OrderAccent.copy(alpha = 0.5f) else OrderCardBorder, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = OrderTextPrimary, fontSize = 13.sp)
            if (price != null) Text(price, color = OrderAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        // Stepper
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (isSelected) {
                Box(
                    Modifier.size(28.dp).clip(CircleShape).background(if (canRemove) OrderCardBorder else Color.Transparent).clickable(enabled = canRemove, onClick = onRemove),
                    Alignment.Center
                ) { Icon(Icons.Default.Remove, null, tint = if (canRemove) OrderTextPrimary else Color.Transparent, modifier = Modifier.size(14.dp)) }
                Box(
                    Modifier.defaultMinSize(28.dp, 28.dp).clip(CircleShape).background(OrderAccent.copy(alpha = 0.2f)).padding(horizontal = 6.dp),
                    Alignment.Center
                ) { Text("$count", color = OrderAccent, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold) }
            }
            Box(
                Modifier.size(28.dp).clip(CircleShape).background(if (canAdd) OrderAccent else OrderAccent.copy(alpha = 0.25f)).clickable(enabled = canAdd, onClick = onAdd),
                Alignment.Center
            ) { Icon(Icons.Default.Add, null, tint = Color.White, modifier = Modifier.size(14.dp)) }
        }
    }
}

// ─── Cart Review Screen ───────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CartReviewScreen(
    cart: List<CartItem>, orderNote: String, cartTotal: Double, isSubmitting: Boolean, submitError: String?,
    onNoteChange: (String) -> Unit, onRemove: (String) -> Unit, onUpdateQty: (String, Int) -> Unit,
    onBack: () -> Unit, onSubmit: () -> Unit
) {
    Scaffold(
        containerColor = OrderBg,
        topBar = {
            TopAppBar(
                title = { Text("Sepetim", color = OrderTextPrimary, fontWeight = FontWeight.ExtraBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Geri", tint = OrderTextPrimary) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1627))
            )
        },
        bottomBar = {
            Column(Modifier.fillMaxWidth().background(Color(0xFF0D1627)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (submitError != null) Text(submitError, color = Color(0xFFFCA5A5), fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                    Text("Toplam", color = OrderTextSecondary, fontSize = 14.sp)
                    Text("₺${String.format("%.2f", cartTotal)}", color = OrderAccent, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                }
                Button(
                    onClick = onSubmit, enabled = !isSubmitting && cart.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrderGreen), shape = RoundedCornerShape(16.dp)
                ) {
                    if (isSubmitting) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    else { Icon(Icons.Default.CheckCircle, null); Spacer(Modifier.width(8.dp)); Text("Siparişi Gönder", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Color.White) }
                }
            }
        }
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize().padding(pad), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(cart, key = { it.localId }) { item ->
                CartItemCard(item, { onRemove(item.localId) }, { onUpdateQty(item.localId, +1) }, { onUpdateQty(item.localId, -1) })
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = OrderCardBg), shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, OrderCardBorder)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.EditNote, null, tint = OrderAccent, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Sipariş Notu", color = OrderTextPrimary, fontWeight = FontWeight.Bold)
                        }
                        OutlinedTextField(
                            value = orderNote, onValueChange = onNoteChange,
                            placeholder = { Text("Ek istek, alerji notu... (opsiyonel)", color = OrderTextSecondary, fontSize = 13.sp) },
                            modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = OrderAccent, unfocusedBorderColor = OrderCardBorder, focusedTextColor = OrderTextPrimary, unfocusedTextColor = OrderTextPrimary, cursorColor = OrderAccent),
                            minLines = 2
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CartItemCard(item: CartItem, onRemove: () -> Unit, onQtyUp: () -> Unit, onQtyDown: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = OrderCardBg), shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, OrderCardBorder)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(item.name, color = OrderTextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                if (item.selectedOptions.isNotEmpty()) Text(item.selectedOptions.joinToString(", ") { it.optionName }, color = OrderTextSecondary, fontSize = 11.sp)
                Text("₺${String.format("%.2f", item.unitPrice * item.qty)}", color = OrderAccent, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onQtyDown, Modifier.size(32.dp).clip(CircleShape).background(OrderCardBorder)) {
                    Icon(if (item.qty <= 1) Icons.Default.Delete else Icons.Default.Remove, null, tint = if (item.qty <= 1) Color(0xFFEF4444) else OrderTextPrimary, modifier = Modifier.size(16.dp))
                }
                Text("${item.qty}", color = OrderTextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, modifier = Modifier.padding(horizontal = 12.dp))
                IconButton(onClick = onQtyUp, Modifier.size(32.dp).clip(CircleShape).background(OrderAccent)) {
                    Icon(Icons.Default.Add, null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

// ─── Başarı Ekranı ────────────────────────────────────────────────────────────

@Composable
private fun OrderSuccessScreen(tableName: String, onDone: () -> Unit) {
    val scale by rememberInfiniteTransition(label = "s").animateFloat(0.95f, 1.05f, infiniteRepeatable(tween(900), RepeatMode.Reverse), "ss")
    Column(modifier = Modifier.fillMaxSize().background(OrderBg).padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size((120 * scale).dp).clip(CircleShape).background(OrderGreen.copy(alpha = 0.15f)), Alignment.Center) {
            Icon(Icons.Default.CheckCircle, null, tint = OrderGreen, modifier = Modifier.size(72.dp))
        }
        Spacer(Modifier.height(28.dp))
        Text("Sipariş Alındı! 🎉", color = OrderTextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        Text("$tableName için siparişiniz mutfağa iletildi.\nAfiyet olsun!", color = OrderTextSecondary, fontSize = 15.sp, textAlign = TextAlign.Center, lineHeight = 22.sp)
        Spacer(Modifier.height(40.dp))
        Button(onClick = onDone, colors = ButtonDefaults.buttonColors(containerColor = OrderGreen), modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(16.dp)) {
            Text("Masama Dön", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Color.White)
        }
    }
}


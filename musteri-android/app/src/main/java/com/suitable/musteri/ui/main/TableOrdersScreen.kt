package com.suitable.musteri.ui.main

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo
import com.suitable.musteri.data.TableOrder
import com.suitable.musteri.data.TableRepository
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val OrdersBg = Color(0xFF0B1120)
private val OrdersCardBg = Color(0xFF141E2E)
private val OrdersCardBorder = Color(0xFF1E2D42)
private val OrdersAccent = Color(0xFFF59E0B)
private val OrdersTextPrimary = Color(0xFFF1F5F9)
private val OrdersTextSecondary = Color(0xFF94A3B8)
private val OrdersGreen = Color(0xFF10B981)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableOrdersScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    val tableNumber = sharedPref.getString("tableNumber", null)
    val tableName = sharedPref.getString("tableName", null)
    val branchId = sharedPref.getString("tableBranchId", null)

    val repo = remember { TableRepository() }
    var orders by remember { mutableStateOf<List<TableOrder>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    fun loadOrders() {
        isLoading = true
        errorMsg = null
    }

    LaunchedEffect(tableNumber, branchId) {
        if (tableNumber.isNullOrBlank() || branchId.isNullOrBlank()) {
            isLoading = false
            return@LaunchedEffect
        }
        try {
            orders = repo.fetchTodayTableOrders(branchId, tableNumber)
        } catch (e: Exception) {
            errorMsg = "Siparişler yüklenemedi"
        }
        isLoading = false
    }

    Scaffold(
        containerColor = OrdersBg,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Masa Siparişleri",
                            color = OrdersTextPrimary,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp
                        )
                        if (!tableName.isNullOrBlank()) {
                            Text(
                                text = tableName,
                                color = OrdersTextSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { onNavigate("table") }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Geri", tint = OrdersTextPrimary)
                    }
                },
                actions = {
                    IconButton(onClick = {
                        isLoading = true
                        // trigger recompose by resetting
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = OrdersTextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1627))
            )
        },
        bottomBar = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0D1627))
                    .padding(16.dp)
            ) {
                Button(
                    onClick = { onNavigate("table_order") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrdersAccent),
                    shape = RoundedCornerShape(16.dp),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Sipariş Ekle",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 16.sp,
                        color = Color.White
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(OrdersBg)
        ) {
            when {
                tableNumber.isNullOrBlank() -> {
                    // Masa seçilmemiş
                    EmptyState(
                        icon = Icons.Default.TableRestaurant,
                        title = "Masa Seçilmedi",
                        subtitle = "Sipariş görmek için önce bir masa seçin",
                        actionLabel = "Masa Seç",
                        onAction = { onNavigate("table") }
                    )
                }

                isLoading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            CircularProgressIndicator(color = OrdersAccent, modifier = Modifier.size(48.dp))
                            Text("Siparişler yükleniyor...", color = OrdersTextSecondary, fontSize = 14.sp)
                        }
                    }
                }

                orders.isEmpty() -> {
                    EmptyState(
                        icon = Icons.Default.ReceiptLong,
                        title = "Henüz Sipariş Yok",
                        subtitle = "Bu masaya bugün verilmiş sipariş bulunamadı",
                        actionLabel = "İlk Siparişi Ver",
                        onAction = { onNavigate("table_order") }
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Özet banner
                        item {
                            OrderSummaryBanner(orders = orders)
                        }

                        items(orders, key = { it.id }) { order ->
                            OrderCard(order = order)
                        }

                        item { Spacer(modifier = Modifier.height(8.dp)) }
                    }
                }
            }
        }
    }
}

// ─── Özet Banner ─────────────────────────────────────────────────────────────

@Composable
private fun OrderSummaryBanner(orders: List<TableOrder>) {
    val total = orders.sumOf { it.grossTotal }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2744)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(OrdersAccent.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = OrdersAccent, modifier = Modifier.size(24.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("${orders.size} sipariş", color = OrdersTextSecondary, fontSize = 12.sp)
                Text(
                    text = "Bugünkü Toplam",
                    color = OrdersTextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
            }
            Text(
                text = "₺${String.format("%.2f", total)}",
                color = OrdersAccent,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp
            )
        }
    }
}

// ─── Sipariş Kartı ────────────────────────────────────────────────────────────

@Composable
private fun OrderCard(order: TableOrder) {
    val timeText = remember(order.saleDateTime) {
        try {
            val instant = Instant.parse(order.saleDateTime)
            val formatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
            formatter.format(instant)
        } catch (e: Exception) { "--:--" }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = OrdersCardBg),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, OrdersCardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Başlık satırı
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(OrdersGreen.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = OrdersGreen, modifier = Modifier.size(20.dp))
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Saat $timeText", color = OrdersTextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text("Alındı", color = OrdersGreen, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    text = "₺${String.format("%.2f", order.grossTotal)}",
                    color = OrdersTextPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp
                )
            }

            // Sipariş notu (içerik olarak ürünleri de içerebilir)
            if (!order.orderNote.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = OrdersCardBorder)
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = order.orderNote,
                    color = OrdersTextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )
            }
        }
    }
}

// ─── Boş Durum ────────────────────────────────────────────────────────────────

@Composable
private fun EmptyState(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .clip(RoundedCornerShape(28.dp))
                .background(Color(0xFF1E293B)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = OrdersTextSecondary, modifier = Modifier.size(52.dp))
        }
        Spacer(modifier = Modifier.height(24.dp))
        Text(title, color = OrdersTextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(8.dp))
        Text(subtitle, color = OrdersTextSecondary, fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 20.sp)
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = onAction,
            colors = ButtonDefaults.buttonColors(containerColor = OrdersAccent),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text(actionLabel, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}

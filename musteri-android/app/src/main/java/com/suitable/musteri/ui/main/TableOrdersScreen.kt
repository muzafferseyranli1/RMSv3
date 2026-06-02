package com.suitable.musteri.ui.main

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
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
import com.suitable.musteri.data.TableOrderLine
import com.suitable.musteri.data.TableRepository
import kotlinx.coroutines.launch
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
private val OrdersRed = Color(0xFFEF4444)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableOrdersScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    val tableId = sharedPref.getString("tableId", null)
    val tableNumber = sharedPref.getString("tableNumber", null)
    val tableName = sharedPref.getString("tableName", null)
    val branchId = sharedPref.getString("tableBranchId", null)

    val repo = remember { TableRepository() }
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<TableOrder>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    // Dialog state
    var showLeaveConfirmDialog by remember { mutableStateOf(false) }
    var showCannotLeaveDialog by remember { mutableStateOf(false) }
    var isLeavingTable by remember { mutableStateOf(false) }

    fun loadOrders() {
        if (tableNumber.isNullOrBlank() || branchId.isNullOrBlank()) {
            isLoading = false
            return
        }
        isLoading = true
        scope.launch {
            try {
                val hasPlacedOrder = sharedPref.getBoolean("hasPlacedOrder", false)
                val occupied = repo.isTableOccupied(branchId, tableId ?: "")
                
                if (hasPlacedOrder && !occupied) {
                    // Masanın hesabı alınmış, masa boşalmış. Otomatik bırak.
                    sharedPref.edit()
                        .remove("tableId")
                        .remove("tableName")
                        .remove("tableNumber")
                        .remove("tableBranchId")
                        .remove("hasPlacedOrder")
                        .remove("sessionStart")
                        .apply()
                    onNavigate("home")
                    return@launch
                }
                
                if (!occupied && !hasPlacedOrder) {
                    orders = emptyList()
                } else {
                    val sessionStart = sharedPref.getLong("sessionStart", 0L).let { if (it > 0) it else null }
                    orders = repo.fetchTodayTableOrders(branchId, tableNumber, sessionStart)
                }
            } catch (e: Exception) {
                errorMsg = "Siparişler yüklenemedi"
            }
            isLoading = false
        }
    }

    LaunchedEffect(tableNumber, branchId) {
        loadOrders()
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
                    IconButton(onClick = { loadOrders() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = OrdersTextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0D1627))
            )
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0D1627))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Ekleme Yap Butonu (Büyük Kehribar Buton)
                Button(
                    onClick = { onNavigate("table_order") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrdersAccent),
                    shape = RoundedCornerShape(14.dp),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 6.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Siparişime Ekleme Yap",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 15.sp,
                        color = Color.White,
                        maxLines = 1
                    )
                }

                // Masayı Değiştir & Masayı Bırak Butonları Yan Yana
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = { onNavigate("table") },
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, OrdersCardBorder),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = OrdersTextSecondary),
                        contentPadding = PaddingValues(horizontal = 4.dp)
                    ) {
                        Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Masayı Değiştir", 
                            fontSize = 12.sp, 
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                    }

                    Button(
                        onClick = {
                            if (isLeavingTable) return@Button
                            isLeavingTable = true
                            scope.launch {
                                try {
                                    val occupied = repo.isTableOccupied(branchId ?: "", tableId ?: "")
                                    if (occupied) {
                                        showCannotLeaveDialog = true
                                    } else {
                                        showLeaveConfirmDialog = true
                                    }
                                } finally {
                                    isLeavingTable = false
                                }
                            }
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = OrdersRed),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp)
                    ) {
                        if (isLeavingTable) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                        } else {
                            Icon(Icons.Default.Logout, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Masayı Bırak", 
                                fontSize = 12.sp, 
                                fontWeight = FontWeight.Bold, 
                                color = Color.White,
                                maxLines = 1
                            )
                        }
                    }
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
                tableNumber.isNullOrBlank() || branchId.isNullOrBlank() -> {
                    EmptyState(
                        icon = Icons.Default.TableRestaurant,
                        title = "Masa Seçilmedi",
                        subtitle = "Siparişlerinizi görmek için önce bir masa seçin",
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
                        subtitle = "Bu masaya ait aktif bir sipariş bulunmamaktadır.",
                        actionLabel = "İlk Siparişimi Ver",
                        onAction = { onNavigate("table_order") }
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Özet banner
                        item {
                            OrderSummaryBanner(orders = orders)
                        }

                        // Siparişleri saat kırılımına göre listele
                        items(orders, key = { it.id }) { order ->
                            OrderGroupCard(order = order)
                        }

                        item { Spacer(modifier = Modifier.height(16.dp)) }
                    }
                }
            }

            // Dialoglar
            if (showCannotLeaveDialog) {
                AlertDialog(
                    onDismissRequest = { showCannotLeaveDialog = false },
                    title = { Text("Masayı Bırakamazsınız", fontWeight = FontWeight.Bold) },
                    text = { Text("Aktif siparişiniz bulunduğu için masayı bırakamazsınız. Masayı kapatmak veya hesabı ödemek için lütfen garsona bildirin.") },
                    confirmButton = {
                        Button(
                            onClick = { showCannotLeaveDialog = false },
                            colors = ButtonDefaults.buttonColors(containerColor = OrdersAccent)
                        ) {
                            Text("Tamam", color = Color.White)
                        }
                    },
                    containerColor = OrdersCardBg,
                    titleContentColor = OrdersTextPrimary,
                    textContentColor = OrdersTextSecondary
                )
            }

            if (showLeaveConfirmDialog) {
                AlertDialog(
                    onDismissRequest = { showLeaveConfirmDialog = false },
                    title = { Text("Masayı Bırak", fontWeight = FontWeight.Bold) },
                    text = { Text("Masayı bırakmak istediğinize emin misiniz? Sepetinizdeki ve masadaki tüm kayıtlar sıfırlanacaktır.") },
                    confirmButton = {
                        Button(
                            onClick = {
                                showLeaveConfirmDialog = false
                                isLeavingTable = true
                                scope.launch {
                                    val success = repo.leaveTable(branchId ?: "", tableId ?: "")
                                    if (success) {
                                        // SharedPref temizliği
                                        sharedPref.edit()
                                            .remove("tableId")
                                            .remove("tableName")
                                            .remove("tableNumber")
                                            .remove("tableBranchId")
                                            .remove("hasPlacedOrder")
                                            .remove("sessionStart")
                                            .apply()
                                        
                                        onNavigate("home")
                                    }
                                    isLeavingTable = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = OrdersRed)
                        ) {
                            Text("Evet, Bırak", color = Color.White)
                        }
                    },
                    dismissButton = {
                        OutlinedButton(
                            onClick = { showLeaveConfirmDialog = false },
                            border = BorderStroke(1.dp, OrdersCardBorder),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = OrdersTextSecondary)
                        ) {
                            Text("Vazgeç")
                        }
                    },
                    containerColor = OrdersCardBg,
                    titleContentColor = OrdersTextPrimary,
                    textContentColor = OrdersTextSecondary
                )
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
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, OrdersCardBorder)
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
                    text = "Toplam Masa Hesabı",
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

@Composable
private fun OrderGroupCard(order: TableOrder) {
    val timeText = remember(order.saleDateTime) {
        try {
            val instant = Instant.parse(order.saleDateTime)
            val formatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
            formatter.format(instant)
        } catch (e: Exception) { "--:--" }
    }

    val (statusText, statusColor, statusIcon) = remember(order.status) {
        when (order.status) {
            "pending" -> Triple("Onay Bekliyor", OrdersAccent, Icons.Default.HourglassEmpty)
            "preparing" -> Triple("Hazırlanıyor", Color(0xFF3B82F6), Icons.Default.Restaurant)
            "ready" -> Triple("Hazır", OrdersGreen, Icons.Default.CheckCircle)
            "completed", "paid" -> Triple("Tamamlandı", OrdersGreen, Icons.Default.CheckCircle)
            else -> Triple(order.status.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }, OrdersTextSecondary, Icons.Default.Info)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = OrdersCardBg),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, OrdersCardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Başlık satırı (Saat + Durum + Ara Toplam)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(statusColor.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(statusIcon, contentDescription = null, tint = statusColor, modifier = Modifier.size(20.dp))
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Sipariş Saati: $timeText", color = OrdersTextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text("Durum: $statusText", color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    text = "₺${String.format("%.2f", order.grossTotal)}",
                    color = OrdersAccent,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 17.sp
                )
            }

            // Sipariş Notu
            if (!order.orderNote.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = OrdersTextSecondary, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = order.orderNote,
                            color = OrdersTextSecondary,
                            fontSize = 11.sp,
                            lineHeight = 15.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = OrdersCardBorder)
            Spacer(modifier = Modifier.height(12.dp))

            // Ürün Satırları (Her bir line için)
            if (order.lines.isEmpty()) {
                Text(
                    text = "Sipariş detayları yüklenemedi.",
                    color = OrdersTextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    order.lines.forEach { line ->
                        OrderLineRow(line = line)
                    }
                }
            }
        }
    }
}

// ─── Ürün Satır Görünümü ──────────────────────────────────────────────────────

@Composable
private fun OrderLineRow(line: TableOrderLine) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        // Miktar kutucuğu
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(OrdersTextSecondary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            val qtyStr = if (line.qty % 1.0 == 0.0) line.qty.toInt().toString() else String.format("%.1f", line.qty)
            Text(
                text = "${qtyStr}x",
                color = OrdersAccent,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        
        // Ürün adı, porsiyon ve seçenekler
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = line.productName,
                color = OrdersTextPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp
            )
            
            // Porsiyon varsa göster
            if (!line.portionName.isNullOrBlank()) {
                Text(
                    text = "Porsiyon: ${line.portionName}",
                    color = OrdersTextSecondary,
                    fontSize = 11.sp
                )
            }
            
            // Seçenek özetini göster
            if (!line.optionsSummary.isNullOrBlank()) {
                Text(
                    text = "+ ${line.optionsSummary}",
                    color = OrdersTextSecondary.copy(alpha = 0.8f),
                    fontSize = 11.sp,
                    lineHeight = 14.sp
                )
            }
        }
        
        Spacer(modifier = Modifier.width(12.dp))
        
        // Tutar
        Text(
            text = "₺${String.format("%.2f", line.lineTotal)}",
            color = OrdersTextPrimary,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp
        )
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

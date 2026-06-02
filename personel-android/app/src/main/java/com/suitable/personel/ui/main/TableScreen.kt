package com.suitable.personel.ui.main

import android.content.Context
import android.util.Log
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items as lazyItems
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.personel.data.AppConfig
import com.suitable.personel.data.TableInfo
import com.suitable.personel.data.TableOrder
import com.suitable.personel.data.TableRepository
import com.suitable.personel.data.DeviceRepository
import com.suitable.personel.data.PosTerminal
import kotlinx.coroutines.launch
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions

private val TableBg = Color(0xFF0F172A)
private val CardBg = Color(0xFF1E293B)
private val CardBorder = Color(0xFF334155)
private val AccentOrange = Color(0xFFFF8C42)
private val AccentBlue = Color(0xFF3B82F6)
private val AccentGreen = Color(0xFF10B981)
private val AccentRed = Color(0xFFEF4444)
private val TextPrimary = Color(0xFFF8FAFC)
private val TextSecondary = Color(0xFF94A3B8)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableScreen(
    config: AppConfig?,
    staffSession: StaffSession?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { TableRepository() }
    val deviceRepo = remember { DeviceRepository() }

    val sharedPref = context.getSharedPreferences("PersonelPrefs", Context.MODE_PRIVATE)

    val branchId = staffSession?.activeBranchId ?: ""
    val branchName = staffSession?.activeBranchName ?: "Şube"

    var selectedTerminalId by remember { mutableStateOf(sharedPref.getString("selectedGarsonTerminalId", null)) }
    var selectedTerminal by remember { mutableStateOf<PosTerminal?>(null) }
    var terminalsList by remember { mutableStateOf<List<PosTerminal>>(emptyList()) }
    var showTerminalSelection by remember { mutableStateOf(selectedTerminalId == null) }

    var tables by remember { mutableStateOf<List<TableInfo>>(emptyList()) }
    var occupiedTables by remember { mutableStateOf<Map<String, List<*>>>(emptyMap()) }
    var pendingRequests by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
    var pendingAssignments by remember { mutableStateOf<List<TableOrder>>(emptyList()) }
    
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var refreshTrigger by remember { mutableStateOf(0) }

    var selectedTableForAction by remember { mutableStateOf<TableInfo?>(null) }
    var showActionDialog by remember { mutableStateOf(false) }
    var showAssignmentDialog by remember { mutableStateOf<TableOrder?>(null) }
    var assignmentPin by remember { mutableStateOf("") }
    var assignmentError by remember { mutableStateOf<String?>(null) }

    // Verileri yükle
    LaunchedEffect(branchId, refreshTrigger) {
        if (branchId.isBlank()) return@LaunchedEffect
        isLoading = true
        errorMsg = null
        scope.launch {
            try {
                // Terminals
                val allTerminals = deviceRepo.fetchGarsonTerminals(branchId)
                terminalsList = allTerminals

                if (selectedTerminalId != null) {
                    selectedTerminal = allTerminals.find { it.id == selectedTerminalId }
                    // Update active session on initial load
                    if (selectedTerminal != null && staffSession?.id != null) {
                        deviceRepo.updateGarsonActiveSession(selectedTerminalId!!, staffSession.id)
                    }
                }

                // 1) Masaları çek
                val allTables = repo.fetchBranchTables(branchId)

                // 2) Terminal allowed_zones fitrelemesi
                val allowedZones = selectedTerminal?.getAllowedZones()
                tables = if (allowedZones.isNullOrEmpty() || allowedZones.contains("*")) {
                    allTables
                } else {
                    allTables.filter { allowedZones.contains(it.hallId) || allowedZones.contains(it.sectionId) }
                }
                
                // 3) Açık adisyonlu (dolu) masaları çek
                occupiedTables = repo.fetchOpenTicketsForBranch(branchId)
                
                // 4) Bekleyen servis taleplerini çek
                pendingRequests = repo.fetchPendingServiceRequests(branchId)

                // 5) Atanmayı bekleyen müşteri siparişleri
                val allPendingOrders = repo.fetchPendingWaiterAssignments(branchId)
                pendingAssignments = allPendingOrders.filter { order ->
                    tables.any { t -> t.tableNumber == order.tableNumber || t.tableName == order.tableName }
                }

                if (pendingAssignments.isNotEmpty() && showAssignmentDialog == null) {
                    showAssignmentDialog = pendingAssignments.first()
                } else if (pendingAssignments.isEmpty()) {
                    showAssignmentDialog = null
                }
            } catch (e: Exception) {
                errorMsg = "Veriler yüklenirken hata oluştu."
                Log.e("TableScreen", "Error loading table data", e)
            } finally {
                isLoading = false
            }
        }
    }

    if (showTerminalSelection) {
        Scaffold(
            containerColor = TableBg,
            topBar = {
                TopAppBar(
                    title = { Text("Garson Terminali Seçin", color = TextPrimary) },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F172A))
                )
            }
        ) { innerPadding ->
            Box(modifier = Modifier.padding(innerPadding).fillMaxSize().background(TableBg)) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = AccentBlue)
                } else if (terminalsList.isEmpty()) {
                    Text(
                        "Bu şubede tanımlı masa tipi (Garson) terminal bulunamadı.",
                        color = TextSecondary,
                        modifier = Modifier.align(Alignment.Center)
                    )
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        lazyItems(terminalsList, key = { it.id }) { terminal ->
                            Card(
                                modifier = Modifier.fillMaxWidth().clickable {
                                    selectedTerminalId = terminal.id
                                    selectedTerminal = terminal
                                    sharedPref.edit().putString("selectedGarsonTerminalId", terminal.id).apply()
                                    scope.launch {
                                        deviceRepo.updateGarsonActiveSession(terminal.id, staffSession?.id)
                                    }
                                    showTerminalSelection = false
                                    refreshTrigger++
                                },
                                colors = CardDefaults.cardColors(containerColor = CardBg),
                                border = if (selectedTerminalId == terminal.id) androidx.compose.foundation.BorderStroke(2.dp, AccentBlue) else null
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(terminal.terminalName ?: "İsimsiz Terminal", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text("Kod: ${terminal.activationCode}", color = TextSecondary, fontSize = 12.sp)
                                    val zones = terminal.getAllowedZones()
                                    if (zones.isNotEmpty()) {
                                        Text("Bölgeler: ${zones.size}", color = AccentGreen, fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return
    }

    Scaffold(
        containerColor = TableBg,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Garson Terminali",
                            color = TextPrimary,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 20.sp
                        )
                        Text(
                            text = "${branchName} • ${selectedTerminal?.terminalName ?: ""}",
                            color = TextSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { showTerminalSelection = true }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Terminal Seç",
                            tint = Color.White
                        )
                    }
                    IconButton(
                        onClick = { refreshTrigger++ },
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Yenile",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F172A))
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(TableBg)
        ) {
            if (isLoading && tables.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentBlue)
                }
            } else if (errorMsg != null && tables.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.Warning, null, tint = AccentRed, modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(text = errorMsg!!, color = TextSecondary, textAlign = TextAlign.Center)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = { refreshTrigger++ }) {
                        Text("Tekrar Deneyin")
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Durum Dashboard
                    TableDashboardHeader(
                        totalCount = tables.size,
                        occupiedCount = tables.count { occupiedTables.containsKey(it.id) },
                        callsCount = tables.count { t -> pendingRequests.any { r -> r["table_id"] == t.id } }
                    )

                    if (tables.isEmpty()) {
                        Box(
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("Bu yetki bölgesine ait masa bulunamadı.", color = TextSecondary, fontSize = 15.sp)
                        }
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(3),
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            contentPadding = PaddingValues(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(tables, key = { it.id }) { table ->
                                val cart = occupiedTables[table.id]
                                val isOccupied = cart != null && cart.isNotEmpty()
                                val itemCount = cart?.sumOf { 
                                    ((it as? Map<*, *>)?.get("qty") as? Number)?.toInt() ?: 1 
                                } ?: 0
                                
                                // Bekleyen talep var mı kontrol et
                                val tableRequests = pendingRequests.filter { it["table_id"] == table.id }
                                val hasCall = tableRequests.any { it["request_type"] == "call_waiter" }
                                val hasBill = tableRequests.any { it["request_type"] == "bill_request" }

                                TableGridCard(
                                    table = table,
                                    isOccupied = isOccupied,
                                    itemCount = itemCount,
                                    hasCall = hasCall,
                                    hasBill = hasBill,
                                    onClick = {
                                        // Masayı aktif yap ve aksiyon penceresini aç
                                        val sharedPrefCust = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
                                        sharedPrefCust.edit()
                                            .putString("tableId", table.id)
                                            .putString("tableName", table.tableName.ifBlank { "Masa ${table.tableNumber}" })
                                            .putString("tableNumber", table.tableNumber)
                                            .putString("tableBranchId", table.branchId)
                                            .apply()

                                        selectedTableForAction = table
                                        showActionDialog = true
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Masa Aksiyon Penceresi
    if (showActionDialog && selectedTableForAction != null) {
        val table = selectedTableForAction!!
        val cart = occupiedTables[table.id]
        val isOccupied = cart != null && cart.isNotEmpty()
        val itemCount = cart?.sumOf { 
            ((it as? Map<*, *>)?.get("qty") as? Number)?.toInt() ?: 1 
        } ?: 0
        
        val tableRequests = pendingRequests.filter { it["table_id"] == table.id }
        val hasRequest = tableRequests.isNotEmpty()

        AlertDialog(
            onDismissRequest = {
                showActionDialog = false
                selectedTableForAction = null
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.TableRestaurant,
                        contentDescription = null,
                        tint = if (isOccupied) AccentBlue else AccentGreen,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = table.tableName.ifBlank { "Masa ${table.tableNumber}" },
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = if (isOccupied) "Adisyon Durumu: Dolu (${itemCount} ürün)" else "Adisyon Durumu: Boş",
                        color = TextSecondary,
                        fontSize = 14.sp
                    )
                    
                    if (hasRequest) {
                        Text(
                            text = "Aktif Çağrılar: " + tableRequests.joinToString { 
                                if (it["request_type"] == "bill_request") "Hesap Talebi" else "Garson Çağrısı"
                            },
                            color = AccentRed,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // 1. Aksiyon: Sipariş Al
                    Button(
                        onClick = {
                            showActionDialog = false
                            selectedTableForAction = null
                            onNavigate("table_order")
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = AccentBlue),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Restaurant, null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Sipariş Al", fontWeight = FontWeight.Bold)
                    }

                    // 2. Aksiyon: Siparişleri Gör
                    OutlinedButton(
                        onClick = {
                            showActionDialog = false
                            selectedTableForAction = null
                            onNavigate("table_orders")
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)
                    ) {
                        Icon(Icons.Default.Receipt, null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Siparişleri Gör (${itemCount})")
                    }

                    // 3. Aksiyon: Çağrıyı Kapat
                    if (hasRequest) {
                        Button(
                            onClick = {
                                scope.launch {
                                    val success = repo.resolveServiceRequests(
                                        tableId = table.id,
                                        branchId = branchId,
                                        staffId = staffSession?.id ?: "garson",
                                        staffName = staffSession?.getDisplayName() ?: "Garson"
                                    )
                                    if (success) {
                                        refreshTrigger++
                                    }
                                    showActionDialog = false
                                    selectedTableForAction = null
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Done, null, tint = Color.White)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Çağrıları Kapat", fontWeight = FontWeight.Bold)
                        }
                    }

                    // 4. Aksiyon: Masayı Boşalt / Temizle
                    if (isOccupied) {
                        Button(
                            onClick = {
                                scope.launch {
                                    val success = repo.leaveTable(branchId, table.id)
                                    if (success) {
                                        refreshTrigger++
                                    }
                                    showActionDialog = false
                                    selectedTableForAction = null
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = AccentRed),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.CleaningServices, null, tint = Color.White)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Adisyonu Kapat (Boşalt)", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(
                    onClick = {
                        showActionDialog = false
                        selectedTableForAction = null
                    }
                ) {
                    Text("Kapat", color = TextSecondary)
                }
            },
            containerColor = Color(0xFF1E293B)
        )
    }

    if (showAssignmentDialog != null) {
        val order = showAssignmentDialog!!
        AlertDialog(
            onDismissRequest = {
                showAssignmentDialog = null
                assignmentPin = ""
                assignmentError = null
            },
            title = {
                Text("🛎️ Yeni Müşteri Siparişi", color = AccentBlue, fontWeight = FontWeight.Bold)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Masa: ${order.tableName.ifBlank { order.tableNumber }}", color = Color.White, fontSize = 16.sp)
                    Text("Tutar: ₺${String.format("%.2f", order.grossTotal)}", color = TextSecondary)
                    Text("Siparişi üstünüze almak için PIN girin:", color = TextSecondary, fontSize = 14.sp)
                    
                    OutlinedTextField(
                        value = assignmentPin,
                        onValueChange = { assignmentPin = it; assignmentError = null },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        placeholder = { Text("PIN") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentBlue,
                            unfocusedBorderColor = CardBorder,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )
                    
                    if (assignmentError != null) {
                        Text(assignmentError!!, color = AccentRed, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (assignmentPin == staffSession?.pin) {
                            scope.launch {
                                val success = repo.acceptWaiterAssignment(order.id, staffSession.id, staffSession.getDisplayName())
                                if (success) {
                                    showAssignmentDialog = null
                                    assignmentPin = ""
                                    refreshTrigger++
                                } else {
                                    assignmentError = "İşlem başarısız oldu."
                                }
                            }
                        } else {
                            assignmentError = "Hatalı PIN"
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentBlue)
                ) {
                    Text("Kabul Et")
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showAssignmentDialog = null
                    assignmentPin = ""
                    assignmentError = null
                }) {
                    Text("Kapat", color = TextSecondary)
                }
            },
            containerColor = Color(0xFF1E293B)
        )
    }
}

@Composable
private fun TableDashboardHeader(
    totalCount: Int,
    occupiedCount: Int,
    callsCount: Int
) {
    val emptyCount = (totalCount - occupiedCount).coerceAtLeast(0)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        DashboardBadge(label = "Tümü", value = totalCount, color = Color(0xFF475569), modifier = Modifier.weight(1f))
        DashboardBadge(label = "Dolu", value = occupiedCount, color = AccentBlue, modifier = Modifier.weight(1f))
        DashboardBadge(label = "Boş", value = emptyCount, color = AccentGreen, modifier = Modifier.weight(1f))
        if (callsCount > 0) {
            DashboardBadge(label = "Çağrı", value = callsCount, color = AccentRed, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun DashboardBadge(
    label: String,
    value: Int,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(text = label, color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value.toString(), color = color, fontSize = 18.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun TableGridCard(
    table: TableInfo,
    isOccupied: Boolean,
    itemCount: Int,
    hasCall: Boolean,
    hasBill: Boolean,
    onClick: () -> Unit
) {
    val showPulse = hasCall || hasBill
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.95f)
            .shadow(4.dp, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (showPulse) CardBg.copy(alpha = alpha) else CardBg
        ),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(
            width = if (showPulse) 2.dp else 1.dp,
            color = when {
                hasBill -> AccentOrange
                hasCall -> AccentRed
                isOccupied -> AccentBlue
                else -> CardBorder
            }
        )
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Masa İkonu ve No
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                isOccupied -> AccentBlue.copy(alpha = 0.15f)
                                else -> AccentGreen.copy(alpha = 0.15f)
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.TableRestaurant,
                        contentDescription = null,
                        tint = if (isOccupied) AccentBlue else AccentGreen,
                        modifier = Modifier.size(18.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = table.tableNumber,
                    color = TextPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black
                )

                Text(
                    text = table.tableName.ifBlank { "Masa" },
                    color = TextSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                // Adisyon Ürün Sayısı
                if (isOccupied) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(AccentBlue.copy(alpha = 0.2f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "${itemCount} Ürün",
                            color = AccentBlue,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else {
                    Text(
                        text = "Boş",
                        color = AccentGreen,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Çağrı/Talepler Badgeleri
            if (hasBill || hasCall) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(if (hasBill) AccentOrange else AccentRed),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (hasBill) "₺" else "🛎️",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }
    }
}

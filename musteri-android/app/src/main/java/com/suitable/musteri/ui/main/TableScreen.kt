package com.suitable.musteri.ui.main

import android.app.Activity
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.integration.android.IntentIntegrator
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo
import com.suitable.musteri.data.TableInfo
import com.suitable.musteri.data.TableRepository
import com.suitable.musteri.data.parseQrPayload
import kotlinx.coroutines.launch

// ─── Renkler & Stiller ────────────────────────────────────────────────────────

private val TableBg = Color(0xFF0B1120)
private val CardBg = Color(0xFF141E2E)
private val CardBorder = Color(0xFF1E2D42)
private val AccentOrange = Color(0xFFFF8C42)
private val AccentBlue = Color(0xFF3B82F6)
private val AccentGreen = Color(0xFF10B981)
private val AccentPurple = Color(0xFF8B5CF6)
private val TextPrimary = Color(0xFFF1F5F9)
private val TextSecondary = Color(0xFF94A3B8)

// ─── TableScreen ──────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    val scope = rememberCoroutineScope()
    val repo = remember { TableRepository() }

    // Kayıtlı masa bilgileri
    var tableId by remember { mutableStateOf(sharedPref.getString("tableId", null)) }
    var tableName by remember { mutableStateOf(sharedPref.getString("tableName", null)) }
    var tableNumber by remember { mutableStateOf(sharedPref.getString("tableNumber", null)) }
    var tableBranchId by remember { mutableStateOf(sharedPref.getString("tableBranchId", null)) }

    var isScanning by remember { mutableStateOf(false) }
    var isChangingTable by remember { mutableStateOf(false) }
    var scanError by remember { mutableStateOf<String?>(null) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    // Snackbar göster
    LaunchedEffect(snackbarMessage) {
        val msg = snackbarMessage ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        snackbarMessage = null
    }

    // ZXing QR scanner launcher
    val scanLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val scanResult = IntentIntegrator.parseActivityResult(result.resultCode, result.data)
            val contents = scanResult?.contents
            if (contents != null) {
                val payload = parseQrPayload(contents)
                if (payload != null) {
                    isScanning = true
                    scanError = null
                    scope.launch {
                        val info = repo.lookupTableByQrToken(payload.branchId, payload.tableToken)
                        if (info != null) {
                            val oldTableId = tableId
                            val currentBranchId = tableBranchId
                            val wasChangingTable = isChangingTable
                            val targetBranchId = payload.branchId ?: info.branchId

                            // Yeni taranan masa şu anki masamızdan farklıysa doluluk kontrolü yap
                            val isSameTable = info.id == oldTableId
                            if (!isSameTable && repo.isTableOccupied(targetBranchId, info.id)) {
                                isScanning = false
                                scanError = "Bu masa şu an dolu. Lütfen boş bir masa seçin."
                                return@launch
                            }

                            // Masa değiştiriliyorsa adisyonu transfer et
                            var transferSuccess = true
                            if (wasChangingTable && !oldTableId.isNullOrBlank() && !currentBranchId.isNullOrBlank()) {
                                transferSuccess = repo.transferTableTicket(targetBranchId, oldTableId, info.id)
                            }

                            isScanning = false

                            sharedPref.edit()
                                .putString("tableId", info.id)
                                .putString("tableName", info.tableName.ifBlank { "Masa ${info.tableNumber}" })
                                .putString("tableNumber", info.tableNumber)
                                .putString("tableBranchId", info.branchId)
                                .putBoolean("hasPlacedOrder", false)
                                .putLong("sessionStart", System.currentTimeMillis())
                                .apply()

                            tableId = info.id
                            tableName = info.tableName.ifBlank { "Masa ${info.tableNumber}" }
                            tableNumber = info.tableNumber
                            tableBranchId = info.branchId
                            isChangingTable = false

                            snackbarMessage = if (wasChangingTable && transferSuccess) {
                                "✓ Adisyon ${tableName} masasına taşındı"
                            } else {
                                "✓ ${tableName} seçildi"
                            }
                        } else {
                            isScanning = false
                            scanError = "Bu QR kodu tanımlanamadı. Lütfen masanın QR kodunu okutun."
                        }
                    }
                } else {
                    scanError = "Geçersiz QR kodu. Lütfen masa QR kodunu okutun."
                }
            } else {
                isChangingTable = false
            }
        } else {
            isChangingTable = false
        }
    }

    fun launchQrScanner() {
        val activity = context as? Activity ?: return
        val integrator = IntentIntegrator(activity)
        integrator.setBeepEnabled(true)
        integrator.setOrientationLocked(true) // Daima portre/dikey
        integrator.setPrompt("Masanızın QR kodunu kameraya gösterin")
        integrator.setCameraId(0)
        integrator.setBarcodeImageEnabled(false)
        scanLauncher.launch(integrator.createScanIntent())
    }

    AppScaffold(
        config = config,
        customerInfo = customerInfo,
        onNavigate = onNavigate,
        showMenu = true
    ) {
        Scaffold(
            containerColor = TableBg,
            snackbarHost = { SnackbarHost(snackbarHostState) }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color(0xFF0B1120), Color(0xFF071018))
                        )
                    )
            ) {
                if (tableId != null && tableName != null && !isChangingTable) {
                    // ── Masa Seçilmiş: 4 Büyük Buton ─────────────────────────────
                    TableActionPanel(
                        tableName = tableName ?: "",
                        tableNumber = tableNumber ?: "",
                        branchId = tableBranchId ?: "",
                        customerId = customerInfo?.id,
                        customerPhone = customerInfo?.telefon,
                        tableId = tableId ?: "",
                        repo = repo,
                        isScanning = isScanning,
                        onNavigate = onNavigate,
                        onChangeTable = {
                            isChangingTable = true
                        },
                        onLaunchQrScanner = { launchQrScanner() },
                        onSnackbar = { msg -> snackbarMessage = msg }
                    )
                } else if (isChangingTable) {
                    // ── Masa Değiştirme QR Tarama Paneli (Vazgeç butonlu) ────────
                    TableQrScanPanel(
                        isScanning = isScanning,
                        scanError = scanError,
                        onLaunchQrScanner = { launchQrScanner() },
                        onCancel = { isChangingTable = false }
                    )
                } else {
                    // ── QR Tarama Paneli ────────────────────────────────────────
                    TableQrScanPanel(
                        isScanning = isScanning,
                        scanError = scanError,
                        onLaunchQrScanner = { launchQrScanner() }
                    )
                }
            }
        }
    }
}

// ─── QR Tarama Paneli ────────────────────────────────────────────────────────

@Composable
private fun TableQrScanPanel(
    isScanning: Boolean,
    scanError: String?,
    onLaunchQrScanner: () -> Unit,
    onCancel: (() -> Unit)? = null
) {
    val infiniteTransition = rememberInfiniteTransition(label = "qr_pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "qr_scale"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // QR İkon animasyonu
        Box(
            modifier = Modifier
                .size((140 * scale).dp)
                .clip(RoundedCornerShape(32.dp))
                .background(Color(0xFF1E293B))
                .border(2.dp, AccentOrange.copy(alpha = 0.5f), RoundedCornerShape(32.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.QrCodeScanner,
                contentDescription = "QR Tara",
                tint = AccentOrange,
                modifier = Modifier.size(80.dp)
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        Text(
            text = "Masanızı Seçin",
            color = TextPrimary,
            fontSize = 28.sp,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Masanızın üzerindeki QR kodu\nokutarak sipariş verebilirsiniz",
            color = TextSecondary,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            lineHeight = 22.sp
        )

        Spacer(modifier = Modifier.height(40.dp))

        if (isScanning) {
            CircularProgressIndicator(color = AccentOrange, modifier = Modifier.size(48.dp))
        } else {
            Button(
                onClick = onLaunchQrScanner,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(60.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                shape = RoundedCornerShape(18.dp),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp)
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(24.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "QR Kodu Tara",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White
                )
            }

            if (onCancel != null) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onCancel,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(55.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary),
                    border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)
                ) {
                    Text(text = "Vazgeç", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        if (scanError != null) {
            Spacer(modifier = Modifier.height(20.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF3B1515)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFEF4444))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(text = scanError, color = Color(0xFFFCA5A5), fontSize = 14.sp)
                }
            }
        }
    }
}

// ─── Masa Aksiyon Paneli ─────────────────────────────────────────────────────

@Composable
private fun TableActionPanel(
    tableName: String,
    tableNumber: String,
    branchId: String,
    customerId: String?,
    customerPhone: String?,
    tableId: String,
    repo: TableRepository,
    isScanning: Boolean,
    onNavigate: (String) -> Unit,
    onChangeTable: () -> Unit,
    onLaunchQrScanner: () -> Unit,
    onSnackbar: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var isLoadingServiceRequest by remember { mutableStateOf(false) }
    var showLeaveConfirmDialog by remember { mutableStateOf(false) }
    var showCannotLeaveDialog by remember { mutableStateOf(false) }
    var isCheckingOrders by remember { mutableStateOf(false) }
    var isLeavingTable by remember { mutableStateOf(false) }

    fun sendServiceRequest(type: String, label: String) {
        if (isLoadingServiceRequest) return
        isLoadingServiceRequest = true
        scope.launch {
            val success = repo.createServiceRequest(
                tableId = tableId,
                branchId = branchId,
                requestType = type,
                customerId = customerId,
                phone = customerPhone
            )
            isLoadingServiceRequest = false
            onSnackbar(if (success) "✓ $label talebiniz iletildi" else "Hata oluştu, tekrar deneyin")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
    ) {
        // ── Masa Kartı ──────────────────────────────────────────────────────
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = CardBg),
            shape = RoundedCornerShape(20.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(AccentOrange.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.TableRestaurant, contentDescription = null, tint = AccentOrange, modifier = Modifier.size(28.dp))
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = tableName, color = TextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    Text(text = "Masa No: $tableNumber", color = TextSecondary, fontSize = 13.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // ── 2×2 Buton Grid ──────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            TableActionCard(
                icon = Icons.Default.Restaurant,
                label = "Sipariş Ver",
                subtitle = "Menüden seçim yap",
                gradient = Brush.linearGradient(listOf(Color(0xFF1D4ED8), Color(0xFF3B82F6))),
                iconTint = Color(0xFF93C5FD),
                modifier = Modifier.weight(1f),
                onClick = { onNavigate("table_order") }
            )
            TableActionCard(
                icon = Icons.Default.SupportAgent,
                label = "Garson Çağır",
                subtitle = "Yardım iste",
                gradient = Brush.linearGradient(listOf(Color(0xFF059669), Color(0xFF10B981))),
                iconTint = Color(0xFF6EE7B7),
                modifier = Modifier.weight(1f),
                enabled = !isLoadingServiceRequest,
                onClick = { sendServiceRequest("call_waiter", "Garson") }
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            TableActionCard(
                icon = Icons.Default.Receipt,
                label = "Hesap İste",
                subtitle = "Ödeme talebi gönder",
                gradient = Brush.linearGradient(listOf(Color(0xFF7C3AED), Color(0xFF8B5CF6))),
                iconTint = Color(0xFFC4B5FD),
                modifier = Modifier.weight(1f),
                enabled = !isLoadingServiceRequest,
                onClick = { sendServiceRequest("bill_request", "Hesap") }
            )
            TableActionCard(
                icon = Icons.Default.ListAlt,
                label = "Siparişlerim",
                subtitle = "Güncel siparişleri gör",
                gradient = Brush.linearGradient(listOf(Color(0xFFB45309), Color(0xFFF59E0B))),
                iconTint = Color(0xFFFDE68A),
                modifier = Modifier.weight(1f),
                onClick = { onNavigate("table_orders") }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Masayı Değiştir & Masayı Bırak Yan Yana ───────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = {
                    onChangeTable()
                    onLaunchQrScanner()
                },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary),
                border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
                contentPadding = PaddingValues(horizontal = 4.dp)
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(16.dp))
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
                    if (isCheckingOrders || isLeavingTable) return@Button
                    isCheckingOrders = true
                    scope.launch {
                        try {
                            val orders = repo.fetchTodayTableOrders(branchId, tableNumber)
                            if (orders.isNotEmpty()) {
                                showCannotLeaveDialog = true
                            } else {
                                showLeaveConfirmDialog = true
                            }
                        } catch (e: Exception) {
                            onSnackbar("Sipariş kontrolü başarısız oldu")
                        } finally {
                            isCheckingOrders = false
                        }
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                contentPadding = PaddingValues(horizontal = 4.dp)
            ) {
                if (isCheckingOrders || isLeavingTable) {
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

        // Dialoglar
        if (showCannotLeaveDialog) {
            AlertDialog(
                onDismissRequest = { showCannotLeaveDialog = false },
                title = { Text("Masayı Bırakamazsınız", fontWeight = FontWeight.Bold) },
                text = { Text("Aktif siparişiniz bulunduğu için masayı bırakamazsınız. Masayı kapatmak veya hesabı ödemek için lütfen garsona bildirin.") },
                confirmButton = {
                    Button(
                        onClick = { showCannotLeaveDialog = false },
                        colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                    ) {
                        Text("Tamam", color = Color.White)
                    }
                },
                containerColor = CardBg,
                titleContentColor = TextPrimary,
                textContentColor = TextSecondary
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
                                val success = repo.leaveTable(branchId, tableId)
                                if (success) {
                                    val prefs = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
                                    prefs.edit()
                                        .remove("tableId")
                                        .remove("tableName")
                                        .remove("tableNumber")
                                        .remove("tableBranchId")
                                        .remove("hasPlacedOrder")
                                        .remove("sessionStart")
                                        .apply()
                                    
                                    onNavigate("home")
                                } else {
                                    onSnackbar("Masa bırakılamadı")
                                }
                                isLeavingTable = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                    ) {
                        Text("Evet, Bırak", color = Color.White)
                    }
                },
                dismissButton = {
                    OutlinedButton(
                        onClick = { showLeaveConfirmDialog = false },
                        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary)
                    ) {
                        Text("Vazgeç")
                    }
                },
                containerColor = CardBg,
                titleContentColor = TextPrimary,
                textContentColor = TextSecondary
            )
        }
    }
}

// ─── Aksiyon Kartı ────────────────────────────────────────────────────────────

@Composable
private fun TableActionCard(
    icon: ImageVector,
    label: String,
    subtitle: String,
    gradient: Brush,
    iconTint: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.96f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "card_scale"
    )

    Box(
        modifier = modifier
            .fillMaxHeight()
            .shadow(
                elevation = if (enabled) 12.dp else 0.dp,
                shape = RoundedCornerShape(22.dp)
            )
            .clip(RoundedCornerShape(22.dp))
            .background(if (enabled) gradient else Brush.linearGradient(listOf(Color(0xFF1E293B), Color(0xFF1E293B))))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick
            )
            .graphicsLayer { scaleX = scale; scaleY = scale },
        contentAlignment = Alignment.Center
    ) {
        // Glassmorphism overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.White.copy(alpha = 0.08f), Color.Transparent)
                    )
                )
        )
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (enabled) iconTint else TextSecondary,
                    modifier = Modifier.size(30.dp)
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = label,
                color = if (enabled) Color.White else TextSecondary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 16.sp,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                lineHeight = 15.sp
            )
        }
    }
}

package com.suitable.wms.ui.main

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.CompoundBarcodeView
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.graphicsLayer as uiGraphicsLayer // just in case
import com.suitable.wms.data.ApiClient
import com.suitable.wms.data.WarehouseTask
import com.suitable.wms.data.WmsRepository
import com.suitable.wms.data.StockLookupResult
import kotlinx.coroutines.launch
import androidx.lifecycle.viewmodel.compose.viewModel
import com.suitable.wms.ui.scan.WmsScanViewModel
import com.suitable.wms.ui.scan.WmsScanUiState
import com.suitable.wms.ui.scan.WmsScanResult
import java.io.File
import android.net.Uri
import androidx.core.content.FileProvider
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import com.suitable.wms.ui.scan.WmsScanPackageUnit
import com.suitable.wms.data.ShipmentCapacityData
import com.suitable.wms.data.ShipmentCapacityResponse


@Composable
fun WmsMobileScreen(
    staffSession: StaffSession,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { WmsRepository() }
    val scanViewModel: WmsScanViewModel = viewModel()
    val scanState by scanViewModel.uiState.collectAsState()

    var activeTab by remember { mutableStateOf("tasks") }
    var taskList by remember { mutableStateOf<List<WarehouseTask>>(emptyList()) }
    var activeTask by remember { mutableStateOf<WarehouseTask?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    // Task Type filters for Tasks Tab
    var selectedFilterType by remember { mutableStateOf("all") }

    // Quantity variables for Active Task Tab
    var inputQuantity by remember { mutableStateOf("0") }
    var putawayTargetLocation by remember { mutableStateOf("") }

    // Putaway verification states
    var scannedLocationCode by remember { mutableStateOf("") }
    var isLocationVerified by remember { mutableStateOf(false) }
    var verificationMessage by remember { mutableStateOf<String?>(null) }
    var verifiedLocationId by remember { mutableStateOf<String?>(null) }

    // Picking verification states
    var scannedProductCode by remember { mutableStateOf("") }
    var isProductVerified by remember { mutableStateOf(false) }
    var productVerificationMessage by remember { mutableStateOf<String?>(null) }

    // Inventory lookup states
    var lookupBarcode by remember { mutableStateOf("") }
    var lookupResult by remember { mutableStateOf<StockLookupResult?>(null) }
    var isLookupLoading by remember { mutableStateOf(false) }
    var scanFeedback by remember { mutableStateOf<Pair<String, Boolean>?>(null) } // Pair(Message, isSuccess)

    // Photo evidence states
    var evidencePhotoUrl by remember { mutableStateOf<String?>(null) }
    var isUploadingPhoto by remember { mutableStateOf(false) }
    var tempPhotoFile by remember { mutableStateOf<File?>(null) }

    // WMS-03G Package & Capacity States
    var scannedPackageUnit by remember { mutableStateOf<WmsScanPackageUnit?>(null) }
    var shipmentCapacityData by remember { mutableStateOf<ShipmentCapacityData?>(null) }
    var shipmentCapacityError by remember { mutableStateOf<String?>(null) }

    val fetchCapacity = { shipmentId: String ->
        scope.launch {
            try {
                val response = ApiClient.apiService.getShipmentCapacity(shipmentId)
                if (response.error != null) {
                    shipmentCapacityError = response.error["message"]?.toString() ?: "Kapasite sorgulama hatası."
                    shipmentCapacityData = null
                } else {
                    shipmentCapacityData = response.data
                    shipmentCapacityError = null
                }
            } catch (e: Exception) {
                shipmentCapacityError = e.message ?: "Ağ bağlantı hatası."
                shipmentCapacityData = null
            }
        }
    }

    // Camera permission state
    var hasCameraPermission by remember {
        mutableStateOf(
            androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.CAMERA
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    // Photo upload and launchers
    val uploadPhoto = { file: File ->
        isUploadingPhoto = true
        scope.launch {
            try {
                val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("file", file.name, requestFile)
                val response = ApiClient.apiService.uploadFile(body)
                if (response.error != null) {
                    throw Exception(response.error["message"]?.toString() ?: "Yükleme hatası")
                }
                val url = response.data?.file_url
                if (url != null) {
                    evidencePhotoUrl = url
                    Toast.makeText(context, "Fotoğraf başarıyla yüklendi", Toast.LENGTH_SHORT).show()
                } else {
                    throw Exception("Sunucudan dosya yolu alınamadı")
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Fotoğraf yüklenemedi: ${e.message}", Toast.LENGTH_LONG).show()
                evidencePhotoUrl = null
            } finally {
                isUploadingPhoto = false
            }
        }
    }

    val copyUriToCacheFile = { uri: Uri ->
        try {
            val inputStream = context.contentResolver.openInputStream(uri)
            if (inputStream != null) {
                val file = File(context.cacheDir, "evidence_gallery_${System.currentTimeMillis()}.jpg")
                file.outputStream().use { out ->
                    inputStream.copyTo(out)
                }
                uploadPhoto(file)
            } else {
                Toast.makeText(context, "Dosya okunamadı", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(context, "Dosya kopyalama hatası: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            val file = tempPhotoFile
            if (file != null && file.exists() && file.length() > 0) {
                uploadPhoto(file)
            } else {
                Toast.makeText(context, "Fotoğraf çekilemedi veya dosya boş", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            copyUriToCacheFile(uri)
        }
    }

    val onTakePhotoClick = {
        if (hasCameraPermission) {
            val file = File(context.cacheDir, "evidence_camera_${System.currentTimeMillis()}.jpg")
            tempPhotoFile = file
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )
            cameraLauncher.launch(uri)
        } else {
            permissionLauncher.launch(android.Manifest.permission.CAMERA)
        }
    }

    val onSelectPhotoClick = {
        galleryLauncher.launch(
            androidx.activity.result.PickVisualMediaRequest(
                ActivityResultContracts.PickVisualMedia.ImageOnly
            )
        )
    }

    // Load tasks on init or refresh
    val loadTasks = {
        isLoading = true
        scope.launch {
            try {
                taskList = repository.fetchWarehouseTasks(staffSession.activeBranchId)
            } catch (e: Exception) {
                Toast.makeText(context, "Görevler çekilemedi: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(staffSession.activeBranchId) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(android.Manifest.permission.CAMERA)
        }
        loadTasks()
    }

    LaunchedEffect(scanState) {
        when (scanState) {
            is WmsScanUiState.Success -> {
                val result = (scanState as WmsScanUiState.Success).result
                val isSuccess = result.is_expected && result.matched
                scanFeedback = Pair(result.message, isSuccess)

                if (activeTab == "lookup") {
                    if (isSuccess) {
                        scope.launch {
                            try {
                                val res = repository.queryStock(result.barcode, staffSession.activeBranchId)
                                lookupResult = res
                            } catch (e: Exception) {
                                scanFeedback = Pair("Stok sorgulama hatası: ${e.message}", false)
                                lookupResult = null
                            } finally {
                                isLookupLoading = false
                            }
                        }
                    } else {
                        isLookupLoading = false
                    }
                } else {
                    val currentTask = activeTask
                    if (currentTask != null) {
                        if (currentTask.taskType == "putaway") {
                            if (result.scan_type == "location") {
                                scannedLocationCode = result.barcode
                                isLocationVerified = isSuccess
                                verificationMessage = result.message
                                verifiedLocationId = result.location?.id
                            } else {
                                scanFeedback = Pair("Lütfen hedef lokasyon barkodunu taratın (Taranan: ${result.scan_type})", false)
                            }
                        } else if (currentTask.taskType == "pick") {
                            if (!isLocationVerified) {
                                if (result.scan_type == "location") {
                                    scannedLocationCode = result.barcode
                                    isLocationVerified = isSuccess
                                    verificationMessage = result.message
                                } else {
                                    scanFeedback = Pair("Lütfen önce kaynak lokasyon barkodunu taratın (Taranan: ${result.scan_type})", false)
                                }
                            } else {
                                if (result.scan_type == "product" || result.scan_type == "lpn") {
                                    scannedProductCode = result.barcode
                                    isProductVerified = isSuccess
                                    productVerificationMessage = result.message
                                    if (isSuccess && result.scan_type == "product") {
                                        scannedPackageUnit = result.package_unit
                                        inputQuantity = currentTask.quantity.toString()
                                    }
                                } else if (result.scan_type == "location") {
                                    scannedLocationCode = result.barcode
                                    isLocationVerified = isSuccess
                                    verificationMessage = result.message
                                    scannedProductCode = ""
                                    isProductVerified = false
                                    productVerificationMessage = null
                                    scannedPackageUnit = null
                                } else {
                                    scanFeedback = Pair("Lütfen geçerli bir ürün veya LPN barkodu taratın", false)
                                }
                            }
                        } else if (currentTask.taskType == "pack" || currentTask.taskType == "load") {
                            if (result.scan_type == "product") {
                                scannedProductCode = result.barcode
                                isProductVerified = isSuccess
                                productVerificationMessage = result.message
                                scannedPackageUnit = result.package_unit
                                if (isSuccess) {
                                    inputQuantity = currentTask.quantity.toString()
                                    if (!currentTask.sourceDocId.isNullOrBlank()) {
                                        fetchCapacity(currentTask.sourceDocId)
                                    }
                                }
                            } else {
                                scanFeedback = Pair("Lütfen geçerli bir ürün veya paket barkodu taratın (Taranan: ${result.scan_type})", false)
                            }
                        } else {
                            if (isSuccess) {
                                if (result.scan_type == "product" && result.product != null) {
                                    val currentVal = inputQuantity.toIntOrNull() ?: 0
                                    if (currentVal < currentTask.quantity) {
                                        inputQuantity = (currentVal + 1).toString()
                                    }
                                    scannedPackageUnit = result.package_unit
                                } else if (result.scan_type == "location" && result.location != null) {
                                    val loc = result.location
                                    putawayTargetLocation = "LOC-${loc.zone_code}-${loc.aisle ?: 0}-${loc.rack ?: 0}-${loc.level ?: 0}"
                                }
                            }
                        }
                    } else {
                        // Try to auto-select matching task from taskList based on product scan
                        if (isSuccess && result.scan_type == "product" && result.product != null) {
                            val matchedTask = taskList.firstOrNull {
                                it.barcode == result.barcode ||
                                it.productCode == result.barcode ||
                                it.productCode == result.product.sku
                            }
                            if (matchedTask != null) {
                                activeTask = matchedTask
                                inputQuantity = matchedTask.scannedQuantity.toString()
                                putawayTargetLocation = matchedTask.targetLocation ?: ""
                                scannedLocationCode = ""
                                isLocationVerified = false
                                verificationMessage = null
                                verifiedLocationId = null
                                scannedProductCode = ""
                                isProductVerified = false
                                productVerificationMessage = null
                                scannedPackageUnit = result.package_unit
                                shipmentCapacityData = null
                                shipmentCapacityError = null
                                if ((matchedTask.taskType == "pack" || matchedTask.taskType == "load") && !matchedTask.sourceDocId.isNullOrBlank()) {
                                    fetchCapacity(matchedTask.sourceDocId)
                                }
                                activeTab = "active_item"
                            }
                        }
                    }
                }
                scanViewModel.clearState()
            }
            is WmsScanUiState.Error -> {
                val errorMsg = (scanState as WmsScanUiState.Error).message
                scanFeedback = Pair(errorMsg, false)
                isLookupLoading = false
                
                val currentTask = activeTask
                if (currentTask != null) {
                    if (currentTask.taskType == "putaway") {
                        scannedLocationCode = "Hata"
                        isLocationVerified = false
                        verificationMessage = errorMsg
                        verifiedLocationId = null
                    } else if (currentTask.taskType == "pick") {
                        if (!isLocationVerified) {
                            scannedLocationCode = "Hata"
                            isLocationVerified = false
                            verificationMessage = errorMsg
                        } else {
                            scannedProductCode = "Hata"
                            isProductVerified = false
                            productVerificationMessage = errorMsg
                        }
                    }
                }
                
                scanViewModel.clearState()
            }
            else -> {}
        }
    }

    // Handles scanned barcodes from camera or emulator mock
    val handleBarcodeScan = { barcode: String ->
        scanFeedback = null
        if (activeTab == "lookup") {
            isLookupLoading = true
            lookupBarcode = barcode
        }
        scanViewModel.scanBarcode(
            barcode = barcode,
            branchId = staffSession.activeBranchId,
            taskId = activeTask?.id,
            personnelId = staffSession.id,
            terminalId = "TERMINAL-01"
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
    ) {
        // ─── TOP SECTION: CAMERA SCANNER (%22 height) ───
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(0.22f)
                .background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            if (hasCameraPermission) {
                val barcodeView = remember {
                    CompoundBarcodeView(context).apply {
                        setStatusText("")
                    }
                }

                AndroidView(
                    factory = { barcodeView },
                    modifier = Modifier.fillMaxSize()
                )

                DisposableEffect(barcodeView) {
                    barcodeView.resume()
                    barcodeView.decodeContinuous(object : BarcodeCallback {
                        override fun barcodeResult(result: BarcodeResult?) {
                            result?.text?.let { code ->
                                // Debounce or handle scan
                                barcodeView.pause()
                                handleBarcodeScan(code)
                                scope.launch {
                                    kotlinx.coroutines.delay(1200)
                                    barcodeView.resume()
                                }
                            }
                        }
                        override fun possibleResultPoints(resultPoints: MutableList<com.google.zxing.ResultPoint>?) {}
                    })
                    onDispose {
                        barcodeView.pause()
                    }
                }

                // Pulser laser overlay animation
                val infiniteTransition = rememberInfiniteTransition(label = "laserTransition")
                val laserY by infiniteTransition.animateFloat(
                    initialValue = 0.1f,
                    targetValue = 0.9f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(1500, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "laserY"
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(0.005f)
                        .align(Alignment.TopCenter)
                        .graphicsLayer(translationY = laserY * 110.dp.value) // Adjusted from 180 to fit narrower viewport
                        .background(Color.Red)
                )

                // Aim target overlay
                Box(
                    modifier = Modifier
                        .size(140.dp, 80.dp)
                        .border(1.dp, Color(0xFFa855f7).copy(alpha = 0.7f), RoundedCornerShape(8.dp))
                        .align(Alignment.Center)
                )
            } else {
                // Simulator fallback / No Camera access interface
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "CANLI TARAMA AKTİF (SİMÜLATÖR)",
                        color = Color(0xFFa855f7),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { handleBarcodeScan("HE-01") },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Ürün (HE-01)", fontSize = 11.sp, color = Color.White)
                        }
                        Button(
                            onClick = { handleBarcodeScan("LOC-A-01") },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Konum (LOC-A)", fontSize = 11.sp, color = Color.White)
                        }
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    var testInput by remember { mutableStateOf("") }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = testInput,
                            onValueChange = { testInput = it },
                            placeholder = { Text("Barkodu el ile yazın", color = Color.Gray, fontSize = 11.sp) },
                            textStyle = LocalTextStyle.current.copy(color = Color.White, fontSize = 12.sp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFFa855f7),
                                unfocusedBorderColor = Color.DarkGray
                            ),
                            modifier = Modifier.width(150.dp).height(42.dp),
                            singleLine = true
                        )
                        IconButton(
                            onClick = {
                                if (testInput.isNotBlank()) {
                                    handleBarcodeScan(testInput)
                                    testInput = ""
                                }
                            },
                            modifier = Modifier.background(Color(0xFFa855f7), RoundedCornerShape(8.dp)).size(36.dp)
                        ) {
                            Icon(Icons.Default.Send, contentDescription = "Gönder", tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }

        // Display inline scan feedback
        val feedback = scanFeedback
        if (feedback != null) {
            val (msg, isSuccess) = feedback
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (isSuccess) Color(0xFF065F46) else Color(0xFF991B1B))
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isSuccess) Icons.Default.CheckCircle else Icons.Default.Warning,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = msg,
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Kapat",
                        tint = Color.White.copy(alpha = 0.8f),
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { scanFeedback = null }
                    )
                }
            }
        }

        // ─── BOTTOM SECTION: INTERACTIVE TABS & CONTENT (%78 height) ───
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(0.78f)
        ) {
            // Header bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = staffSession.activeBranchName,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "Sorumlu: ${staffSession.getDisplayName()}",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp
                    )
                }
                IconButton(onClick = onLogout) {
                    Icon(Icons.Default.Logout, contentDescription = "Çıkış Yap", tint = Color(0xFFEF4444))
                }
            }

            // Tabs navigation
            TabRow(
                selectedTabIndex = when (activeTab) {
                    "tasks" -> 0
                    "active_item" -> 1
                    else -> 2
                },
                containerColor = Color(0xFF0F172A),
                contentColor = Color(0xFFa855f7),
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        Modifier.tabIndicatorOffset(
                            tabPositions[when (activeTab) {
                                "tasks" -> 0
                                "active_item" -> 1
                                else -> 2
                            }]
                        ),
                        color = Color(0xFFa855f7)
                    )
                }
            ) {
                Tab(
                    selected = activeTab == "tasks",
                    onClick = { activeTab = "tasks" },
                    text = { Text("Görevler", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                    selectedContentColor = Color(0xFFa855f7),
                    unselectedContentColor = Color(0xFF94A3B8)
                )
                Tab(
                    selected = activeTab == "active_item",
                    onClick = { activeTab = "active_item" },
                    text = { Text("Aktif İşlem", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                    selectedContentColor = Color(0xFFa855f7),
                    unselectedContentColor = Color(0xFF94A3B8)
                )
                Tab(
                    selected = activeTab == "lookup",
                    onClick = { activeTab = "lookup" },
                    text = { Text("Stok Sorgu", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                    selectedContentColor = Color(0xFFa855f7),
                    unselectedContentColor = Color(0xFF94A3B8)
                )
            }

            // Content Screens
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                when (activeTab) {
                    "tasks" -> {
                        // ─── WmsTaskListScreen ───
                        Column {
                            // Refresh & Filters Row
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Aktif Depo Görevleri (${taskList.size})",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                IconButton(
                                    onClick = { loadTasks() },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color(0xFFa855f7))
                                }
                            }

                            // Type Filter segments
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                val filters = listOf(
                                    "all" to "Hepsi",
                                    "putaway" to "Yerleştir",
                                    "pick" to "Topla",
                                    "pack" to "Paketle",
                                    "load" to "Yükle"
                                )
                                filters.forEach { (key, label) ->
                                    val isSelected = selectedFilterType == key
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSelected) Color(0xFFa855f7) else Color(0xFF1E293B))
                                            .clickable { selectedFilterType = key }
                                            .padding(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }

                            if (isLoading) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = Color(0xFFa855f7))
                                }
                            } else if (taskList.isEmpty()) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text("Aktif depo görevi bulunmamaktadır.", color = Color(0xFF64748b), fontSize = 13.sp)
                                }
                            } else {
                                val filteredTasks = taskList.filter {
                                    selectedFilterType == "all" || it.taskType == selectedFilterType
                                }
                                LazyColumn(
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    items(filteredTasks) { task ->
                                        Card(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable {
                                                    activeTask = task
                                                    inputQuantity = task.scannedQuantity.toString()
                                                    putawayTargetLocation = task.targetLocation ?: ""
                                                    scannedLocationCode = ""
                                                    isLocationVerified = false
                                                    verificationMessage = null
                                                    verifiedLocationId = null
                                                    scannedProductCode = ""
                                                    isProductVerified = false
                                                    productVerificationMessage = null
                                                    scannedPackageUnit = null
                                                    shipmentCapacityData = null
                                                    shipmentCapacityError = null
                                                    if ((task.taskType == "pack" || task.taskType == "load") && !task.sourceDocId.isNullOrBlank()) {
                                                        fetchCapacity(task.sourceDocId)
                                                    }
                                                    activeTab = "active_item"
                                                },
                                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                                            border = BorderStroke(1.dp, Color(0xFF334155))
                                        ) {
                                            Column(modifier = Modifier.padding(14.dp)) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .clip(RoundedCornerShape(4.dp))
                                                            .background(
                                                                when(task.taskType) {
                                                                    "putaway" -> Color(0xFF10B981).copy(alpha = 0.2f)
                                                                    "pick" -> Color(0xFF3B82F6).copy(alpha = 0.2f)
                                                                    "pack" -> Color(0xFF8B5CF6).copy(alpha = 0.2f)
                                                                    "load" -> Color(0xFFF59E0B).copy(alpha = 0.2f)
                                                                    else -> Color.White.copy(alpha = 0.2f)
                                                                }
                                                            )
                                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                                    ) {
                                                        Text(
                                                            text = when(task.taskType) {
                                                                "putaway" -> "YERLEŞTİRME"
                                                                "pick" -> "TOPLAMA"
                                                                "pack" -> "PAKETLEME"
                                                                "load" -> "YÜKLEME"
                                                                else -> task.taskType.uppercase()
                                                            },
                                                            color = when(task.taskType) {
                                                                "putaway" -> Color(0xFF10B981)
                                                                "pick" -> Color(0xFF3B82F6)
                                                                "pack" -> Color(0xFF8B5CF6)
                                                                "load" -> Color(0xFFF59E0B)
                                                                else -> Color.White
                                                            },
                                                            fontSize = 9.sp,
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                    }
                                                    Text(
                                                        text = "${task.scannedQuantity} / ${task.quantity} ${task.productCode ?: ""}",
                                                        color = Color.White,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 12.sp
                                                    )
                                                }
                                                Spacer(modifier = Modifier.height(8.dp))
                                                Text(
                                                    text = task.productName ?: "İsimsiz Ürün",
                                                    color = Color.White,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 14.sp
                                                )
                                                Spacer(modifier = Modifier.height(6.dp))
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween
                                                ) {
                                                    Text(
                                                        text = "Kaynak: ${task.sourceLocation ?: "—"}",
                                                        color = Color(0xFF94A3B8),
                                                        fontSize = 11.sp
                                                    )
                                                    Text(
                                                        text = "Hedef: ${task.targetLocation ?: "—"}",
                                                        color = Color(0xFF94A3B8),
                                                        fontSize = 11.sp
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    "active_item" -> {
                        // ─── WmsActiveTaskScreen (WmsPutawayScreen/WmsPickingScreen) ───
                        val task = activeTask
                        if (task == null) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text("Lütfen işlemler listesinden bir görev seçin veya barkod tarayın.", color = Color(0xFF64748b), fontSize = 13.sp, textAlign = TextAlign.Center)
                            }
                        } else {
                        if (task.taskType == "putaway") {
                            WmsPutawayScreen(
                                task = task,
                                scannedLocationCode = scannedLocationCode,
                                isLocationVerified = isLocationVerified,
                                verificationMessage = verificationMessage,
                                packageUnit = scannedPackageUnit,
                                inputQuantity = inputQuantity,
                                onQuantityChange = { inputQuantity = it },
                                isLoading = isLoading,
                                evidencePhotoUrl = evidencePhotoUrl,
                                isUploadingPhoto = isUploadingPhoto,
                                onTakePhoto = onTakePhotoClick,
                                onSelectPhoto = onSelectPhotoClick,
                                onRemovePhoto = { evidencePhotoUrl = null },
                                onCompleteTask = {
                                    val qty = inputQuantity.toIntOrNull() ?: 0
                                    if (qty <= 0) {
                                        Toast.makeText(context, "Miktar en az 1 olmalıdır", Toast.LENGTH_SHORT).show()
                                        return@WmsPutawayScreen
                                    }
                                    val locId = verifiedLocationId
                                    if (locId == null) {
                                        Toast.makeText(context, "Lütfen geçerli bir hedef lokasyon barkodu okutun", Toast.LENGTH_SHORT).show()
                                        return@WmsPutawayScreen
                                    }
                                    isLoading = true
                                    scope.launch {
                                        try {
                                            val success = repository.completePutawayTask(
                                                taskId = task.id,
                                                personnelId = staffSession.id,
                                                targetLocationId = locId,
                                                evidencePhotoUrl = evidencePhotoUrl
                                            )
                                            if (success) {
                                                Toast.makeText(context, "Görev başarıyla tamamlandı", Toast.LENGTH_LONG).show()
                                                activeTask = null
                                                scannedLocationCode = ""
                                                isLocationVerified = false
                                                verificationMessage = null
                                                verifiedLocationId = null
                                                scannedProductCode = ""
                                                isProductVerified = false
                                                productVerificationMessage = null
                                                scannedPackageUnit = null
                                                shipmentCapacityData = null
                                                shipmentCapacityError = null
                                                evidencePhotoUrl = null
                                                isUploadingPhoto = false
                                                tempPhotoFile = null
                                                loadTasks()
                                                activeTab = "tasks"
                                            }
                                        } catch (e: Exception) {
                                            Toast.makeText(context, "Hata: ${e.message}", Toast.LENGTH_LONG).show()
                                        } finally {
                                            isLoading = false
                                        }
                                    }
                                },
                                onCancelTask = {
                                    activeTask = null
                                    scannedLocationCode = ""
                                    isLocationVerified = false
                                    verificationMessage = null
                                    verifiedLocationId = null
                                    scannedProductCode = ""
                                    isProductVerified = false
                                    productVerificationMessage = null
                                    scannedPackageUnit = null
                                    shipmentCapacityData = null
                                    shipmentCapacityError = null
                                    evidencePhotoUrl = null
                                    isUploadingPhoto = false
                                    tempPhotoFile = null
                                    activeTab = "tasks"
                                }
                            )
                        } else if (task.taskType == "pick") {
                            WmsPickingScreen(
                                task = task,
                                scannedLocationCode = scannedLocationCode,
                                isLocationVerified = isLocationVerified,
                                locationVerificationMessage = verificationMessage,
                                scannedProductCode = scannedProductCode,
                                isProductVerified = isProductVerified,
                                productVerificationMessage = productVerificationMessage,
                                packageUnit = scannedPackageUnit,
                                inputQuantity = inputQuantity,
                                onQuantityChange = { inputQuantity = it },
                                isLoading = isLoading,
                                evidencePhotoUrl = evidencePhotoUrl,
                                isUploadingPhoto = isUploadingPhoto,
                                onTakePhoto = onTakePhotoClick,
                                onSelectPhoto = onSelectPhotoClick,
                                onRemovePhoto = { evidencePhotoUrl = null },
                                onCompleteTask = {
                                    val qty = inputQuantity.toIntOrNull() ?: 0
                                    if (qty <= 0) {
                                        Toast.makeText(context, "Miktar en az 1 olmalıdır", Toast.LENGTH_SHORT).show()
                                        return@WmsPickingScreen
                                    }
                                    isLoading = true
                                    scope.launch {
                                        try {
                                            val success = repository.completeShipmentTask(
                                                taskId = task.id,
                                                personnelId = staffSession.id,
                                                pickedQty = qty,
                                                evidencePhotoUrl = evidencePhotoUrl,
                                                packageUnitId = scannedPackageUnit?.package_unit_id,
                                                packageQty = scannedPackageUnit?.let { qty.toDouble() / it.conversion_factor }
                                            )
                                            if (success) {
                                                Toast.makeText(context, "Görev başarıyla tamamlandı", Toast.LENGTH_LONG).show()
                                                activeTask = null
                                                scannedLocationCode = ""
                                                isLocationVerified = false
                                                verificationMessage = null
                                                verifiedLocationId = null
                                                scannedProductCode = ""
                                                isProductVerified = false
                                                productVerificationMessage = null
                                                scannedPackageUnit = null
                                                shipmentCapacityData = null
                                                shipmentCapacityError = null
                                                evidencePhotoUrl = null
                                                isUploadingPhoto = false
                                                tempPhotoFile = null
                                                loadTasks()
                                                activeTab = "tasks"
                                            }
                                        } catch (e: Exception) {
                                            Toast.makeText(context, "Hata: ${e.message}", Toast.LENGTH_LONG).show()
                                        } finally {
                                            isLoading = false
                                        }
                                    }
                                },
                                onCancelTask = {
                                    activeTask = null
                                    scannedLocationCode = ""
                                    isLocationVerified = false
                                    verificationMessage = null
                                    verifiedLocationId = null
                                    scannedProductCode = ""
                                    isProductVerified = false
                                    productVerificationMessage = null
                                    scannedPackageUnit = null
                                    shipmentCapacityData = null
                                    shipmentCapacityError = null
                                    evidencePhotoUrl = null
                                    isUploadingPhoto = false
                                    tempPhotoFile = null
                                    activeTab = "tasks"
                                }
                            )
                        } else if (task.taskType == "pack" || task.taskType == "load") {
                            WmsPackLoadScreen(
                                task = task,
                                scannedProductCode = scannedProductCode,
                                isProductVerified = isProductVerified,
                                productVerificationMessage = productVerificationMessage,
                                packageUnit = scannedPackageUnit,
                                capacityData = shipmentCapacityData,
                                capacityError = shipmentCapacityError,
                                inputQuantity = inputQuantity,
                                onQuantityChange = { inputQuantity = it },
                                isLoading = isLoading,
                                evidencePhotoUrl = evidencePhotoUrl,
                                isUploadingPhoto = isUploadingPhoto,
                                onTakePhoto = onTakePhotoClick,
                                onSelectPhoto = onSelectPhotoClick,
                                onRemovePhoto = { evidencePhotoUrl = null },
                                onCompleteTask = {
                                    val qty = inputQuantity.toIntOrNull() ?: 0
                                    if (qty <= 0) {
                                        Toast.makeText(context, "Miktar en az 1 olmalıdır", Toast.LENGTH_SHORT).show()
                                        return@WmsPackLoadScreen
                                    }
                                    isLoading = true
                                    scope.launch {
                                        try {
                                            val success = repository.completeShipmentTask(
                                                taskId = task.id,
                                                personnelId = staffSession.id,
                                                pickedQty = qty,
                                                evidencePhotoUrl = evidencePhotoUrl,
                                                packageUnitId = scannedPackageUnit?.package_unit_id,
                                                packageQty = scannedPackageUnit?.let { qty.toDouble() / it.conversion_factor }
                                            )
                                            if (success) {
                                                Toast.makeText(context, "Görev başarıyla tamamlandı", Toast.LENGTH_LONG).show()
                                                activeTask = null
                                                scannedLocationCode = ""
                                                isLocationVerified = false
                                                verificationMessage = null
                                                verifiedLocationId = null
                                                scannedProductCode = ""
                                                isProductVerified = false
                                                productVerificationMessage = null
                                                scannedPackageUnit = null
                                                shipmentCapacityData = null
                                                shipmentCapacityError = null
                                                evidencePhotoUrl = null
                                                isUploadingPhoto = false
                                                tempPhotoFile = null
                                                loadTasks()
                                                activeTab = "tasks"
                                            }
                                        } catch (e: Exception) {
                                            Toast.makeText(context, "Hata: ${e.message}", Toast.LENGTH_LONG).show()
                                        } finally {
                                            isLoading = false
                                        }
                                    }
                                },
                                onCancelTask = {
                                    activeTask = null
                                    scannedLocationCode = ""
                                    isLocationVerified = false
                                    verificationMessage = null
                                    verifiedLocationId = null
                                    scannedProductCode = ""
                                    isProductVerified = false
                                    productVerificationMessage = null
                                    scannedPackageUnit = null
                                    shipmentCapacityData = null
                                    shipmentCapacityError = null
                                    evidencePhotoUrl = null
                                    isUploadingPhoto = false
                                    tempPhotoFile = null
                                    activeTab = "tasks"
                                }
                            )
                        } else {
                            Column(
                                modifier = Modifier.fillMaxSize()
                                    .padding(16.dp)
                            ) {
                                Text(
                                    text = "DİĞER GÖREV: ${task.taskType.uppercase()}",
                                    color = Color(0xFFa855f7),
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 15.sp
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = task.productName ?: "Bilinmeyen Ürün",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 17.sp
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "SKU: ${task.productCode}",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                                
                                Spacer(modifier = Modifier.height(16.dp))

                                if (scannedPackageUnit != null) {
                                    WmsPackageInfoCard(packageUnit = scannedPackageUnit)
                                } else {
                                    Text(
                                        text = "Paket veya Ürün barkodu okutarak paket detaylarını görebilirsiniz.",
                                        color = Color(0xFF64748B),
                                        fontSize = 12.sp
                                    )
                                }

                                Spacer(modifier = Modifier.height(24.dp))
                                Button(
                                    onClick = {
                                        activeTask = null
                                        scannedPackageUnit = null
                                        activeTab = "tasks"
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFa855f7)),
                                    modifier = Modifier.fillMaxWidth().height(48.dp),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text("GERİ DÖN", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                        }
                    }

                    else -> {
                        // ─── WmsCountScreen / Stock Lookup ───
                        Column {
                            Text(
                                text = "Stok / Lokasyon Sorgu",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Sorgulamak istediğiniz Palet (LPN), Lokasyon veya Ürün barkodunu üst kameradan taratın ya da yazın.",
                                color = Color(0xFF94A3B8),
                                fontSize = 11.sp
                            )
                            Spacer(modifier = Modifier.height(16.dp))

                            if (isLookupLoading) {
                                Box(modifier = Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = Color(0xFFa855f7))
                                }
                            } else {
                                val result = lookupResult
                                if (result != null) {
                                    Card(
                                        modifier = Modifier.fillMaxWidth(),
                                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                                        border = BorderStroke(1.dp, Color(0xFF334155))
                                    ) {
                                        Column(modifier = Modifier.padding(16.dp)) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = "Taranan: ${result.barcode}",
                                                    color = Color(0xFFa855f7),
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 11.sp
                                                )
                                                Text(
                                                    text = "TEMİZLE",
                                                    color = Color(0xFFEF4444),
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 11.sp,
                                                    modifier = Modifier.clickable { lookupResult = null }
                                                )
                                            }
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                text = result.name,
                                                color = Color.White,
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 16.sp
                                            )
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                text = "SKU / Barkod: ${result.sku}",
                                                color = Color(0xFF94A3B8),
                                                fontSize = 12.sp
                                            )
                                            Spacer(modifier = Modifier.height(12.dp))
                                            Text(
                                                text = "Depo Yerleşimleri & Bakiyeler:",
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                            Spacer(modifier = Modifier.height(6.dp))
                                            if (result.locations.isEmpty()) {
                                                Text("Bu ürün için stok kaydı bulunamadı.", color = Color(0xFF64748b), fontSize = 12.sp)
                                            } else {
                                                result.locations.forEach { loc ->
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(vertical = 4.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween
                                                    ) {
                                                        Text(loc.locationName, color = Color(0xFFcbd5e1), fontSize = 12.sp)
                                                        Text("${loc.quantity} adet", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(120.dp)
                                            .border(1.dp, Color(0xFF334155), RoundedCornerShape(12.dp)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("Henüz barkod sorgulanmadı.", color = Color(0xFF64748b), fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

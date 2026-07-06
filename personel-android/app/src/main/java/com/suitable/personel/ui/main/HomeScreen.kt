package com.suitable.personel.ui.main

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.Manifest
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.google.gson.Gson
import com.suitable.personel.data.AppConfig
import com.suitable.personel.data.CustomerInfo
import com.suitable.personel.data.TaskRepository
import com.suitable.personel.data.ShiftScheduleEntry

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
    config: AppConfig?,
    customerInfo: CustomerInfo? = null,
    staffSession: StaffSession? = null,
    onNavigate: (String) -> Unit,
    showMenu: Boolean = true,
    onSelectTableClick: (() -> Unit)? = null,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("PersonelPrefs", Context.MODE_PRIVATE)
    var showSidebarMenu by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        content()

        if (showMenu) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(top = 16.dp, end = 16.dp)
            ) {
                IconButton(
                    onClick = { showSidebarMenu = true },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Menu,
                        contentDescription = "Menu",
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }

                DropdownMenu(
                    expanded = showSidebarMenu,
                    onDismissRequest = { showSidebarMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("🏠  Ana Sayfa") },
                        onClick = {
                            showSidebarMenu = false
                            onNavigate("home")
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("📋  Görevler (Tasks)") },
                        onClick = {
                            showSidebarMenu = false
                            onNavigate("tasks")
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("🗓️  Çalışma Planı") },
                        onClick = {
                            showSidebarMenu = false
                            onNavigate("shift_plan")
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Çıkış Yap", color = Color.Red) },
                        onClick = {
                            showSidebarMenu = false
                            sharedPref.edit().remove("staffSession").apply()
                            onNavigate("login")
                        }
                    )
                }
            }
        }
    }
}

private fun getCurrentLocation(
    context: Context,
    onLocationReceived: (Location) -> Unit,
    onError: (String) -> Unit
) {
    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    if (locationManager == null) {
        onError("Konum servisi bulunamadı.")
        return
    }

    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
        onError("Konum izni verilmedi.")
        return
    }

    val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
    val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

    if (!isGpsEnabled && !isNetworkEnabled) {
        onError("Konum servisleri (GPS/Mobil Veri) kapalı. Lütfen ayarlardan açın.")
        return
    }

    var bestLocation: Location? = null

    if (isNetworkEnabled) {
        try {
            val loc = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (loc != null) {
                bestLocation = loc
            }
        } catch (_: SecurityException) {}
    }

    if (isGpsEnabled) {
        try {
            val loc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            if (loc != null) {
                if (bestLocation == null || loc.time > bestLocation.time) {
                    bestLocation = loc
                }
            }
        } catch (_: SecurityException) {}
    }

    val now = System.currentTimeMillis()
    if (bestLocation != null && (now - bestLocation.time) < 30000) {
        onLocationReceived(bestLocation)
        return
    }

    val provider = if (isGpsEnabled) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER

    val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            try {
                locationManager.removeUpdates(this)
            } catch (_: Exception) {}
            onLocationReceived(location)
        }
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    try {
        locationManager.requestLocationUpdates(
            provider,
            0L,
            0f,
            listener,
            Looper.getMainLooper()
        )
        val handler = android.os.Handler(Looper.getMainLooper())
        handler.postDelayed({
            try {
                locationManager.removeUpdates(listener)
            } catch (_: Exception) {}
            if (bestLocation != null) {
                onLocationReceived(bestLocation)
            } else {
                onError("Konumunuz alınamadı. Lütfen açık bir alana geçip tekrar deneyin.")
            }
        }, 8000)
    } catch (e: SecurityException) {
        onError("Konum erişim izni hatası: ${e.message}")
    } catch (e: Exception) {
        if (bestLocation != null) {
            onLocationReceived(bestLocation)
        } else {
            onError("Konum alınırken hata oluştu: ${e.message}")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: AppConfig?,
    onNavigate: (String) -> Unit,
    staffSession: StaffSession? = null,
    shifts: List<ShiftScheduleEntry> = emptyList(),
    isLoadingShifts: Boolean = true,
    onShiftsFetched: (List<ShiftScheduleEntry>) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val pref = remember { context.getSharedPreferences("PersonelPrefs", Context.MODE_PRIVATE) }
    
    val repo = remember { TaskRepository() }

    // PDKS State Machine
    var pdksState by remember { mutableStateOf(pref.getString("pdksState", "OUT") ?: "OUT") }
    var pdksAccumulatedSeconds by remember { mutableStateOf(pref.getLong("pdksAccumulatedSeconds", 0L)) }
    var pdksSessionStartTime by remember { mutableStateOf(pref.getLong("pdksSessionStartTime", 0L)) }
    var pdksBreakStartTime by remember { mutableStateOf(pref.getLong("pdksBreakStartTime", 0L)) }

    val savePdksState = { state: String, accum: Long, sessionStart: Long, breakStart: Long ->
        pdksState = state
        pdksAccumulatedSeconds = accum
        pdksSessionStartTime = sessionStart
        pdksBreakStartTime = breakStart
        pref.edit()
            .putString("pdksState", state)
            .putLong("pdksAccumulatedSeconds", accum)
            .putLong("pdksSessionStartTime", sessionStart)
            .putLong("pdksBreakStartTime", breakStart)
            .apply()
    }

    var tickingSeconds by remember { mutableStateOf(0L) }
    var tickingBreakSeconds by remember { mutableStateOf(0L) }

    LaunchedEffect(pdksState, pdksSessionStartTime, pdksBreakStartTime) {
        if (pdksState == "IN" || pdksState == "BREAK") {
            while (true) {
                val now = System.currentTimeMillis()
                if (pdksState == "IN" && pdksSessionStartTime > 0L) {
                    val activeSession = (now - pdksSessionStartTime) / 1000L
                    tickingSeconds = pdksAccumulatedSeconds + activeSession
                    tickingBreakSeconds = 0L
                } else if (pdksState == "BREAK" && pdksBreakStartTime > 0L) {
                    tickingSeconds = pdksAccumulatedSeconds
                    tickingBreakSeconds = (now - pdksBreakStartTime) / 1000L
                }
                kotlinx.coroutines.delay(1000L)
            }
        } else {
            tickingSeconds = pdksAccumulatedSeconds
            tickingBreakSeconds = 0L
        }
    }

    val displayTimer = remember(tickingSeconds) {
        val h = tickingSeconds / 3600
        val m = (tickingSeconds % 3600) / 60
        val s = tickingSeconds % 60
        String.format("%02d:%02d:%02d", h, m, s)
    }

    val displayBreakTimer = remember(tickingBreakSeconds) {
        val h = tickingBreakSeconds / 3600
        val m = (tickingBreakSeconds % 3600) / 60
        val s = tickingBreakSeconds % 60
        String.format("%02d:%02d:%02d", h, m, s)
    }

    // 3 Günlük Vardiya Tarihleri (Bugün, Yarın, Öbür Gün)
    val dates = remember {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
        val cal = java.util.Calendar.getInstance()
        val today = sdf.format(cal.time)
        cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
        val tomorrow = sdf.format(cal.time)
        cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
        val afterTomorrow = sdf.format(cal.time)
        Triple(today, tomorrow, afterTomorrow)
    }

    val actorId = staffSession?.id ?: ""

    LaunchedEffect(actorId) {
        if (actorId.isNotBlank()) {
            try {
                val result = repo.fetchShiftsForPersonnel(actorId, listOf(dates.first, dates.second, dates.third))
                onShiftsFetched(result)
            } catch (e: Exception) {
                // handle error
            }
        }
    }

    val todayShift = remember(shifts, dates) { shifts.find { it.scheduleDate == dates.first } }
    val tomorrowShift = remember(shifts, dates) { shifts.find { it.scheduleDate == dates.second } }
    val afterTomorrowShift = remember(shifts, dates) { shifts.find { it.scheduleDate == dates.third } }

    var showStartShiftDialog by remember { mutableStateOf(false) }
    var showEndOrBreakDialog by remember { mutableStateOf(false) }
    var showResumeFromBreakDialog by remember { mutableStateOf(false) }

    var locationErrorDialogMessage by remember { mutableStateOf<String?>(null) }
    var isCheckingLocation by remember { mutableStateOf(false) }

    val qrScanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            val code = result.contents.trim()
            var scannedBranchId = code
            try {
                val map = Gson().fromJson(code, Map::class.java)
                if (map != null) {
                    scannedBranchId = (map["branchId"] ?: map["id"] ?: code).toString()
                }
            } catch (_: Exception) {}

            val activeBranchId = staffSession?.activeBranchId ?: ""
            if (scannedBranchId != activeBranchId) {
                locationErrorDialogMessage = "Hatalı şube QR kodu okuttunuz! Bu QR kod sizin aktif şubenize ait değil."
                return@rememberLauncherForActivityResult
            }

            val branchLat = staffSession?.activeBranchLatitude
            val branchLon = staffSession?.activeBranchLongitude
            if (branchLat == null || branchLon == null) {
                locationErrorDialogMessage = "Şubenizin koordinat bilgileri girilmemiş. Lütfen yönetici ile iletişime geçin."
                return@rememberLauncherForActivityResult
            }

            isCheckingLocation = true
            getCurrentLocation(context,
                onLocationReceived = { location ->
                    isCheckingLocation = false
                    val results = FloatArray(1)
                    Location.distanceBetween(branchLat, branchLon, location.latitude, location.longitude, results)
                    val distance = results[0]
                    if (distance > 100f) {
                        locationErrorDialogMessage = String.format(
                            java.util.Locale.US,
                            "Şubede görünmüyorsunuz. Giriş yapmak için lütfen şube sınırları içerisinde bulunun.\nMesafe: %.1f m (Sınır: 100m)",
                            distance
                        )
                    } else {
                        showStartShiftDialog = true
                    }
                },
                onError = { error ->
                    isCheckingLocation = false
                    locationErrorDialogMessage = error
                }
            )
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarseGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (fineGranted || coarseGranted) {
            val opts = ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt("Vardiya başlatmak için şube QR'ını taratın")
                .setBeepEnabled(true)
                .setOrientationLocked(true)
            qrScanLauncher.launch(opts)
        } else {
            locationErrorDialogMessage = "Vardiyayı başlatmak için konum izinlerini vermeniz gerekmektedir."
        }
    }

    // Vardiya zaman kontrolü: dk cinsinden fark (+ = geç, - = erken)
    val shiftTimingDiffMinutes: (String?) -> Long? = { timeStr ->
        if (timeStr.isNullOrBlank()) null
        else try {
            val parts = timeStr.split(":")
            val shiftH = parts[0].toLong()
            val shiftM = parts[1].toLong()
            val cal = java.util.Calendar.getInstance()
            val nowH = cal.get(java.util.Calendar.HOUR_OF_DAY).toLong()
            val nowM = cal.get(java.util.Calendar.MINUTE).toLong()
            val nowTotalMins = nowH * 60 + nowM
            val shiftTotalMins = shiftH * 60 + shiftM
            nowTotalMins - shiftTotalMins
        } catch (_: Exception) { null }
    }

    val onBugunCardClick = {
        when (pdksState) {
            "OUT" -> {
                val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                if (hasFine || hasCoarse) {
                    val opts = ScanOptions()
                        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                        .setPrompt("Vardiya başlatmak için şube QR'ını taratın")
                        .setBeepEnabled(true)
                        .setOrientationLocked(true)
                    qrScanLauncher.launch(opts)
                } else {
                    locationPermissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }
            }
            "IN" -> showEndOrBreakDialog = true
            "BREAK" -> showResumeFromBreakDialog = true
        }
    }

    AppScaffold(
        config = config,
        customerInfo = null,
        staffSession = staffSession,
        onNavigate = onNavigate,
        showMenu = true
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Header (Profile)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                ) {
                    val initials = remember(staffSession) {
                        val first = staffSession?.firstName?.take(1) ?: "P"
                        val last = staffSession?.lastName?.take(1) ?: ""
                        (first + last).uppercase()
                    }
                    val displayName = remember(staffSession) {
                        staffSession?.getDisplayName() ?: "Personel"
                    }
                    val role = remember(staffSession) {
                        staffSession?.authorityLevel?.uppercase() ?: "GARSON"
                    }
                    val branchName = remember(staffSession) {
                        staffSession?.activeBranchName ?: "Şube Belirtilmedi"
                    }

                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(Color(0xFF3B82F6), Color(0xFF1D4ED8))
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp
                        )
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column {
                        Text(
                            text = displayName,
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 20.sp
                        )
                        Text(
                            text = "$role • $branchName",
                            color = Color(0xFF94A3B8),
                            fontWeight = FontWeight.Medium,
                            fontSize = 13.sp
                        )
                    }
                }

                // Çalışma Planı (Vardiya)
                Text(
                    text = "Çalışma Planı (Vardiya)",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(top = 10.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // BUGÜN Card
                    val shiftColor = when {
                        todayShift?.shiftKind == "off" || todayShift?.shiftKind == "leave" -> Color(0xFF8B5CF6)
                        pdksState == "IN" -> Color(0xFF10B981)
                        pdksState == "BREAK" -> Color(0xFFF59E0B)
                        todayShift != null -> Color(0xFF3B82F6)
                        else -> Color(0xFF334155)
                    }
                    Card(
                        modifier = Modifier
                            .weight(1.4f)
                            .clickable { onBugunCardClick() },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = shiftColor.copy(alpha = 0.08f)
                        ),
                        border = BorderStroke(
                            2.dp,
                            shiftColor.copy(alpha = if (pdksState == "OUT") 0.5f else 1f)
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            // Başlık satırı
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "BUGÜN",
                                    color = Color.White,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 11.sp
                                )
                                val todayDateFormatted = remember(dates.first) {
                                    try {
                                        val parts = dates.first.split("-")
                                        val day = parts[2]
                                        val month = when (parts[1]) {
                                            "01" -> "Oca"; "02" -> "Şub"; "03" -> "Mar"; "04" -> "Nis"
                                            "05" -> "May"; "06" -> "Haz"; "07" -> "Tem"; "08" -> "Ağu"
                                            "09" -> "Eyl"; "10" -> "Eki"; "11" -> "Kas"; "12" -> "Ara"
                                            else -> parts[1]
                                        }
                                        "$day $month"
                                    } catch(_: Exception) { dates.first }
                                }
                                Text(
                                    text = todayDateFormatted,
                                    color = shiftColor.copy(alpha = 0.8f),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }

                            HorizontalDivider(color = shiftColor.copy(alpha = 0.2f), thickness = 0.5.dp)

                            // Vardiya saatleri (büyük)
                            val shiftTimeLabel = when {
                                isLoadingShifts -> "Yükleniyor..."
                                todayShift == null -> "Vardiya Yok"
                                todayShift.shiftKind == "off" -> "🏖️ İzin Günü"
                                todayShift.shiftKind == "leave" -> "🏥 İzinli"
                                todayShift.shiftStartTime != null && todayShift.shiftEndTime != null ->
                                    "${todayShift.shiftStartTime.substring(0, 5)} — ${todayShift.shiftEndTime.substring(0, 5)}"
                                else -> "Vardiya Yok"
                            }
                            Text(
                                text = shiftTimeLabel,
                                color = Color.White,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 14.sp
                            )

                            // Short code
                            if (todayShift?.shiftShortCode != null) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(shiftColor.copy(alpha = 0.2f))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = todayShift.shiftShortCode,
                                        color = shiftColor,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(2.dp))

                            // Durum satırı (timer veya başlat)
                            val (statusIcon, statusText, statusColor) = when (pdksState) {
                                "IN" -> Triple(Icons.Default.PlayArrow, displayTimer, Color(0xFF10B981))
                                "BREAK" -> Triple(Icons.Default.Pause, "☕ Mola: $displayBreakTimer", Color(0xFFF59E0B))
                                else -> Triple(Icons.Default.TouchApp, "Başlatmak için dokun", Color(0xFF94A3B8))
                            }
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(statusIcon, contentDescription = null, tint = statusColor, modifier = Modifier.size(14.dp))
                                Text(statusText, color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    // YARIN Card
                    val tomorrowShiftColor = when {
                        tomorrowShift?.shiftKind == "off" || tomorrowShift?.shiftKind == "leave" -> Color(0xFF8B5CF6)
                        tomorrowShift != null -> Color(0xFF3B82F6)
                        else -> Color(0xFF334155)
                    }
                    Card(
                        modifier = Modifier.weight(1f).clickable { onNavigate("shift_plan") },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = tomorrowShiftColor.copy(alpha = 0.06f)),
                        border = BorderStroke(1.dp, tomorrowShiftColor.copy(alpha = 0.4f))
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "YARIN",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp
                            )
                            val tomorrowDateFormatted = remember(dates.second) {
                                try {
                                    val parts = dates.second.split("-")
                                    val month = when (parts[1]) {
                                        "01" -> "Oca"; "02" -> "Şub"; "03" -> "Mar"; "04" -> "Nis"
                                        "05" -> "May"; "06" -> "Haz"; "07" -> "Tem"; "08" -> "Ağu"
                                        "09" -> "Eyl"; "10" -> "Eki"; "11" -> "Kas"; "12" -> "Ara"
                                        else -> parts[1]
                                    }
                                    "${parts[2]} $month"
                                } catch(_: Exception) { dates.second }
                            }
                            Text(tomorrowDateFormatted, color = tomorrowShiftColor.copy(alpha = 0.8f), fontSize = 10.sp)
                            HorizontalDivider(color = tomorrowShiftColor.copy(alpha = 0.2f), thickness = 0.5.dp)
                            val tmrwLabel = when {
                                isLoadingShifts -> "Yükleniyor..."
                                tomorrowShift == null -> "Plan Yok"
                                tomorrowShift.shiftKind == "off" -> "🏖️ İzin"
                                tomorrowShift.shiftKind == "leave" -> "🏥 İzin"
                                tomorrowShift.shiftStartTime != null -> "${tomorrowShift.shiftStartTime.substring(0,5)}—${tomorrowShift.shiftEndTime?.substring(0,5) ?: "?"}"
                                else -> "Vardiya Yok"
                            }
                            Text(tmrwLabel, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                            if (tomorrowShift?.shiftShortCode != null) {
                                Text(tomorrowShift.shiftShortCode, color = tomorrowShiftColor, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    // SONRAKİ Card
                    val nextShiftColor = when {
                        afterTomorrowShift?.shiftKind == "off" || afterTomorrowShift?.shiftKind == "leave" -> Color(0xFF8B5CF6)
                        afterTomorrowShift != null -> Color(0xFF3B82F6)
                        else -> Color(0xFF334155)
                    }
                    Card(
                        modifier = Modifier.weight(1f).clickable { onNavigate("shift_plan") },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = nextShiftColor.copy(alpha = 0.06f)),
                        border = BorderStroke(1.dp, nextShiftColor.copy(alpha = 0.4f))
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "SONRAKİ",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp
                            )
                            val afterTomorrowDateFormatted = remember(dates.third) {
                                try {
                                    val parts = dates.third.split("-")
                                    val month = when (parts[1]) {
                                        "01" -> "Oca"; "02" -> "Şub"; "03" -> "Mar"; "04" -> "Nis"
                                        "05" -> "May"; "06" -> "Haz"; "07" -> "Tem"; "08" -> "Ağu"
                                        "09" -> "Eyl"; "10" -> "Eki"; "11" -> "Kas"; "12" -> "Ara"
                                        else -> parts[1]
                                    }
                                    "${parts[2]} $month"
                                } catch(_: Exception) { dates.third }
                            }
                            Text(afterTomorrowDateFormatted, color = nextShiftColor.copy(alpha = 0.8f), fontSize = 10.sp)
                            HorizontalDivider(color = nextShiftColor.copy(alpha = 0.2f), thickness = 0.5.dp)
                            val nextLabel = when {
                                isLoadingShifts -> "Yükleniyor..."
                                afterTomorrowShift == null -> "Plan Yok"
                                afterTomorrowShift.shiftKind == "off" -> "🏖️ İzin"
                                afterTomorrowShift.shiftKind == "leave" -> "🏥 İzin"
                                afterTomorrowShift.shiftStartTime != null -> "${afterTomorrowShift.shiftStartTime.substring(0,5)}—${afterTomorrowShift.shiftEndTime?.substring(0,5) ?: "?"}"
                                else -> "Vardiya Yok"
                            }
                            Text(nextLabel, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                            if (afterTomorrowShift?.shiftShortCode != null) {
                                Text(afterTomorrowShift.shiftShortCode, color = nextShiftColor, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Dialogs
                if (locationErrorDialogMessage != null) {
                    AlertDialog(
                        onDismissRequest = { locationErrorDialogMessage = null },
                        title = { Text("Giriş Başarısız", color = Color.White, fontWeight = FontWeight.Bold) },
                        text = { Text(locationErrorDialogMessage ?: "", color = Color.White) },
                        confirmButton = {
                            Button(
                                onClick = { locationErrorDialogMessage = null },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                            ) {
                                Text("Tamam", color = Color.White)
                            }
                        },
                        containerColor = Color(0xFF0F2847)
                    )
                }

                if (isCheckingLocation) {
                    AlertDialog(
                        onDismissRequest = {},
                        title = { Text("Konum Doğrulanıyor", color = Color.White, fontWeight = FontWeight.Bold) },
                        text = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp),
                                modifier = Modifier.padding(vertical = 8.dp)
                            ) {
                                CircularProgressIndicator(color = Color(0xFF3B82F6))
                                Text("GPS konumu alınıyor, lütfen bekleyin...", color = Color.White)
                            }
                        },
                        confirmButton = {},
                        containerColor = Color(0xFF0F2847)
                    )
                }

                if (showStartShiftDialog) {
                    val startDiffMins = shiftTimingDiffMinutes(todayShift?.shiftStartTime)
                    val timingWarning = when {
                        startDiffMins == null -> null
                        startDiffMins > 5 -> "⚠️ Vardiya planınızda ${startDiffMins} dk geç giriş yapıyorsunuz."
                        startDiffMins < -5 -> "⏰ Vardiya planınızda ${-startDiffMins} dk erken giriş yapıyorsunuz."
                        else -> null
                    }
                    AlertDialog(
                        onDismissRequest = { showStartShiftDialog = false },
                        title = {
                            Column {
                                Text("Mesai Başlangıcı", color = Color.White, fontWeight = FontWeight.Bold)
                                if (todayShift?.shiftStartTime != null) {
                                    Text(
                                        "Planlanan Giriş: ${todayShift.shiftStartTime.substring(0,5)}",
                                        color = Color(0xFF94A3B8),
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (timingWarning != null) {
                                    Card(
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (startDiffMins!! > 0)
                                                Color(0xFFEF4444).copy(alpha = 0.15f)
                                            else
                                                Color(0xFFF59E0B).copy(alpha = 0.15f)
                                        ),
                                        border = BorderStroke(1.dp,
                                            if (startDiffMins > 0) Color(0xFFEF4444).copy(alpha = 0.4f)
                                            else Color(0xFFF59E0B).copy(alpha = 0.4f)
                                        )
                                    ) {
                                        Text(
                                            timingWarning,
                                            color = if (startDiffMins > 0) Color(0xFFEF4444) else Color(0xFFF59E0B),
                                            modifier = Modifier.padding(12.dp),
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                                Text(
                                    "Vardiyanızı başlatmak istiyor musunuz?",
                                    color = Color.White
                                )
                            }
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    val now = System.currentTimeMillis()
                                    savePdksState("IN", 0L, now, 0L)
                                    showStartShiftDialog = false
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                            ) {
                                Text("▶ Başlat", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showStartShiftDialog = false }) {
                                Text("Vazgeç", color = Color(0xFF94A3B8))
                            }
                        },
                        containerColor = Color(0xFF0F2847)
                    )
                }

                if (showEndOrBreakDialog) {
                    val endDiffMins = shiftTimingDiffMinutes(todayShift?.shiftEndTime)
                    val endTimingWarning = when {
                        endDiffMins == null -> null
                        endDiffMins < -5 -> "⏰ Vardiya planınızda ${-endDiffMins} dk erken çıkış yapıyorsunuz."
                        endDiffMins > 5 -> "⚠️ Vardiya planınızda ${endDiffMins} dk geç çıkış yapıyorsunuz."
                        else -> null
                    }
                    AlertDialog(
                        onDismissRequest = { showEndOrBreakDialog = false },
                        title = {
                            Column {
                                Text("Mesai / Mola İşlemi", color = Color.White, fontWeight = FontWeight.Bold)
                                if (todayShift?.shiftEndTime != null) {
                                    Text(
                                        "Planlanan Çıkış: ${todayShift.shiftEndTime.substring(0,5)}",
                                        color = Color(0xFF94A3B8),
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (endTimingWarning != null) {
                                    Card(
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (endDiffMins!! < 0)
                                                Color(0xFFF59E0B).copy(alpha = 0.15f)
                                            else
                                                Color(0xFFEF4444).copy(alpha = 0.15f)
                                        ),
                                        border = BorderStroke(1.dp,
                                            if (endDiffMins < 0) Color(0xFFF59E0B).copy(alpha = 0.4f)
                                            else Color(0xFFEF4444).copy(alpha = 0.4f)
                                        )
                                    ) {
                                        Text(
                                            endTimingWarning,
                                            color = if (endDiffMins < 0) Color(0xFFF59E0B) else Color(0xFFEF4444),
                                            modifier = Modifier.padding(12.dp),
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                                Text(
                                    "Mola vermek mi istiyorsunuz yoksa bugünkü vardiyanızı sonlandırmak mı?",
                                    color = Color.White
                                )
                            }
                        },
                        confirmButton = {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        val now = System.currentTimeMillis()
                                        val worked = pdksAccumulatedSeconds + ((now - pdksSessionStartTime) / 1000L)
                                        savePdksState("BREAK", worked, 0L, now)
                                        showEndOrBreakDialog = false
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B))
                                ) {
                                    Text("☕ Mola", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                                Button(
                                    onClick = {
                                        val branchLat = staffSession?.activeBranchLatitude
                                        val branchLon = staffSession?.activeBranchLongitude
                                        if (branchLat == null || branchLon == null) {
                                            locationErrorDialogMessage = "Şubenizin koordinat bilgileri girilmemiş. Lütfen yönetici ile iletişime geçin."
                                            showEndOrBreakDialog = false
                                            return@Button
                                        }

                                        isCheckingLocation = true
                                        getCurrentLocation(context,
                                            onLocationReceived = { location ->
                                                isCheckingLocation = false
                                                val results = FloatArray(1)
                                                Location.distanceBetween(branchLat, branchLon, location.latitude, location.longitude, results)
                                                val distance = results[0]
                                                if (distance > 100f) {
                                                    locationErrorDialogMessage = String.format(
                                                        java.util.Locale.US,
                                                        "Şubede görünmüyorsunuz. Vardiyayı sonlandırmak için lütfen şube sınırları içerisinde bulunun.\nMesafe: %.1f m (Sınır: 100m)",
                                                        distance
                                                    )
                                                } else {
                                                    savePdksState("OUT", 0L, 0L, 0L)
                                                    showEndOrBreakDialog = false
                                                }
                                            },
                                            onError = { error ->
                                                isCheckingLocation = false
                                                locationErrorDialogMessage = error
                                            }
                                        )
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                                ) {
                                    Text("⏹ Bitir", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showEndOrBreakDialog = false }) {
                                Text("Vazgeç", color = Color(0xFF94A3B8))
                            }
                        },
                        containerColor = Color(0xFF0F2847)
                    )
                }

                if (showResumeFromBreakDialog) {
                    AlertDialog(
                        onDismissRequest = { showResumeFromBreakDialog = false },
                        title = { Text("Molayı Sonlandır", color = Color.White) },
                        text = { Text("Molayı bitirip mesainize geri dönmek istiyor musunuz?", color = Color.White) },
                        confirmButton = {
                            Button(
                                onClick = {
                                    val now = System.currentTimeMillis()
                                    savePdksState("IN", pdksAccumulatedSeconds, now, 0L)
                                    showResumeFromBreakDialog = false
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                            ) {
                                Text("Moladan Dön", color = Color.White)
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showResumeFromBreakDialog = false }) {
                                Text("Vazgeç", color = Color(0xFF94A3B8))
                            }
                        },
                        containerColor = Color(0xFF1E293B)
                    )
                }



                // Card 3: Görevler (Geniş Kart)
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(86.dp)
                        .clickable { onNavigate("tasks") },
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    border = BorderStroke(1.dp, Color(0xFF334155))
                ) {
                    Row(
                        modifier = Modifier.fillMaxSize().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color(0xFF10B981).copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.Assignment, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(20.dp))
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Görevler & Takip",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "Yapılacak işler ve onay bekleyen talepler",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 11.sp
                                )
                            }
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color(0xFF94A3B8))
                    }
                }

                // System info card at bottom
                Card(
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                    border = BorderStroke(1.dp, Color(0xFF1E293B))
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = null,
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Suitable RMS v3 • Bağlantı Aktif (Yerel)",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}

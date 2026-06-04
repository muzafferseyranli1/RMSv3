package com.suitable.personel.ui.main

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
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
import com.suitable.personel.data.AppConfig
import com.suitable.personel.data.ShiftScheduleEntry
import com.suitable.personel.data.TaskRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShiftPlanScreen(
    config: AppConfig?,
    staffSession: StaffSession?,
    shifts: List<ShiftScheduleEntry>,
    isLoading: Boolean,
    includesPastDays: Boolean,
    onShiftsFetched: (List<ShiftScheduleEntry>, Boolean, Boolean) -> Unit,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { TaskRepository() }
    val personnelId = staffSession?.id ?: ""

    // Date calculations
    val sdf = remember { java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US) }
    val dates = remember {
        val cal = java.util.Calendar.getInstance()
        val today = sdf.format(cal.time)

        val startCal = cal.clone() as java.util.Calendar
        startCal.set(java.util.Calendar.DAY_OF_MONTH, 1)
        val startOfMonth = sdf.format(startCal.time)

        val endCal = cal.clone() as java.util.Calendar
        endCal.set(java.util.Calendar.DAY_OF_MONTH, endCal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH))
        val endOfMonth = sdf.format(endCal.time)

        Triple(today, startOfMonth, endOfMonth)
    }

    // Fetch logic
    val loadShifts = { loadPast: Boolean ->
        if (personnelId.isNotBlank()) {
            onShiftsFetched(shifts, loadPast, true)
            scope.launch {
                val start = if (loadPast) dates.second else dates.first
                val end = dates.third
                val result = repo.fetchShiftsForPersonnelRange(personnelId, start, end)
                // Sort by date ascending
                onShiftsFetched(result.sortedBy { it.scheduleDate }, loadPast, false)
            }
        }
    }

    // Load future shifts on open
    LaunchedEffect(personnelId) {
        loadShifts(includesPastDays)
    }

    val todayShift = remember(shifts, dates.first) {
        shifts.find { it.scheduleDate == dates.first }
    }

    val otherShifts = remember(shifts, dates.first) {
        shifts.filter { it.scheduleDate != dates.first }
    }

    // Net hours calculation helper
    val calculateNetHours: (String?, String?, Int) -> Double = { startTime, endTime, breakMins ->
        if (startTime.isNullOrBlank() || endTime.isNullOrBlank()) {
            0.0
        } else {
            try {
                val startParts = startTime.split(":")
                val endParts = endTime.split(":")
                val startMins = startParts[0].toInt() * 60 + startParts[1].toInt()
                var endMins = endParts[0].toInt() * 60 + endParts[1].toInt()
                if (endMins <= startMins) {
                    endMins += 1440 // Crosses midnight
                }
                val duration = endMins - startMins
                val netMins = duration - breakMins
                java.lang.Math.max(0, netMins) / 60.0
            } catch (_: Exception) {
                0.0
            }
        }
    }

    val formatHours: (Double) -> String = { hours ->
        if (hours % 1.0 == 0.0) {
            "${hours.toInt()} Saat"
        } else {
            String.format(java.util.Locale.US, "%.1f Saat", hours)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Çalışma Planı",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { onNavigate("home") }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Geri",
                            tint = Color.White
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { loadShifts(!includesPastDays) },
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Yenile / Geçmişi Yükle",
                            tint = if (includesPastDays) Color(0xFF10B981) else Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF1E293B)
                )
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (isLoading && shifts.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Color(0xFF3B82F6))
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(top = 16.dp, bottom = 32.dp)
                ) {
                    // Today's Shift (Header Block)
                    item {
                        Text(
                            text = "BUGÜNÜN VARDIYA PLANI",
                            color = Color(0xFF94A3B8),
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )

                        if (todayShift != null) {
                            val isWorking = todayShift.shiftKind == "working"
                            val shiftColor = if (isWorking) Color(0xFF3B82F6) else Color(0xFF8B5CF6)

                            Card(
                                shape = RoundedCornerShape(20.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                                border = BorderStroke(1.dp, shiftColor.copy(alpha = 0.4f)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(20.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = todayShift.shiftName ?: (if (isWorking) "Mesai" else "İzin"),
                                            color = Color.White,
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 18.sp
                                        )
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(shiftColor.copy(alpha = 0.15f))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Text(
                                                text = todayShift.shiftShortCode ?: (if (isWorking) "MS" else "İZ"),
                                                color = shiftColor,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }

                                    HorizontalDivider(color = Color(0xFF334155), thickness = 0.5.dp)

                                    if (isWorking && todayShift.shiftStartTime != null && todayShift.shiftEndTime != null) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Giriş - Çıkış", color = Color(0xFF94A3B8), fontSize = 11.sp)
                                                Text(
                                                    "${todayShift.shiftStartTime.substring(0, 5)} — ${todayShift.shiftEndTime.substring(0, 5)}",
                                                    color = Color.White,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 15.sp
                                                )
                                            }

                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Mola Süresi", color = Color(0xFF94A3B8), fontSize = 11.sp)
                                                Text(
                                                    "${todayShift.breakMinutes} dk",
                                                    color = Color.White,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 15.sp
                                                )
                                            }
                                        }

                                        val netHours = calculateNetHours(todayShift.shiftStartTime, todayShift.shiftEndTime, todayShift.breakMinutes)
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(Color(0xFF10B981).copy(alpha = 0.12f))
                                                .padding(12.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = "Net Çalışma Süresi: ${formatHours(netHours)}",
                                                color = Color(0xFF10B981),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 14.sp
                                            )
                                        }
                                    } else {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Info,
                                                contentDescription = null,
                                                tint = Color(0xFF8B5CF6)
                                            )
                                            Text(
                                                text = if (todayShift.shiftKind == "off") "Bugün planlı izin gününüzdür." else "Bugün izinli/raporlu görünüyorsunuz.",
                                                color = Color(0xFFE2E8F0),
                                                fontSize = 14.sp
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Card(
                                shape = RoundedCornerShape(16.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "Bugün için tanımlanmış bir vardiya planınız bulunmuyor.",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(16.dp),
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }

                    // Monthly Shift Schedule List Header
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (includesPastDays) "BU AYIN TÜM PLANLARI" else "GELECEK VARDİYA PLANLARI",
                                color = Color(0xFF94A3B8),
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp
                            )
                            Text(
                                text = if (includesPastDays) "Geçmiş Dahil" else "Sadece Gelecek",
                                color = if (includesPastDays) Color(0xFF10B981) else Color(0xFF3B82F6),
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(
                                        (if (includesPastDays) Color(0xFF10B981) else Color(0xFF3B82F6)).copy(alpha = 0.12f)
                                    )
                                    .padding(horizontal = 6.dp, vertical = 3.dp)
                                    .clickable { loadShifts(!includesPastDays) }
                            )
                        }
                    }

                    // List items
                    if (otherShifts.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Planlanmış başka bir vardiya bulunamadı.",
                                    color = Color(0xFF475569),
                                    fontSize = 14.sp
                                )
                            }
                        }
                    } else {
                        items(otherShifts, key = { it.id }) { entry ->
                            val isWorking = entry.shiftKind == "working"
                            val accentColor = if (isWorking) Color(0xFF3B82F6) else Color(0xFF8B5CF6)

                            // Format scheduleDate beautiful "dd.MM.yyyy"
                            val displayDate = remember(entry.scheduleDate) {
                                try {
                                    val parts = entry.scheduleDate.split("-")
                                    "${parts[2]}.${parts[1]}.${parts[0]}"
                                } catch (_: Exception) {
                                    entry.scheduleDate
                                }
                            }

                            Card(
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                                border = BorderStroke(0.5.dp, Color(0xFF334155)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            text = displayDate,
                                            color = Color.White,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp
                                        )
                                        Text(
                                            text = entry.shiftName ?: (if (isWorking) "Mesai" else "İzin"),
                                            color = Color(0xFF94A3B8),
                                            fontSize = 12.sp
                                        )
                                    }

                                    Column(
                                        horizontalAlignment = Alignment.End,
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        if (isWorking && entry.shiftStartTime != null && entry.shiftEndTime != null) {
                                            Text(
                                                text = "${entry.shiftStartTime.substring(0, 5)} - ${entry.shiftEndTime.substring(0, 5)}",
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp
                                            )
                                            val netHours = calculateNetHours(entry.shiftStartTime, entry.shiftEndTime, entry.breakMinutes)
                                            Text(
                                                text = "${formatHours(netHours)} Net (Mola: ${entry.breakMinutes} dk)",
                                                color = Color(0xFF10B981),
                                                fontWeight = FontWeight.Medium,
                                                fontSize = 11.sp
                                            )
                                        } else {
                                            Text(
                                                text = if (entry.shiftKind == "off") "İzin Günü" else "İzinli",
                                                color = Color(0xFF8B5CF6),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp
                                            )
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
}

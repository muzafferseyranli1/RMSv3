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
import com.suitable.personel.data.AppConfig
import com.suitable.personel.data.CustomerInfo

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
                        text = { Text("🪑  Garson Masaları") },
                        onClick = {
                            showSidebarMenu = false
                            onNavigate("table")
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("📋  Sipariş Listesi") },
                        onClick = {
                            showSidebarMenu = false
                            onNavigate("table_orders")
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo? = null,
    staffSession: StaffSession? = null,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val pref = remember { context.getSharedPreferences("PersonelPrefs", Context.MODE_PRIVATE) }
    
    // Read PDKS status
    var isPDKSCheckedIn by remember { mutableStateOf(pref.getBoolean("pdksCheckedIn", false)) }
    var pdksStartTime by remember { mutableStateOf(pref.getLong("pdksStartTime", 0L)) }
    var elapsedSeconds by remember { mutableStateOf(0L) }

    // PDKS timer
    LaunchedEffect(isPDKSCheckedIn, pdksStartTime) {
        if (isPDKSCheckedIn && pdksStartTime > 0L) {
            while (true) {
                val current = System.currentTimeMillis()
                elapsedSeconds = (current - pdksStartTime) / 1000L
                kotlinx.coroutines.delay(1000L)
            }
        } else {
            elapsedSeconds = 0L
        }
    }

    val displayTimer = remember(elapsedSeconds) {
        if (elapsedSeconds <= 0L) "00:00:00"
        else {
            val hours = elapsedSeconds / 3600
            val minutes = (elapsedSeconds % 3600) / 60
            val seconds = elapsedSeconds % 60
            String.format("%02d:%02d:%02d", hours, minutes, seconds)
        }
    }

    AppScaffold(
        config = config,
        customerInfo = customerInfo,
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

                // PDKS (Mesai Kartı)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    border = BorderStroke(1.dp, Color(0xFF334155))
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Mesai Durumu",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = if (isPDKSCheckedIn) "MESAİDE (ÇALIŞIYOR)" else "MESAİDE DEĞİL (KAPALI)",
                                    color = if (isPDKSCheckedIn) Color(0xFF10B981) else Color(0xFFEF4444),
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Black
                                )
                            }
                            Icon(
                                imageVector = if (isPDKSCheckedIn) Icons.Default.Work else Icons.Default.WorkOff,
                                contentDescription = null,
                                tint = if (isPDKSCheckedIn) Color(0xFF10B981) else Color(0xFFEF4444),
                                modifier = Modifier.size(28.dp)
                            )
                        }

                        if (isPDKSCheckedIn) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFF0F172A))
                                    .padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Çalışma Süresi",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 13.sp
                                )
                                Text(
                                    text = displayTimer,
                                    color = Color.White,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp
                                )
                            }
                        }

                        Button(
                            onClick = {
                                if (isPDKSCheckedIn) {
                                    isPDKSCheckedIn = false
                                    pdksStartTime = 0L
                                    pref.edit()
                                        .putBoolean("pdksCheckedIn", false)
                                        .remove("pdksStartTime")
                                        .apply()
                                } else {
                                    val start = System.currentTimeMillis()
                                    isPDKSCheckedIn = true
                                    pdksStartTime = start
                                    pref.edit()
                                        .putBoolean("pdksCheckedIn", true)
                                        .putLong("pdksStartTime", start)
                                        .apply()
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isPDKSCheckedIn) Color(0xFFEF4444) else Color(0xFF3B82F6)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(
                                imageVector = if (isPDKSCheckedIn) Icons.Default.Logout else Icons.Default.PlayArrow,
                                contentDescription = null,
                                tint = Color.White
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isPDKSCheckedIn) "Mesaiyi Sonlandır" else "Mesaime Başla",
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }
                }

                // Quick Navigation Cards
                Text(
                    text = "Hızlı İşlemler",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(top = 10.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Card 1: Garson Terminali
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .height(130.dp)
                            .clickable { onNavigate("table") },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                        border = BorderStroke(1.dp, Color(0xFF334155))
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color(0xFF3B82F6).copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.TableRestaurant, contentDescription = null, tint = Color(0xFF3B82F6))
                            }
                            Column {
                                Text(
                                    text = "Garson",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "Masalar & Sipariş",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }

                    // Card 2: Siparişler
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .height(130.dp)
                            .clickable { onNavigate("table_orders") },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                        border = BorderStroke(1.dp, Color(0xFF334155))
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color(0xFFF59E0B).copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color(0xFFF59E0B))
                            }
                            Column {
                                Text(
                                    text = "Siparişler",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "Hesaplar & Ödeme",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
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

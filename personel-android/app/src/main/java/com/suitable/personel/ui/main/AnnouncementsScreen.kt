package com.suitable.personel.ui.main

import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.suitable.personel.data.AnnouncementItem
import com.suitable.personel.data.AnnouncementRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnnouncementsScreen(
    staffSession: StaffSession?,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { AnnouncementRepository() }

    var announcements by remember { mutableStateOf<List<AnnouncementItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var selectedAnnouncement by remember { mutableStateOf<AnnouncementItem?>(null) }

    val currentPersonnelId = staffSession?.id ?: ""
    val currentBranchId = staffSession?.activeBranchId ?: ""
    val authority = staffSession?.authorityLevel?.lowercase() ?: "garson"
    val canCreate = authority == "admin" || authority == "manager" || authority == "genel merkez" || authority == "şube müdürü"

    // Load data
    val loadAnnouncements = {
        isLoading = true
        scope.launch {
            announcements = repo.fetchAnnouncements(currentPersonnelId, currentBranchId)
            isLoading = false
        }
    }

    LaunchedEffect(key1 = true) {
        loadAnnouncements()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("📢 Duyurular", fontWeight = FontWeight.Bold, color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Geri", tint = Color.White)
                    }
                },
                actions = {
                    IconButton(onClick = { loadAnnouncements() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF111111)
                )
            )
        },
        floatingActionButton = {
            if (canCreate) {
                FloatingActionButton(
                    onClick = { showCreateDialog = true },
                    containerColor = Color(0xFFF5A623),
                    contentColor = Color.Black
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Duyuru Ekle")
                }
            }
        },
        containerColor = Color(0xFFF5F5F5)
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = Color(0xFFF5A623)
                )
            } else if (announcements.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "Bilgi",
                        tint = Color.Gray,
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Aktif duyuru bulunmamaktadır.",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color.Gray
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(announcements) { item ->
                        AnnouncementCard(
                            announcement = item,
                            onClick = { selectedAnnouncement = item }
                        )
                    }
                }
            }
        }

        // Announcement Detail Dialog
        selectedAnnouncement?.let { item ->
            AnnouncementDetailDialog(
                announcement = item,
                onDismiss = { selectedAnnouncement = null },
                onMarkAsRead = {
                    scope.launch {
                        val success = repo.markAsRead(item.id, currentPersonnelId)
                        if (success) {
                            Toast.makeText(context, "Duyuru okundu olarak işaretlendi.", Toast.LENGTH_SHORT).show()
                            selectedAnnouncement = null
                            loadAnnouncements()
                        } else {
                            Toast.makeText(context, "İşlem başarısız oldu.", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            )
        }

        // Create Announcement Dialog
        if (showCreateDialog) {
            CreateAnnouncementDialog(
                currentBranchId = currentBranchId,
                onDismiss = { showCreateDialog = false },
                onCreate = { title, content, targetType, targetId, priority, requestReceipt ->
                    scope.launch {
                        val success = repo.createAnnouncement(
                            title = title,
                            content = content,
                            targetType = targetType,
                            targetId = targetId,
                            priority = priority,
                            requestReadReceipt = requestReceipt,
                            createdByPersonnelId = currentPersonnelId
                        )
                        if (success) {
                            Toast.makeText(context, "Duyuru başarıyla yayınlandı.", Toast.LENGTH_SHORT).show()
                            showCreateDialog = false
                            loadAnnouncements()
                        } else {
                            Toast.makeText(context, "Duyuru yayınlanamadı.", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            )
        }
    }
}

@Composable
fun AnnouncementCard(
    announcement: AnnouncementItem,
    onClick: () -> Unit
) {
    val priorityColor = when (announcement.priority.lowercase()) {
        "urgent" -> Color(0xFFDC2626)
        "high" -> Color(0xFFF5A623)
        "normal" -> Color(0xFF2563EB)
        else -> Color(0xFF4B5563)
    }

    val priorityLabel = when (announcement.priority.lowercase()) {
        "urgent" -> "Acil"
        "high" -> "Önemli"
        "normal" -> "Normal"
        else -> "Düşük"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            // Priority Indicator bar on the left
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(6.dp)
                    .background(priorityColor)
                    .align(Alignment.CenterStart)
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Priority Badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(priorityColor.copy(alpha = 0.15f))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = priorityLabel,
                            color = priorityColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Read/Unread dot
                    if (!announcement.isRead) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(RoundedCornerShape(5.dp))
                                .background(Color(0xFF2563EB))
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = announcement.title,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF111111)
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = announcement.content,
                    fontSize = 14.sp,
                    maxLines = 2,
                    color = Color.Gray
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Tarih: ${announcement.createdAt.take(10)}",
                        fontSize = 11.sp,
                        color = Color.Gray
                    )

                    if (announcement.requestReadReceipt) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = "Okundu İsteği",
                                tint = if (announcement.isRead) Color(0xFF15803D) else Color.Gray,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = if (announcement.isRead) "Onaylandı" else "Onay Bekliyor",
                                fontSize = 11.sp,
                                color = if (announcement.isRead) Color(0xFF15803D) else Color.Gray,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AnnouncementDetailDialog(
    announcement: AnnouncementItem,
    onDismiss: () -> Unit,
    onMarkAsRead: () -> Unit
) {
    val priorityColor = when (announcement.priority.lowercase()) {
        "urgent" -> Color(0xFFDC2626)
        "high" -> Color(0xFFF5A623)
        "normal" -> Color(0xFF2563EB)
        else -> Color(0xFF4B5563)
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 24.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Duyuru Detayı",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.Gray
                    )
                    IconButton(onClick = onDismiss, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Kapat", tint = Color.Gray)
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = announcement.title,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF111111)
                )

                Spacer(modifier = Modifier.height(6.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(priorityColor)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Öncelik: ${announcement.priority.uppercase()}",
                        fontSize = 12.sp,
                        color = priorityColor,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false)
                        .background(Color(0xFFF9F9F9), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    LazyColumn {
                        item {
                            Text(
                                text = announcement.content,
                                fontSize = 15.sp,
                                color = Color(0xFF333333),
                                lineHeight = 22.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Tarih: ${announcement.createdAt.replace("T", " ").take(16)}",
                    fontSize = 12.sp,
                    color = Color.Gray
                )

                Spacer(modifier = Modifier.height(20.dp))

                if (announcement.requestReadReceipt && !announcement.isRead) {
                    Button(
                        onClick = onMarkAsRead,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFF5A623),
                            contentColor = Color.Black
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = "Okundu")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Okudum ve Onaylıyorum", fontWeight = FontWeight.Bold)
                    }
                } else {
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF111111),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Kapat")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateAnnouncementDialog(
    currentBranchId: String,
    onDismiss: () -> Unit,
    onCreate: (title: String, content: String, targetType: String, targetId: String?, priority: String, requestReceipt: Boolean) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var targetType by remember { mutableStateOf("all") } // "all" or "branch"
    var priority by remember { mutableStateOf("normal") } // "low", "normal", "high", "urgent"
    var requestReceipt by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Yeni Duyuru Oluştur",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF111111)
                    )
                    IconButton(onClick = onDismiss, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Kapat", tint = Color.Gray)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Başlık") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFFF5A623),
                        focusedLabelColor = Color(0xFFF5A623)
                    ),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it },
                    label = { Text("İçerik") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(100.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFFF5A623),
                        focusedLabelColor = Color(0xFFF5A623)
                    )
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Target Selection
                Text("Hedef Kitle:", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = targetType == "all",
                            onClick = { targetType = "all" },
                            colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFF5A623))
                        )
                        Text("Tüm Şubeler", fontSize = 14.sp)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = targetType == "branch",
                            onClick = { targetType = "branch" },
                            colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFF5A623))
                        )
                        Text("Sadece Kendi Şubem", fontSize = 14.sp)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Priority Selection
                Text("Öncelik Derecesi:", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    listOf("low" to "Düşük", "normal" to "Normal", "high" to "Yüksek", "urgent" to "Acil").forEach { (valStr, label) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = priority == valStr,
                                onClick = { priority = valStr },
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFF5A623)),
                                modifier = Modifier.size(36.dp)
                            )
                            Text(label, fontSize = 12.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Request Receipt Checkbox
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = requestReceipt,
                        onCheckedChange = { requestReceipt = it },
                        colors = CheckboxDefaults.colors(checkedColor = Color(0xFFF5A623))
                    )
                    Text("Okundu/Onay Bilgisi İstensin", fontSize = 14.sp)
                }

                Spacer(modifier = Modifier.height(20.dp))

                Button(
                    onClick = {
                        if (title.trim().isEmpty() || content.trim().isEmpty()) {
                            return@Button
                        }
                        val targetId = if (targetType == "branch") currentBranchId else null
                        onCreate(title, content, targetType, targetId, priority, requestReceipt)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFF5A623),
                        contentColor = Color.Black
                    ),
                    shape = RoundedCornerShape(8.dp),
                    enabled = title.isNotBlank() && content.isNotBlank()
                ) {
                    Text("Yayınla", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

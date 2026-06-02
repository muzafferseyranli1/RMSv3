package com.suitable.personel.ui.main

import android.app.DatePickerDialog
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.personel.data.*
import kotlinx.coroutines.launch
import java.util.Calendar

private val TaskBg = Color(0xFF0F172A)
private val CardBg = Color(0xFF1E293B)
private val CardBorder = Color(0xFF334155)
private val TextPrimary = Color(0xFFF8FAFC)
private val TextSecondary = Color(0xFF94A3B8)
private val AccentGreen = Color(0xFF10B981)
private val AccentRed = Color(0xFFEF4444)
private val AccentBlue = Color(0xFF3B82F6)
private val AccentOrange = Color(0xFFF59E0B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(
    config: AppConfig?,
    staffSession: StaffSession?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { TaskRepository() }

    val actorId = staffSession?.id ?: ""
    val authorityLevel = staffSession?.authorityLevel ?: "şube"
    val branchId = staffSession?.activeBranchId ?: ""

    var tasks by remember { mutableStateOf<List<TaskItem>>(emptyList()) }
    var employees by remember { mutableStateOf<List<EmployeeInfo>>(emptyList()) }
    var positions by remember { mutableStateOf<List<PositionInfo>>(emptyList()) }
    var branches by remember { mutableStateOf<List<BranchInfo>>(emptyList()) }

    var isLoading by remember { mutableStateOf(true) }
    var refreshTrigger by remember { mutableStateOf(0) }

    // Tab state: "mine" (Bana Atananlar), "assigned_by_me" (Oluşturduklarım), "watching" (Gözlemci Olduklarım)
    var selectedTab by remember { mutableStateOf("mine") }
    // Status Filter: "active" (Devam Edenler), "completed" (Tamamlananlar), "overdue" (Gecikenler), "all" (Tümü)
    var statusFilter by remember { mutableStateOf("active") }

    // Dialog & Detail states
    var selectedTaskForDetail by remember { mutableStateOf<TaskItem?>(null) }
    var showCreateDialog by remember { mutableStateOf(false) }

    // 1) Verileri Yükle
    LaunchedEffect(actorId, refreshTrigger) {
        if (actorId.isBlank()) return@LaunchedEffect
        isLoading = true
        scope.launch {
            try {
                // Pozisyonlar, Personeller, Şubeler
                val meta = repo.fetchEmployeesAndPositionsAndBranches()
                employees = meta.first
                positions = meta.second
                branches = meta.third

                // Görevler
                tasks = repo.fetchTasksForActor(actorId, authorityLevel, branchId)
            } catch (e: Exception) {
                Toast.makeText(context, "Görevler yüklenirken hata oluştu", Toast.LENGTH_SHORT).show()
            } finally {
                isLoading = false
            }
        }
    }

    // 2) Filtrelenmiş Görev Listesi
    val filteredTasks = remember(tasks, selectedTab, statusFilter) {
        tasks.filter { task ->
            // Tab filtresi
            val passTab = when (selectedTab) {
                "mine" -> task.participants.any { it.participantType == "assignee" && it.personnelId == actorId }
                "assigned_by_me" -> task.createdByPersonnelId == actorId
                "watching" -> task.participants.any { it.participantType == "watcher" && it.personnelId == actorId }
                else -> true
            }

            // Durum filtresi
            val passStatus = when (statusFilter) {
                "active" -> task.status == "open" || task.status == "in_progress" || task.status == "pending_approval" || task.status == "pending_completion_approval"
                "completed" -> task.status == "completed"
                "overdue" -> {
                    // dueAt geçmişte kalmış ve completed değilse
                    val isLate = task.dueAt?.let {
                        try {
                            val due = java.time.Instant.parse(it)
                            due.isBefore(java.time.Instant.now())
                        } catch (_: Exception) { false }
                    } ?: false
                    isLate && task.status != "completed"
                }
                else -> true // "all"
            }

            passTab && passStatus
        }
    }

    AppScaffold(
        config = config,
        staffSession = staffSession,
        onNavigate = onNavigate,
        showMenu = true
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(TaskBg)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(16.dp)
            ) {
                // Başlık Alanı
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Görev Yönetimi",
                            color = TextPrimary,
                            fontWeight = FontWeight.Black,
                            fontSize = 22.sp
                        )
                        Text(
                            text = "İş atamaları ve durum takibi",
                            color = TextSecondary,
                            fontSize = 13.sp
                        )
                    }

                    // Yeni Görev FAB/Button
                    Button(
                        onClick = { showCreateDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, tint = Color.White)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Yeni Görev", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 13.sp)
                    }
                }

                // 1. Düzey Sekmeler (Bana Atananlar, Oluşturduklarım, İzlediklerim)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val tabs = listOf(
                        "mine" to "Atananlar",
                        "assigned_by_me" to "Verdiklerim",
                        "watching" to "Gözlemci"
                    )
                    tabs.forEach { (key, label) ->
                        val isSelected = selectedTab == key
                        Card(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { selectedTab = key },
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) AccentBlue.copy(alpha = 0.2f) else CardBg
                            ),
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) AccentBlue else CardBorder
                            )
                        ) {
                            Text(
                                text = label,
                                color = if (isSelected) Color.White else TextSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(vertical = 10.dp).align(Alignment.CenterHorizontally)
                            )
                        }
                    }
                }

                // 2. Düzey Durum Filtreleri (Devam Edenler, Tamamlananlar, Gecikenler, Hepsi)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val filters = listOf(
                        "active" to "Aktif",
                        "completed" to "Biten",
                        "overdue" to "Geciken",
                        "all" to "Tümü"
                    )
                    filters.forEach { (key, label) ->
                        val isSelected = statusFilter == key
                        Card(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { statusFilter = key },
                            shape = RoundedCornerShape(8.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) Color(0xFF334155) else Color(0xFF0F172A)
                            ),
                            border = BorderStroke(1.dp, if (isSelected) TextSecondary else Color(0xFF1E293B))
                        ) {
                            Text(
                                text = label,
                                color = if (isSelected) Color.White else TextSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(vertical = 6.dp).align(Alignment.CenterHorizontally)
                            )
                        }
                    }
                }

                // Liste Alanı
                if (isLoading) {
                    Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = AccentBlue)
                    }
                } else if (filteredTasks.isEmpty()) {
                    Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Bu kriterlere uygun görev bulunamadı.",
                            color = TextSecondary,
                            fontSize = 14.sp
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(filteredTasks, key = { it.id }) { task ->
                            val responsible = remember(task, employees) {
                                val respId = task.participants.find { it.participantType == "assignee" }?.personnelId ?: ""
                                employees.find { it.id == respId }?.getDisplayName() ?: "Belirtilmemiş"
                            }
                            TaskItemCard(
                                task = task,
                                responsibleName = responsible,
                                onClick = { selectedTaskForDetail = task }
                            )
                        }
                    }
                }
            }
        }
    }

    // ─── Detay Modalı / Sayfası ──────────────────────────────────────────────
    if (selectedTaskForDetail != null) {
        val task = selectedTaskForDetail!!
        TaskDetailDialog(
            task = task,
            employees = employees,
            positions = positions,
            branches = branches,
            repo = repo,
            currentUserId = actorId,
            onDismiss = {
                selectedTaskForDetail = null
                refreshTrigger++
            }
        )
    }

    // ─── Yeni Görev Oluşturma Modalı ─────────────────────────────────────────
    if (showCreateDialog) {
        CreateTaskDialog(
            employees = employees,
            positions = positions,
            branches = branches,
            repo = repo,
            currentUserId = actorId,
            currentUserPositionId = remember(actorId, employees) {
                employees.find { it.id == actorId }?.positionId
            },
            currentBranchId = branchId,
            onDismiss = {
                showCreateDialog = false
                refreshTrigger++
            }
        )
    }
}

// ─── Yardımcı Composable Kart Bileşeni ────────────────────────────────────────

@Composable
private fun TaskItemCard(
    task: TaskItem,
    responsibleName: String,
    onClick: () -> Unit
) {
    val (priorityLabel, priorityColor) = remember(task.priority) {
        when (task.priority) {
            "urgent" -> "Kritik" to AccentRed
            "high" -> "Yüksek" to AccentOrange
            "low" -> "Düşük" to TextSecondary
            else -> "Normal" to AccentBlue
        }
    }

    val (statusLabel, statusColor) = remember(task.status) {
        when (task.status) {
            "completed" -> "Tamamlandı" to AccentGreen
            "in_progress" -> "Devam Ediyor" to AccentBlue
            "pending_approval" -> "Onay Bekliyor" to AccentOrange
            "pending_completion_approval" -> "Kapanış Onayında" to AccentOrange
            "not_completed" -> "Tamamlanmadı" to AccentRed
            "rejected" -> "Reddedildi" to AccentRed
            else -> "Açık" to TextSecondary
        }
    }

    val formattedDate = remember(task.dueAt) {
        if (task.dueAt.isNullOrBlank()) "—"
        else {
            try {
                // ISO formatını daha kısa bir gösterime dönüştür: "YYYY-MM-DD"
                task.dueAt.substring(0, 10)
            } catch (_: Exception) { task.dueAt }
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        border = BorderStroke(1.dp, CardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Başlık Satırı (Öncelik + Başlık + Durum)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Öncelik Rozeti
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(priorityColor.copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = priorityLabel,
                        color = priorityColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Durum Göstergesi
                Text(
                    text = statusLabel,
                    color = statusColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Görev Başlığı
            Text(
                text = task.title,
                color = Color.White,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            // Açıklama Özeti
            if (!task.description.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = task.description,
                    color = TextSecondary,
                    fontSize = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = CardBorder)
            Spacer(modifier = Modifier.height(10.dp))

            // Alt Detay Satırı (Sorumlu + Bitiş Tarihi + Checklist)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Sorumlu", color = TextSecondary, fontSize = 10.sp)
                    Text(responsibleName, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text("Bitiş Tarihi", color = TextSecondary, fontSize = 10.sp)
                    Text(formattedDate, color = if (statusLabel == "Geciken") AccentRed else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                if (task.checklistCount > 0) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Kontrol Listesi", color = TextSecondary, fontSize = 10.sp)
                        Text("${task.checklistDoneCount}/${task.checklistCount}", color = AccentGreen, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ─── Detay Penceresi Modülü (Dialog) ──────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskDetailDialog(
    task: TaskItem,
    employees: List<EmployeeInfo>,
    positions: List<PositionInfo>,
    branches: List<BranchInfo>,
    repo: TaskRepository,
    currentUserId: String,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Local states
    var taskStatus by remember { mutableStateOf(task.status) }
    var checklist by remember { mutableStateOf<List<TaskChecklistItem>>(emptyList()) }
    var chatMessages by remember { mutableStateOf<List<TaskChatMessage>>(emptyList()) }
    var approvals by remember { mutableStateOf<List<TaskApprovalRequest>>(emptyList()) }

    var isSubmittingAction by remember { mutableStateOf(false) }

    // Chat states
    var chatInput by remember { mutableStateOf("") }
    var isSendingMsg by remember { mutableStateOf(false) }

    // Verileri yükle
    LaunchedEffect(task.id) {
        checklist = repo.fetchTaskChecklist(task.id)
        chatMessages = repo.fetchTaskChatMessages(task.id)
        approvals = repo.fetchTaskApprovals(task.id)
    }

    val creatorName = remember(task, employees) {
        employees.find { it.id == task.createdByPersonnelId }?.getDisplayName() ?: "Sistem"
    }

    val branchName = remember(task, branches) {
        branches.find { it.id == task.branchNodeId }?.name ?: "Genel Merkez"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(
                    text = task.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color.White
                )
                Text(
                    text = "Konum: $branchName • Oluşturan: $creatorName",
                    color = TextSecondary,
                    fontSize = 11.sp
                )
            }
        },
        text = {
            Surface(
                color = Color.Transparent,
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp)
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // 1) Açıklama
                    if (!task.description.isNullOrBlank()) {
                        item {
                            Column {
                                Text("Açıklama", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    border = BorderStroke(1.dp, CardBorder)
                                ) {
                                    Text(
                                        text = task.description,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(10.dp)
                                    )
                                }
                            }
                        }
                    }

                    // 2) Onay Durumları (Varsa listele)
                    if (approvals.isNotEmpty()) {
                        item {
                            Column {
                                Text("Onay Geçmişi", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    border = BorderStroke(1.dp, CardBorder)
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        approvals.forEach { app ->
                                            val from = employees.find { it.id == app.fromPersonnel }?.getDisplayName() ?: app.fromPersonnel
                                            val to = employees.find { it.id == app.toPersonnel }?.getDisplayName() ?: app.toPersonnel
                                            val stateText = when (app.status) {
                                                "accepted" -> "Kabul Edildi"
                                                "rejected" -> "Reddedildi"
                                                else -> "Bekliyor"
                                            }
                                            Text(
                                                text = "• $from → $to ($stateText)",
                                                color = if (app.status == "accepted") AccentGreen else if (app.status == "rejected") AccentRed else AccentOrange,
                                                fontSize = 11.sp
                                            )
                                            if (!app.reason.isNullOrBlank()) {
                                                Text(text = "  Neden: ${app.reason}", color = TextSecondary, fontSize = 11.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 3) Kontrol Listesi
                    if (checklist.isNotEmpty()) {
                        item {
                            Text("Kontrol Listesi", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        items(checklist, key = { it.id }) { item ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        scope.launch {
                                            val success = repo.updateChecklistItem(item.id, !item.isDone)
                                            if (success) {
                                                checklist = checklist.map {
                                                    if (it.id == item.id) it.copy(isDone = !item.isDone) else it
                                                }
                                            }
                                        }
                                    },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = item.isDone,
                                    onCheckedChange = { checked ->
                                        scope.launch {
                                            val success = repo.updateChecklistItem(item.id, checked)
                                            if (success) {
                                                checklist = checklist.map {
                                                    if (it.id == item.id) it.copy(isDone = checked) else it
                                                }
                                            }
                                        }
                                    },
                                    colors = CheckboxDefaults.colors(
                                        checkedColor = AccentGreen,
                                        uncheckedColor = CardBorder
                                    )
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = item.text,
                                    color = if (item.isDone) TextSecondary else Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }

                    // 4) Durum Eylemleri (FAB/Butonlar)
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Görev Durum Eylemleri", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                // Görevi Başlat (Status = open/rejected ise)
                                if (taskStatus == "open" || taskStatus == "rejected") {
                                    Button(
                                        onClick = {
                                            isSubmittingAction = true
                                            scope.launch {
                                                val success = repo.updateTaskStatus(task.id, "in_progress")
                                                if (success) {
                                                    taskStatus = "in_progress"
                                                    Toast.makeText(context, "Göreve başlandı", Toast.LENGTH_SHORT).show()
                                                }
                                                isSubmittingAction = false
                                            }
                                        },
                                        modifier = Modifier.weight(1f),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentBlue),
                                        enabled = !isSubmittingAction,
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Text("Görevi Başlat", fontWeight = FontWeight.Bold)
                                    }
                                }

                                // Görevi Tamamla (Status = in_progress ise)
                                if (taskStatus == "in_progress") {
                                    Button(
                                        onClick = {
                                            isSubmittingAction = true
                                            scope.launch {
                                                // Eğer onay gerekiyorsa completion_approval'a gönder, yoksa direkt complete yap
                                                val nextState = if (task.approvalRequired) "pending_completion_approval" else "completed"
                                                val success = repo.updateTaskStatus(task.id, nextState)
                                                if (success) {
                                                    taskStatus = nextState
                                                    Toast.makeText(
                                                        context, 
                                                        if (task.approvalRequired) "Kapanış onayına gönderildi" else "Görev tamamlandı", 
                                                        Toast.LENGTH_SHORT
                                                    ).show()
                                                }
                                                isSubmittingAction = false
                                            }
                                        },
                                        modifier = Modifier.weight(1f),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentGreen),
                                        enabled = !isSubmittingAction,
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Text("Tamamlandı Olarak İşaretle", fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }

                    // 5) Sohbet & Notlar (Chat)
                    item {
                        Text("Notlar & Tartışma", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    if (chatMessages.isEmpty()) {
                        item {
                            Text(
                                "Henüz eklenmiş bir not bulunmamaktadır.",
                                color = TextSecondary,
                                fontSize = 12.sp,
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            )
                        }
                    } else {
                        items(chatMessages, key = { it.id }) { msg ->
                            val isSystem = msg.messageType == "system"
                            val isMe = msg.senderId == currentUserId

                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = if (isSystem) Alignment.CenterHorizontally else if (isMe) Alignment.End else Alignment.Start
                            ) {
                                if (isSystem) {
                                    // Sistem Mesajı
                                    Card(
                                        colors = CardDefaults.cardColors(containerColor = Color(0xFF334155).copy(alpha = 0.4f)),
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.padding(vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = msg.body ?: "",
                                            color = TextSecondary,
                                            fontSize = 11.sp,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                } else {
                                    // Kullanıcı Mesajı
                                    val sender = employees.find { it.id == msg.senderId }?.getDisplayName() ?: "Bilinmeyen Personel"
                                    if (!isMe) {
                                        Text(sender, color = TextSecondary, fontSize = 10.sp, modifier = Modifier.padding(start = 4.dp))
                                    }
                                    Card(
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (isMe) AccentBlue else Color(0xFF1E293B)
                                        ),
                                        shape = RoundedCornerShape(12.dp),
                                        border = if (isMe) null else BorderStroke(1.dp, CardBorder),
                                        modifier = Modifier.padding(vertical = 4.dp).widthIn(max = 240.dp)
                                    ) {
                                        Text(
                                            text = msg.body ?: "",
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            modifier = Modifier.padding(10.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Mesaj Yazma Alanı
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = chatInput,
                                onValueChange = { chatInput = it },
                                placeholder = { Text("Bir mesaj veya not yazın...", fontSize = 12.sp) },
                                modifier = Modifier.weight(1f),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = AccentBlue,
                                    unfocusedBorderColor = CardBorder,
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                ),
                                shape = RoundedCornerShape(12.dp),
                                maxLines = 3
                            )

                            Spacer(modifier = Modifier.width(8.dp))

                            IconButton(
                                onClick = {
                                    if (chatInput.isBlank() || isSendingMsg) return@IconButton
                                    isSendingMsg = true
                                    scope.launch {
                                        val success = repo.addChatMessage(task.id, currentUserId, chatInput)
                                        if (success) {
                                            chatInput = ""
                                            // Mesajları yenile
                                            chatMessages = repo.fetchTaskChatMessages(task.id)
                                        }
                                        isSendingMsg = false
                                    }
                                },
                                enabled = chatInput.isNotBlank() && !isSendingMsg,
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(if (chatInput.isNotBlank()) AccentBlue else Color(0xFF1E293B))
                            ) {
                                Icon(Icons.Default.Send, contentDescription = null, tint = Color.White)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Kapat", color = TextSecondary)
            }
        },
        containerColor = Color(0xFF1E293B)
    )
}

// ─── Görev Oluşturma Penceresi Modülü (Dialog) ────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateTaskDialog(
    employees: List<EmployeeInfo>,
    positions: List<PositionInfo>,
    branches: List<BranchInfo>,
    repo: TaskRepository,
    currentUserId: String,
    currentUserPositionId: String?,
    currentBranchId: String,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Form inputs
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var responsibleId by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf("normal") }
    var locationId by remember { mutableStateOf(currentBranchId) }
    var dueDate by remember { mutableStateOf("") }

    // Checklist creation
    var checklistInputs by remember { mutableStateOf(listOf("")) }

    // Dropdowns triggers
    var respExpanded by remember { mutableStateOf(false) }
    var priorityExpanded by remember { mutableStateOf(false) }
    var branchExpanded by remember { mutableStateOf(false) }

    var isCreating by remember { mutableStateOf(false) }

    // Date picker setup
    val calendar = Calendar.getInstance()
    val datePickerDialog = DatePickerDialog(
        context,
        { _, year, month, dayOfMonth ->
            // Format YYYY-MM-DD
            dueDate = String.format("%04d-%02d-%02d", year, month + 1, dayOfMonth)
        },
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH),
        calendar.get(Calendar.DAY_OF_MONTH)
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Yeni Görev Oluştur", fontWeight = FontWeight.Bold, color = Color.White) },
        text = {
            Surface(
                color = Color.Transparent,
                modifier = Modifier.fillMaxWidth().heightIn(max = 440.dp)
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // 1) Görev Adı
                    item {
                        OutlinedTextField(
                            value = title,
                            onValueChange = { title = it },
                            label = { Text("Görev Başlığı") },
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = CardBorder
                            ),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }

                    // 2) Görev Açıklaması
                    item {
                        OutlinedTextField(
                            value = description,
                            onValueChange = { description = it },
                            label = { Text("Açıklama") },
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = CardBorder
                            ),
                            shape = RoundedCornerShape(10.dp),
                            maxLines = 4
                        )
                    }

                    // 3) Sorumlu Seçimi (Dropdown)
                    item {
                        Box(modifier = Modifier.fillMaxWidth()) {
                            val selectedName = employees.find { it.id == responsibleId }?.getDisplayName() ?: "Seçiniz..."
                            OutlinedTextField(
                                value = selectedName,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Sorumlu Personel") },
                                trailingIcon = {
                                    IconButton(onClick = { respExpanded = !respExpanded }) {
                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().clickable { respExpanded = !respExpanded },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = AccentBlue,
                                    unfocusedBorderColor = CardBorder
                                ),
                                shape = RoundedCornerShape(10.dp)
                            )

                            DropdownMenu(
                                expanded = respExpanded,
                                onDismissRequest = { respExpanded = false }
                            ) {
                                employees.forEach { emp ->
                                    DropdownMenuItem(
                                        text = { Text(emp.getDisplayName()) },
                                        onClick = {
                                            responsibleId = emp.id
                                            respExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // 4) Öncelik Seçimi (Dropdown)
                    item {
                        Box(modifier = Modifier.fillMaxWidth()) {
                            val priorityLabel = when (priority) {
                                "urgent" -> "Kritik"
                                "high" -> "Yüksek"
                                "low" -> "Düşük"
                                else -> "Normal"
                            }
                            OutlinedTextField(
                                value = priorityLabel,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Öncelik") },
                                trailingIcon = {
                                    IconButton(onClick = { priorityExpanded = !priorityExpanded }) {
                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().clickable { priorityExpanded = !priorityExpanded },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = AccentBlue,
                                    unfocusedBorderColor = CardBorder
                                ),
                                shape = RoundedCornerShape(10.dp)
                            )

                            DropdownMenu(
                                expanded = priorityExpanded,
                                onDismissRequest = { priorityExpanded = false }
                            ) {
                                val opts = listOf("low" to "Düşük", "normal" to "Normal", "high" to "Yüksek", "urgent" to "Kritik")
                                opts.forEach { (valKey, valLabel) ->
                                    DropdownMenuItem(
                                        text = { Text(valLabel) },
                                        onClick = {
                                            priority = valKey
                                            priorityExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // 5) Şube / Lokasyon Seçimi
                    item {
                        Box(modifier = Modifier.fillMaxWidth()) {
                            val branchName = branches.find { it.id == locationId }?.name ?: "Merkez"
                            OutlinedTextField(
                                value = branchName,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Görev Lokasyonu") },
                                trailingIcon = {
                                    IconButton(onClick = { branchExpanded = !branchExpanded }) {
                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().clickable { branchExpanded = !branchExpanded },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = AccentBlue,
                                    unfocusedBorderColor = CardBorder
                                ),
                                shape = RoundedCornerShape(10.dp)
                            )

                            DropdownMenu(
                                expanded = branchExpanded,
                                onDismissRequest = { branchExpanded = false }
                            ) {
                                branches.forEach { br ->
                                    DropdownMenuItem(
                                        text = { Text(br.name) },
                                        onClick = {
                                            locationId = br.id
                                            branchExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // 6) Bitiş Tarihi
                    item {
                        OutlinedTextField(
                            value = dueDate,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Bitiş Tarihi") },
                            trailingIcon = {
                                IconButton(onClick = { datePickerDialog.show() }) {
                                    Icon(Icons.Default.CalendarMonth, null, tint = Color.White)
                                }
                            },
                            modifier = Modifier.fillMaxWidth().clickable { datePickerDialog.show() },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = CardBorder
                            ),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }

                    // 7) Kontrol Listesi Oluşturma
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Kontrol Listesi", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            IconButton(onClick = { checklistInputs = checklistInputs + "" }) {
                                Icon(Icons.Default.AddCircle, null, tint = AccentGreen)
                            }
                        }
                    }

                    items(checklistInputs.size) { index ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = checklistInputs[index],
                                onValueChange = { newVal ->
                                    checklistInputs = checklistInputs.toMutableList().apply { set(index, newVal) }
                                },
                                placeholder = { Text("Kontrol maddesi yazın...", fontSize = 12.sp) },
                                modifier = Modifier.weight(1f),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = AccentBlue,
                                    unfocusedBorderColor = CardBorder
                                ),
                                shape = RoundedCornerShape(8.dp)
                            )
                            if (checklistInputs.size > 1) {
                                Spacer(modifier = Modifier.width(6.dp))
                                IconButton(onClick = {
                                    checklistInputs = checklistInputs.toMutableList().apply { removeAt(index) }
                                }) {
                                    Icon(Icons.Default.Delete, null, tint = AccentRed)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (title.isBlank() || responsibleId.isBlank() || locationId.isBlank() || dueDate.isBlank()) {
                        Toast.makeText(context, "Lütfen gerekli alanları (Başlık, Sorumlu, Tarih) doldurun", Toast.LENGTH_SHORT).show()
                        return@Button
                    }

                    isCreating = true
                    scope.launch {
                        val resp = employees.find { it.id == responsibleId }
                        val assigneePositionId = resp?.positionId

                        val success = repo.createTask(
                            title = title,
                            description = description,
                            responsibleId = responsibleId,
                            priority = priority,
                            dueAt = dueDate + "T23:59:59.000Z", // Günü sonuna tamamla
                            branchNodeId = locationId,
                            creatorId = currentUserId,
                            creatorPositionId = currentUserPositionId,
                            assigneePositionId = assigneePositionId,
                            positions = positions,
                            checklistItems = checklistInputs
                        )

                        if (success) {
                            Toast.makeText(context, "Görev başarıyla oluşturuldu", Toast.LENGTH_SHORT).show()
                            onDismiss()
                        } else {
                            Toast.makeText(context, "Görev oluşturulamadı", Toast.LENGTH_SHORT).show()
                        }
                        isCreating = false
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                enabled = !isCreating,
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isCreating) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                } else {
                    Text("Görev Oluştur", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isCreating) {
                Text("Vazgeç", color = TextSecondary)
            }
        },
        containerColor = Color(0xFF1E293B)
    )
}

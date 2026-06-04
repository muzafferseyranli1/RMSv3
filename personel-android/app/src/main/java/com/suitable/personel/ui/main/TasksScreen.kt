package com.suitable.personel.ui.main

import android.app.DatePickerDialog
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
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
private val AccentPurple = Color(0xFF8B5CF6)

// Modal renk ayrımı için
private val DetailDialogBg = Color(0xFF0F2847)   // Mavi tonu → Detay modalı
private val CreateDialogBg = Color(0xFF1A0F2E)   // Mor tonu → Oluşturma modalı
private val SelectDialogBg = Color(0xFF0D1F12)   // Yeşil tonu → Seçim modalı

private fun parseFormIdAndCleanDescription(description: String?): Pair<String?, String?> {
    if (description.isNullOrBlank()) return Pair(null, null)
    val pattern = java.util.regex.Pattern.compile("\\[Form ID:\\s*([^\\]]+)\\]")
    val matcher = pattern.matcher(description)
    return if (matcher.find()) {
        val formId = matcher.group(1)?.trim()
        val cleaned = matcher.replaceAll("").replace(Regex("\n{2,}$"), "").trim()
        Pair(formId, cleaned)
    } else {
        Pair(null, description)
    }
}

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
    var formTemplates by remember { mutableStateOf<List<FormTemplateInfo>>(emptyList()) }

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

                // Şablonlar
                formTemplates = repo.fetchFormTemplates()

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
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) AccentOrange.copy(alpha = 0.2f) else CardBg
                            ),
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) AccentOrange else CardBorder
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

                // Tasks List
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(top = 12.dp)
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            color = AccentOrange,
                            modifier = Modifier.align(Alignment.Center)
                        )
                    } else if (filteredTasks.isEmpty()) {
                        Text(
                            text = "Herhangi bir görev bulunamadı.",
                            color = TextSecondary,
                            modifier = Modifier.align(Alignment.Center),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(filteredTasks, key = { it.id }) { task ->
                                val responsibleName = remember(task, employees) {
                                    val assignees = task.participants.filter { it.participantType == "assignee" }
                                    if (assignees.isNotEmpty()) {
                                        assignees.map { a ->
                                            employees.find { it.id == a.personnelId }?.getDisplayName() ?: "Personel"
                                        }.joinToString(", ")
                                    } else {
                                        "Belirtilmedi"
                                    }
                                }
                                TaskItemCard(
                                    task = task,
                                    responsibleName = responsibleName,
                                    onClick = { selectedTaskForDetail = task }
                                )
                            }
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
            formTemplates = formTemplates,
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
            formTemplates = formTemplates,
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
            val cleanedDesc = remember(task.description) {
                parseFormIdAndCleanDescription(task.description).second
            }
            if (!cleanedDesc.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = cleanedDesc,
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

            // Tekrarlayan görev rozeti
            if (task.isRecurring) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        tint = AccentPurple,
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Tekrarlayan Görev",
                        color = AccentPurple,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
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
    formTemplates: List<FormTemplateInfo>,
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
    var attachments by remember { mutableStateOf<List<TaskAttachment>>(emptyList()) }

    // Form detail states
    var showFormDetailDialog by remember { mutableStateOf(false) }
    var formSubmissionDetail by remember { mutableStateOf<FormSubmissionDetail?>(null) }
    var isFormDetailLoading by remember { mutableStateOf(false) }

    // Dialog action visibility states
    var showSendBackDialog by remember { mutableStateOf(false) }
    var showDelegateDialog by remember { mutableStateOf(false) }
    var showPasifeAlConfirmation by remember { mutableStateOf(false) }

    var isSubmittingAction by remember { mutableStateOf(false) }

    // Chat states
    var chatInput by remember { mutableStateOf("") }
    var isSendingMsg by remember { mutableStateOf(false) }

    // Verileri yükle
    LaunchedEffect(task.id) {
        checklist = repo.fetchTaskChecklist(task.id)
        chatMessages = repo.fetchTaskChatMessages(task.id)
        approvals = repo.fetchTaskApprovals(task.id)
        attachments = repo.fetchTaskAttachments(task.id)
    }

    val creatorName = remember(task, employees) {
        employees.find { it.id == task.createdByPersonnelId }?.getDisplayName() ?: "Sistem"
    }

    val branchName = remember(task, branches) {
        branches.find { it.id == task.branchNodeId }?.name ?: "Genel Merkez"
    }

    val parsedDesc = remember(task.description) {
        parseFormIdAndCleanDescription(task.description)
    }
    val formId = parsedDesc.first
    val cleanedDescription = parsedDesc.second

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        title = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = task.title,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = Color.White,
                        modifier = Modifier.weight(1f)
                    )
                    // Mavi şerit — detay diyalogu göstergesi
                    Box(
                        modifier = Modifier
                            .width(4.dp)
                            .height(28.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(AccentBlue)
                    )
                }
                Text(
                    text = "📋 Görev Detayı  •  $branchName  •  $creatorName",
                    color = AccentBlue.copy(alpha = 0.7f),
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
                    if (!cleanedDescription.isNullOrBlank()) {
                        item {
                            Column {
                                Text("Açıklama", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    border = BorderStroke(1.dp, CardBorder)
                                ) {
                                    Text(
                                        text = cleanedDescription,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(10.dp)
                                    )
                                }
                            }
                        }
                    }

                    // 1.2) İlişkili Form Yanıtı Butonu
                    if (!formId.isNullOrBlank()) {
                        item {
                            Button(
                                onClick = {
                                    isFormDetailLoading = true
                                    scope.launch {
                                        val detail = repo.fetchFormSubmissionDetail(formId)
                                        formSubmissionDetail = detail
                                        isFormDetailLoading = false
                                        if (detail != null) {
                                            showFormDetailDialog = true
                                        } else {
                                            Toast.makeText(context, "Form detayları yüklenemedi", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = AccentPurple),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isFormDetailLoading
                            ) {
                                if (isFormDetailLoading) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                } else {
                                    Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("İlişkili Form Yanıtını Göster", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }

                    // 1.3) Ekler Listesi
                    if (attachments.isNotEmpty()) {
                        item {
                            Column {
                                Text("Ekler (${attachments.size})", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    border = BorderStroke(1.dp, CardBorder)
                                ) {
                                    Column(
                                        modifier = Modifier.padding(10.dp).fillMaxWidth(),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        attachments.forEach { att ->
                                            val isImage = att.attachmentType == "image" || att.attachmentType == "closure_image" || att.mimeType?.startsWith("image/") == true
                                            if (isImage) {
                                                val imageUrl = ApiClient.resolveImageUrl(att.fileUrl)
                                                Column(modifier = Modifier.fillMaxWidth()) {
                                                    Text(
                                                        text = att.fileName ?: "Görsel Ek",
                                                        color = TextSecondary,
                                                        fontSize = 11.sp,
                                                        modifier = Modifier.padding(bottom = 4.dp)
                                                    )
                                                    AsyncImage(
                                                        model = imageUrl,
                                                        contentDescription = att.fileName,
                                                        contentScale = ContentScale.Crop,
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .height(140.dp)
                                                            .clip(RoundedCornerShape(8.dp))
                                                            .border(1.dp, CardBorder, RoundedCornerShape(8.dp))
                                                            .clickable {
                                                                try {
                                                                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(imageUrl))
                                                                    context.startActivity(intent)
                                                                } catch (e: Exception) {
                                                                    Toast.makeText(context, "Bağlantı açılamadı", Toast.LENGTH_SHORT).show()
                                                                }
                                                            }
                                                    )
                                                }
                                            } else {
                                                val fileUrl = ApiClient.resolveImageUrl(att.fileUrl)
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clip(RoundedCornerShape(8.dp))
                                                        .background(CardBg)
                                                        .border(1.dp, CardBorder, RoundedCornerShape(8.dp))
                                                        .clickable {
                                                            try {
                                                                val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(fileUrl))
                                                                context.startActivity(intent)
                                                            } catch (e: Exception) {
                                                                Toast.makeText(context, "Bağlantı açılamadı", Toast.LENGTH_SHORT).show()
                                                            }
                                                        }
                                                        .padding(10.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Attachment,
                                                        contentDescription = null,
                                                        tint = AccentBlue,
                                                        modifier = Modifier.size(18.dp)
                                                    )
                                                    Spacer(modifier = Modifier.width(8.dp))
                                                    Text(
                                                        text = att.fileName ?: "Dosya Eki",
                                                        color = Color.White,
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Medium,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                        modifier = Modifier.weight(1f)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 1.5) Görev Meta Bilgileri (Tekrarlama, Kurallar)
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF0A1628)),
                            border = BorderStroke(1.dp, AccentBlue.copy(alpha = 0.3f))
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Görev Bilgileri", color = AccentBlue, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(2.dp))
                                val rows = buildList {
                                    if (task.startAt != null) add("Başlangıç" to task.startAt.take(10))
                                    if (task.dueAt != null) add("Bitiş" to task.dueAt.take(10))
                                    add("Öncelik" to when (task.priority) {
                                        "urgent" -> "🔴 Kritik"
                                        "high" -> "🟠 Yüksek"
                                        "low" -> "⬇️ Düşük"
                                        else -> "🔵 Normal"
                                    })
                                    if (task.isRecurring) add("Tekrar" to "✅ Tekrarlayan Görev")
                                    if (task.approvalRequired) add("Onay" to "✅ Kapanış Onayı Gerekli")
                                    if (task.closureSummaryRequired) add("Özet" to "✅ Kapanışta Özet Zorunlu")
                                    if (task.closureImageRequired) add("Görsel" to "✅ Kapanışta Görsel Zorunlu")
                                    if (task.closureFileRequired) add("Dosya" to "✅ Kapanışta Dosya Zorunlu")
                                }
                                rows.forEach { (label, value) ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(label, color = TextSecondary, fontSize = 11.sp)
                                        Text(value, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                    }
                                }
                            }
                        }
                    }

                    // 2) Görev Formu Şablonu
                    if (!task.formTemplateId.isNullOrBlank()) {
                        val tName = formTemplates.find { it.id == task.formTemplateId }?.name ?: "Şablon"
                        item {
                            Column {
                                Text("Görev Formu", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    border = BorderStroke(1.dp, CardBorder)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(tName, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Button(
                                            onClick = {
                                                Toast.makeText(context, "$tName Formu açılıyor...", Toast.LENGTH_SHORT).show()
                                            },
                                            colors = ButtonDefaults.buttonColors(containerColor = AccentBlue),
                                            shape = RoundedCornerShape(8.dp),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                        ) {
                                            Text("Doldur", fontSize = 11.sp)
                                        }
                                    }
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
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("Görev Durum Eylemleri", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)

                            val hasPrimaryAction = taskStatus == "open" || taskStatus == "rejected" || taskStatus == "in_progress" || (taskStatus == "soft_deleted" && task.createdByPersonnelId == currentUserId)
                            if (hasPrimaryAction) {
                                Row(modifier = Modifier.fillMaxWidth()) {
                                    // Görevi Başlat
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
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = ButtonDefaults.buttonColors(containerColor = AccentBlue),
                                            enabled = !isSubmittingAction,
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Text("Görevi Başlat", fontWeight = FontWeight.Bold)
                                        }
                                    }

                                    // Görevi Tamamla
                                    if (taskStatus == "in_progress") {
                                        Button(
                                            onClick = {
                                                isSubmittingAction = true
                                                scope.launch {
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
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = ButtonDefaults.buttonColors(containerColor = AccentGreen),
                                            enabled = !isSubmittingAction,
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Text("Tamamlandı Olarak İşaretle", fontWeight = FontWeight.Bold)
                                        }
                                    }

                                    // Görevi Aktifleştir
                                    if (taskStatus == "soft_deleted" && task.createdByPersonnelId == currentUserId) {
                                        Button(
                                            onClick = {
                                                isSubmittingAction = true
                                                scope.launch {
                                                    val success = repo.restoreTask(task.id, currentUserId)
                                                    if (success) {
                                                        taskStatus = "open"
                                                        Toast.makeText(context, "Görev aktif hale getirildi", Toast.LENGTH_SHORT).show()
                                                    }
                                                    isSubmittingAction = false
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = ButtonDefaults.buttonColors(containerColor = AccentGreen),
                                            enabled = !isSubmittingAction,
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Text("Görevi Aktifleştir", fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }

                            // Secondary Actions Row: Geri Gönder, Delege Et, Pasife Al
                            val showSecondaryActions = taskStatus != "completed" && taskStatus != "cancelled" && taskStatus != "soft_deleted"
                            if (showSecondaryActions) {
                                val showSendBack = true
                                val showDelegate = task.delegationAllowed
                                val showPasifeAl = task.createdByPersonnelId == currentUserId

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    if (showSendBack) {
                                        OutlinedButton(
                                            onClick = { showSendBackDialog = true },
                                            modifier = Modifier.weight(1f),
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                            border = BorderStroke(1.dp, AccentOrange),
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(vertical = 8.dp)
                                        ) {
                                            Text("Geri Gönder", fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                        }
                                    }
                                    if (showDelegate) {
                                        OutlinedButton(
                                            onClick = { showDelegateDialog = true },
                                            modifier = Modifier.weight(1f),
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                            border = BorderStroke(1.dp, AccentPurple),
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(vertical = 8.dp)
                                        ) {
                                            Text("Delege Et", fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                        }
                                    }
                                    if (showPasifeAl) {
                                        OutlinedButton(
                                            onClick = { showPasifeAlConfirmation = true },
                                            modifier = Modifier.weight(1f),
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                            border = BorderStroke(1.dp, AccentRed),
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(vertical = 8.dp)
                                        ) {
                                            Text("Pasife Al", fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 5) Sohhet & Notlar (Chat)
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
                            ) {
                                Icon(Icons.Default.Send, contentDescription = null, tint = Color.White)
                            }
                        }
                    }
                }
            }
        },
        containerColor = DetailDialogBg
    )

    if (showFormDetailDialog) {
        formSubmissionDetail?.let { detail ->
            FormDetailDialog(
                detail = detail,
                onDismiss = { showFormDetailDialog = false }
            )
        }
    }

    if (showSendBackDialog) {
        var reasonText by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showSendBackDialog = false },
            title = { Text("Geri Gönderme Gerekçesi", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                OutlinedTextField(
                    value = reasonText,
                    onValueChange = { reasonText = it },
                    placeholder = { Text("Lütfen iade gerekçesini buraya yazın...", fontSize = 12.sp) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = AccentOrange,
                        unfocusedBorderColor = CardBorder
                    ),
                    shape = RoundedCornerShape(10.dp),
                    maxLines = 4
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (reasonText.trim().isBlank()) {
                            Toast.makeText(context, "Gerekçe alanı boş olamaz", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        isSubmittingAction = true
                        scope.launch {
                            val success = repo.sendBackTask(task.id, currentUserId, reasonText, task.createdByPersonnelId)
                            if (success) {
                                taskStatus = "rejected"
                                showSendBackDialog = false
                                Toast.makeText(context, "Görev iade edildi", Toast.LENGTH_SHORT).show()
                                chatMessages = repo.fetchTaskChatMessages(task.id)
                            }
                            isSubmittingAction = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !isSubmittingAction
                ) {
                    Text("Geri Gönder", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showSendBackDialog = false }) {
                    Text("İptal", color = TextSecondary)
                }
            },
            containerColor = DetailDialogBg
        )
    }

    if (showPasifeAlConfirmation) {
        AlertDialog(
            onDismissRequest = { showPasifeAlConfirmation = false },
            title = { Text("Görevi Pasife Al", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = { Text("Bu görevi pasife almak istediğinize emin misiniz?", color = Color.White, fontSize = 13.sp) },
            confirmButton = {
                Button(
                    onClick = {
                        isSubmittingAction = true
                        scope.launch {
                            val success = repo.softDeleteTask(task.id, currentUserId)
                            if (success) {
                                taskStatus = "soft_deleted"
                                showPasifeAlConfirmation = false
                                Toast.makeText(context, "Görev pasife alındı", Toast.LENGTH_SHORT).show()
                                chatMessages = repo.fetchTaskChatMessages(task.id)
                            }
                            isSubmittingAction = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentRed),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !isSubmittingAction
                ) {
                    Text("Evet, Pasife Al", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showPasifeAlConfirmation = false }) {
                    Text("İptal", color = TextSecondary)
                }
            },
            containerColor = DetailDialogBg
        )
    }

    if (showDelegateDialog) {
        AlertDialog(
            onDismissRequest = { showDelegateDialog = false },
            title = { Text("Görevi Delege Et", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                Surface(
                    color = Color.Transparent,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp)
                ) {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val assignablePeople = employees.filter { it.id != currentUserId }
                        items(assignablePeople) { emp ->
                            Card(
                                colors = CardDefaults.cardColors(containerColor = CardBg),
                                border = BorderStroke(1.dp, CardBorder),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        isSubmittingAction = true
                                        scope.launch {
                                            val fromEmployee = employees.find { it.id == currentUserId }
                                            val success = repo.delegateTask(
                                                taskId = task.id,
                                                fromPersonnelId = currentUserId,
                                                toPersonnelId = emp.id,
                                                fromPositionId = fromEmployee?.positionId,
                                                toPositionId = emp.positionId,
                                                positions = positions
                                            )
                                            if (success) {
                                                showDelegateDialog = false
                                                Toast.makeText(context, "Delege talebi gönderildi", Toast.LENGTH_SHORT).show()
                                                chatMessages = repo.fetchTaskChatMessages(task.id)
                                            }
                                            isSubmittingAction = false
                                        }
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = AccentPurple)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = emp.getDisplayName(),
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showDelegateDialog = false }) {
                    Text("İptal", color = TextSecondary)
                }
            },
            containerColor = DetailDialogBg
        )
    }
}

@Composable
private fun PillBadge(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(99.dp))
            .background(Color.White.copy(alpha = 0.06f))
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(99.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(11.dp))
        Text(text, color = Color.White.copy(alpha = 0.7f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FormDetailDialog(
    detail: FormSubmissionDetail,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    val metadataMap = remember(detail.metadata) {
        try {
            ApiClient.gson.fromJson(detail.metadata ?: "{}", Map::class.java) as? Map<String, Any>
        } catch (e: Exception) { null }
    }
    val branchName = metadataMap?.get("branch_name")?.toString() ?: "İlgili Şube"
    val formDate = metadataMap?.get("form_date")?.toString()
    val startTime = metadataMap?.get("start_time")?.toString()
    val endTime = metadataMap?.get("end_time")?.toString()

    val answers = remember(detail.answersJson) {
        try {
            val list = ApiClient.gson.fromJson(detail.answersJson, List::class.java) as? List<Map<String, Any?>>
            list ?: emptyList()
        } catch (e: Exception) { emptyList() }
    }
    val schemaMap = remember(detail.templateSchemaJson) {
        try {
            ApiClient.gson.fromJson(detail.templateSchemaJson ?: "{}", Map::class.java) as? Map<String, Any>
        } catch (e: Exception) { null }
    }
    val sections = remember(schemaMap) {
        val rawSections = schemaMap?.get("sections") as? List<Map<String, Any?>>
        rawSections ?: emptyList()
    }
    val failedCriticalFields = remember(metadataMap) {
        val list = metadataMap?.get("failed_critical_fields") as? List<Map<String, Any?>>
        list?.map { it["id"]?.toString() ?: "" }?.toSet() ?: emptySet()
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            // Hero Header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFF2E1A47), Color(0xFF130A24))))
                    .padding(vertical = 16.dp, horizontal = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF8B5CF6).copy(alpha = 0.15f))
                            .border(2.dp, Color(0xFF8B5CF6), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.NotificationsActive,
                            contentDescription = null,
                            tint = Color(0xFF8B5CF6),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = detail.templateTitle?.uppercase() ?: "BİLDİRİM FORMU",
                            color = Color(0xFF8B5CF6),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                        Text(
                            text = branchName,
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            val dateStr = formDate ?: detail.createdAt.take(10)
                            PillBadge(icon = Icons.Default.CalendarToday, text = dateStr)
                            if (!startTime.isNullOrBlank()) {
                                val timeText = if (!endTime.isNullOrBlank()) "$startTime – $endTime" else startTime
                                PillBadge(icon = Icons.Default.Schedule, text = timeText)
                            }
                            if (detail.completionTimeSeconds != null) {
                                PillBadge(icon = Icons.Default.HourglassEmpty, text = "${detail.completionTimeSeconds / 60} dk")
                            }
                        }
                    }
                }
            }
        },
        text = {
            Surface(
                color = Color.Transparent,
                modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Kanıt Fotoğrafları
                    if (detail.photos.isNotEmpty()) {
                        item {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = "📷 FOTOĞRAFLAR (${detail.photos.size})",
                                    color = TextSecondary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(bottom = 6.dp)
                                )
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    border = BorderStroke(1.dp, CardBorder),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    androidx.compose.foundation.lazy.LazyRow(
                                        contentPadding = PaddingValues(8.dp),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        items(detail.photos) { photo ->
                                            val imageUrl = ApiClient.resolveImageUrl(photo.fileUrl) ?: ""
                                            AsyncImage(
                                                model = imageUrl,
                                                contentDescription = "Kanıt Görseli",
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier
                                                    .size(90.dp)
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .border(1.dp, CardBorder, RoundedCornerShape(8.dp))
                                                    .clickable {
                                                        try {
                                                            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(imageUrl))
                                                            context.startActivity(intent)
                                                        } catch (e: Exception) {
                                                            Toast.makeText(context, "Görsel açılamadı", Toast.LENGTH_SHORT).show()
                                                        }
                                                    }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Soru & Yanıt Listesi
                    if (sections.isNotEmpty()) {
                        sections.forEachIndexed { sIdx, section ->
                            val sectionId = section["id"]?.toString() ?: ""
                            val sectionTitle = section["title"]?.toString() ?: "Bölüm"
                            val fields = section["fields"] as? List<Map<String, Any?>> ?: emptyList()
                            if (fields.isNotEmpty()) {
                                item {
                                    Column(modifier = Modifier.fillMaxWidth()) {
                                        Text(
                                            text = "${sIdx + 1}. $sectionTitle",
                                            color = AccentPurple,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(bottom = 6.dp)
                                        )
                                        Card(
                                            colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                            border = BorderStroke(1.dp, CardBorder),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(modifier = Modifier.fillMaxWidth()) {
                                                fields.forEachIndexed { fIdx, field ->
                                                    val fieldId = field["id"]?.toString() ?: ""
                                                    val fieldLabel = field["label"]?.toString() ?: ""
                                                    val fieldType = field["type"]?.toString() ?: ""
                                                    val isCritical = field["is_critical"] == true

                                                    val ans = answers.find { it["field_id"]?.toString() == fieldId }
                                                    val ansVal = ans?.get("value")
                                                    val ansNote = ans?.get("note")?.toString()

                                                    val isAnsNegative = failedCriticalFields.contains(fieldId)

                                                    val displayValue = when (ansVal) {
                                                        null -> "—"
                                                        true -> "Evet"
                                                        false -> "Hayır"
                                                        else -> {
                                                            if (fieldType == "stock_item_select" || fieldType == "sale_item_select" || fieldType == "semi_product_select") {
                                                                val itemsList = try {
                                                                    if (ansVal is String) {
                                                                        ApiClient.gson.fromJson(ansVal, List::class.java) as? List<*>
                                                                    } else ansVal as? List<*>
                                                                } catch (e: Exception) { null }

                                                                itemsList?.mapNotNull { item ->
                                                                    when (item) {
                                                                        is Map<*, *> -> item["name"]?.toString() ?: item["id"]?.toString()
                                                                        else -> item?.toString()
                                                                    }
                                                                }?.joinToString(", ") ?: ansVal.toString()
                                                            } else {
                                                                ansVal.toString()
                                                            }
                                                        }
                                                    }

                                                    if (fIdx > 0) {
                                                        HorizontalDivider(color = CardBorder)
                                                    }

                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .background(if (isAnsNegative) Color(0xFFEF4444).copy(alpha = 0.05f) else Color.Transparent)
                                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                                if (isCritical) {
                                                                    Box(
                                                                        modifier = Modifier
                                                                            .clip(RoundedCornerShape(4.dp))
                                                                            .background(Color(0xFFEF4444).copy(alpha = 0.15f))
                                                                            .padding(horizontal = 4.dp, vertical = 1.dp)
                                                                    ) {
                                                                        Text("KRİTİK", color = Color(0xFFEF4444), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                                                    }
                                                                    Spacer(modifier = Modifier.width(6.dp))
                                                                }
                                                                Text(
                                                                    text = fieldLabel,
                                                                    color = Color.White,
                                                                    fontSize = 12.sp,
                                                                    fontWeight = FontWeight.Medium
                                                                )
                                                            }
                                                            if (!ansNote.isNullOrBlank()) {
                                                                Text(
                                                                    text = "Not: $ansNote",
                                                                    color = TextSecondary,
                                                                    fontSize = 11.sp,
                                                                    modifier = Modifier.padding(top = 2.dp)
                                                                )
                                                            }
                                                        }
                                                        Spacer(modifier = Modifier.width(10.dp))
                                                        Text(
                                                            text = displayValue,
                                                            color = if (isAnsNegative) Color(0xFFEF4444) else AccentPurple,
                                                            fontSize = 12.sp,
                                                            fontWeight = FontWeight.Bold
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
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("Kapat", color = Color.White, fontWeight = FontWeight.Bold)
            }
        },
        containerColor = DetailDialogBg
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateTaskDialog(
    employees: List<EmployeeInfo>,
    positions: List<PositionInfo>,
    branches: List<BranchInfo>,
    formTemplates: List<FormTemplateInfo>,
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
    var collaboratorIds by remember { mutableStateOf(emptyList<String>()) }
    var observerIds by remember { mutableStateOf(emptyList<String>()) }
    var priority by remember { mutableStateOf("normal") }
    var locationId by remember { mutableStateOf(currentBranchId) }
    
    var startDate by remember { mutableStateOf("") }
    var dueDate by remember { mutableStateOf("") }
    var hasSpecificTime by remember { mutableStateOf(false) }
    var startTime by remember { mutableStateOf("09:00") }
    var dueTime by remember { mutableStateOf("18:00") }
    
    var recurrence by remember { mutableStateOf("") }
    var recurrenceExpanded by remember { mutableStateOf(false) }
    var recurrenceInterval by remember { mutableStateOf(1) }
    var recurrenceWeekdays by remember { mutableStateOf(emptyList<String>()) }
    var monthlyPattern by remember { mutableStateOf("day_of_month") }
    var monthlyDayOfMonth by remember { mutableStateOf(1) }
    var monthlyNth by remember { mutableStateOf(1) }
    var monthlyWeekday by remember { mutableStateOf("monday") }
    var yearlyPattern by remember { mutableStateOf("specific_dates") }
    var yearlyDates by remember { mutableStateOf("") }

    // Rules
    var delegationAllowed by remember { mutableStateOf(false) }
    var approvalRequired by remember { mutableStateOf(false) }
    var closureSummaryRequired by remember { mutableStateOf(false) }
    var closureFileRequired by remember { mutableStateOf(false) }
    var closureImageRequired by remember { mutableStateOf(false) }
    var editDueDateAllowed by remember { mutableStateOf(false) }
    var editScheduleAllowed by remember { mutableStateOf(false) }
    var incompleteIfLate by remember { mutableStateOf(false) }

    // Form Template selection
    var selectedTemplateId by remember { mutableStateOf("") }

    // Checklist creation
    var checklistInputs by remember { mutableStateOf(listOf("")) }

    // Dialog section states (Collapsible)
    var isBasicInfoExpanded by remember { mutableStateOf(true) }
    var isParticipantsExpanded by remember { mutableStateOf(false) }
    var isTimingExpanded by remember { mutableStateOf(false) }
    var isRulesExpanded by remember { mutableStateOf(false) }
    var isChecklistExpanded by remember { mutableStateOf(false) }

    // Dropdowns & Selection Dialog triggers
    var respExpanded by remember { mutableStateOf(false) }
    var priorityExpanded by remember { mutableStateOf(false) }
    var branchExpanded by remember { mutableStateOf(false) }
    var templateExpanded by remember { mutableStateOf(false) }
    var showCollabSelectDialog by remember { mutableStateOf(false) }
    var showObserverSelectDialog by remember { mutableStateOf(false) }

    var isCreating by remember { mutableStateOf(false) }

    // Date & Time pickers setup
    val calendar = Calendar.getInstance()
    
    val startDatePickerDialog = DatePickerDialog(
        context,
        { _, year, month, dayOfMonth ->
            startDate = String.format("%04d-%02d-%02d", year, month + 1, dayOfMonth)
        },
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH),
        calendar.get(Calendar.DAY_OF_MONTH)
    )

    val dueDatePickerDialog = DatePickerDialog(
        context,
        { _, year, month, dayOfMonth ->
            dueDate = String.format("%04d-%02d-%02d", year, month + 1, dayOfMonth)
        },
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH),
        calendar.get(Calendar.DAY_OF_MONTH)
    )

    val startTimePickerDialog = android.app.TimePickerDialog(
        context,
        { _, hour, minute ->
            startTime = String.format("%02d:%02d", hour, minute)
        },
        9, 0, true
    )

    val dueTimePickerDialog = android.app.TimePickerDialog(
        context,
        { _, hour, minute ->
            dueTime = String.format("%02d:%02d", hour, minute)
        },
        18, 0, true
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Mor şerit — oluşturma diyalogu göstergesi
                Box(
                    modifier = Modifier
                        .width(4.dp)
                        .height(28.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(AccentPurple)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text("Yeni Görev Oluştur", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 17.sp)
                    Text("✏️ Görev tanımı", color = AccentPurple.copy(alpha = 0.7f), fontSize = 11.sp)
                }
            }
        },
        text = {
            Surface(
                color = Color.Transparent,
                modifier = Modifier.fillMaxWidth().heightIn(max = 500.dp)
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // SECTION 1: Temel Bilgiler
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            border = BorderStroke(1.dp, CardBorder)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { isBasicInfoExpanded = !isBasicInfoExpanded },
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("📝  Temel Bilgiler", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    Icon(
                                        imageVector = if (isBasicInfoExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                }
                                if (isBasicInfoExpanded) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        OutlinedTextField(
                                            value = title,
                                            onValueChange = { title = it },
                                            label = { Text("Görev Başlığı *") },
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White,
                                                focusedBorderColor = AccentOrange,
                                                unfocusedBorderColor = CardBorder
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        )

                                        OutlinedTextField(
                                            value = description,
                                            onValueChange = { description = it },
                                            label = { Text("Açıklama (İsteğe Bağlı)") },
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White,
                                                focusedBorderColor = AccentOrange,
                                                unfocusedBorderColor = CardBorder
                                            ),
                                            shape = RoundedCornerShape(10.dp),
                                            maxLines = 4
                                        )

                                        // Lokasyon
                                        Box(modifier = Modifier.fillMaxWidth()) {
                                            val branchName = branches.find { it.id == locationId }?.name ?: "Şube Seçiniz..."
                                            OutlinedTextField(
                                                value = branchName,
                                                onValueChange = {},
                                                readOnly = true,
                                                label = { Text("Görev Lokasyonu *") },
                                                trailingIcon = {
                                                    IconButton(onClick = { branchExpanded = !branchExpanded }) {
                                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                    }
                                                },
                                                modifier = Modifier.fillMaxWidth().clickable { branchExpanded = !branchExpanded },
                                                colors = OutlinedTextFieldDefaults.colors(
                                                    focusedTextColor = Color.White,
                                                    unfocusedTextColor = Color.White,
                                                    focusedBorderColor = AccentOrange,
                                                    unfocusedBorderColor = CardBorder
                                                ),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                            DropdownMenu(expanded = branchExpanded, onDismissRequest = { branchExpanded = false }) {
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

                                        // Öncelik
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
                                                    focusedBorderColor = AccentOrange,
                                                    unfocusedBorderColor = CardBorder
                                                ),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                            DropdownMenu(expanded = priorityExpanded, onDismissRequest = { priorityExpanded = false }) {
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
                                }
                            }
                        }
                    }

                    // SECTION 2: Katılımcılar
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            border = BorderStroke(1.dp, CardBorder)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { isParticipantsExpanded = !isParticipantsExpanded },
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("👥  Katılımcılar", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    Icon(
                                        imageVector = if (isParticipantsExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                }
                                if (isParticipantsExpanded) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        // Sorumlu Personel
                                        Box(modifier = Modifier.fillMaxWidth()) {
                                            val selectedName = employees.find { it.id == responsibleId }?.getDisplayName() ?: "Seçiniz..."
                                            OutlinedTextField(
                                                value = selectedName,
                                                onValueChange = {},
                                                readOnly = true,
                                                label = { Text("Sorumlu Personel *") },
                                                trailingIcon = {
                                                    IconButton(onClick = { respExpanded = !respExpanded }) {
                                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                    }
                                                },
                                                modifier = Modifier.fillMaxWidth().clickable { respExpanded = !respExpanded },
                                                colors = OutlinedTextFieldDefaults.colors(
                                                    focusedTextColor = Color.White,
                                                    unfocusedTextColor = Color.White,
                                                    focusedBorderColor = AccentOrange,
                                                    unfocusedBorderColor = CardBorder
                                                ),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                            DropdownMenu(expanded = respExpanded, onDismissRequest = { respExpanded = false }) {
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

                                        // Ortak Çalışanlar (Collaborators)
                                        val collabNames = collaboratorIds.mapNotNull { id -> employees.find { it.id == id }?.getDisplayName() }
                                            .joinToString(", ").ifBlank { "Seçiniz (İsteğe Bağlı)..." }
                                        OutlinedTextField(
                                            value = collabNames,
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Ortak Çalışanlar") },
                                            trailingIcon = {
                                                IconButton(onClick = { showCollabSelectDialog = true }) {
                                                    Icon(Icons.Default.AddCircle, null, tint = Color.White)
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth().clickable { showCollabSelectDialog = true },
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White,
                                                focusedBorderColor = AccentOrange,
                                                unfocusedBorderColor = CardBorder
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        )

                                        // Gözlemciler (Observers)
                                        val observerNames = observerIds.mapNotNull { id -> employees.find { it.id == id }?.getDisplayName() }
                                            .joinToString(", ").ifBlank { "Seçiniz (İsteğe Bağlı)..." }
                                        OutlinedTextField(
                                            value = observerNames,
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Gözlemciler") },
                                            trailingIcon = {
                                                IconButton(onClick = { showObserverSelectDialog = true }) {
                                                    Icon(Icons.Default.AddCircle, null, tint = Color.White)
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth().clickable { showObserverSelectDialog = true },
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White,
                                                focusedBorderColor = AccentOrange,
                                                unfocusedBorderColor = CardBorder
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // SECTION 3: Zamanlama & Planlama
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            border = BorderStroke(1.dp, CardBorder)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { isTimingExpanded = !isTimingExpanded },
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("📅  Planlama ve Zaman", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    Icon(
                                        imageVector = if (isTimingExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                }
                                if (isTimingExpanded) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        // Başlangıç Tarihi
                                        OutlinedTextField(
                                            value = startDate,
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Başlangıç Tarihi") },
                                            trailingIcon = {
                                                IconButton(onClick = { startDatePickerDialog.show() }) {
                                                    Icon(Icons.Default.CalendarMonth, null, tint = Color.White)
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth().clickable { startDatePickerDialog.show() },
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White,
                                                focusedBorderColor = AccentOrange,
                                                unfocusedBorderColor = CardBorder
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        )

                                        // Bitiş Tarihi
                                        OutlinedTextField(
                                            value = dueDate,
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Bitiş Tarihi *") },
                                            trailingIcon = {
                                                IconButton(onClick = { dueDatePickerDialog.show() }) {
                                                    Icon(Icons.Default.CalendarMonth, null, tint = Color.White)
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth().clickable { dueDatePickerDialog.show() },
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedTextColor = Color.White,
                                                unfocusedTextColor = Color.White,
                                                focusedBorderColor = AccentOrange,
                                                unfocusedBorderColor = CardBorder
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        )

                                        // Tekrar (Recurrence)
                                        Box(modifier = Modifier.fillMaxWidth()) {
                                            val recurrenceLabel = when (recurrence) {
                                                "daily" -> "Günlük"
                                                "weekly" -> "Haftalık"
                                                "monthly" -> "Aylık"
                                                "yearly" -> "Yıllık"
                                                else -> "Tek seferlik"
                                            }
                                            OutlinedTextField(
                                                value = recurrenceLabel,
                                                onValueChange = {},
                                                readOnly = true,
                                                label = { Text("Tekrar") },
                                                trailingIcon = {
                                                    IconButton(onClick = { recurrenceExpanded = !recurrenceExpanded }) {
                                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                    }
                                                },
                                                modifier = Modifier.fillMaxWidth().clickable { recurrenceExpanded = !recurrenceExpanded },
                                                colors = OutlinedTextFieldDefaults.colors(
                                                    focusedTextColor = Color.White,
                                                    unfocusedTextColor = Color.White,
                                                    focusedBorderColor = AccentOrange,
                                                    unfocusedBorderColor = CardBorder
                                                ),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                            DropdownMenu(
                                                expanded = recurrenceExpanded,
                                                onDismissRequest = { recurrenceExpanded = false }
                                            ) {
                                                val opts = listOf(
                                                    "" to "Tek seferlik",
                                                    "daily" to "Günlük",
                                                    "weekly" to "Haftalık",
                                                    "monthly" to "Aylık",
                                                    "yearly" to "Yıllık"
                                                )
                                                opts.forEach { (valKey, valLabel) ->
                                                    DropdownMenuItem(
                                                        text = { Text(valLabel) },
                                                        onClick = {
                                                            recurrence = valKey
                                                            recurrenceExpanded = false
                                                        }
                                                    )
                                                }
                                            }
                                        }

                                        // Recurrence Details UI
                                        if (recurrence == "daily") {
                                            OutlinedTextField(
                                                value = recurrenceInterval.toString(),
                                                onValueChange = { recurrenceInterval = it.toIntOrNull() ?: 1 },
                                                label = { Text("Tekrarlama Sıklığı (Gün)") },
                                                modifier = Modifier.fillMaxWidth(),
                                                colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                        }

                                        if (recurrence == "weekly") {
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text("Tekrarlanacak Günler", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                            val days = listOf(
                                                "monday" to "Pzt",
                                                "tuesday" to "Sal",
                                                "wednesday" to "Çar",
                                                "thursday" to "Per",
                                                "friday" to "Cum",
                                                "saturday" to "Cmt",
                                                "sunday" to "Paz"
                                            )
                                            Row(
                                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                days.forEach { (key, label) ->
                                                    val isSelected = recurrenceWeekdays.contains(key)
                                                    Card(
                                                        modifier = Modifier
                                                            .weight(1f)
                                                            .clickable {
                                                                recurrenceWeekdays = if (isSelected) {
                                                                    recurrenceWeekdays.filter { it != key }
                                                                } else {
                                                                    recurrenceWeekdays + key
                                                                }
                                                            },
                                                        shape = RoundedCornerShape(6.dp),
                                                        colors = CardDefaults.cardColors(
                                                            containerColor = if (isSelected) AccentOrange.copy(alpha = 0.2f) else CardBg
                                                        ),
                                                        border = BorderStroke(1.dp, if (isSelected) AccentOrange else CardBorder)
                                                    ) {
                                                        Text(
                                                            text = label,
                                                            color = if (isSelected) Color.White else TextSecondary,
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            modifier = Modifier.padding(vertical = 8.dp).align(Alignment.CenterHorizontally)
                                                        )
                                                    }
                                                }
                                            }
                                        }

                                        if (recurrence == "monthly") {
                                            var patternExpanded by remember { mutableStateOf(false) }
                                            Box(modifier = Modifier.fillMaxWidth()) {
                                                val patternLabel = when (monthlyPattern) {
                                                    "last_day" -> "Ayın Son Günü"
                                                    "nth_weekday" -> "N. Hafta Günü (Örn. 2. Pazartesi)"
                                                    else -> "Belirli Bir Gün"
                                                }
                                                OutlinedTextField(
                                                    value = patternLabel,
                                                    onValueChange = {},
                                                    readOnly = true,
                                                    label = { Text("Aylık Tekrarlama Şekli") },
                                                    trailingIcon = {
                                                        IconButton(onClick = { patternExpanded = !patternExpanded }) {
                                                            Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                        }
                                                    },
                                                    modifier = Modifier.fillMaxWidth().clickable { patternExpanded = !patternExpanded },
                                                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                                DropdownMenu(expanded = patternExpanded, onDismissRequest = { patternExpanded = false }) {
                                                    DropdownMenuItem(text = { Text("Belirli Bir Gün") }, onClick = { monthlyPattern = "day_of_month"; patternExpanded = false })
                                                    DropdownMenuItem(text = { Text("Ayın Son Günü") }, onClick = { monthlyPattern = "last_day"; patternExpanded = false })
                                                    DropdownMenuItem(text = { Text("N. Hafta Günü (Örn. 2. Pazartesi)") }, onClick = { monthlyPattern = "nth_weekday"; patternExpanded = false })
                                                }
                                            }

                                            if (monthlyPattern == "day_of_month") {
                                                OutlinedTextField(
                                                    value = monthlyDayOfMonth.toString(),
                                                    onValueChange = { monthlyDayOfMonth = it.toIntOrNull() ?: 1 },
                                                    label = { Text("Ayın Günü (1-31)") },
                                                    modifier = Modifier.fillMaxWidth(),
                                                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                            }

                                            if (monthlyPattern == "nth_weekday") {
                                                var nthExpanded by remember { mutableStateOf(false) }
                                                var weekdayExpanded by remember { mutableStateOf(false) }

                                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                                    Box(modifier = Modifier.weight(1f)) {
                                                        val nthLabel = when (monthlyNth) {
                                                            1 -> "1. (İlk)"
                                                            2 -> "2."
                                                            3 -> "3."
                                                            4 -> "4."
                                                            else -> "5. (Son)"
                                                        }
                                                        OutlinedTextField(
                                                            value = nthLabel,
                                                            onValueChange = {},
                                                            readOnly = true,
                                                            label = { Text("Kaçıncı") },
                                                            trailingIcon = {
                                                                IconButton(onClick = { nthExpanded = !nthExpanded }) {
                                                                    Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                                }
                                                            },
                                                            modifier = Modifier.fillMaxWidth().clickable { nthExpanded = !nthExpanded },
                                                            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                            shape = RoundedCornerShape(10.dp)
                                                        )
                                                        DropdownMenu(expanded = nthExpanded, onDismissRequest = { nthExpanded = false }) {
                                                            listOf(1 to "1. (İlk)", 2 to "2.", 3 to "3.", 4 to "4.", 5 to "5. (Son)").forEach { (v, lbl) ->
                                                                DropdownMenuItem(text = { Text(lbl) }, onClick = { monthlyNth = v; nthExpanded = false })
                                                            }
                                                        }
                                                    }

                                                    Box(modifier = Modifier.weight(1f)) {
                                                        val dayLabel = when (monthlyWeekday) {
                                                            "monday" -> "Pazartesi"
                                                            "tuesday" -> "Salı"
                                                            "wednesday" -> "Çarşamba"
                                                            "thursday" -> "Perşembe"
                                                            "friday" -> "Cuma"
                                                            "saturday" -> "Cumartesi"
                                                            else -> "Pazar"
                                                        }
                                                        OutlinedTextField(
                                                            value = dayLabel,
                                                            onValueChange = {},
                                                            readOnly = true,
                                                            label = { Text("Gün") },
                                                            trailingIcon = {
                                                                IconButton(onClick = { weekdayExpanded = !weekdayExpanded }) {
                                                                    Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                                }
                                                            },
                                                            modifier = Modifier.fillMaxWidth().clickable { weekdayExpanded = !weekdayExpanded },
                                                            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                            shape = RoundedCornerShape(10.dp)
                                                        )
                                                        DropdownMenu(expanded = weekdayExpanded, onDismissRequest = { weekdayExpanded = false }) {
                                                            listOf(
                                                                "monday" to "Pazartesi",
                                                                "tuesday" to "Salı",
                                                                "wednesday" to "Çarşamba",
                                                                "thursday" to "Perşembe",
                                                                "friday" to "Cuma",
                                                                "saturday" to "Cumartesi",
                                                                "sunday" to "Pazar"
                                                            ).forEach { (v, lbl) ->
                                                                DropdownMenuItem(text = { Text(lbl) }, onClick = { monthlyWeekday = v; weekdayExpanded = false })
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        if (recurrence == "yearly") {
                                            OutlinedTextField(
                                                value = yearlyDates,
                                                onValueChange = { yearlyDates = it },
                                                label = { Text("Tarihler (Örn. 01-01, 10-29)") },
                                                modifier = Modifier.fillMaxWidth(),
                                                colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                        }

                                        // Belirli Saat Switch
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("Belirli Bir Saat Var mı?", color = Color.White, fontSize = 13.sp)
                                            Switch(
                                                checked = hasSpecificTime,
                                                onCheckedChange = { hasSpecificTime = it },
                                                colors = SwitchDefaults.colors(checkedThumbColor = AccentOrange)
                                            )
                                        }

                                        if (hasSpecificTime) {
                                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                                OutlinedTextField(
                                                    value = startTime,
                                                    onValueChange = {},
                                                    readOnly = true,
                                                    label = { Text("Başl. Saati") },
                                                    modifier = Modifier.weight(1f).clickable { startTimePickerDialog.show() },
                                                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                                OutlinedTextField(
                                                    value = dueTime,
                                                    onValueChange = {},
                                                    readOnly = true,
                                                    label = { Text("Bitiş Saati") },
                                                    modifier = Modifier.weight(1f).clickable { dueTimePickerDialog.show() },
                                                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = AccentOrange, unfocusedBorderColor = CardBorder),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // SECTION 4: İş Kuralları & Kısıtlar
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            border = BorderStroke(1.dp, CardBorder)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { isRulesExpanded = !isRulesExpanded },
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("⚙️  İş Kuralları ve Onaylar", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    Icon(
                                        imageVector = if (isRulesExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                }
                                if (isRulesExpanded) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        SwitchRow("Başka Personele Delege Edilebilir", delegationAllowed) { delegationAllowed = it }
                                        SwitchRow("Kapanışta Yönetici Onayı Gerekli", approvalRequired) { approvalRequired = it }
                                        SwitchRow("Kapanışta Açıklama/Özet Metin Zorunlu", closureSummaryRequired) { closureSummaryRequired = it }
                                        SwitchRow("Kapanışta Görsel Yüklemek Zorunlu", closureImageRequired) { closureImageRequired = it }
                                        SwitchRow("Kapanışta Dosya Yüklemek Zorunlu", closureFileRequired) { closureFileRequired = it }
                                        SwitchRow("Bitiş Tarihi Değiştirilebilir", editDueDateAllowed) { editDueDateAllowed = it }
                                        SwitchRow("Zaman Planı Güncellenebilir", editScheduleAllowed) { editScheduleAllowed = it }
                                        SwitchRow("Gecikirse Yapılmadı Olarak İşaretle", incompleteIfLate) { incompleteIfLate = it }

                                        Spacer(modifier = Modifier.height(8.dp))

                                        // Görev Şablonu Dropdown
                                        Box(modifier = Modifier.fillMaxWidth()) {
                                            val tName = formTemplates.find { it.id == selectedTemplateId }?.name ?: "Şablon Yok"
                                            OutlinedTextField(
                                                value = tName,
                                                onValueChange = {},
                                                readOnly = true,
                                                label = { Text("Görev Form Şablonu") },
                                                trailingIcon = {
                                                    IconButton(onClick = { templateExpanded = !templateExpanded }) {
                                                        Icon(Icons.Default.ArrowDropDown, null, tint = Color.White)
                                                    }
                                                },
                                                modifier = Modifier.fillMaxWidth().clickable { templateExpanded = !templateExpanded },
                                                colors = OutlinedTextFieldDefaults.colors(
                                                    focusedTextColor = Color.White,
                                                    unfocusedTextColor = Color.White,
                                                    focusedBorderColor = AccentOrange,
                                                    unfocusedBorderColor = CardBorder
                                                ),
                                                shape = RoundedCornerShape(10.dp)
                                            )
                                            DropdownMenu(expanded = templateExpanded, onDismissRequest = { templateExpanded = false }) {
                                                DropdownMenuItem(
                                                    text = { Text("Şablon Yok") },
                                                    onClick = {
                                                        selectedTemplateId = ""
                                                        templateExpanded = false
                                                    }
                                                )
                                                formTemplates.forEach { tpl ->
                                                    DropdownMenuItem(
                                                        text = { Text(tpl.name) },
                                                        onClick = {
                                                            selectedTemplateId = tpl.id
                                                            templateExpanded = false
                                                        }
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // SECTION 5: Kontrol Listesi
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            border = BorderStroke(1.dp, CardBorder)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { isChecklistExpanded = !isChecklistExpanded },
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("📋  Kontrol Listesi", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        IconButton(
                                            onClick = { checklistInputs = checklistInputs + "" },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(Icons.Default.AddCircle, null, tint = AccentGreen, modifier = Modifier.size(20.dp))
                                        }
                                    }
                                    Icon(
                                        imageVector = if (isChecklistExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                }
                                if (isChecklistExpanded) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        checklistInputs.forEachIndexed { index, value ->
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                OutlinedTextField(
                                                    value = value,
                                                    onValueChange = { newVal ->
                                                        checklistInputs = checklistInputs.toMutableList().apply { set(index, newVal) }
                                                    },
                                                    placeholder = { Text("Maddeleri yazın...", fontSize = 12.sp) },
                                                    modifier = Modifier.weight(1f),
                                                    colors = OutlinedTextFieldDefaults.colors(
                                                        focusedTextColor = Color.White,
                                                        unfocusedTextColor = Color.White,
                                                        focusedBorderColor = AccentOrange,
                                                        unfocusedBorderColor = CardBorder
                                                    ),
                                                    shape = RoundedCornerShape(8.dp)
                                                )
                                                if (checklistInputs.size > 1) {
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    IconButton(
                                                        onClick = {
                                                            checklistInputs = checklistInputs.toMutableList().apply { removeAt(index) }
                                                        },
                                                        modifier = Modifier.size(28.dp)
                                                    ) {
                                                        Icon(Icons.Default.Delete, null, tint = AccentRed, modifier = Modifier.size(20.dp))
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
        },
        confirmButton = {
            Button(
                onClick = {
                    if (title.isBlank() || responsibleId.isBlank() || locationId.isBlank() || dueDate.isBlank()) {
                        Toast.makeText(context, "Lütfen gerekli alanları (Başlık, Lokasyon, Sorumlu ve Bitiş Tarihi) doldurun", Toast.LENGTH_SHORT).show()
                        return@Button
                    }

                    isCreating = true
                    scope.launch {
                        val resp = employees.find { it.id == responsibleId }
                        val assigneePositionId = resp?.positionId

                        val startAtIso = if (startDate.isNotBlank()) {
                            if (hasSpecificTime) "${startDate}T${startTime}:00.000Z" else "${startDate}T00:00:00.000Z"
                        } else null

                        val dueAtIso = if (dueDate.isNotBlank()) {
                            if (hasSpecificTime) "${dueDate}T${dueTime}:00.000Z" else "${dueDate}T23:59:59.000Z"
                        } else null

                        val success = repo.createTask(
                            title = title,
                            description = description,
                            responsibleId = responsibleId,
                            collaboratorIds = collaboratorIds,
                            observerIds = observerIds,
                            priority = priority,
                            dueAt = dueAtIso,
                            startAt = startAtIso,
                            hasSpecificTime = hasSpecificTime,
                            delegationAllowed = delegationAllowed,
                            approvalRequired = approvalRequired,
                            closureSummaryRequired = closureSummaryRequired,
                            closureFileRequired = closureFileRequired,
                            closureImageRequired = closureImageRequired,
                            editDueDateAllowed = editDueDateAllowed,
                            editScheduleAllowed = editScheduleAllowed,
                            incompleteIfLate = incompleteIfLate,
                            recurrence = recurrence.ifBlank { null },
                            recurrenceInterval = recurrenceInterval,
                            recurrenceWeekdays = recurrenceWeekdays,
                            monthlyPattern = monthlyPattern,
                            monthlyDayOfMonth = monthlyDayOfMonth,
                            monthlyNth = monthlyNth,
                            monthlyWeekday = monthlyWeekday,
                            specificDates = if (yearlyDates.isNotBlank()) yearlyDates.split(",").map { it.trim() }.filter { it.isNotBlank() } else null,
                            timeOfDay = if (hasSpecificTime) startTime else null,
                            formTemplateId = selectedTemplateId.ifBlank { null },
                            branchNodeId = locationId,
                            creatorId = currentUserId,
                            creatorPositionId = currentUserPositionId,
                            assigneePositionId = assigneePositionId,
                            positions = positions,
                            employees = employees,
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
        containerColor = CreateDialogBg
    )

    // Multi select dialog for Collaborators
    if (showCollabSelectDialog) {
        MultiPersonnelSelectDialog(
            title = "Ortak Çalışanları Seçin",
            employees = employees.filter { it.id != responsibleId }, // main assignee is already assigned
            selectedIds = collaboratorIds,
            onDismiss = { showCollabSelectDialog = false },
            onConfirm = { selected ->
                collaboratorIds = selected
                showCollabSelectDialog = false
            }
        )
    }

    // Multi select dialog for Observers
    if (showObserverSelectDialog) {
        MultiPersonnelSelectDialog(
            title = "Gözlemcileri Seçin",
            employees = employees,
            selectedIds = observerIds,
            onDismiss = { showObserverSelectDialog = false },
            onConfirm = { selected ->
                observerIds = selected
                showObserverSelectDialog = false
            }
        )
    }
}

@Composable
private fun SwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 12.sp,
            modifier = Modifier.weight(1f).padding(end = 8.dp)
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = AccentOrange,
                checkedTrackColor = AccentOrange.copy(alpha = 0.4f)
            )
        )
    }
}

@Composable
private fun MultiPersonnelSelectDialog(
    title: String,
    employees: List<EmployeeInfo>,
    selectedIds: List<String>,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit
) {
    var tempSelected by remember { mutableStateOf(selectedIds) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold, color = Color.White) },
        text = {
            Surface(
                color = Color.Transparent,
                modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp)
            ) {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(employees, key = { it.id }) { emp ->
                        val isChecked = tempSelected.contains(emp.id)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    tempSelected = if (isChecked) {
                                        tempSelected.filter { it != emp.id }
                                    } else {
                                        tempSelected + emp.id
                                    }
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = { checked ->
                                    tempSelected = if (checked == true) {
                                        tempSelected + emp.id
                                    } else {
                                        tempSelected.filter { it != emp.id }
                                    }
                                },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = AccentOrange,
                                    uncheckedColor = CardBorder
                                )
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(emp.getDisplayName(), color = Color.White, fontSize = 14.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(tempSelected) },
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
            ) {
                Text("Tamam")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("İptal", color = TextSecondary)
            }
        },
        containerColor = SelectDialogBg
    )
}

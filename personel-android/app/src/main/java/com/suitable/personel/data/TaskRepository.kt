package com.suitable.personel.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// ─── Data Models ─────────────────────────────────────────────────────────────

data class TaskItem(
    val id: String,
    val title: String,
    val description: String?,
    val status: String,
    val priority: String,
    val dueAt: String?,
    val startAt: String?,
    val createdByPersonnelId: String,
    val createdByPositionId: String?,
    val branchNodeId: String?,
    val isRecurring: Boolean,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String?,
    val approvalRequired: Boolean,
    val closureSummaryRequired: Boolean,
    val closureFileRequired: Boolean,
    val closureImageRequired: Boolean,
    val formTemplateId: String?,
    var participants: List<TaskParticipant> = emptyList(),
    var checklistCount: Int = 0,
    var checklistDoneCount: Int = 0
)

data class TaskParticipant(
    val id: String,
    val taskId: String,
    val participantType: String, // "assignee", "watcher"
    val personnelId: String,
    val positionId: String?,
    val nodeId: String?,
    val isDelegate: Boolean = false,
    val delegatedFrom: String? = null
)

data class TaskChecklistItem(
    val id: String,
    val taskId: String,
    val text: String,
    val isDone: Boolean,
    val sortOrder: Int
)

data class TaskChatMessage(
    val id: String,
    val threadId: String,
    val taskId: String,
    val messageType: String, // "user", "system"
    val senderId: String?,
    val body: String?,
    val createdAt: String
)

data class TaskApprovalRequest(
    val id: String,
    val taskId: String,
    val requestType: String, // "assignment", "delegation", "closure_approval", etc.
    val fromPersonnel: String,
    val toPersonnel: String,
    val status: String, // "pending", "accepted", "rejected"
    val reason: String?,
    val createdAt: String
)

data class EmployeeInfo(
    val id: String,
    val firstName: String,
    val middleName: String?,
    val lastName: String?,
    val positionId: String?,
    val defaultBranchId: String?,
    val authorityLevel: String?,
    val pin: String?,
    val deletedAt: String? = null
) {
    fun getDisplayName(): String {
        return listOfNotNull(firstName, middleName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()
            .ifBlank { "Personel" }
    }
}

data class PositionInfo(
    val id: String,
    val name: String,
    val parentId: String?,
    val deletedAt: String? = null
)

data class BranchInfo(
    val id: String,
    val name: String
)

data class ShiftScheduleEntry(
    val id: String,
    val scheduleDate: String,
    val shiftName: String?,
    val shiftShortCode: String?,
    val shiftStartTime: String?,
    val shiftEndTime: String?,
    val shiftKind: String
)

data class FormTemplateInfo(
    val id: String,
    val name: String
)

// ─── Repository ───────────────────────────────────────────────────────────────

class TaskRepository {

    // ─── Hiyerarşi & Ayarlar Yükleme ─────────────────────────────────────────

    suspend fun fetchEmployeesAndPositionsAndBranches(): Triple<List<EmployeeInfo>, List<PositionInfo>, List<BranchInfo>> {
        return withContext(Dispatchers.IO) {
            try {
                // 1) Employees (personnel_records)
                val empReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to "personnel_records"))
                )
                val empRes = ApiClient.apiService.executeQuery(empReq)
                val empList = parseJsonList((empRes.data as? List<*>)?.firstOrNull() as? Map<*, *>) ?: emptyList()
                val employees = empList.mapNotNull { row ->
                    val id = row["id"]?.toString() ?: return@mapNotNull null
                    if (row["deletedAt"] != null) return@mapNotNull null
                    EmployeeInfo(
                        id = id,
                        firstName = row["firstName"]?.toString() ?: "",
                        middleName = row["middleName"]?.toString(),
                        lastName = row["lastName"]?.toString(),
                        positionId = row["positionId"]?.toString(),
                        defaultBranchId = row["defaultBranchId"]?.toString(),
                        authorityLevel = row["authorityLevel"]?.toString(),
                        pin = row["pin"]?.toString()
                    )
                }

                // 2) Positions (personnel_positions)
                val posReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to "personnel_positions"))
                )
                val posRes = ApiClient.apiService.executeQuery(posReq)
                val posList = parseJsonList((posRes.data as? List<*>)?.firstOrNull() as? Map<*, *>) ?: emptyList()
                val positions = posList.mapNotNull { row ->
                    val id = row["id"]?.toString() ?: return@mapNotNull null
                    if (row["deletedAt"] != null) return@mapNotNull null
                    PositionInfo(
                        id = id,
                        name = row["name"]?.toString() ?: "",
                        parentId = row["parentId"]?.toString() ?: row["parent_id"]?.toString()
                    )
                }

                // 3) Branches (company_tree)
                val treeReq = QueryRequest(
                    table = "settings",
                    select = "value",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to "company_tree"))
                )
                val treeRes = ApiClient.apiService.executeQuery(treeReq)
                val treeList = (treeRes.data as? List<*>)?.firstOrNull() as? Map<*, *>
                val treeNodes = treeList?.get("value") as? List<*>
                val branches = parseBranchesFromTree(treeNodes)

                Triple(employees, positions, branches)
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchEmployeesAndPositionsAndBranches error", e)
                Triple(emptyList(), emptyList(), emptyList())
            }
        }
    }

    // ─── Görev Listeleme ─────────────────────────────────────────────────────

    suspend fun fetchTasksForActor(
        actorId: String,
        authorityLevel: String,
        branchId: String
    ): List<TaskItem> {
        return withContext(Dispatchers.IO) {
            try {
                val isGeneralCenter = authorityLevel.lowercase() == "genel merkez"
                val taskRows = mutableListOf<Map<String, Any>>()

                if (isGeneralCenter) {
                    // Genel Merkez her şeyi çeker
                    val req = QueryRequest(
                        table = "tasks",
                        filters = listOf(
                            mapOf("type" to "is", "col" to "deleted_at", "val" to null)
                        )
                    )
                    val res = ApiClient.apiService.executeQuery(req)
                    taskRows.addAll((res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList())
                } else {
                    // 1) Katılımcı olunan görevlerin ID'lerini çek
                    val partReq = QueryRequest(
                        table = "task_participants",
                        filters = listOf(mapOf("type" to "eq", "col" to "personnel_id", "val" to actorId))
                    )
                    val partRes = ApiClient.apiService.executeQuery(partReq)
                    val participations = (partRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                    val taskIds = participations.mapNotNull { it["task_id"]?.toString() }.distinct()

                    // 2) Kendi oluşturduğu veya şubeye atanan görevleri çek
                    val req1 = QueryRequest(
                        table = "tasks",
                        filters = listOf(
                            mapOf("type" to "is", "col" to "deleted_at", "val" to null),
                            mapOf("type" to "eq", "col" to "created_by_personnel_id", "val" to actorId)
                        )
                    )
                    val res1 = ApiClient.apiService.executeQuery(req1)
                    taskRows.addAll((res1.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList())

                    if (branchId.isNotBlank()) {
                        val req2 = QueryRequest(
                            table = "tasks",
                            filters = listOf(
                                mapOf("type" to "is", "col" to "deleted_at", "val" to null),
                                mapOf("type" to "eq", "col" to "branch_node_id", "val" to branchId)
                            )
                        )
                        val res2 = ApiClient.apiService.executeQuery(req2)
                        taskRows.addAll((res2.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList())
                    }

                    // 3) Katılımcı olunan görevleri çek (listed olmayanlar varsa)
                    if (taskIds.isNotEmpty()) {
                        val req3 = QueryRequest(
                            table = "tasks",
                            filters = listOf(
                                mapOf("type" to "is", "col" to "deleted_at", "val" to null),
                                mapOf("type" to "in", "col" to "id", "val" to taskIds)
                            )
                        )
                        val res3 = ApiClient.apiService.executeQuery(req3)
                        taskRows.addAll((res3.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList())
                    }
                }

                // Benzersiz yap
                val uniqueTasks = taskRows.associateBy { it["id"]?.toString() ?: "" }.values.toList()
                val uniqueTaskIds = uniqueTasks.mapNotNull { it["id"]?.toString() }

                if (uniqueTaskIds.isEmpty()) return@withContext emptyList()

                // Tüm katılımcıları tek sorguda çek
                val participantsReq = QueryRequest(
                    table = "task_participants",
                    filters = listOf(mapOf("type" to "in", "col" to "task_id", "val" to uniqueTaskIds))
                )
                val participantsRes = ApiClient.apiService.executeQuery(participantsReq)
                val participantsList = (participantsRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val participantsByTask = participantsList.groupBy { it["task_id"]?.toString() ?: "" }

                // Tüm checklist miktarlarını ve biten miktarları çek
                val checklistReq = QueryRequest(
                    table = "task_checklist_items",
                    select = "id,task_id,is_done",
                    filters = listOf(mapOf("type" to "in", "col" to "task_id", "val" to uniqueTaskIds))
                )
                val checklistRes = ApiClient.apiService.executeQuery(checklistReq)
                val checklistList = (checklistRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val checklistByTask = checklistList.groupBy { it["task_id"]?.toString() ?: "" }

                val parseBool = { v: Any? ->
                    when (v) {
                        is Boolean -> v
                        is String -> v.toBoolean()
                        is Number -> v.toInt() == 1
                        else -> false
                    }
                }

                uniqueTasks.map { row ->
                    val id = row["id"]?.toString() ?: ""
                    val participantsRows = participantsByTask[id] ?: emptyList()
                    val taskParticipants = participantsRows.map { pRow ->
                        TaskParticipant(
                            id = pRow["id"]?.toString() ?: "",
                            taskId = pRow["task_id"]?.toString() ?: "",
                            participantType = pRow["participant_type"]?.toString() ?: "assignee",
                            personnelId = pRow["personnel_id"]?.toString() ?: "",
                            positionId = pRow["position_id"]?.toString(),
                            nodeId = pRow["node_id"]?.toString(),
                            isDelegate = parseBool(pRow["is_delegate"]),
                            delegatedFrom = pRow["delegated_from"]?.toString()
                        )
                    }

                    val checklistRows = checklistByTask[id] ?: emptyList()
                    val checklistCount = checklistRows.size
                    val checklistDoneCount = checklistRows.count { parseBool(it["is_done"]) }

                    TaskItem(
                        id = id,
                        title = row["title"]?.toString() ?: "",
                        description = row["description"]?.toString(),
                        status = row["status"]?.toString() ?: "open",
                        priority = row["priority"]?.toString() ?: "normal",
                        dueAt = row["due_at"]?.toString(),
                        startAt = row["start_at"]?.toString(),
                        createdByPersonnelId = row["created_by_personnel_id"]?.toString() ?: "",
                        createdByPositionId = row["created_by_position_id"]?.toString(),
                        branchNodeId = row["branch_node_id"]?.toString(),
                        isRecurring = parseBool(row["is_recurring"]),
                        createdAt = row["created_at"]?.toString() ?: "",
                        updatedAt = row["updated_at"]?.toString() ?: "",
                        deletedAt = row["deleted_at"]?.toString(),
                        approvalRequired = parseBool(row["approval_required"]),
                        closureSummaryRequired = parseBool(row["closure_summary_required"]),
                        closureFileRequired = parseBool(row["closure_file_required"]),
                        closureImageRequired = parseBool(row["closure_image_required"]),
                        formTemplateId = row["form_template_id"]?.toString(),
                        participants = taskParticipants,
                        checklistCount = checklistCount,
                        checklistDoneCount = checklistDoneCount
                    )
                }.sortedByDescending { it.createdAt }
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchTasksForActor error", e)
                emptyList()
            }
        }
    }

    // ─── Görev Detay Yükleme ─────────────────────────────────────────────────

    suspend fun fetchTaskChecklist(taskId: String): List<TaskChecklistItem> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "task_checklist_items",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "task_id", "val" to taskId),
                        mapOf("type" to "order", "col" to "sort_order", "ascending" to true)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val parseBool = { v: Any? ->
                    when (v) {
                        is Boolean -> v
                        is String -> v.toBoolean()
                        is Number -> v.toInt() == 1
                        else -> false
                    }
                }
                rows.map { row ->
                    TaskChecklistItem(
                        id = row["id"]?.toString() ?: "",
                        taskId = row["task_id"]?.toString() ?: "",
                        text = row["text"]?.toString() ?: "",
                        isDone = parseBool(row["is_done"]),
                        sortOrder = (row["sort_order"] as? Number)?.toInt() ?: 0
                    )
                }
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchTaskChecklist error", e)
                emptyList()
            }
        }
    }

    suspend fun fetchTaskChatMessages(taskId: String): List<TaskChatMessage> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "task_chat_messages",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "task_id", "val" to taskId),
                        mapOf("type" to "order", "col" to "created_at", "ascending" to true)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                rows.map { row ->
                    TaskChatMessage(
                        id = row["id"]?.toString() ?: "",
                        threadId = row["thread_id"]?.toString() ?: "",
                        taskId = row["task_id"]?.toString() ?: "",
                        messageType = row["message_type"]?.toString() ?: "user",
                        senderId = row["sender_id"]?.toString(),
                        body = row["body"]?.toString() ?: "",
                        createdAt = row["created_at"]?.toString() ?: ""
                    )
                }
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchTaskChatMessages error", e)
                emptyList()
            }
        }
    }

    suspend fun fetchTaskApprovals(taskId: String): List<TaskApprovalRequest> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "task_approval_requests",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "task_id", "val" to taskId),
                        mapOf("type" to "order", "col" to "created_at", "ascending" to false)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                rows.map { row ->
                    TaskApprovalRequest(
                        id = row["id"]?.toString() ?: "",
                        taskId = row["task_id"]?.toString() ?: "",
                        requestType = row["request_type"]?.toString() ?: "assignment",
                        fromPersonnel = row["from_personnel"]?.toString() ?: "",
                        toPersonnel = row["to_personnel"]?.toString() ?: "",
                        status = row["status"]?.toString() ?: "pending",
                        reason = row["reason"]?.toString(),
                        createdAt = row["created_at"]?.toString() ?: ""
                    )
                }
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchTaskApprovals error", e)
                emptyList()
            }
        }
    }

    // ─── Eylem Güncellemeleri ────────────────────────────────────────────────

    suspend fun updateTaskStatus(taskId: String, newStatus: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "tasks",
                    operation = "update",
                    filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to taskId)),
                    data = mapOf(
                        "status" to newStatus,
                        "updated_at" to java.time.Instant.now().toString()
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("TaskRepository", "updateTaskStatus error", e)
                false
            }
        }
    }

    suspend fun updateChecklistItem(itemId: String, isDone: Boolean): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "task_checklist_items",
                    operation = "update",
                    filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to itemId)),
                    data = mapOf(
                        "is_done" to isDone,
                        "updated_at" to java.time.Instant.now().toString()
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("TaskRepository", "updateChecklistItem error", e)
                false
            }
        }
    }

    suspend fun addChatMessage(taskId: String, senderId: String, body: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                // 1) thread_id bul veya oluştur
                var threadId: String? = null
                val threadQuery = QueryRequest(
                    table = "task_chat_threads",
                    filters = listOf(mapOf("type" to "eq", "col" to "task_id", "val" to taskId))
                )
                val threadRes = ApiClient.apiService.executeQuery(threadQuery)
                val threadRows = (threadRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                if (threadRows.isNotEmpty()) {
                    threadId = threadRows.first()["id"]?.toString()
                } else {
                    // Thread oluştur
                    val newThreadId = java.util.UUID.randomUUID().toString()
                    val createThread = QueryRequest(
                        table = "task_chat_threads",
                        operation = "insert",
                        data = mapOf(
                            "id" to newThreadId,
                            "task_id" to taskId,
                            "created_at" to java.time.Instant.now().toString()
                        )
                    )
                    val createRes = ApiClient.apiService.executeQuery(createThread)
                    if (createRes.error == null) {
                        threadId = newThreadId
                    }
                }

                if (threadId == null) return@withContext false

                // 2) Mesaj ekle
                val msgReq = QueryRequest(
                    table = "task_chat_messages",
                    operation = "insert",
                    data = mapOf(
                        "id" to java.util.UUID.randomUUID().toString(),
                        "thread_id" to threadId,
                        "task_id" to taskId,
                        "message_type" to "user",
                        "sender_id" to senderId,
                        "body" to body,
                        "created_at" to java.time.Instant.now().toString()
                    )
                )
                val msgRes = ApiClient.apiService.executeQuery(msgReq)
                msgRes.error == null
            } catch (e: Exception) {
                Log.e("TaskRepository", "addChatMessage error", e)
                false
            }
        }
    }

    // ─── Yeni Görev Oluşturma ────────────────────────────────────────────────

    suspend fun createTask(
        title: String,
        description: String,
        responsibleId: String,
        collaboratorIds: List<String>,
        observerIds: List<String>,
        priority: String,
        dueAt: String?,
        startAt: String?,
        hasSpecificTime: Boolean,
        delegationAllowed: Boolean,
        approvalRequired: Boolean,
        closureSummaryRequired: Boolean,
        closureFileRequired: Boolean,
        closureImageRequired: Boolean,
        editDueDateAllowed: Boolean,
        editScheduleAllowed: Boolean,
        incompleteIfLate: Boolean,
        recurrence: String?,
        recurrenceInterval: Int = 1,
        recurrenceWeekdays: List<String>? = null,
        monthlyPattern: String? = null,
        monthlyDayOfMonth: Int? = null,
        monthlyNth: Int? = null,
        monthlyWeekday: String? = null,
        specificDates: List<String>? = null,
        timeOfDay: String? = null,
        formTemplateId: String?,
        branchNodeId: String,
        creatorId: String,
        creatorPositionId: String?,
        assigneePositionId: String?,
        positions: List<PositionInfo>,
        employees: List<EmployeeInfo>,
        checklistItems: List<String>
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                // 1) Hiyerarşi kontrolü (Requires Approval?)
                val requiresApproval = canReject(creatorPositionId ?: "", assigneePositionId ?: "", positions)
                val status = if (requiresApproval) "pending_approval" else "open"

                val taskId = java.util.UUID.randomUUID().toString()
                val now = java.time.Instant.now().toString()

                // 1.5) Recurrence rule creation (if recurring)
                var recurrenceRuleId: String? = null
                if (!recurrence.isNullOrBlank()) {
                    val ruleId = java.util.UUID.randomUUID().toString()

                    val computedMonthDay = when (monthlyPattern) {
                        "last_day" -> -1
                        "day_of_month" -> monthlyDayOfMonth
                        else -> null
                    }
                    val computedMonthNth = if (monthlyPattern == "nth_weekday") monthlyNth else null
                    val computedMonthWeekday = if (monthlyPattern == "nth_weekday") monthlyWeekday else null

                    val timeOfDayFormatted = if (!timeOfDay.isNullOrBlank()) {
                        if (timeOfDay.length == 5) "$timeOfDay:00" else timeOfDay
                    } else null

                    val recurrenceData = mutableMapOf<String, Any?>(
                        "id" to ruleId,
                        "frequency" to recurrence,
                        "interval_value" to recurrenceInterval,
                        "weekdays" to if (recurrence == "weekly") recurrenceWeekdays else null,
                        "month_day" to if (recurrence == "monthly") computedMonthDay else null,
                        "month_nth" to if (recurrence == "monthly") computedMonthNth else null,
                        "month_weekday" to if (recurrence == "monthly") computedMonthWeekday else null,
                        "specific_dates" to if (recurrence == "yearly") specificDates else null,
                        "time_of_day" to timeOfDayFormatted,
                        "created_at" to now
                    )
                    val recurrenceInsert = ApiClient.apiService.executeQuery(
                        QueryRequest(table = "task_recurrence_rules", operation = "insert", data = recurrenceData)
                    )
                    if (recurrenceInsert.error == null) {
                        recurrenceRuleId = ruleId
                    }
                }

                // 2) Görevi oluştur
                val taskData = mutableMapOf<String, Any?>(
                    "id" to taskId,
                    "title" to title,
                    "description" to description,
                    "status" to status,
                    "priority" to priority,
                    "due_at" to dueAt,
                    "start_at" to startAt,
                    "has_specific_time" to hasSpecificTime,
                    "delegation_allowed" to delegationAllowed,
                    "approval_required" to approvalRequired,
                    "closure_summary_required" to closureSummaryRequired,
                    "closure_file_required" to closureFileRequired,
                    "closure_image_required" to closureImageRequired,
                    "edit_due_date_allowed" to editDueDateAllowed,
                    "edit_schedule_allowed" to editScheduleAllowed,
                    "incomplete_if_late" to incompleteIfLate,
                    "form_template_id" to formTemplateId,
                    "created_by_personnel_id" to creatorId,
                    "created_by_position_id" to creatorPositionId,
                    "branch_node_id" to branchNodeId,
                    "is_recurring" to (!recurrence.isNullOrBlank()),
                    "recurrence_rule_id" to recurrenceRuleId,
                    "created_at" to now,
                    "updated_at" to now
                )

                val taskInsert = ApiClient.apiService.executeQuery(
                    QueryRequest(table = "tasks", operation = "insert", data = taskData)
                )
                if (taskInsert.error != null) return@withContext false

                // 3) Katılımcıları ekle (Assignee + Collaborators + Watchers)
                val participantRows = mutableListOf<Map<String, Any?>>()
                
                // Main assignee
                val mainEmp = employees.find { it.id == responsibleId }
                participantRows.add(mapOf(
                    "id" to java.util.UUID.randomUUID().toString(),
                    "task_id" to taskId,
                    "participant_type" to "assignee",
                    "personnel_id" to responsibleId,
                    "position_id" to mainEmp?.positionId,
                    "node_id" to (mainEmp?.defaultBranchId ?: branchNodeId),
                    "created_at" to now
                ))

                // Collaborators
                collaboratorIds.filter { it.isNotBlank() }.forEach { collabId ->
                    val emp = employees.find { it.id == collabId }
                    participantRows.add(mapOf(
                        "id" to java.util.UUID.randomUUID().toString(),
                        "task_id" to taskId,
                        "participant_type" to "assignee",
                        "personnel_id" to collabId,
                        "position_id" to emp?.positionId,
                        "node_id" to (emp?.defaultBranchId ?: branchNodeId),
                        "created_at" to now
                    ))
                }

                // Watchers (observers)
                observerIds.filter { it.isNotBlank() }.forEach { obsId ->
                    val emp = employees.find { it.id == obsId }
                    participantRows.add(mapOf(
                        "id" to java.util.UUID.randomUUID().toString(),
                        "task_id" to taskId,
                        "participant_type" to "watcher",
                        "personnel_id" to obsId,
                        "position_id" to emp?.positionId,
                        "node_id" to (emp?.defaultBranchId ?: branchNodeId),
                        "created_at" to now
                    ))
                }

                if (participantRows.isNotEmpty()) {
                    val participantReq = QueryRequest(
                        table = "task_participants",
                        operation = "insert",
                        data = participantRows
                    )
                    ApiClient.apiService.executeQuery(participantReq)
                }

                // 4) Onay Talebi Ekle (Eğer onay gerekiyorsa)
                if (requiresApproval) {
                    val approvalReq = QueryRequest(
                        table = "task_approval_requests",
                        operation = "insert",
                        data = mapOf(
                            "id" to java.util.UUID.randomUUID().toString(),
                            "task_id" to taskId,
                            "request_type" to "assignment",
                            "from_personnel" to creatorId,
                            "to_personnel" to responsibleId,
                            "status" to "pending",
                            "created_at" to now
                        )
                    )
                    ApiClient.apiService.executeQuery(approvalReq)
                }

                // 5) Kontrol Listesi Elemanlarını Ekle
                checklistItems.filter { it.isNotBlank() }.forEachIndexed { index, text ->
                    val checklistInsert = QueryRequest(
                        table = "task_checklist_items",
                        operation = "insert",
                        data = mapOf(
                            "id" to java.util.UUID.randomUUID().toString(),
                            "task_id" to taskId,
                            "text" to text.trim(),
                            "is_done" to false,
                            "sort_order" to index,
                            "created_at" to now,
                            "updated_at" to now
                        )
                    )
                    ApiClient.apiService.executeQuery(checklistInsert)
                }

                // 6) Chat Thread Oluştur
                val threadId = java.util.UUID.randomUUID().toString()
                val threadReq = QueryRequest(
                    table = "task_chat_threads",
                    operation = "insert",
                    data = mapOf(
                        "id" to threadId,
                        "task_id" to taskId,
                        "created_at" to now
                    )
                )
                ApiClient.apiService.executeQuery(threadReq)

                // 7) Başlangıç sistem mesajı ekle
                val systemMsgReq = QueryRequest(
                    table = "task_chat_messages",
                    operation = "insert",
                    data = mapOf(
                        "id" to java.util.UUID.randomUUID().toString(),
                        "thread_id" to threadId,
                        "task_id" to taskId,
                        "message_type" to "system",
                        "body" to "Görev oluşturuldu.",
                        "created_at" to now
                    )
                )
                ApiClient.apiService.executeQuery(systemMsgReq)

                true
            } catch (e: Exception) {
                Log.e("TaskRepository", "createTask error", e)
                false
            }
        }
    }

    suspend fun fetchShiftsForPersonnel(personnelId: String, dates: List<String>): List<ShiftScheduleEntry> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "branch_shift_schedule_entries",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "personnel_id", "val" to personnelId),
                        mapOf("type" to "in", "col" to "schedule_date", "val" to dates)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                rows.map { row ->
                    ShiftScheduleEntry(
                        id = row["id"]?.toString() ?: "",
                        scheduleDate = row["schedule_date"]?.toString() ?: "",
                        shiftName = row["shift_name"]?.toString(),
                        shiftShortCode = row["shift_short_code"]?.toString(),
                        shiftStartTime = row["shift_start_time"]?.toString(),
                        shiftEndTime = row["shift_end_time"]?.toString(),
                        shiftKind = row["shift_kind"]?.toString() ?: "working"
                    )
                }
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchShiftsForPersonnel error", e)
                emptyList()
            }
        }
    }

    suspend fun fetchFormTemplates(): List<FormTemplateInfo> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "branch_templates",
                    filters = listOf(
                        mapOf("type" to "is", "col" to "deleted_at", "val" to null)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                rows.map { row ->
                    FormTemplateInfo(
                        id = row["id"]?.toString() ?: "",
                        name = row["name"]?.toString() ?: ""
                    )
                }
            } catch (e: Exception) {
                Log.e("TaskRepository", "fetchFormTemplates error", e)
                emptyList()
            }
        }
    }

    // ─── Hiyerarşi canReject Fonksiyonu ──────────────────────────────────────

    fun getDescendantIds(positionId: String, positions: List<PositionInfo>): Set<String> {
        val childrenMap = mutableMapOf<String, MutableList<String>>()
        for (pos in positions) {
            val pid = pos.id
            val parentId = pos.parentId ?: ""
            if (pid.isNotBlank()) {
                if (!childrenMap.containsKey(parentId)) {
                    childrenMap[parentId] = mutableListOf()
                }
                childrenMap[parentId]?.add(pid)
            }
        }

        val result = mutableSetOf<String>()
        val queue = mutableListOf<String>()
        queue.addAll(childrenMap[positionId] ?: emptyList())

        while (queue.isNotEmpty()) {
            val current = queue.removeAt(0)
            if (current.isBlank() || result.contains(current)) continue
            result.add(current)
            queue.addAll(childrenMap[current] ?: emptyList())
        }

        return result
    }

    fun canReject(assignerPositionId: String, assigneePositionId: String, positions: List<PositionInfo>): Boolean {
        val assignerId = assignerPositionId.trim()
        val assigneeId = assigneePositionId.trim()

        if (assignerId.isBlank() || assigneeId.isBlank()) return true
        if (assignerId == assigneeId) return false

        return !getDescendantIds(assignerId, positions).contains(assigneeId)
    }

    // ─── JSON ve Ağaç Ayrıştırma Yardımcıları ─────────────────────────────────

    @Suppress("UNCHECKED_CAST")
    private fun parseJsonList(raw: Any?): List<Map<String, Any>> {
        if (raw == null) return emptyList()
        return when (raw) {
            is List<*> -> raw.mapNotNull { it as? Map<String, Any> }
            is Map<*, *> -> {
                val value = raw["value"]
                if (value is List<*>) value.mapNotNull { it as? Map<String, Any> }
                else emptyList()
            }
            is String -> {
                try {
                    val parsed = ApiClient.gson.fromJson(raw, List::class.java)
                    (parsed as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                } catch (_: Exception) { emptyList() }
            }
            else -> emptyList()
        }
    }

    private fun parseBranchesFromTree(nodes: List<*>?): List<BranchInfo> {
        val list = mutableListOf<BranchInfo>()
        if (nodes == null) return list

        fun traverse(nodeList: List<*>) {
            for (item in nodeList) {
                val node = item as? Map<*, *> ?: continue
                val id = node["id"]?.toString() ?: ""
                val name = node["name"]?.toString() ?: ""
                val type = node["type"]?.toString() ?: ""

                if (type == "sube" && id.isNotBlank()) {
                    list.add(BranchInfo(id, name))
                }
                val children = node["children"] as? List<*>
                if (children != null) {
                    traverse(children)
                }
            }
        }
        traverse(nodes)
        return list
    }
}

package com.suitable.personel.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.UUID

data class AnnouncementItem(
    val id: String,
    val title: String,
    val content: String,
    val targetType: String,
    val targetId: String?,
    val priority: String,
    val requestReadReceipt: Boolean,
    val createdAt: String,
    val createdByPersonnelId: String,
    val deletedAt: String?,
    var isRead: Boolean = false
)

class AnnouncementRepository {

    private fun parseBool(v: Any?): Boolean {
        return when (v) {
            is Boolean -> v
            is String -> v.toBoolean()
            is Number -> v.toInt() == 1
            else -> false
        }
    }

    suspend fun fetchAnnouncements(personnelId: String, branchId: String): List<AnnouncementItem> {
        return withContext(Dispatchers.IO) {
            try {
                // 1) Fetch active announcements
                val req = QueryRequest(
                    table = "announcements",
                    filters = listOf(
                        mapOf("type" to "is", "col" to "deleted_at", "val" to null)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                // Filter target
                val filteredRows = rows.filter { row ->
                    val targetType = row["target_type"]?.toString() ?: "all"
                    val targetId = row["target_id"]?.toString()
                    targetType == "all" || (targetType == "branch" && targetId == branchId)
                }

                if (filteredRows.isEmpty()) return@withContext emptyList()

                val announcementIds = filteredRows.mapNotNull { it["id"]?.toString() }

                // 2) Fetch read logs for this personnel
                val readReq = QueryRequest(
                    table = "announcement_reads",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "personnel_id", "val" to personnelId),
                        mapOf("type" to "in", "col" to "announcement_id", "val" to announcementIds)
                    )
                )
                val readRes = ApiClient.apiService.executeQuery(readReq)
                val readRows = (readRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                val readAnnouncementIds = readRows.mapNotNull { it["announcement_id"]?.toString() }.toSet()

                // Map to domain model
                val items = filteredRows.map { row ->
                    val id = row["id"]?.toString() ?: ""
                    AnnouncementItem(
                        id = id,
                        title = row["title"]?.toString() ?: "",
                        content = row["content"]?.toString() ?: "",
                        targetType = row["target_type"]?.toString() ?: "all",
                        targetId = row["target_id"]?.toString(),
                        priority = row["priority"]?.toString() ?: "normal",
                        requestReadReceipt = parseBool(row["request_read_receipt"]),
                        createdAt = row["created_at"]?.toString() ?: "",
                        createdByPersonnelId = row["created_by_personnel_id"]?.toString() ?: "",
                        deletedAt = row["deleted_at"]?.toString(),
                        isRead = readAnnouncementIds.contains(id)
                    )
                }

                // Sort: Urgent -> High -> Normal -> Low, then by Date descending
                val priorityWeight = mapOf(
                    "urgent" to 4,
                    "high" to 3,
                    "normal" to 2,
                    "low" to 1
                )
                items.sortedWith(
                    compareByDescending<AnnouncementItem> { priorityWeight[it.priority.lowercase()] ?: 0 }
                        .thenByDescending { it.createdAt }
                )
            } catch (e: Exception) {
                Log.e("AnnouncementRepository", "fetchAnnouncements error", e)
                emptyList()
            }
        }
    }

    suspend fun markAsRead(announcementId: String, personnelId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                // Check if already marked as read
                val checkReq = QueryRequest(
                    table = "announcement_reads",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "announcement_id", "val" to announcementId),
                        mapOf("type" to "eq", "col" to "personnel_id", "val" to personnelId)
                    )
                )
                val checkRes = ApiClient.apiService.executeQuery(checkReq)
                val checkRows = (checkRes.data as? List<*>) ?: emptyList<Any>()
                if (checkRows.isNotEmpty()) return@withContext true // already read

                // Insert read record
                val req = QueryRequest(
                    table = "announcement_reads",
                    operation = "insert",
                    data = mapOf(
                        "id" to UUID.randomUUID().toString(),
                        "announcement_id" to announcementId,
                        "personnel_id" to personnelId,
                        "read_at" to Instant.now().toString()
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("AnnouncementRepository", "markAsRead error", e)
                false
            }
        }
    }

    suspend fun createAnnouncement(
        title: String,
        content: String,
        targetType: String,
        targetId: String?,
        priority: String,
        requestReadReceipt: Boolean,
        createdByPersonnelId: String
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val announcementId = UUID.randomUUID().toString()
                val req = QueryRequest(
                    table = "announcements",
                    operation = "insert",
                    data = mapOf(
                        "id" to announcementId,
                        "title" to title,
                        "content" to content,
                        "target_type" to targetType,
                        "target_id" to targetId,
                        "priority" to priority,
                        "request_read_receipt" to requestReadReceipt,
                        "created_at" to Instant.now().toString(),
                        "created_by_personnel_id" to createdByPersonnelId
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                if (res.error != null) return@withContext false

                // Also trigger notification for this announcement!
                // We use target type for personnel_id: 'all' or 'branch_[branchId]'
                val targetText = if (targetType == "branch" && !targetId.isNullOrBlank()) {
                    "branch_$targetId"
                } else {
                    "all"
                }
                
                val priorityText = when(priority.lowercase()) {
                    "urgent" -> "ACİL: "
                    "high" -> "Önemli: "
                    else -> ""
                }

                NotificationRepository().createNotification(
                    personnelId = targetText,
                    title = "Yeni Duyuru Yayınlandı",
                    message = "$priorityText$title",
                    type = "new_announcement",
                    relatedId = announcementId
                )

                true
            } catch (e: Exception) {
                Log.e("AnnouncementRepository", "createAnnouncement error", e)
                false
            }
        }
    }
}

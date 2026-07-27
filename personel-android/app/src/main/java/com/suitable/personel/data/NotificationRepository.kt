package com.suitable.personel.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.UUID

data class NotificationItem(
    val id: String,
    val personnelId: String,
    val title: String,
    val message: String,
    val type: String,
    val relatedId: String?,
    val isRead: Boolean,
    val createdAt: String
)

class NotificationRepository {

    private fun parseBool(v: Any?): Boolean {
        return when (v) {
            is Boolean -> v
            is String -> v.toBoolean()
            is Number -> v.toInt() == 1
            else -> false
        }
    }

    suspend fun fetchNotifications(personnelId: String, branchId: String): List<NotificationItem> {
        return withContext(Dispatchers.IO) {
            try {
                // Fetch notifications targeted to this user, all users, or this branch
                val targets = listOf("all", "branch_$branchId", personnelId)
                val req = QueryRequest(
                    table = "personnel_notifications",
                    filters = listOf(
                        mapOf("type" to "in", "col" to "personnel_id", "val" to targets)
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                rows.map { row ->
                    NotificationItem(
                        id = row["id"]?.toString() ?: "",
                        personnelId = row["personnel_id"]?.toString() ?: "",
                        title = row["title"]?.toString() ?: "",
                        message = row["message"]?.toString() ?: "",
                        type = row["type"]?.toString() ?: "info",
                        relatedId = row["related_id"]?.toString(),
                        isRead = parseBool(row["is_read"]),
                        createdAt = row["created_at"]?.toString() ?: ""
                    )
                }.sortedByDescending { it.createdAt }
            } catch (e: Exception) {
                Log.e("NotificationRepository", "fetchNotifications error", e)
                emptyList()
            }
        }
    }

    suspend fun markAsRead(notificationId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "personnel_notifications",
                    operation = "update",
                    filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to notificationId)),
                    data = mapOf("is_read" to true)
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("NotificationRepository", "markAsRead error", e)
                false
            }
        }
    }

    suspend fun markAllAsRead(personnelId: String, branchId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val targets = listOf("all", "branch_$branchId", personnelId)
                val req = QueryRequest(
                    table = "personnel_notifications",
                    operation = "update",
                    filters = listOf(
                        mapOf("type" to "in", "col" to "personnel_id", "val" to targets)
                    ),
                    data = mapOf("is_read" to true)
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("NotificationRepository", "markAllAsRead error", e)
                false
            }
        }
    }

    suspend fun createNotification(
        personnelId: String,
        title: String,
        message: String,
        type: String,
        relatedId: String?
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "personnel_notifications",
                    operation = "insert",
                    data = mapOf(
                        "id" to UUID.randomUUID().toString(),
                        "personnel_id" to personnelId,
                        "title" to title,
                        "message" to message,
                        "type" to type,
                        "related_id" to relatedId,
                        "is_read" to false,
                        "created_at" to Instant.now().toString()
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                res.error == null
            } catch (e: Exception) {
                Log.e("NotificationRepository", "createNotification error", e)
                false
            }
        }
    }
}

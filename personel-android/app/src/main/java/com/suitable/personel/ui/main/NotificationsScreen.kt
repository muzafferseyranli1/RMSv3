package com.suitable.personel.ui.main

import android.widget.Toast
import androidx.compose.animation.*
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.personel.data.NotificationItem
import com.suitable.personel.data.NotificationRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    staffSession: StaffSession?,
    onNavigateBack: () -> Unit,
    onNavigateToTasks: () -> Unit,
    onNavigateToAnnouncements: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { NotificationRepository() }

    var notifications by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    val currentPersonnelId = staffSession?.id ?: ""
    val currentBranchId = staffSession?.activeBranchId ?: ""

    val loadNotifications = {
        isLoading = true
        scope.launch {
            notifications = repo.fetchNotifications(currentPersonnelId, currentBranchId)
            isLoading = false
        }
    }

    LaunchedEffect(key1 = true) {
        loadNotifications()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🔔 Bildirimler", fontWeight = FontWeight.Bold, color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Geri", tint = Color.White)
                    }
                },
                actions = {
                    if (notifications.any { !it.isRead }) {
                        TextButton(
                            onClick = {
                                scope.launch {
                                    val success = repo.markAllAsRead(currentPersonnelId, currentBranchId)
                                    if (success) {
                                        Toast.makeText(context, "Tüm bildirimler okundu yapıldı.", Toast.LENGTH_SHORT).show()
                                        loadNotifications()
                                    }
                                }
                            }
                        ) {
                            Text("Hepsini Okundu Yap", color = Color(0xFFF5A623), fontWeight = FontWeight.Bold)
                        }
                    }
                    IconButton(onClick = { loadNotifications() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF111111)
                )
            )
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
            } else if (notifications.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.NotificationsOff,
                        contentDescription = "Bildirim Yok",
                        tint = Color.Gray,
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Hiç bildiriminiz bulunmamaktadır.",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color.Gray
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(notifications) { item ->
                        NotificationRow(
                            notification = item,
                            onClick = {
                                scope.launch {
                                    // Mark as read
                                    if (!item.isRead) {
                                        repo.markAsRead(item.id)
                                    }
                                    // Redirect based on type
                                    when (item.type) {
                                        "task_assigned", "task_updated", "task_overdue" -> {
                                            onNavigateToTasks()
                                        }
                                        "new_announcement" -> {
                                            onNavigateToAnnouncements()
                                        }
                                        else -> {
                                            // just reload
                                            loadNotifications()
                                        }
                                    }
                                }
                            }
                        )
                        Divider(color = Color(0xFFE5E5E5), thickness = 1.dp)
                    }
                }
            }
        }
    }
}

@Composable
fun NotificationRow(
    notification: NotificationItem,
    onClick: () -> Unit
) {
    val (icon, tint, bgColor) = when (notification.type) {
        "task_assigned" -> Triple(Icons.Default.Assignment, Color(0xFF2563EB), Color(0xFFDBEAFE))
        "task_updated" -> Triple(Icons.Default.Edit, Color(0xFF15803D), Color(0xFFDCFCE7))
        "task_overdue" -> Triple(Icons.Default.Warning, Color(0xFFDC2626), Color(0xFFFEE2E2))
        "new_announcement" -> Triple(Icons.Default.Campaign, Color(0xFFD97706), Color(0xFFFEF3C7))
        "order_approval_pending" -> Triple(Icons.Default.ShoppingCart, Color(0xFF7C3AED), Color(0xFFF3E8FF))
        else -> Triple(Icons.Default.Notifications, Color(0xFF4B5563), Color(0xFFF3F4F6))
    }

    val rowBgColor = if (notification.isRead) Color.White else Color(0xFFF5A623).copy(alpha = 0.05f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(rowBgColor)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Icon Container
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(bgColor),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(22.dp)
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        // Content
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = notification.title,
                    fontSize = 15.sp,
                    fontWeight = if (notification.isRead) FontWeight.Normal else FontWeight.Bold,
                    color = Color(0xFF111111)
                )

                // Date label
                Text(
                    text = formatNotificationTime(notification.createdAt),
                    fontSize = 11.sp,
                    color = Color.Gray
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = notification.message,
                fontSize = 13.sp,
                color = if (notification.isRead) Color.Gray else Color(0xFF333333)
            )
        }

        if (!notification.isRead) {
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFF5A623))
                    .align(Alignment.CenterVertically)
            )
        }
    }
}

private fun formatNotificationTime(rawTime: String): String {
    return try {
        // Take: 2026-07-08T06:36:56Z -> 06:36
        if (rawTime.contains("T")) {
            val parts = rawTime.split("T")
            val date = parts[0].substring(5) // MM-DD
            val time = parts[1].take(5) // HH:MM
            "$date $time"
        } else {
            rawTime.take(16)
        }
    } catch (_: Exception) {
        rawTime
    }
}

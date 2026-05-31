package com.suitable.musteri.ui.main

import android.graphics.Bitmap
import android.util.Log
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo
import com.suitable.musteri.data.ApiClient
import com.suitable.musteri.data.QueryRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// ─── Model ───────────────────────────────────────────────────────────────────

data class CampaignItem(
    val id: String,
    val name: String,
    val description: String,
    val stackable: Boolean,
    val priority: Int,
    val color: Color,
    val rewardType: String,
    val rewardValue: String
)

// Birleşebilir / Münhasır grupları
enum class StackGroup { STACKABLE, EXCLUSIVE }

// Renk paleti — her kampanya farklı renk
private val CAMPAIGN_PALETTE = listOf(
    listOf(Color(0xFFEC4899), Color(0xFFBE185D)),
    listOf(Color(0xFF3B82F6), Color(0xFF1D4ED8)),
    listOf(Color(0xFF10B981), Color(0xFF059669)),
    listOf(Color(0xFFF59E0B), Color(0xFFD97706)),
    listOf(Color(0xFFA855F7), Color(0xFF7C3AED)),
    listOf(Color(0xFFEF4444), Color(0xFFDC2626)),
    listOf(Color(0xFF06B6D4), Color(0xFF0891B2)),
    listOf(Color(0xFF84CC16), Color(0xFF65A30D))
)

// ─── Screen ───────────────────────────────────────────────────────────────────

@Composable
fun CampaignsScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val haptic = LocalHapticFeedback.current
    var campaigns by remember { mutableStateOf<List<CampaignItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedIds by remember { mutableStateOf(setOf<String>()) }
    var showQrDialog by remember { mutableStateOf(false) }

    val primaryColor = remember(config) {
        val hex = (config?.branding?.get("primaryColor") as? String) ?: "#be185d"
        try { Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { Color(0xFFBE185D) }
    }

    // Load campaigns
    LaunchedEffect(Unit) {
        isLoading = true
        try {
            val res = withContext(Dispatchers.IO) {
                ApiClient.apiService.executeQuery(
                    QueryRequest(
                        table = "loyalty_campaigns",
                        select = "id,name,description,stackable,priority,audience_json,reward_type,reward_value,metadata,status,starts_at,ends_at",
                        filters = listOf(
                            mapOf("type" to "eq", "col" to "status", "val" to "active")
                        )
                    )
                )
            }
            val list = res.data as? List<*> ?: emptyList<Any>()
            val parsed = list.mapIndexedNotNull { idx, raw ->
                parseCampaign(raw, idx, customerInfo)
            }
            campaigns = parsed
        } catch (e: Exception) {
            Log.e("CampaignsScreen", "Load error", e)
        }
        isLoading = false
    }

    // Group by stackability
    val stackableGroup = campaigns.filter { it.stackable }
    val exclusiveGroup = campaigns.filter { !it.stackable }

    AppScaffold(config = config, customerInfo = customerInfo, onNavigate = onNavigate) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1E293B))
                        .statusBarsPadding()
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { onNavigate("home") }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri", tint = Color.White)
                    }
                    Text(
                        "Kampanyalar",
                        color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    if (selectedIds.isNotEmpty()) {
                        Text(
                            "${selectedIds.size} seçili",
                            color = primaryColor, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    }
                }

                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = primaryColor)
                    }
                } else if (campaigns.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("🎁", fontSize = 48.sp)
                            Text("Kampanya bulunamadı", color = Color(0xFF94A3B8), fontSize = 16.sp, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Birleşebilir kampanyalar
                        if (stackableGroup.isNotEmpty()) {
                            item {
                                SectionHeader("🟢  Birleştirilebilir Kampanyalar", subtitle = "Bu kampanyaları bir arada kullanabilirsiniz")
                            }
                            items(stackableGroup, key = { it.id }) { campaign ->
                                CampaignBanner(
                                    campaign = campaign,
                                    isSelected = selectedIds.contains(campaign.id),
                                    onLongPress = {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        selectedIds = if (selectedIds.contains(campaign.id))
                                            selectedIds - campaign.id
                                        else
                                            selectedIds + campaign.id
                                    }
                                )
                            }
                        }

                        // Ayırıcı
                        if (stackableGroup.isNotEmpty() && exclusiveGroup.isNotEmpty()) {
                            item { GroupDivider() }
                        }

                        // Münhasır kampanyalar
                        if (exclusiveGroup.isNotEmpty()) {
                            item {
                                SectionHeader("🔴  Münhasır Kampanyalar", subtitle = "Bu gruptan sadece 1 kampanya seçebilirsiniz")
                            }
                            items(exclusiveGroup, key = { it.id }) { campaign ->
                                val isSelected = selectedIds.contains(campaign.id)
                                // Exclusive group: başka exclusive seçiliyse disable
                                val isDisabled = !isSelected && selectedIds.any { sid ->
                                    exclusiveGroup.any { it.id == sid }
                                }
                                CampaignBanner(
                                    campaign = campaign,
                                    isSelected = isSelected,
                                    isDisabled = isDisabled,
                                    onLongPress = {
                                        if (!isDisabled) {
                                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            selectedIds = if (isSelected)
                                                selectedIds - campaign.id
                                            else {
                                                // exclusive grubundaki diğerleri kaldır
                                                val othersRemoved = selectedIds.filter { sid ->
                                                    exclusiveGroup.none { it.id == sid }
                                                }.toSet()
                                                othersRemoved + campaign.id
                                            }
                                        }
                                    }
                                )
                            }
                        }

                        item { Spacer(modifier = Modifier.height(80.dp)) }
                    }
                }
            }

            // FAB — QR Göster
            AnimatedVisibility(
                visible = selectedIds.isNotEmpty(),
                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp)
            ) {
                Button(
                    onClick = { showQrDialog = true },
                    shape = RoundedCornerShape(50),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                    modifier = Modifier
                        .shadow(8.dp, RoundedCornerShape(50))
                        .height(52.dp)
                        .padding(horizontal = 8.dp)
                ) {
                    Icon(Icons.Default.QrCode, contentDescription = null, tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("QR Kodu Göster", fontWeight = FontWeight.ExtraBold, color = Color.White)
                }
            }
        }
    }

    // QR Dialog
    if (showQrDialog) {
        val selectedCampaigns = campaigns.filter { selectedIds.contains(it.id) }
        CampaignQrDialog(
            campaigns = selectedCampaigns,
            campaignIds = selectedIds.toList(),
            onDismiss = { showQrDialog = false }
        )
    }
}

// ─── Banner ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CampaignBanner(
    campaign: CampaignItem,
    isSelected: Boolean,
    isDisabled: Boolean = false,
    onLongPress: () -> Unit
) {
    val gradientIndex = campaign.id.hashCode().let { abs(it) % CAMPAIGN_PALETTE.size }
    val gradColors = CAMPAIGN_PALETTE[gradientIndex]

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .combinedClickable(
                onClick = {},
                onLongClick = onLongPress
            )
            .alpha(if (isDisabled) 0.4f else 1f)
    ) {
        // Banner gradient
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(110.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(gradColors[0].copy(alpha = 0.9f), gradColors[1].copy(alpha = 0.95f))
                    ),
                    shape = RoundedCornerShape(20.dp)
                )
                .then(
                    if (isSelected) Modifier.border(3.dp, Color.White, RoundedCornerShape(20.dp))
                    else Modifier
                )
        ) {
            // Rope / banner holes decoration
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                BannerHole(); BannerHole()
            }

            // Content
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = campaign.name.uppercase(),
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (campaign.description.isNotBlank()) {
                    Text(
                        text = campaign.description,
                        color = Color.White.copy(alpha = 0.85f),
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }

            // Bottom rope decoration
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                BannerHole(); BannerHole()
            }
        }

        // Selected chip
        if (isSelected) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.White)
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text("✓ AKTİF", color = gradColors[0], fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
            }
        }

        // Long press hint (bottom)
        if (!isSelected && !isDisabled) {
            Text(
                text = "Seçmek için uzun basın",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 10.sp,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 12.dp, bottom = 6.dp)
            )
        }
    }
}

@Composable
fun BannerHole() {
    Box(
        modifier = Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.3f))
            .border(1.dp, Color.White.copy(alpha = 0.5f), CircleShape)
    )
}

@Composable
fun SectionHeader(title: String, subtitle: String = "") {
    Column(modifier = Modifier.padding(vertical = 4.dp)) {
        Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
        if (subtitle.isNotBlank()) {
            Text(subtitle, color = Color(0xFF94A3B8), fontSize = 11.sp, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
fun GroupDivider() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = Color(0xFF334155), thickness = 1.dp)
        Box(
            modifier = Modifier
                .padding(horizontal = 12.dp)
                .clip(RoundedCornerShape(50))
                .background(Color(0xFF334155))
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Text("veya", color = Color(0xFF94A3B8), fontSize = 11.sp)
        }
        HorizontalDivider(modifier = Modifier.weight(1f), color = Color(0xFF334155), thickness = 1.dp)
    }
}

// ─── QR Dialog ────────────────────────────────────────────────────────────────

@Composable
fun CampaignQrDialog(
    campaigns: List<CampaignItem>,
    campaignIds: List<String>,
    onDismiss: () -> Unit
) {
    val qrPayload = remember(campaignIds) {
        "{\"type\":\"campaigns\",\"ids\":${campaignIds.joinToString(",", "[\"", "\"]")}}"
    }
    val qrBitmap = remember(qrPayload) { generateQrBitmap(qrPayload) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Kampanya QR", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, "Kapat", tint = Color(0xFF94A3B8))
                    }
                }

                // QR Code
                if (qrBitmap != null) {
                    Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "QR Kod",
                        modifier = Modifier
                            .size(240.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White)
                            .padding(12.dp)
                    )
                }

                Text(
                    "POS'a veya kiosk'a gösterin",
                    color = Color(0xFF94A3B8), fontSize = 13.sp, textAlign = TextAlign.Center
                )

                // Selected campaign list
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    campaigns.forEach { camp ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF10B981), modifier = Modifier.size(16.dp))
                            Text(camp.name, color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

@Suppress("UNCHECKED_CAST")
fun parseCampaign(raw: Any?, index: Int, customerInfo: CustomerInfo?): CampaignItem? {
    val m = raw as? Map<*, *> ?: return null
    val id = m["id"] as? String ?: return null
    val name = m["name"] as? String ?: return null
    val description = m["description"] as? String ?: ""
    val stackable = m["stackable"] as? Boolean ?: false
    val priority = (m["priority"] as? Double)?.toInt() ?: 10
    val rewardType = m["reward_type"] as? String ?: ""
    val rewardValue = m["reward_value"] as? String ?: "0"

    // Audience check
    val audienceJson = m["audience_json"] as? Map<*, *>
    val audienceType = audienceJson?.get("type") as? String ?: "all"
    if (!matchesAudienceKt(audienceType, customerInfo)) return null

    // Skip internal smoke test campaigns
    val metadata = m["metadata"] as? Map<*, *>
    val source = metadata?.get("source") as? String ?: ""
    if (source.contains("smoke", ignoreCase = true)) return null

    val colorIdx = abs(id.hashCode()) % CAMPAIGN_PALETTE.size
    return CampaignItem(
        id = id, name = name, description = description,
        stackable = stackable, priority = priority,
        color = CAMPAIGN_PALETTE[colorIdx][0],
        rewardType = rewardType, rewardValue = rewardValue
    )
}

fun matchesAudienceKt(audienceType: String, customer: CustomerInfo?): Boolean {
    if (audienceType == "all") return true
    if (customer == null) return false
    // In the app all logged-in users are members; other rules shown to all
    return true
}

fun generateQrBitmap(content: String, size: Int = 512): Bitmap? {
    return try {
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
        bitmap
    } catch (e: Exception) { null }
}

private fun abs(n: Int): Int = if (n < 0) -n else n

package com.suitable.musteri.ui.main

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo
import java.text.NumberFormat
import java.util.Locale
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete

// ─── Shared Sidebar Composable ──────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit,
    showMenu: Boolean = true,
    onSelectTableClick: (() -> Unit)? = null,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    var showSidebarMenu by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        content()

        // Hamburger button — only shown on screens that don't have their own top bar
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
                    DropdownMenuItem(text = { Text("Hesabım") }, onClick = { showSidebarMenu = false })
                    DropdownMenuItem(
                        text = { Text("🪑  Masa") },
                        onClick = {
                            showSidebarMenu = false
                            onNavigate("table")
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("🎁  Kampanyalar") },
                        onClick = { showSidebarMenu = false; onNavigate("campaigns") }
                    )
                    DropdownMenuItem(
                        text = { Text("🎟️  Kuponlarım") },
                        onClick = { showSidebarMenu = false; onNavigate("coupons") }
                    )
                    DropdownMenuItem(text = { Text("Menü") }, onClick = { showSidebarMenu = false })
                    DropdownMenuItem(text = { Text("Şubeler") }, onClick = { showSidebarMenu = false })
                    DropdownMenuItem(text = { Text("Bize Ulaş") }, onClick = { showSidebarMenu = false })
                    DropdownMenuItem(
                        text = { Text("Çıkış Yap", color = Color.Red) },
                        onClick = {
                            showSidebarMenu = false
                            sharedPref.edit().remove("customerId").apply()
                            onNavigate("login")
                        }
                    )
                }
            }
        }
    }
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    var tableNumber by remember { mutableStateOf(sharedPref.getString("tableNumber", null)) }
    var showTableDialog by remember { mutableStateOf(false) }

    var showQrModal by remember { mutableStateOf(false) }
    var showOrderModal by remember { mutableStateOf(false) }
    var orderModalConfig by remember { mutableStateOf<Map<String, Any>?>(null) }
    var showSocialModal by remember { mutableStateOf(false) }
    var socialModalConfig by remember { mutableStateOf<Map<String, Any>?>(null) }

    // Read branding — API uses bodyBackgroundColor and backgroundImageUrl
    val bgColor = try {
        Color(android.graphics.Color.parseColor(
            config?.branding?.get("bodyBackgroundColor") as? String
                ?: config?.branding?.get("backgroundColor") as? String
                ?: "#021427"
        ))
    } catch (e: Exception) { Color(0xFF021427) }

    val bgImageUrl = config?.branding?.get("backgroundImageUrl") as? String
    val logoUrl = config?.branding?.get("logoUrl") as? String
    val buttonShape = config?.branding?.get("buttonShape") as? String ?: "rounded"
    val primaryColor = try {
        Color(android.graphics.Color.parseColor(config?.branding?.get("primaryColor") as? String ?: "#be185d"))
    } catch (e: Exception) { Color(0xFFbe185d) }

    AppScaffold(
        config = config,
        customerInfo = customerInfo,
        onNavigate = onNavigate,
        onSelectTableClick = { showTableDialog = true }
    ) {
        Box(modifier = Modifier.fillMaxSize().background(bgColor)) {
            // Background Image
            if (!bgImageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = bgImageUrl,
                    contentDescription = "Background",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
                // Dark overlay for readability
                Box(modifier = Modifier.fillMaxSize().background(Color(0x66000000)))
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars)
            ) {
                // Top row: 3 identical circles side-by-side (QR, Points, Stamp Progress)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, top = 16.dp, end = 76.dp, bottom = 8.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Circle 1: QR Code
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(Color.White)
                            .border(2.dp, primaryColor, CircleShape)
                            .clickable { showQrModal = true },
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.QrCode,
                                contentDescription = "QR Code",
                                tint = primaryColor,
                                modifier = Modifier.size(32.dp)
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("KOD", color = primaryColor, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    // Circle 2: Puan (Points)
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(primaryColor)
                            .border(2.dp, Color.White, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("PUAN", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            val formatter = NumberFormat.getNumberInstance(Locale("tr", "TR"))
                            val points = formatter.format(customerInfo?.pointsBalance ?: 0)
                            Text(points, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }

                    // Circle 3: Damga (Stamp Progress Circular Arc)
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF1E293B))
                            .border(2.dp, Color.White.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        val progress = customerInfo?.stampCampaigns?.firstOrNull()
                        val current = progress?.current ?: 0
                        val target = progress?.target ?: 5
                        val sweepAngle = (current.toFloat() / target.toFloat()) * 360f

                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize().padding(6.dp)) {
                                drawArc(
                                    color = Color.White.copy(alpha = 0.15f),
                                    startAngle = -90f,
                                    sweepAngle = 360f,
                                    useCenter = false,
                                    style = androidx.compose.ui.graphics.drawscope.Stroke(
                                        width = 4.dp.toPx(),
                                        cap = androidx.compose.ui.graphics.StrokeCap.Round
                                    )
                                )
                                if (sweepAngle > 0) {
                                    drawArc(
                                        color = primaryColor,
                                        startAngle = -90f,
                                        sweepAngle = sweepAngle,
                                        useCenter = false,
                                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                                            width = 4.dp.toPx(),
                                            cap = androidx.compose.ui.graphics.StrokeCap.Round
                                        )
                                    )
                                }
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("DAMGA", color = Color.White.copy(alpha = 0.7f), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                Text("$current/$target", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                }

                // Logo — kalan alanı doldurur, butonlar hiç küçülmez
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    if (!logoUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = logoUrl,
                            contentDescription = "Logo",
                            modifier = Modifier
                                .fillMaxWidth(1f)
                                .fillMaxHeight(),
                            contentScale = ContentScale.Fit
                        )
                    }
                }

                // Welcome Banner
                val welcomeText = if (!customerInfo?.adSoyad.isNullOrBlank())
                    "Hoş Geldiniz, ${customerInfo!!.adSoyad}"
                else
                    "Hoş Geldiniz"

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(primaryColor)
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = welcomeText,
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Active Table Banner
                if (tableNumber != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xCC000000))
                            .border(1.dp, primaryColor.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                            .clickable { onNavigate("table") }
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text("🪑", fontSize = 18.sp)
                                Column {
                                    Text("Aktif Masanız", color = Color.White.copy(alpha = 0.6f), fontSize = 10.sp)
                                    Text("Masa $tableNumber", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            Text(
                                "Değiştir",
                                color = primaryColor,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Grid Buttons — her zaman sabit yükseklik
                val buttons = config?.homeButtons ?: emptyList()
                if (buttons.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Transparent)
                            .padding(horizontal = 16.dp)
                            .padding(bottom = 16.dp, top = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        for (i in buttons.indices step 2) {
                            Row(
                                modifier = Modifier.fillMaxWidth().height(110.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                DynamicButton(buttons[i], buttonShape, Modifier.weight(1f)) {
                                    handleButtonClick(buttons[i], context, onNavigate) { modalType, cfg ->
                                        if (modalType == "order") { orderModalConfig = cfg; showOrderModal = true }
                                        if (modalType == "social") { socialModalConfig = cfg; showSocialModal = true }
                                    }
                                }
                                if (i + 1 < buttons.size) {
                                    DynamicButton(buttons[i + 1], buttonShape, Modifier.weight(1f)) {
                                        handleButtonClick(buttons[i + 1], context, onNavigate) { modalType, cfg ->
                                            if (modalType == "order") { orderModalConfig = cfg; showOrderModal = true }
                                            if (modalType == "social") { socialModalConfig = cfg; showSocialModal = true }
                                        }
                                    }
                                } else {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }


    // QR Modal
    if (showQrModal) {
        ModalBottomSheet(onDismissRequest = { showQrModal = false }) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(32.dp).padding(bottom = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Sadakat QR Kodunuz", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp))
                val qrContent = customerInfo?.loyaltyMemberNo?.takeIf { it.isNotBlank() }
                    ?: customerInfo?.telefon?.takeIf { it.isNotBlank() }
                    ?: customerInfo?.id?.takeIf { it.isNotBlank() }
                    ?: "MISAFIR"
                val qrBitmap = remember(qrContent) { generateQrCodeBitmap(qrContent, 600) }
                if (qrBitmap != null) {
                    Image(bitmap = qrBitmap.asImageBitmap(), contentDescription = "QR Code", modifier = Modifier.size(250.dp))
                } else {
                    Text("QR Kod oluşturulamadı.", color = Color.Red)
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(text = qrContent, fontSize = 14.sp, color = Color.Gray)
            }
        }
    }

    // Order Modal
    if (showOrderModal) {
        ModalBottomSheet(onDismissRequest = { showOrderModal = false }) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 32.dp)) {
                Text("Sipariş Ver", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp))
                val deliveryUrl = (orderModalConfig?.get("paketServisUrl") ?: orderModalConfig?.get("deliveryUrl")) as? String
                Button(
                    onClick = {
                        showOrderModal = false
                        val url = if (!deliveryUrl.isNullOrBlank()) deliveryUrl else "https://play.google.com/store/apps/details?id=com.proaktif.suitablelive"
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                ) { Text("Paket Servis Siparişi") }
                val enableTable = orderModalConfig?.get("enableTableOrder") as? Boolean ?: false
                Button(
                    onClick = {
                        showOrderModal = false
                        onNavigate("table")
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) { Text("Masa Siparişi") }
            }
        }
    }

    // Social Modal
    if (showSocialModal) {
        ModalBottomSheet(onDismissRequest = { showSocialModal = false }) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 32.dp)) {
                Text("Sosyal Medya", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp))
                val insta = socialModalConfig?.get("instagram") as? String
                val fb = socialModalConfig?.get("facebook") as? String
                val tw = socialModalConfig?.get("twitter") as? String
                if (!insta.isNullOrBlank()) Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(insta))) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { Text("Instagram") }
                if (!fb.isNullOrBlank()) Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fb))) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { Text("Facebook") }
                if (!tw.isNullOrBlank()) Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(tw))) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { Text("Twitter / X") }
            }
        }
    }

    // Table Selection Dialog
    if (showTableDialog) {
        TableSelectionDialog(
            currentTable = tableNumber,
            onDismiss = { showTableDialog = false },
            onSave = { newTable ->
                if (newTable.isNullOrBlank()) {
                    sharedPref.edit().remove("tableNumber").apply()
                    tableNumber = null
                } else {
                    sharedPref.edit().putString("tableNumber", newTable).apply()
                    tableNumber = newTable
                }
                showTableDialog = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableSelectionDialog(
    currentTable: String?,
    onDismiss: () -> Unit,
    onSave: (String?) -> Unit
) {
    var tableInput by remember { mutableStateOf(currentTable ?: "") }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Masa Seçimi", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                
                Text(
                    "Lütfen oturduğunuz masanın numarasını giriniz:",
                    color = Color(0xFF94A3B8),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )

                OutlinedTextField(
                    value = tableInput,
                    onValueChange = { tableInput = it },
                    label = { Text("Masa No", color = Color(0xFF94A3B8)) },
                    placeholder = { Text("Örn: 5", color = Color(0xFF475569)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF3B82F6),
                        unfocusedBorderColor = Color(0xFF334155),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )

                Button(
                    onClick = { onSave(tableInput.trim()) },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6))
                ) {
                    Icon(Icons.Default.Check, null, tint = Color.White)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Kaydet", fontWeight = FontWeight.Bold, color = Color.White)
                }

                if (currentTable != null) {
                    OutlinedButton(
                        onClick = { onSave(null) },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFFEF4444))
                    ) {
                        Icon(Icons.Default.Delete, null, tint = Color(0xFFEF4444))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Masadan Kalk", color = Color(0xFFEF4444))
                    }
                }

                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("İptal", color = Color(0xFF94A3B8))
                }
            }
        }
    }
}

// ─── DynamicButton ────────────────────────────────────────────────────────────

private fun getIconForName(iconName: String?, buttonType: String?): androidx.compose.ui.graphics.vector.ImageVector {
    val name = (iconName ?: "").lowercase()
    val type = (buttonType ?: "").lowercase()
    
    return when {
        name.contains("order") || name.contains("food") || name.contains("cart") || name.contains("dine") || type.contains("order") || type.contains("siparis") -> Icons.Default.Restaurant
        name.contains("campaign") || name.contains("gift") || name.contains("offer") || name.contains("coupon") || type.contains("kampanya") -> Icons.Default.Campaign
        name.contains("phone") || name.contains("call") || name.contains("tel") || type.contains("tel") || type.contains("ulas") || type.contains("bize_ulasin") -> Icons.Default.Phone
        name.contains("comment") || name.contains("feedback") || name.contains("chat") || name.contains("form") || type.contains("feedback") || type.contains("geri_bildirim") -> Icons.Default.Feedback
        name.contains("social") || name.contains("share") || name.contains("insta") || name.contains("fb") || name.contains("twitter") || type.contains("sosyal") -> Icons.Default.Share
        name.contains("info") || name.contains("about") || type.contains("kurumsal") -> Icons.Default.Info
        else -> Icons.Default.Star
    }
}

@Composable
fun DynamicButton(button: Map<String, Any>, shape: String, modifier: Modifier, onClick: () -> Unit) {
    val btnColor = try {
        Color(android.graphics.Color.parseColor(button["color"] as? String ?: "#1a1a2e"))
    } catch (e: Exception) { Color(0xFF1a1a2e) }

    val cornerShape = when (shape) {
        "square" -> RoundedCornerShape(4.dp)
        "pill" -> RoundedCornerShape(50)
        else -> RoundedCornerShape(16.dp)
    }

    val icon = getIconForName(button["icon"] as? String, button["type"] as? String)

    Card(
        modifier = modifier.fillMaxHeight().clickable { onClick() }.shadow(4.dp, cornerShape),
        shape = cornerShape,
        colors = CardDefaults.cardColors(containerColor = btnColor)
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = button["label"] as? String ?: "",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

// ─── Button Click Handler ────────────────────────────────────────────────────

fun handleButtonClick(
    btn: Map<String, Any>,
    context: Context,
    onNavigate: (String) -> Unit,
    showModal: (String, Map<String, Any>?) -> Unit
) {
    val type = btn["type"] as? String
    @Suppress("UNCHECKED_CAST")
    val config = btn["config"] as? Map<String, Any>

    when (type) {
        // Admin panelinde kayıtlı tipler
        "kampanyalar", "app_page" -> {
            val pageKey = config?.get("pageKey") as? String
            if (pageKey == "campaigns") onNavigate("coupons")
            else onNavigate("coupons")
        }
        "siparis_ver", "order" -> showModal("order", config)
        "telefon_et" -> {
            val phone = (config?.get("phone") ?: config?.get("phoneNumber")) as? String
            if (!phone.isNullOrBlank()) {
                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
            }
        }
        "kurumsal", "ozel_web" -> {
            val url = config?.get("url") as? String
            if (!url.isNullOrBlank()) context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
        "sosyal_medya" -> showModal("social", config)
        "bize_ulasin" -> {
            val phone = (config?.get("phone") ?: config?.get("phoneNumber")) as? String
            if (!phone.isNullOrBlank()) {
                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
            }
        }
        "ozel_uyg_ici" -> {
            val page = config?.get("targetPage") as? String
            if (!page.isNullOrBlank()) onNavigate(page)
        }
        "geri_bildirim", "feedback" -> {
            @Suppress("UNCHECKED_CAST")
            val surveyIds: List<String> = when {
                config?.get("surveyFormIds") is List<*> ->
                    (config["surveyFormIds"] as List<*>).mapNotNull { it as? String }
                config?.get("formTemplateId") is String && (config["formTemplateId"] as String).isNotBlank() ->
                    listOf(config["formTemplateId"] as String)
                else -> emptyList()
            }
            if (surveyIds.isNotEmpty()) {
                onNavigate("feedback:" + surveyIds.joinToString(","))
            } else {
                onNavigate("feedback:")
            }
        }
    }
}

// ─── Loyalty Stamp Bar ────────────────────────────────────────────────────────

@Composable
fun LoyaltyStampBar(
    pointsBalance: Int,
    modifier: Modifier = Modifier,
    totalStamps: Int = 10
) {
    // Backward compat stub — not used directly anymore
}

@Composable
fun LoyaltyStampSection(
    customerInfo: CustomerInfo?,
    modifier: Modifier = Modifier
) {
    if (customerInfo == null) return

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // ── Puan satırı ──────────────────────────────────────────────────────
        if (customerInfo.pointsBalance > 0) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0x88000000))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "💰 Birikmiş Puanınız",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "${customerInfo.pointsBalance} puan",
                    color = Color(0xFFFFD700),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }

        // ── Damga kampanyaları ────────────────────────────────────────────────
        for (stamp in customerInfo.stampCampaigns) {
            StampCampaignBar(stamp = stamp)
        }
    }
}

@Composable
fun StampCampaignBar(stamp: com.suitable.musteri.data.StampCampaignProgress) {
    val filledCount = stamp.current % stamp.target  // current cycle position
    val isCoffee = stamp.campaignName.contains("kahve", ignoreCase = true) ||
                   stamp.productName?.contains("kahve", ignoreCase = true) == true

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0x88000000))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        // Başlık satırı
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stamp.campaignName,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            if (stamp.completedCycles > 0) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFF16A34A))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = "🎁 ${stamp.completedCycles} Hediye",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Damga slotları + sayaç
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Sol sayı (dolu)
            Text(
                text = filledCount.toString(),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.widthIn(min = 18.dp)
            )
            // Damga kutucukları
            for (i in 0 until stamp.target) {
                val isFilled = i < filledCount
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(
                            if (isFilled) Color(0xFF4ADE80)   // yeşil - dolu
                            else Color(0xFFFF9999)              // pembe - boş
                        )
                )
            }
            // Sağ sayı (kalan)
            Text(
                text = (stamp.target - filledCount).toString(),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.widthIn(min = 18.dp),
                textAlign = TextAlign.End
            )
        }
    }
}

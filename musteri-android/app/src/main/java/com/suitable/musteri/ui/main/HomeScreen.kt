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
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.QrCode
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

// ─── Shared Sidebar Composable ──────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    var showSidebarMenu by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        content()

        // Hamburger button always on top-right
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(Color(0xCC1E1E1E))
                    .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
                    .clickable { showSidebarMenu = true },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Menu, contentDescription = "Menu", tint = Color.White, modifier = Modifier.size(24.dp))
            }

            DropdownMenu(
                expanded = showSidebarMenu,
                onDismissRequest = { showSidebarMenu = false }
            ) {
                DropdownMenuItem(text = { Text("Hesabım") }, onClick = { showSidebarMenu = false })
                DropdownMenuItem(text = { Text("Kampanyalar") }, onClick = { showSidebarMenu = false; onNavigate("coupons") })
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

// ─── HomeScreen ──────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
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

    AppScaffold(config = config, customerInfo = customerInfo, onNavigate = onNavigate) {
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
                // Top row: Points circle (left) | spacer | (menu is in AppScaffold overlay)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, top = 12.dp, end = 70.dp, bottom = 0.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    // Left: Points & QR
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        // Points Circle
                        Box(
                            modifier = Modifier
                                .size(72.dp)
                                .clip(CircleShape)
                                .background(primaryColor)
                                .border(2.dp, Color.White, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("PUAN", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                val formatter = NumberFormat.getNumberInstance(Locale("tr", "TR"))
                                val points = formatter.format(customerInfo?.pointsBalance ?: 0)
                                Text(points, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // QR Icon Circle
                        Box(
                            modifier = Modifier
                                .size(50.dp)
                                .clip(CircleShape)
                                .background(Color.White)
                                .clickable { showQrModal = true },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.QrCode, contentDescription = "QR Code", tint = Color.Black, modifier = Modifier.size(28.dp))
                        }
                    }
                }

                // Logo (center)
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
                                .fillMaxWidth(0.75f)
                                .wrapContentHeight()
                                .clip(RoundedCornerShape(16.dp)),
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

                // Loyalty Stamp & Points Section
                LoyaltyStampSection(
                    customerInfo = customerInfo,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .padding(bottom = 8.dp)
                )

                // Grid Buttons
                val buttons = config?.homeButtons ?: emptyList()
                if (buttons.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Transparent)
                            .padding(16.dp),
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
                        Spacer(modifier = Modifier.height(8.dp))
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
                val deliveryUrl = orderModalConfig?.get("deliveryUrl") as? String
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
                    onClick = { showOrderModal = false },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = if (enableTable) MaterialTheme.colorScheme.primary else Color.Gray)
                ) { Text(if (enableTable) "Masa Siparişi" else "Masa Siparişi (Yakında)") }
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
}

// ─── DynamicButton ────────────────────────────────────────────────────────────

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
        "geri_bildirim", "feedback" -> { /* todo */ }
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

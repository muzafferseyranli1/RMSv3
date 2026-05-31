package com.suitable.musteri.ui.main

import android.content.Context
import android.content.Intent
import android.net.Uri
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: AppConfig?,
    customerInfo: CustomerInfo?,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    
    var showOrderModal by remember { mutableStateOf(false) }
    var orderModalConfig by remember { mutableStateOf<Map<String, Any>?>(null) }
    var showSocialModal by remember { mutableStateOf(false) }
    var socialModalConfig by remember { mutableStateOf<Map<String, Any>?>(null) }
    var showQrModal by remember { mutableStateOf(false) }
    var showSidebarMenu by remember { mutableStateOf(false) }

    val bgColor = try { Color(android.graphics.Color.parseColor(config?.branding?.get("backgroundColor") as? String ?: "#0F172A")) } catch (e: Exception) { Color(0xFF0F172A) }
    val bgImageUrl = config?.branding?.get("backgroundImageUrl") as? String
    val logoUrl = config?.branding?.get("logoUrl") as? String
    val buttonShape = config?.branding?.get("buttonShape") as? String ?: "rounded"

    Box(modifier = Modifier.fillMaxSize().background(bgColor)) {
        // Background Image
        if (!bgImageUrl.isNullOrBlank()) {
            AsyncImage(
                model = bgImageUrl,
                contentDescription = "Background",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            // Fallback dark overlay if no image
            Box(modifier = Modifier.fillMaxSize().background(Color(0xAA000000)))
        }

        // Top Content Layer
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header Row: Points/QR (Left) and Hamburger Menu (Right)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .padding(top = 16.dp), // status bar padding approximation
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                // Left: Points & QR
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    // Points Circle
                    Box(
                        modifier = Modifier
                            .size(70.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFD32F2F)) // Red circle
                            .border(2.dp, Color.White, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("PUAN", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                        Icon(Icons.Default.QrCode, contentDescription = "QR Code", tint = Color.Black, modifier = Modifier.size(30.dp))
                    }
                }

                // Right: Menu Button
                Box {
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF1E1E1E))
                            .clickable { showSidebarMenu = true },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Menu, contentDescription = "Menu", tint = Color.White, modifier = Modifier.size(28.dp))
                    }

                    DropdownMenu(
                        expanded = showSidebarMenu,
                        onDismissRequest = { showSidebarMenu = false },
                        modifier = Modifier.align(Alignment.TopEnd)
                    ) {
                        DropdownMenuItem(text = { Text("Hesabım") }, onClick = { showSidebarMenu = false })
                        DropdownMenuItem(text = { Text("Kampanyalar") }, onClick = { showSidebarMenu = false; onNavigate("coupons") })
                        DropdownMenuItem(text = { Text("Menü") }, onClick = { showSidebarMenu = false })
                        DropdownMenuItem(text = { Text("Şubeler") }, onClick = { showSidebarMenu = false })
                        DropdownMenuItem(text = { Text("Bize Ulaş") }, onClick = { showSidebarMenu = false })
                        DropdownMenuItem(
                            text = { Text("Çıkış Yap") }, 
                            onClick = { 
                                showSidebarMenu = false
                                sharedPref.edit().remove("customerId").apply()
                                onNavigate("login")
                            }
                        )
                    }
                }
            }

            // Logo
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
                            .size(220.dp)
                            .clip(RoundedCornerShape(16.dp)),
                        contentScale = ContentScale.Fit
                    )
                }
            }

            // Welcome Banner
            val welcomeText = if (customerInfo?.adSoyad.isNullOrBlank()) "Hoş Geldiniz" else "Hoş Geldiniz, ${customerInfo?.adSoyad}"
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFD32F2F)) // Red banner
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = welcomeText,
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Grid Buttons Layer
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x99000000)) // Semi-transparent overlay behind buttons for readability
                    .padding(16.dp)
            ) {
                val buttons = config?.homeButtons ?: emptyList()
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    for (i in buttons.indices step 2) {
                        Row(
                            modifier = Modifier.fillMaxWidth().height(120.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            val btn1 = buttons[i]
                            DynamicButton(btn1, buttonShape, Modifier.weight(1f)) {
                                handleButtonClick(btn1, context, onNavigate) { modalType, cfg ->
                                    if (modalType == "order") { orderModalConfig = cfg; showOrderModal = true }
                                    if (modalType == "social") { socialModalConfig = cfg; showSocialModal = true }
                                }
                            }
                            
                            if (i + 1 < buttons.size) {
                                val btn2 = buttons[i + 1]
                                DynamicButton(btn2, buttonShape, Modifier.weight(1f)) {
                                    handleButtonClick(btn2, context, onNavigate) { modalType, cfg ->
                                        if (modalType == "order") { orderModalConfig = cfg; showOrderModal = true }
                                        if (modalType == "social") { socialModalConfig = cfg; showSocialModal = true }
                                    }
                                }
                            } else {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }
        }
    }

    if (showOrderModal) {
        ModalBottomSheet(onDismissRequest = { showOrderModal = false }) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 32.dp)) {
                Text("Sipariş Ver", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp))
                Button(
                    onClick = {
                        showOrderModal = false
                        val url = orderModalConfig?.get("paketServisUrl") as? String
                        val finalUrl = if (url.isNullOrBlank()) "https://play.google.com/store/apps/details?id=com.proaktif.suitablelive" else url
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(finalUrl))
                        context.startActivity(intent)
                    },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                ) {
                    Text("Paket Servis Siparişi (SuitableLive)")
                }
                Button(
                    onClick = {
                        showOrderModal = false
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Gray)
                ) {
                    Text("Masa Siparişi (Yakında)")
                }
            }
        }
    }

    if (showSocialModal) {
        ModalBottomSheet(onDismissRequest = { showSocialModal = false }) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 32.dp)) {
                Text("Sosyal Medya", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp))
                val insta = socialModalConfig?.get("instagram") as? String
                val fb = socialModalConfig?.get("facebook") as? String
                val tw = socialModalConfig?.get("twitter") as? String
                
                if (!insta.isNullOrBlank()) {
                    Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(insta))) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { Text("Instagram") }
                }
                if (!fb.isNullOrBlank()) {
                    Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fb))) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { Text("Facebook") }
                }
                if (!tw.isNullOrBlank()) {
                    Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(tw))) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { Text("Twitter / X") }
                }
            }
        }
    }

    if (showQrModal) {
        ModalBottomSheet(onDismissRequest = { showQrModal = false }) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(32.dp).padding(bottom = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Sadakat QR Kodunuz", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp))
                
                val qrContent = customerInfo?.loyaltyMemberNo.takeIf { !it.isNullOrBlank() } ?: customerInfo?.telefon ?: "BILINMEYEN"
                val qrBitmap = remember(qrContent) { generateQrCodeBitmap(qrContent, 600) }
                
                if (qrBitmap != null) {
                    androidx.compose.foundation.Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "QR Code",
                        modifier = Modifier.size(250.dp)
                    )
                } else {
                    Text("QR Kod oluşturulamadı.", color = Color.Red)
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                Text(text = qrContent, fontSize = 16.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
fun DynamicButton(button: Map<String, Any>, shape: String, modifier: Modifier, onClick: () -> Unit) {
    val btnColor = try { Color(android.graphics.Color.parseColor(button["color"] as? String ?: "#1E1E1E")) } catch (e: Exception) { Color(0xFF1E1E1E) }
    
    val shapeModifier = when (shape) {
        "square" -> RoundedCornerShape(4.dp)
        "pill" -> RoundedCornerShape(50)
        else -> RoundedCornerShape(16.dp)
    }

    Card(
        modifier = modifier.fillMaxHeight().clickable { onClick() }.shadow(4.dp, shapeModifier),
        shape = shapeModifier,
        colors = CardDefaults.cardColors(containerColor = btnColor)
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // If the icon field has a name from fontawesome, we would map it. For now, just show text.
            Text(
                text = button["label"] as? String ?: "",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

fun handleButtonClick(
    btn: Map<String, Any>, 
    context: Context, 
    onNavigate: (String) -> Unit,
    showModal: (String, Map<String, Any>?) -> Unit
) {
    val type = btn["type"] as? String
    val config = btn["config"] as? Map<String, Any>

    when (type) {
        "kampanyalar" -> onNavigate("coupons")
        "siparis_ver" -> showModal("order", config)
        "telefon_et" -> {
            val phone = config?.get("phone") as? String
            if (!phone.isNullOrBlank()) {
                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                context.startActivity(intent)
            }
        }
        "kurumsal", "ozel_web" -> {
            val url = config?.get("url") as? String
            if (!url.isNullOrBlank()) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                context.startActivity(intent)
            }
        }
        "sosyal_medya" -> showModal("social", config)
        "bize_ulasin" -> {
            val phone = config?.get("phone") as? String
            if (!phone.isNullOrBlank()) {
                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                context.startActivity(intent)
            }
        }
        "ozel_uyg_ici" -> {
            val page = config?.get("targetPage") as? String
            if (!page.isNullOrBlank()) onNavigate(page)
        }
        "geri_bildirim" -> {
            // Later: Navigate to feedback screen
        }
    }
}

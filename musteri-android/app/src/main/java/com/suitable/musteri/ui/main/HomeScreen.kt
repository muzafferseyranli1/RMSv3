package com.suitable.musteri.ui.main

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.suitable.musteri.data.AppConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: AppConfig?,
    customerName: String,
    onNavigate: (String) -> Unit
) {
    val context = LocalContext.current
    var showOrderModal by remember { mutableStateOf(false) }
    var orderModalConfig by remember { mutableStateOf<Map<String, Any>?>(null) }
    var showSocialModal by remember { mutableStateOf(false) }
    var socialModalConfig by remember { mutableStateOf<Map<String, Any>?>(null) }

    val bgColor = try { Color(android.graphics.Color.parseColor(config?.branding?.get("backgroundColor") as? String ?: "#0F172A")) } catch (e: Exception) { Color(0xFF0F172A) }
    val logoBgColor = try { 
        val colorStr = config?.branding?.get("logoAreaBackgroundColor") as? String ?: "transparent"
        if (colorStr == "transparent") Color.Transparent else Color(android.graphics.Color.parseColor(colorStr))
    } catch (e: Exception) { Color.Transparent }
    
    val bgImageUrl = config?.branding?.get("backgroundImageUrl") as? String
    val logoUrl = config?.branding?.get("logoUrl") as? String

    Box(modifier = Modifier.fillMaxSize().background(bgColor)) {
        if (!bgImageUrl.isNullOrBlank()) {
            AsyncImage(
                model = bgImageUrl,
                contentDescription = "Background",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }

        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Top Section (Logo and Welcome)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(logoBgColor),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (!logoUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = logoUrl,
                            contentDescription = "Logo",
                            modifier = Modifier.size(120.dp).clip(CircleShape)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                    }
                    Text(
                        text = "Hoş Geldiniz,\n$customerName",
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    // Stamp Indicator Mock
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("3", color = Color.White, fontWeight = FontWeight.Bold)
                        repeat(3) {
                            Box(modifier = Modifier.size(30.dp, 10.dp).background(Color(0xFFA3E635), RoundedCornerShape(2.dp)))
                        }
                        repeat(2) {
                            Box(modifier = Modifier.size(30.dp, 10.dp).background(Color(0xFFFCA5A5), RoundedCornerShape(2.dp)))
                        }
                        Text("2", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Bottom Section (Grid Buttons)
            val buttons = config?.homeButtons ?: emptyList()
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                for (i in buttons.indices step 2) {
                    Row(
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        val btn1 = buttons[i]
                        DynamicButton(btn1, Modifier.weight(1f)) {
                            handleButtonClick(btn1, context, onNavigate) { modalType, cfg ->
                                if (modalType == "order") { orderModalConfig = cfg; showOrderModal = true }
                                if (modalType == "social") { socialModalConfig = cfg; showSocialModal = true }
                            }
                        }
                        
                        if (i + 1 < buttons.size) {
                            val btn2 = buttons[i + 1]
                            DynamicButton(btn2, Modifier.weight(1f)) {
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
                Spacer(modifier = Modifier.height(24.dp))
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
                        // Later: navigate to Masa Siparişi screen
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
}

@Composable
fun DynamicButton(button: Map<String, Any>, modifier: Modifier, onClick: () -> Unit) {
    val btnColor = try { Color(android.graphics.Color.parseColor(button["color"] as? String ?: "#3B82F6")) } catch (e: Exception) { Color(0xFF3B82F6) }
    
    Card(
        modifier = modifier.fillMaxHeight().clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = btnColor)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = button["label"] as? String ?: "",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp
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

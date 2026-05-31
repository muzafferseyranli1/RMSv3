package com.suitable.musteri.ui.main

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.suitable.musteri.data.ApiClient
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo
import com.suitable.musteri.data.QueryRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ─── Coupon Wallet Model ──────────────────────────────────────────────────────

data class CouponWalletItem(
    val id: String,
    val code: String,
    val seriesName: String,
    val campaignName: String,
    val description: String,
    val benefit: CouponBenefit,
    val isUsed: Boolean,
    val colorIdx: Int
)

sealed class CouponBenefit {
    data class Amount(val value: String) : CouponBenefit()
    data class Percent(val value: String) : CouponBenefit()
    object Gift : CouponBenefit()
}

// Color palette for coupons
private val COUPON_PALETTE = listOf(
    Color(0xFFEC4899) to Color(0xFF9D174D),
    Color(0xFF3B82F6) to Color(0xFF1E40AF),
    Color(0xFF10B981) to Color(0xFF065F46),
    Color(0xFFF59E0B) to Color(0xFF92400E),
    Color(0xFFA855F7) to Color(0xFF6B21A8),
    Color(0xFFEF4444) to Color(0xFF991B1B),
    Color(0xFF06B6D4) to Color(0xFF164E63),
)

// Prefs key for stored coupon codes
private const val PREF_COUPON_CODES = "wallet_coupon_codes"

// ─── Screen ───────────────────────────────────────────────────────────────────

@Composable
fun CouponsScreen(
    config: AppConfig? = null,
    customerInfo: CustomerInfo? = null,
    onNavigate: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)

    var coupons by remember { mutableStateOf<List<CouponWalletItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showAddDialog by remember { mutableStateOf(false) }
    var selectedCoupon by remember { mutableStateOf<CouponWalletItem?>(null) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val primaryColor = remember(config) {
        val hex = (config?.branding?.get("primaryColor") as? String) ?: "#be185d"
        try { Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { Color(0xFFBE185D) }
    }

    // QR Scanner launcher
    val qrScanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            val code = result.contents.trim()
            scope.launch {
                val err = addCouponByCode(code, prefs)
                if (err != null) {
                    errorMsg = err
                } else {
                    coupons = loadCoupons(prefs)
                }
            }
        }
    }

    // Load stored coupons on start
    LaunchedEffect(Unit) {
        isLoading = true
        coupons = loadCoupons(prefs)
        isLoading = false
    }

    AppScaffold(config = config, customerInfo = customerInfo, onNavigate = onNavigate) {
        Box(
            modifier = modifier
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
                        "Kuponlarım",
                        color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    // Add coupon button
                    IconButton(onClick = { showAddDialog = true }) {
                        Icon(Icons.Default.Add, "Kupon Ekle", tint = Color.White)
                    }
                    // QR Scan button
                    IconButton(onClick = {
                        val opts = ScanOptions()
                            .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            .setPrompt("Kupon QR'ını okutun")
                            .setBeepEnabled(true)
                            .setOrientationLocked(false)
                        qrScanLauncher.launch(opts)
                    }) {
                        Icon(Icons.Default.QrCodeScanner, "QR Okut", tint = Color.White)
                    }
                }

                // Error banner
                errorMsg?.let { msg ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF7F1D1D))
                            .padding(12.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Error, null, tint = Color(0xFFFCA5A5), modifier = Modifier.size(18.dp))
                            Text(msg, color = Color(0xFFFCA5A5), fontSize = 13.sp, modifier = Modifier.weight(1f))
                            IconButton(onClick = { errorMsg = null }, modifier = Modifier.size(24.dp)) {
                                Icon(Icons.Default.Close, null, tint = Color(0xFFFCA5A5))
                            }
                        }
                    }
                }

                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = primaryColor)
                    }
                } else if (coupons.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text("🎟️", fontSize = 56.sp)
                            Text("Henüz kuponunuz yok", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "Kupon kodu girerek veya QR okutarak ekleyebilirsiniz",
                                color = Color(0xFF94A3B8), fontSize = 13.sp, textAlign = TextAlign.Center,
                                modifier = Modifier.padding(horizontal = 32.dp)
                            )
                            Button(
                                onClick = { showAddDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(Icons.Default.Add, null, tint = Color.White)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Kupon Ekle", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        items(coupons, key = { it.id }) { coupon ->
                            JaggedCouponCard(
                                coupon = coupon,
                                onClick = { selectedCoupon = coupon }
                            )
                        }
                        item { Spacer(modifier = Modifier.height(24.dp)) }
                    }
                }
            }
        }
    }

    // Add coupon dialog
    if (showAddDialog) {
        AddCouponDialog(
            onDismiss = { showAddDialog = false },
            onAdd = { code ->
                showAddDialog = false
                scope.launch {
                    isLoading = true
                    val err = addCouponByCode(code, prefs)
                    if (err != null) errorMsg = err
                    coupons = loadCoupons(prefs)
                    isLoading = false
                }
            },
            onScanQr = {
                showAddDialog = false
                val opts = ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt("Kupon QR'ını okutun")
                    .setBeepEnabled(true)
                    .setOrientationLocked(false)
                qrScanLauncher.launch(opts)
            }
        )
    }

    // QR display dialog (kupon detayı)
    selectedCoupon?.let { coupon ->
        CouponDetailDialog(
            coupon = coupon,
            onDismiss = { selectedCoupon = null }
        )
    }
}

// ─── Jagged Coupon Card ───────────────────────────────────────────────────────

@Composable
fun JaggedCouponCard(coupon: CouponWalletItem, onClick: () -> Unit) {
    val (color1, color2) = COUPON_PALETTE[coupon.colorIdx % COUPON_PALETTE.size]

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(110.dp)
            .drawBehind { drawJaggedCoupon(this, color1, color2) }
            .clickable { onClick() }
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            // ─ Sol kısım: Fayda ─
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(90.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    when (coupon.benefit) {
                        is CouponBenefit.Amount -> {
                            Text(
                                coupon.benefit.value,
                                color = Color.White,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.ExtraBold,
                                textAlign = TextAlign.Center
                            )
                            Text("TL", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
                        }
                        is CouponBenefit.Percent -> {
                            Text(
                                coupon.benefit.value,
                                color = Color.White,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold,
                                textAlign = TextAlign.Center
                            )
                            Text("İNDİRİM", color = Color.White.copy(alpha = 0.8f), fontSize = 9.sp)
                        }
                        is CouponBenefit.Gift -> {
                            Text("🎁", fontSize = 32.sp)
                        }
                    }
                }
            }

            // Dikey kesme çizgisi (tırtıklı)
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(1.dp)
                    .background(Color.White.copy(alpha = 0.3f))
            )

            // ─ Sağ kısım: Kampanya bilgisi ─
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    coupon.campaignName.uppercase(),
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    letterSpacing = 0.3.sp
                )
                if (coupon.description.isNotBlank()) {
                    Text(
                        coupon.description,
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 11.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
                Text(
                    "Kullanmak için dokunun",
                    color = Color.White.copy(alpha = 0.5f),
                    fontSize = 10.sp,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }

            // Sağ kenarda QR ikonu
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(40.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.QrCode2,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.7f),
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

// Tırtıklı (jagged) kupon arka planı çizer
fun drawJaggedCoupon(scope: DrawScope, color1: Color, color2: Color) {
    val w = scope.size.width
    val h = scope.size.height
    val teethSize = 8.dp.value * scope.density
    val teethCount = (h / teethSize).toInt()
    val leftX = 80.dp.value * scope.density

    val path = Path().apply {
        moveTo(0f, 0f)
        lineTo(leftX - teethSize, 0f)
        // Left jagged edge
        for (i in 0..teethCount) {
            val y = i * teethSize
            lineTo(if (i % 2 == 0) leftX else leftX - teethSize, y)
        }
        lineTo(leftX - teethSize, h)
        lineTo(0f, h)
        close()
    }

    val rightPath = Path().apply {
        moveTo(leftX, 0f)
        lineTo(w, 0f)
        lineTo(w, h)
        lineTo(leftX, h)
        // Right jagged edge (matching left)
        for (i in teethCount downTo 0) {
            val y = i * teethSize
            lineTo(if (i % 2 == 0) leftX else leftX + teethSize / 2f, y)
        }
        close()
    }

    scope.drawPath(path, Brush.verticalGradient(listOf(color1, color2)))
    scope.drawPath(rightPath, Brush.horizontalGradient(listOf(color1.copy(alpha = 0.85f), color2)))
}

// ─── Add Coupon Dialog ────────────────────────────────────────────────────────

@Composable
fun AddCouponDialog(onDismiss: () -> Unit, onAdd: (String) -> Unit, onScanQr: () -> Unit) {
    var code by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Kupon Ekle", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)

                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.uppercase() },
                    label = { Text("Kupon Kodu", color = Color(0xFF94A3B8)) },
                    placeholder = { Text("Örn: KPN123456", color = Color(0xFF475569)) },
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
                    onClick = { if (code.isNotBlank()) onAdd(code.trim()) },
                    enabled = code.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6))
                ) {
                    Icon(Icons.Default.Add, null, tint = Color.White)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Ekle", fontWeight = FontWeight.Bold, color = Color.White)
                }

                OutlinedButton(
                    onClick = onScanQr,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Color(0xFF334155))
                ) {
                    Icon(Icons.Default.QrCodeScanner, null, tint = Color.White)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("QR Kod Okut", color = Color.White)
                }

                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("İptal", color = Color(0xFF94A3B8))
                }
            }
        }
    }
}

// ─── Coupon Detail / QR Dialog ────────────────────────────────────────────────

@Composable
fun CouponDetailDialog(coupon: CouponWalletItem, onDismiss: () -> Unit) {
    val qrBitmap = remember(coupon.code) { generateCouponQrBitmap(coupon.code) }
    val (c1, _) = COUPON_PALETTE[coupon.colorIdx % COUPON_PALETTE.size]

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
                    Column {
                        Text(coupon.campaignName, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                        if (coupon.description.isNotBlank()) {
                            Text(coupon.description, color = Color(0xFF94A3B8), fontSize = 12.sp)
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, "Kapat", tint = Color(0xFF94A3B8))
                    }
                }

                // QR Code
                if (qrBitmap != null) {
                    Box(
                        modifier = Modifier
                            .size(220.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.White)
                            .padding(12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            bitmap = qrBitmap.asImageBitmap(),
                            contentDescription = "Kupon QR",
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }

                // Kupon kodu
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(c1.copy(alpha = 0.15f))
                        .border(1.dp, c1.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                        .padding(12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        coupon.code,
                        color = c1,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 3.sp
                    )
                }

                Text(
                    "QR'ı gösterin veya kodu söyleyin",
                    color = Color(0xFF94A3B8), fontSize = 12.sp, textAlign = TextAlign.Center
                )

                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    border = BorderStroke(1.dp, Color(0xFF334155)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Kapat", color = Color.White)
                }
            }
        }
    }
}

// ─── Data / Logic ─────────────────────────────────────────────────────────────

fun generateCouponQrBitmap(code: String): android.graphics.Bitmap? {
    return try {
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(code, BarcodeFormat.QR_CODE, 512, 512)
        val bitmap = android.graphics.Bitmap.createBitmap(512, 512, android.graphics.Bitmap.Config.RGB_565)
        for (x in 0 until 512) for (y in 0 until 512) {
            bitmap.setPixel(x, y, if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
        bitmap
    } catch (e: Exception) { null }
}

// Kupon kodunu DB'de doğrulayıp wallet'a ekler. Hata varsa string döner.
suspend fun addCouponByCode(code: String, prefs: SharedPreferences): String? {
    return withContext(Dispatchers.IO) {
        try {
            val res = ApiClient.apiService.executeQuery(
                QueryRequest(
                    table = "loyalty_coupons",
                    select = "id,code,series_id,is_used,active,redemption_status",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "code", "val" to code.trim().uppercase())
                    )
                )
            )
            val list = res.data as? List<*>
            val coupon = list?.firstOrNull() as? Map<*, *>
                ?: return@withContext "Kupon bulunamadı: $code"

            val isUsed = coupon["is_used"] as? Boolean ?: false
            val active = coupon["active"] as? Boolean ?: false
            val redemptionStatus = coupon["redemption_status"] as? String ?: ""

            if (isUsed || !active || redemptionStatus == "used" || redemptionStatus == "redeemed") {
                return@withContext "Bu kupon daha önce kullanılmış veya geçersiz."
            }

            // Mevcut kodları al, duplicate kontrol
            val existing = prefs.getStringSet(PREF_COUPON_CODES, emptySet()) ?: emptySet()
            if (existing.contains(code.trim().uppercase())) {
                return@withContext "Bu kupon zaten cüzdanınızda."
            }

            val newSet = existing.toMutableSet()
            newSet.add(code.trim().uppercase())
            prefs.edit().putStringSet(PREF_COUPON_CODES, newSet).apply()
            null // başarı
        } catch (e: Exception) {
            Log.e("CouponsScreen", "addCoupon error", e)
            "Kupon eklenirken hata oluştu."
        }
    }
}

// Wallet'taki tüm kuponları DB'den zenginleştirerek yükler
suspend fun loadCoupons(prefs: SharedPreferences): List<CouponWalletItem> {
    return withContext(Dispatchers.IO) {
        val codes = prefs.getStringSet(PREF_COUPON_CODES, emptySet()) ?: return@withContext emptyList()
        val result = mutableListOf<CouponWalletItem>()

        codes.forEachIndexed { idx, code ->
            try {
                val res = ApiClient.apiService.executeQuery(
                    QueryRequest(
                        table = "loyalty_coupons",
                        select = "id,code,series_id,is_used,active,redemption_status",
                        filters = listOf(mapOf("type" to "eq", "col" to "code", "val" to code))
                    )
                )
                val list = res.data as? List<*>
                val coupon = list?.firstOrNull() as? Map<*, *> ?: return@forEachIndexed
                val isUsed = coupon["is_used"] as? Boolean ?: false
                val active = coupon["active"] as? Boolean ?: false
                val status = coupon["redemption_status"] as? String ?: ""

                // Kullanılmışsa cüzdandan çıkar
                if (isUsed || !active || status == "used" || status == "redeemed") {
                    val existing = prefs.getStringSet(PREF_COUPON_CODES, emptySet())?.toMutableSet() ?: return@forEachIndexed
                    existing.remove(code)
                    prefs.edit().putStringSet(PREF_COUPON_CODES, existing).apply()
                    return@forEachIndexed
                }

                val seriesId = coupon["series_id"] as? String ?: ""

                // Series bilgisi al
                var seriesName = "Kupon"
                var campaignName = "Kampanya"
                var description = ""
                if (seriesId.isNotBlank()) {
                    val sRes = ApiClient.apiService.executeQuery(
                        QueryRequest(
                            table = "loyalty_coupon_series",
                            select = "id,name",
                            filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to seriesId))
                        )
                    )
                    val sList = sRes.data as? List<*>
                    val series = sList?.firstOrNull() as? Map<*, *>
                    seriesName = series?.get("name") as? String ?: "Kupon"
                    campaignName = seriesName
                }

                val benefit = parseBenefit(seriesName)
                val colorIdx = kotlin.math.abs(code.hashCode()) % COUPON_PALETTE.size

                result.add(
                    CouponWalletItem(
                        id = coupon["id"] as? String ?: code,
                        code = code,
                        seriesName = seriesName,
                        campaignName = campaignName,
                        description = description,
                        benefit = benefit,
                        isUsed = false,
                        colorIdx = colorIdx
                    )
                )
            } catch (e: Exception) {
                Log.e("CouponsScreen", "loadCoupon error for $code", e)
            }
        }
        result
    }
}

fun parseBenefit(seriesName: String): CouponBenefit {
    val lower = seriesName.lowercase()
    // Yüzde kontrolü: %50, 50%, %50 indirim
    val percentMatch = Regex("(\\d+)\\s*%|%\\s*(\\d+)").find(seriesName)
    if (percentMatch != null) {
        val v = percentMatch.groupValues[1].ifBlank { percentMatch.groupValues[2] }
        return CouponBenefit.Percent("%$v")
    }
    // TL miktarı
    val tlMatch = Regex("(\\d+)\\s*tl", RegexOption.IGNORE_CASE).find(seriesName)
    if (tlMatch != null) return CouponBenefit.Amount(tlMatch.groupValues[1])

    // Hediye / bedava / free / ücretsiz
    if (lower.contains("hediye") || lower.contains("bedava") || lower.contains("free") ||
        lower.contains("ücretsiz") || lower.contains("gift")) {
        return CouponBenefit.Gift
    }
    return CouponBenefit.Gift
}

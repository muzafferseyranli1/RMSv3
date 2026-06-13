package com.suitable.wms.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.suitable.wms.data.WarehouseTask

@Composable
fun WmsCycleCountScreen(
    task: WarehouseTask,
    scannedLocationCode: String,
    isLocationVerified: Boolean,
    scannedLpnCode: String,
    isLpnVerified: Boolean,
    scannedProductCode: String,
    isProductVerified: Boolean,
    verificationMessage: String?,
    countedQty: String,
    onCountedQtyChange: (String) -> Unit,
    reason: String,
    onReasonChange: (String) -> Unit,
    isLoading: Boolean,
    onSubmitCount: () -> Unit,
    onCancelTask: () -> Unit
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        // 1. Ürün Kartı
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            border = BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (!task.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = task.imageUrl,
                        contentDescription = "Ürün Fotoğrafı",
                        modifier = Modifier
                            .size(60.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0F172A)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0F172A)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Inventory,
                            contentDescription = "Ürün",
                            tint = Color(0xFF64748B),
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = task.productName ?: "İsimsiz Ürün",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "SKU: ${task.productCode ?: "—"}",
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp
                    )
                    Text(
                        text = "Birim: ${task.unit ?: "Adet"}",
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp
                    )
                }
            }
        }

        // 2. Beklenen Değerler Özeti (Lokasyon & LPN)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0xFF334155))
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text("LOKASYON", color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = task.sourceLocation ?: "Belirtilmemiş",
                        color = Color(0xFF10B981),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Card(
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0xFF334155))
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text("PALET / LPN", color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = task.lpnCode ?: "LPN Yok",
                        color = if (task.lpnCode != null) Color(0xFF38BDF8) else Color(0xFF64748B),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // 3. Tarama Adımları Kontrol Paneli
        Text(
            text = "TARAMA DOĞRULAMA ADIMLARI",
            color = Color(0xFF64748B),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        // Adım 1: Lokasyon Doğrulama
        ScanStepRow(
            stepTitle = "1. Lokasyon Barkodu Tara",
            expectedText = task.sourceLocation ?: "—",
            scannedValue = scannedLocationCode,
            isVerified = isLocationVerified,
            isRequired = true
        )

        // Adım 2: LPN Doğrulama (Sadece LPN tanımlıysa zorunlu)
        val lpnRequired = !task.lpnCode.isNullOrBlank()
        if (lpnRequired) {
            ScanStepRow(
                stepTitle = "2. LPN / Palet Barkodu Tara",
                expectedText = task.lpnCode ?: "",
                scannedValue = scannedLpnCode,
                isVerified = isLpnVerified,
                isRequired = true
            )
        }

        // Adım 3: Ürün Doğrulama
        ScanStepRow(
            stepTitle = if (lpnRequired) "3. Ürün Barkodu Tara" else "2. Ürün Barkodu Tara",
            expectedText = task.productCode ?: "—",
            scannedValue = scannedProductCode,
            isVerified = isProductVerified,
            isRequired = true
        )

        // Geri bildirim mesajı
        if (!verificationMessage.isNullOrBlank()) {
            val isSuccess = (isLocationVerified && (!lpnRequired || isLpnVerified) && isProductVerified)
            Text(
                text = verificationMessage,
                color = if (isSuccess) Color(0xFF10B981) else Color(0xFFEF4444),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                textAlign = TextAlign.Center
            )
        }

        // 4. Miktar Giriş Alanı (Tüm taramalar başarılıysa aktifleşir)
        val isAllScansVerified = isLocationVerified && (!lpnRequired || isLpnVerified) && isProductVerified

        if (isAllScansVerified) {
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0xFF334155))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "FİZİKSEL SAYIM MİKTARI",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    OutlinedTextField(
                        value = countedQty,
                        onValueChange = onCountedQtyChange,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = Color(0xFF6366F1),
                            unfocusedBorderColor = Color(0xFF334155),
                            focusedContainerColor = Color(0xFF0F172A),
                            unfocusedContainerColor = Color(0xFF0F172A)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "AÇIKLAMA / FARK NEDENİ (İsteğe Bağlı)",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    OutlinedTextField(
                        value = reason,
                        onValueChange = onReasonChange,
                        placeholder = { Text("Fark varsa açıklama giriniz...", color = Color(0xFF64748B)) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = Color(0xFF6366F1),
                            unfocusedBorderColor = Color(0xFF334155),
                            focusedContainerColor = Color(0xFF0F172A),
                            unfocusedContainerColor = Color(0xFF0F172A)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.height(24.dp))

        // 5. İşlem Butonları
        Button(
            onClick = onSubmitCount,
            enabled = isAllScansVerified && !isLoading && countedQty.isNotBlank(),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF6366F1),
                disabledContainerColor = Color(0xFF334155)
            ),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
        ) {
            if (isLoading) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
            } else {
                Text("Sayımı Gönder ve Tamamla", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = onCancelTask,
            border = BorderStroke(1.dp, Color(0xFFEF4444)),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
        ) {
            Text("Vazgeç / Görev Listesine Dön", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ScanStepRow(
    stepTitle: String,
    expectedText: String,
    scannedValue: String,
    isVerified: Boolean,
    isRequired: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isVerified) Color(0xFF064E3B) else Color(0xFF1E293B)
        ),
        border = BorderStroke(
            1.dp,
            if (isVerified) Color(0xFF059669) else Color(0xFF334155)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isVerified) Icons.Default.CheckCircle else Icons.Default.QrCodeScanner,
                contentDescription = "Scan Status",
                tint = if (isVerified) Color(0xFF10B981) else Color(0xFF818CF8),
                modifier = Modifier.size(24.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stepTitle,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Text(
                    text = "Beklenen: $expectedText",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp
                )
                if (scannedValue.isNotBlank()) {
                    Text(
                        text = "Okunan: $scannedValue",
                        color = if (isVerified) Color(0xFF34D399) else Color(0xFFF87171),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

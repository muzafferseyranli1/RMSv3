package com.suitable.wms.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import com.suitable.wms.data.ApiClient

import com.suitable.wms.ui.scan.WmsScanPackageUnit

@Composable
fun WmsPutawayScreen(
    task: WarehouseTask,
    scannedLocationCode: String,
    isLocationVerified: Boolean,
    verificationMessage: String?,
    packageUnit: WmsScanPackageUnit? = null,
    inputQuantity: String,
    onQuantityChange: (String) -> Unit,
    isLoading: Boolean,
    evidencePhotoUrl: String?,
    isUploadingPhoto: Boolean,
    onTakePhoto: () -> Unit,
    onSelectPhoto: () -> Unit,
    onRemovePhoto: () -> Unit,
    onCompleteTask: () -> Unit,
    onCancelTask: () -> Unit,
    isSourceVerified: Boolean = false,
    scannedSourceCode: String = "",
    sourceVerificationMessage: String? = null,
    onSourceScanned: (String) -> Unit = {}
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
    ) {
        // Ürün kartı ve detayları
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
                // Ürün görseli
                if (!task.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = task.imageUrl,
                        contentDescription = "Ürün Fotoğrafı",
                        modifier = Modifier
                            .size(70.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0F172A)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(70.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0F172A)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Inventory,
                            contentDescription = "Görsel Yok",
                            tint = Color(0xFF64748B),
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Ürün metin bilgileri
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = task.productName ?: "İsimsiz Ürün",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
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
        if (packageUnit != null) {
            WmsPackageInfoCard(packageUnit = packageUnit, modifier = Modifier.padding(bottom = 12.dp))
        }

        // LPN, Lot ve SKT detayları
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
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
                        color = if (task.lpnCode != null) Color(0xFF38BDF8) else Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Card(
                modifier = Modifier.weight(1.2f),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                border = BorderStroke(1.dp, Color(0xFF334155))
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text("LOT / SKT", color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(2.dp))
                    val lotStr = task.lotNumber ?: "Yok"
                    val sktStr = task.expirationDate?.split("T")?.firstOrNull() ?: "Yok"
                    Text(
                        text = "Lot: $lotStr\nSKT: $sktStr",
                        color = Color.White,
                        fontSize = 11.sp,
                        lineHeight = 14.sp
                    )
                }
            }
        }

        // Önerilen Hedef Lokasyon ve Kaynak Lokasyon
        val isMoveTask = task.taskType == "move"
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B).copy(alpha = 0.5f)),
            border = BorderStroke(1.dp, Color(0xFFa855f7).copy(alpha = 0.3f))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    val sourceBorderColor = when {
                        !isMoveTask -> Color.Transparent
                        isSourceVerified -> Color(0xFF10B981)
                        else -> Color(0xFF3B82F6)
                    }
                    Column(
                        modifier = if (isMoveTask) {
                            Modifier
                                .weight(1f)
                                .border(1.dp, sourceBorderColor, RoundedCornerShape(6.dp))
                                .padding(8.dp)
                        } else {
                            Modifier
                        }
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("KAYNAK LOKASYON", color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            if (isMoveTask && isSourceVerified) {
                                Spacer(modifier = Modifier.width(4.dp))
                                Icon(Icons.Default.CheckCircle, contentDescription = "Doğrulandı", tint = Color(0xFF10B981), modifier = Modifier.size(12.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(task.sourceLocation ?: "Bilinmiyor", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        if (isMoveTask && isSourceVerified && scannedSourceCode.isNotEmpty()) {
                            Text("Okutulan: $scannedSourceCode", color = Color(0xFF10B981), fontSize = 10.sp)
                        }
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    val targetBorderColor = when {
                        !isMoveTask -> Color.Transparent
                        isSourceVerified && isLocationVerified -> Color(0xFF10B981)
                        isSourceVerified -> Color(0xFFa855f7)
                        else -> Color.Transparent
                    }
                    Column(
                        horizontalAlignment = Alignment.End,
                        modifier = if (isMoveTask) {
                            Modifier
                                .weight(1f)
                                .border(1.dp, targetBorderColor, RoundedCornerShape(6.dp))
                                .padding(8.dp)
                        } else {
                            Modifier
                        }
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (isMoveTask && isSourceVerified && isLocationVerified) {
                                Icon(Icons.Default.CheckCircle, contentDescription = "Doğrulandı", tint = Color(0xFF10B981), modifier = Modifier.size(12.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                            }
                            Text("HEDEF LOKASYON", color = Color(0xFFa855f7), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(task.targetLocation ?: "Bilinmiyor", color = Color(0xFFa855f7), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }

        // Taranan lokasyon feedback alanı
        val activeScannedCode = if (isMoveTask && !isSourceVerified) scannedSourceCode else scannedLocationCode
        val isActiveVerified = if (isMoveTask && !isSourceVerified) isSourceVerified else isLocationVerified
        val activeVerificationMessage = if (isMoveTask && !isSourceVerified) sourceVerificationMessage else verificationMessage

        val borderClr = when {
            activeScannedCode.isEmpty() -> Color(0xFF334155)
            isActiveVerified -> Color(0xFF10B981)
            else -> Color(0xFFEF4444)
        }
        val bgClr = when {
            activeScannedCode.isEmpty() -> Color(0xFF1E293B)
            isActiveVerified -> Color(0xFF065F46).copy(alpha = 0.2f)
            else -> Color(0xFF991B1B).copy(alpha = 0.1f)
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(bgClr)
                .border(1.dp, borderClr, RoundedCornerShape(8.dp))
                .padding(12.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (activeScannedCode.isEmpty()) {
                    Icon(
                        imageVector = Icons.Default.QrCodeScanner,
                        contentDescription = null,
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (isMoveTask && !isSourceVerified) "LÜTFEN KAYNAK LOKASYON BARKODUNU TARATIN" else "LÜTFEN HEDEF LOKASYON BARKODUNU TARATIN",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = if (isActiveVerified) Icons.Default.CheckCircle else Icons.Default.Cancel,
                            contentDescription = null,
                            tint = if (isActiveVerified) Color(0xFF10B981) else Color(0xFFEF4444),
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        val labelText = if (isMoveTask && !isSourceVerified) {
                            if (isActiveVerified) "KAYNAK DOĞRULANDI" else "HATALI KAYNAK LOKASYONU"
                        } else {
                            if (isActiveVerified) "HEDEF DOĞRULANDI" else "HATALI HEDEF LOKASYONU"
                        }
                        Text(
                            text = labelText,
                            color = if (isActiveVerified) Color(0xFF10B981) else Color(0xFFEF4444),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Okutulan: $activeScannedCode",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    if (!activeVerificationMessage.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = activeVerificationMessage,
                            color = if (isActiveVerified) Color(0xFF34D399) else Color(0xFFF87171),
                            fontSize = 11.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Adet düzenleme widget'ı
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Yerleştirilecek Adet / Toplam: ${task.quantity}",
                color = Color(0xFF94A3B8),
                fontSize = 12.sp
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                IconButton(
                    onClick = {
                        val currVal = inputQuantity.toIntOrNull() ?: 0
                        if (currVal > 0) {
                            onQuantityChange((currVal - 1).toString())
                        }
                    },
                    modifier = Modifier
                        .background(Color(0xFF334155), RoundedCornerShape(8.dp))
                        .size(36.dp)
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Azalt", tint = Color.White)
                }

                OutlinedTextField(
                    value = inputQuantity,
                    onValueChange = onQuantityChange,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    textStyle = LocalTextStyle.current.copy(
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFFa855f7),
                        unfocusedBorderColor = Color.DarkGray
                    ),
                    modifier = Modifier
                        .width(60.dp)
                        .height(44.dp),
                    singleLine = true
                )

                IconButton(
                    onClick = {
                        val currVal = inputQuantity.toIntOrNull() ?: 0
                        if (currVal < task.quantity) {
                            onQuantityChange((currVal + 1).toString())
                        }
                    },
                    modifier = Modifier
                        .background(Color(0xFF334155), RoundedCornerShape(8.dp))
                        .size(36.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Artır", tint = Color.White)
                }
            }
        }

        // Kanıt Fotoğrafı Kartı
        val isPhotoRequired = task.status == "exception"
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            border = BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "KANIT FOTOĞRAFI" + if (isPhotoRequired) " (ZORUNLU)" else " (OPSİYONEL)",
                    color = if (isPhotoRequired) Color(0xFFEF4444) else Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))

                if (!evidencePhotoUrl.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0F172A))
                    ) {
                        AsyncImage(
                            model = ApiClient.resolveImageUrl(evidencePhotoUrl),
                            contentDescription = "Kanıt Fotoğrafı",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Fit
                        )
                        IconButton(
                            onClick = onRemovePhoto,
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(4.dp)
                                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(18.dp))
                                .size(28.dp)
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Sil", tint = Color.Red, modifier = Modifier.size(16.dp))
                        }
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = onTakePhoto,
                            enabled = !isUploadingPhoto,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("FOTOĞRAF ÇEK", fontSize = 10.sp)
                        }

                        Button(
                            onClick = onSelectPhoto,
                            enabled = !isUploadingPhoto,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(Icons.Default.Photo, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("GALERİDEN SEÇ", fontSize = 10.sp)
                        }
                    }
                }

                if (isUploadingPhoto) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        CircularProgressIndicator(color = Color(0xFF38BDF8), modifier = Modifier.size(12.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Yükleniyor...", color = Color(0xFF38BDF8), fontSize = 10.sp)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Onay / İptal Aksiyon Butonları
        val isCompleteEnabled = (!isMoveTask || isSourceVerified) && isLocationVerified && (!isPhotoRequired || !evidencePhotoUrl.isNullOrBlank()) && !isLoading

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedButton(
                onClick = onCancelTask,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF94A3B8)),
                border = BorderStroke(1.dp, Color(0xFF475569))
            ) {
                Text("VAZGEÇ", fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onCompleteTask,
                enabled = isCompleteEnabled,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF10B981),
                    disabledContainerColor = Color(0xFF1E293B)
                ),
                modifier = Modifier
                    .weight(1.5f)
                    .height(48.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                } else {
                    Text(
                        "GÖREVİ TAMAMLA",
                        color = if (isCompleteEnabled) Color.White else Color(0xFF64748B),
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

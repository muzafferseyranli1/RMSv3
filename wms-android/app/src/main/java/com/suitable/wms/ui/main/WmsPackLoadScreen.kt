package com.suitable.wms.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
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
import com.suitable.wms.data.ApiClient
import com.suitable.wms.data.ShipmentCapacityData
import com.suitable.wms.data.WarehouseTask
import com.suitable.wms.ui.scan.WmsScanPackageUnit

@Composable
fun WmsPackLoadScreen(
    task: WarehouseTask,
    scannedProductCode: String,
    isProductVerified: Boolean,
    productVerificationMessage: String?,
    packageUnit: WmsScanPackageUnit?,
    capacityData: ShipmentCapacityData?,
    capacityError: String?,
    inputQuantity: String,
    onQuantityChange: (String) -> Unit,
    isLoading: Boolean,
    evidencePhotoUrl: String?,
    isUploadingPhoto: Boolean,
    onTakePhoto: () -> Unit,
    onSelectPhoto: () -> Unit,
    onRemovePhoto: () -> Unit,
    onCompleteTask: () -> Unit,
    onCancelTask: () -> Unit
) {
    val isLoadTask = task.taskType == "load"
    val isPackTask = task.taskType == "pack"
    val screenTitle = if (isLoadTask) "YÜKLEME GÖREVİ" else "PAKETLEME GÖREVİ"

    val isCapacityExceeded = capacityData?.is_exceeded == true

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
    ) {
        // Ürün ve Görev Bilgisi Kartı
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
                // Ürün Fotoğrafı
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

                // Detaylar
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = task.productName ?: "İsimsiz Ürün",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "SKU: ${task.productCode}",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Tip: $screenTitle",
                        color = if (isLoadTask) Color(0xFF3B82F6) else Color(0xFF10B981),
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            }
        }

        // Araç Kapasite Önizleme Kartı (Pack/Load için ortak)
        if (capacityData != null) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isCapacityExceeded) Color(0xFF7F1D1D).copy(alpha = 0.3f) else Color(0xFF1E293B)
                ),
                border = BorderStroke(1.dp, if (isCapacityExceeded) Color(0xFFEF4444) else Color(0xFF334155))
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.LocalShipping,
                                contentDescription = "Araç",
                                tint = if (isCapacityExceeded) Color(0xFFEF4444) else Color(0xFFa855f7),
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Araç Yük Durumu (${capacityData.plate_number ?: "Plakasız"})",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Hacim Kapasitesi
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Toplam Yük Hacmi:", color = Color(0xFF94A3B8), fontSize = 12.sp)
                        Text(
                            text = "${capacityData.total_volume_m3} / ${capacityData.vehicle_max_volume_m3} m³",
                            color = if (capacityData.is_volume_exceeded) Color(0xFFEF4444) else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                    LinearProgressIndicator(
                        progress = if (capacityData.vehicle_max_volume_m3 > 0) (capacityData.total_volume_m3 / capacityData.vehicle_max_volume_m3).toFloat() else 0f,
                        color = if (capacityData.is_volume_exceeded) Color(0xFFEF4444) else Color(0xFFa855f7),
                        trackColor = Color(0xFF334155),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                    )

                    // Ağırlık Kapasitesi
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Toplam Brüt Ağırlık:", color = Color(0xFF94A3B8), fontSize = 12.sp)
                        Text(
                            text = "${capacityData.total_weight_kg} / ${capacityData.vehicle_max_weight_kg} kg",
                            color = if (capacityData.is_weight_exceeded) Color(0xFFEF4444) else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                    LinearProgressIndicator(
                        progress = if (capacityData.vehicle_max_weight_kg > 0) (capacityData.total_weight_kg / capacityData.vehicle_max_weight_kg).toFloat() else 0f,
                        color = if (capacityData.is_weight_exceeded) Color(0xFFEF4444) else Color(0xFFa855f7),
                        trackColor = Color(0xFF334155),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                    )

                    if (isCapacityExceeded) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = "Kapasite Aşımı",
                                tint = Color(0xFFFCA5A5),
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "Kapasite Aşımı! Yükleme engellendi.",
                                color = Color(0xFFFCA5A5),
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }

        // Barkod Tarama Sonucu & Paket Bilgi Kartı
        if (isProductVerified && packageUnit != null) {
            WmsPackageInfoCard(packageUnit = packageUnit)
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .border(1.dp, Color(0xFF334155), RoundedCornerShape(8.dp))
                    .background(Color(0xFF1E293B).copy(alpha = 0.5f))
                    .padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Lütfen işlem yapılacak Ürün veya Paket barkodunu okutun.",
                    color = Color(0xFF64748B),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        // Taranan Ürün Feedback Mesajı
        if (!productVerificationMessage.isNullOrBlank()) {
            Text(
                text = productVerificationMessage,
                color = if (isProductVerified) Color(0xFF10B981) else Color(0xFFEF4444),
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp),
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Miktar Giriş Kartı
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            border = BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "İşlem Miktarı (${task.unit ?: "Adet"})",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = inputQuantity,
                        onValueChange = onQuantityChange,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = Color(0xFFa855f7),
                            unfocusedBorderColor = Color(0xFF334155)
                        ),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "/ ${task.quantity}",
                        color = Color(0xFF94A3B8),
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                }
            }
        }

        // Kanıt Fotoğrafı Ekleme Kartı (Opsiyonel)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            border = BorderStroke(1.dp, Color(0xFF334155))
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "KANIT FOTOĞRAFI (OPSİYONEL)",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                if (!evidencePhotoUrl.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .border(1.dp, Color(0xFF334155))
                    ) {
                        AsyncImage(
                            model = ApiClient.resolveImageUrl(evidencePhotoUrl),
                            contentDescription = "Kanıt Görseli",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                        IconButton(
                            onClick = onRemovePhoto,
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(8.dp)
                                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                                .size(24.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Kaldır", tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = onTakePhoto,
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                            shape = RoundedCornerShape(8.dp),
                            enabled = !isUploadingPhoto
                        ) {
                            Icon(Icons.Default.CameraAlt, contentDescription = "Foto Çek", modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Foto Çek", fontSize = 12.sp)
                        }
                        Button(
                            onClick = onSelectPhoto,
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                            shape = RoundedCornerShape(8.dp),
                            enabled = !isUploadingPhoto
                        ) {
                            Icon(Icons.Default.PhotoLibrary, contentDescription = "Galeriden Seç", modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Galeri", fontSize = 12.sp)
                        }
                    }
                    if (isUploadingPhoto) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color(0xFFa855f7))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Fotoğraf yükleniyor...", color = Color(0xFF94A3B8), fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Alt Eylem Butonları
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = onCancelTask,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("GERİ DÖN", color = Color.White, fontWeight = FontWeight.Bold)
            }
            Button(
                onClick = onCompleteTask,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (isCapacityExceeded) Color(0xFF64748B) else Color(0xFFa855f7)),
                shape = RoundedCornerShape(10.dp),
                enabled = !isLoading && !isCapacityExceeded && isProductVerified
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                } else {
                    Text("TAMAMLA", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

package com.suitable.wms.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.wms.ui.scan.WmsScanPackageUnit

@Composable
fun WmsPackageInfoCard(
    packageUnit: WmsScanPackageUnit?,
    modifier: Modifier = Modifier
) {
    if (packageUnit == null) return

    val isMissingMasterData = packageUnit.length_cm == null || 
                              packageUnit.width_cm == null || 
                              packageUnit.height_cm == null || 
                              packageUnit.gross_weight_kg == null

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isMissingMasterData) Color(0xFF7F1D1D) else Color(0xFF1E293B)
        ),
        border = BorderStroke(1.dp, if (isMissingMasterData) Color(0xFFEF4444) else Color(0xFF334155))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Paketleme Birimi: ${packageUnit.unit_name ?: "—"} (${packageUnit.unit_symbol ?: "—"})",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Text(
                    text = "Miktar Katsayısı: x${packageUnit.conversion_factor}",
                    color = Color(0xFFa855f7),
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            if (!packageUnit.barcode.isNullOrBlank()) {
                Text(
                    text = "Paket Barkodu: ${packageUnit.barcode}",
                    color = Color(0xFFcbd5e1),
                    fontSize = 11.sp
                )
            }
            if (isMissingMasterData) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = "Uyarı",
                        tint = Color(0xFFFCA5A5),
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "Eksik Paket Master Verisi!",
                        color = Color(0xFFFCA5A5),
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            } else {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Ölçüler: ${packageUnit.length_cm ?: 0.0} x ${packageUnit.width_cm ?: 0.0} x ${packageUnit.height_cm ?: 0.0} cm",
                    color = Color(0xFFcbd5e1),
                    fontSize = 11.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Hacim: ${packageUnit.volume_m3 ?: 0.0} m³ | Ağırlık: ${packageUnit.gross_weight_kg ?: 0.0} kg",
                    color = Color(0xFFcbd5e1),
                    fontSize = 11.sp
                )
            }
        }
    }
}

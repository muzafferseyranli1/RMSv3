package com.suitable.kiosk.ui.setup

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.kiosk.data.model.KioskMode

/**
 * Cihaz eşleme ekranı.
 *
 * Kiosk Management'tan alınan istasyon kodunu (örn: "KASIYER-01") kullanıcı girer,
 * "Eşle" butonuna basınca API çağrısı yapılır. Başarıyla eşlenen cihaz
 * BIG_SCREEN veya TABLET moduna yönlendirilir.
 */
@Composable
fun PairingScreen(
    viewModel: PairingViewModel,
    onPaired: (KioskMode) -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val code by viewModel.code.collectAsState()

    // Başarılı eşleme → yönlendir
    LaunchedEffect(uiState) {
        if (uiState is PairingUiState.Paired) {
            onPaired((uiState as PairingUiState.Paired).mode)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF0F0F1A), Color(0xFF1A1A2E))
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .widthIn(max = 420.dp)
                .padding(32.dp)
        ) {

            // ─── Logo / başlık ───────────────────────────────────────────────
            Icon(
                imageVector = Icons.Default.QrCode,
                contentDescription = null,
                tint = Color(0xFF6C63FF),
                modifier = Modifier.size(72.dp)
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "SuitableRMS",
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
            Text(
                text = "Kiosk Cihaz Eşleme",
                color = Color(0xFFAAAAAA),
                fontSize = 15.sp,
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(Modifier.height(48.dp))

            // ─── Kod giriş alanı ─────────────────────────────────────────────
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E32)),
                elevation = CardDefaults.cardElevation(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "İstasyon Kodu",
                        color = Color(0xFF9090B0),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = code,
                        onValueChange = viewModel::onCodeChange,
                        singleLine = true,
                        placeholder = {
                            Text("Örn: KASIYER-01", color = Color(0xFF555580))
                        },
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Characters,
                            keyboardType = KeyboardType.Ascii,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { viewModel.pair() }
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = Color(0xFF6C63FF),
                            unfocusedBorderColor = Color(0xFF333355),
                            cursorColor = Color(0xFF6C63FF),
                        ),
                        shape = RoundedCornerShape(12.dp),
                        textStyle = LocalTextStyle.current.copy(
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 3.sp,
                            textAlign = TextAlign.Center,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = uiState !is PairingUiState.Loading,
                    )

                    // ─── Hata mesajı ─────────────────────────────────────────
                    val failure = uiState as? PairingUiState.Failure
                    if (failure != null) {
                        Spacer(Modifier.height(12.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF3A1A1A), RoundedCornerShape(8.dp))
                                .padding(10.dp)
                        ) {
                            Icon(
                                Icons.Default.ErrorOutline,
                                contentDescription = null,
                                tint = Color(0xFFFF6B6B),
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = failure.message,
                                color = Color(0xFFFF9999),
                                fontSize = 13.sp,
                            )
                        }
                    }

                    Spacer(Modifier.height(20.dp))

                    // ─── Eşle butonu ─────────────────────────────────────────
                    Button(
                        onClick = viewModel::pair,
                        enabled = uiState !is PairingUiState.Loading && code.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF6C63FF),
                            disabledContainerColor = Color(0xFF333355),
                        ),
                    ) {
                        if (uiState is PairingUiState.Loading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(22.dp),
                                strokeWidth = 2.5.dp,
                            )
                        } else {
                            Text(
                                "Eşle",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp,
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(32.dp))

            // ─── Alt bilgi ───────────────────────────────────────────────────
            Text(
                text = "İstasyon kodunu Backoffice → Kiosk Yönetimi →\nCihazlar bölümünden alabilirsiniz.",
                color = Color(0xFF666688),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp,
            )
        }
    }
}

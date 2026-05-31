package com.suitable.musteri.ui.main

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.musteri.data.ApiClient
import com.suitable.musteri.data.QueryRequest
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (String) -> Unit
) {
    var phone by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var showNameField by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Hoş Geldiniz",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.Black
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Devam etmek için telefon numaranızı girin.",
                    fontSize = 14.sp,
                    color = Color.Gray,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(24.dp))

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it.take(10) },
                    label = { Text("Telefon Numarası") },
                    placeholder = { Text("5xx-xxx xx xx") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.Black,
                        unfocusedTextColor = Color.Black,
                        cursorColor = Color.Black,
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = Color.Gray,
                        focusedPlaceholderColor = Color.LightGray,
                        unfocusedPlaceholderColor = Color.LightGray,
                        focusedLabelColor = MaterialTheme.colorScheme.primary,
                        unfocusedLabelColor = Color.Gray
                    )
                )

                if (showNameField) {
                    Spacer(modifier = Modifier.height(16.dp))

                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Ad Soyad (İlk girişte zorunludur)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.Black,
                            unfocusedTextColor = Color.Black,
                            cursorColor = Color.Black,
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = Color.Gray,
                            focusedLabelColor = MaterialTheme.colorScheme.primary,
                            unfocusedLabelColor = Color.Gray
                        )
                    )
                }

                if (errorMsg != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(text = errorMsg!!, color = Color.Red, fontSize = 12.sp)
                }

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        if (phone.isBlank()) {
                            errorMsg = "Lütfen telefon numaranızı girin"
                            return@Button
                        }
                        
                        isLoading = true
                        errorMsg = null
                        scope.launch {
                            try {
                                if (!showNameField) {
                                    val findReq = QueryRequest(
                                        table = "musteriler",
                                        operation = "select",
                                        filters = listOf(mapOf("type" to "eq", "col" to "telefon", "val" to phone))
                                    )
                                    val response = ApiClient.apiService.executeQuery(findReq)
                                    
                                    if (response.error == null) {
                                        val dataList = response.data as? List<Map<String, Any>>
                                        if (dataList != null && dataList.isNotEmpty()) {
                                            // User exists
                                            val customerId = dataList[0]["id"].toString()
                                            
                                            val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
                                            sharedPref.edit().putString("customerId", customerId).apply()
                                            
                                            onLoginSuccess(customerId)
                                        } else {
                                            // User doesn't exist, show name field
                                            showNameField = true
                                            errorMsg = "Lütfen ad soyad girerek kaydınızı tamamlayın."
                                        }
                                    } else {
                                        errorMsg = "Sorgu başarısız: ${response.error["message"]}"
                                    }
                                } else {
                                    // We are in register mode
                                    if (name.isBlank()) {
                                        errorMsg = "Lütfen ad soyadınızı girin (Yeni kayıt)"
                                        isLoading = false
                                        return@launch
                                    }
                                    
                                    val createReq = QueryRequest(
                                        table = "musteriler",
                                        operation = "insert",
                                        data = mapOf(
                                            "telefon" to phone,
                                            "ad_soyad" to name
                                        )
                                    )
                                    val createRes = ApiClient.apiService.executeQuery(createReq)
                                    if (createRes.error == null) {
                                        val dataList = createRes.data as? List<Map<String, Any>>
                                        if (dataList != null && dataList.isNotEmpty()) {
                                            val newCustomerId = dataList[0]["id"].toString()
                                            val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
                                            sharedPref.edit().putString("customerId", newCustomerId).apply()
                                            
                                            onLoginSuccess(newCustomerId)
                                        } else {
                                            errorMsg = "Kayıt tamamlandı ancak kullanıcı ID'si alınamadı."
                                        }
                                    } else {
                                        errorMsg = "Kayıt işlemi başarısız: ${createRes.error["message"]}"
                                    }
                                }
                            } catch (e: Exception) {
                                errorMsg = "Bir hata oluştu: ${e.message}"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF22C55E))
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text("Giriş Yap / Kaydol", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

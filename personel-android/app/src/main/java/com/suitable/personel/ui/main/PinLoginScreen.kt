package com.suitable.personel.ui.main

import android.content.Context
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.Gson
import com.suitable.personel.data.ApiClient
import com.suitable.personel.data.QueryRequest
import kotlinx.coroutines.launch

data class StaffSession(
    val id: String,
    val firstName: String,
    val middleName: String?,
    val lastName: String?,
    val authorityLevel: String?,
    val activeBranchId: String,
    val activeBranchName: String,
    val authenticatedAt: String
) {
    fun getDisplayName(): String {
        return listOfNotNull(firstName, middleName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()
            .ifBlank { "Personel" }
    }
}

@Composable
fun PinLoginScreen(
    onLoginSuccess: (StaffSession) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var pin by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    // Tüm şubeler ve personel listesi hafızada tutulacak
    var branches by remember { mutableStateOf<List<Map<String, String>>>(emptyList()) }
    var tempMatchedEmployee by remember { mutableStateOf<Map<String, Any>?>(null) }
    var showBranchSelectDialog by remember { mutableStateOf(false) }
    var accessibleBranchesForUser by remember { mutableStateOf<List<Map<String, String>>>(emptyList()) }

    // Şube ağacını çek
    LaunchedEffect(Unit) {
        scope.launch {
            try {
                val request = QueryRequest(
                    table = "settings",
                    operation = "select",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to "company_tree"))
                )
                val response = ApiClient.apiService.executeQuery(request)
                if (response.error == null) {
                    val dataList = response.data as? List<*>
                    if (!dataList.isNullOrEmpty()) {
                        val row = dataList[0] as? Map<*, *>
                        val tree = row?.get("value") as? List<*>
                        branches = parseBranchesFromTree(tree)
                    }
                }
            } catch (e: Exception) {
                Log.e("PinLoginScreen", "Error loading company tree", e)
            }
        }
    }

    // PIN 4 haneye ulaştığında otomatik doğrula
    LaunchedEffect(pin) {
        if (pin.length == 4) {
            isLoading = true
            errorMsg = null
            scope.launch {
                try {
                    val request = QueryRequest(
                        table = "settings",
                        operation = "select",
                        filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to "personel_records"))
                    )
                    val response = ApiClient.apiService.executeQuery(request)
                    if (response.error == null) {
                        val dataList = response.data as? List<*>
                        if (!dataList.isNullOrEmpty()) {
                            val row = dataList[0] as? Map<*, *>
                            val employees = row?.get("value") as? List<*>
                            
                            val matched = findEmployeeByPin(employees, pin)
                            if (matched != null) {
                                verifyAndLoginEmployee(matched, branches, onLoginSuccess = { session ->
                                    onLoginSuccess(session)
                                }, onBranchSelectRequired = { userBranches ->
                                    tempMatchedEmployee = matched
                                    accessibleBranchesForUser = userBranches
                                    showBranchSelectDialog = true
                                })
                            } else {
                                errorMsg = "Geçersiz PIN girdiniz."
                                pin = ""
                            }
                        } else {
                            errorMsg = "Personel kayıtları bulunamadı."
                            pin = ""
                        }
                    } else {
                        errorMsg = "Veri tabanına bağlanılamadı."
                        pin = ""
                    }
                } catch (e: Exception) {
                    errorMsg = "Bir hata oluştu: ${e.message}"
                    pin = ""
                } finally {
                    isLoading = false
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(24.dp)
        ) {
            Text(
                text = "SUITABLE RMS",
                color = Color(0xFF3B82F6),
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Personel Girişi",
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Devam etmek için 4 haneli PIN kodunuzu tuşlayın.",
                color = Color(0xFF94A3B8),
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(40.dp))

            // PIN Yıldız Göstergeleri
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                for (i in 0 until 4) {
                    val active = i < pin.length
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(if (active) Color(0xFF3B82F6) else Color(0xFF334155))
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Hata / Yükleniyor Durumu
            Box(modifier = Modifier.height(30.dp), contentAlignment = Alignment.Center) {
                if (isLoading) {
                    CircularProgressIndicator(color = Color(0xFF3B82F6), modifier = Modifier.size(24.dp))
                } else if (errorMsg != null) {
                    Text(text = errorMsg!!, color = Color(0xFFF87171), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }

            Spacer(modifier = Modifier.height(30.dp))

            // Keypad
            val numbers = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back")
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.width(280.dp)
            ) {
                items(numbers.size) { index ->
                    val value = numbers[index]
                    if (value.isNotBlank()) {
                        KeypadButton(
                            value = value,
                            onClick = {
                                if (value == "back") {
                                    if (pin.isNotEmpty()) pin = pin.dropLast(1)
                                    errorMsg = null
                                } else {
                                    if (pin.length < 4 && !isLoading) {
                                        pin += value
                                        errorMsg = null
                                    }
                                }
                            }
                        )
                    } else {
                        Spacer(modifier = Modifier.size(60.dp))
                    }
                }
            }
        }
    }

    // Şube Seçim Dialogu
    if (showBranchSelectDialog && tempMatchedEmployee != null) {
        val employee = tempMatchedEmployee!!
        AlertDialog(
            onDismissRequest = {
                showBranchSelectDialog = false
                tempMatchedEmployee = null
                pin = ""
            },
            title = {
                Text(
                    text = "Şube Seçimi",
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                    color = Color.White
                )
            },
            text = {
                Column {
                    Text(
                        text = "Merhaba ${employee["firstName"]}, lütfen çalışacağınız şubeyi seçin:",
                        color = Color(0xFF94A3B8),
                        fontSize = 14.sp,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    accessibleBranchesForUser.forEach { branch ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp)
                                .clickable {
                                    showBranchSelectDialog = false
                                    val session = createStaffSession(employee, branch["id"]!!, branch["name"]!!)
                                    onLoginSuccess(session)
                                },
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = branch["name"] ?: "",
                                color = Color.White,
                                modifier = Modifier.padding(16.dp),
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(
                    onClick = {
                        showBranchSelectDialog = false
                        tempMatchedEmployee = null
                        pin = ""
                    }
                ) {
                    Text("İptal", color = Color(0xFFF87171))
                }
            },
            containerColor = Color(0xFF0F172A)
        )
    }
}

@Composable
fun KeypadButton(
    value: String,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .background(Color(0xFF1E293B))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        if (value == "back") {
            Icon(
                imageVector = Icons.Default.Backspace,
                contentDescription = "Geri Al",
                tint = Color.White,
                modifier = Modifier.size(24.dp)
            )
        } else {
            Text(
                text = value,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

// ─── Yardımcı Fonksiyonlar ───────────────────────────────────────────────────

private fun findEmployeeByPin(employees: List<*>?, pin: String): Map<String, Any>? {
    if (employees == null) return null
    for (item in employees) {
        val emp = item as? Map<String, Any> ?: continue
        val empPin = emp["pin"]?.toString()?.replace(Regex("\\D"), "")
        if (empPin == pin && emp["deletedAt"] == null) {
            return emp
        }
    }
    return null
}

private fun verifyAndLoginEmployee(
    employee: Map<String, Any>,
    allBranches: List<Map<String, String>>,
    onLoginSuccess: (StaffSession) -> Unit,
    onBranchSelectRequired: (List<Map<String, String>>) -> Unit
) {
    val defaultBranchId = employee["defaultBranchId"]?.toString() ?: ""
    val workingBranchIds = (employee["workingBranchIds"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
    val managedBranchIds = (employee["managedBranchIds"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()

    val allowedBranchIds = (listOf(defaultBranchId) + workingBranchIds + managedBranchIds)
        .filter { it.isNotBlank() }
        .distinct()

    val filteredBranches = if (allowedBranchIds.isEmpty()) {
        // Herhangi bir şube ataması yoksa tüm şubelere erişebilir
        allBranches
    } else {
        allBranches.filter { it["id"] in allowedBranchIds }
    }

    if (filteredBranches.isEmpty()) {
        // Şube ağacı boşsa veya şube bulunamadıysa varsayılan/sahte şube üret
        val fallbackBranchId = defaultBranchId.ifBlank { "default-branch" }
        onLoginSuccess(createStaffSession(employee, fallbackBranchId, "Merkez Şube"))
    } else if (filteredBranches.size == 1) {
        // Tek bir şubesi varsa direkt giriş yap
        val target = filteredBranches[0]
        onLoginSuccess(createStaffSession(employee, target["id"]!!, target["name"]!!))
    } else {
        // Birden fazla şubesi varsa seçim yaptır
        onBranchSelectRequired(filteredBranches)
    }
}

private fun createStaffSession(
    employee: Map<String, Any>,
    branchId: String,
    branchName: String
): StaffSession {
    return StaffSession(
        id = employee["id"]?.toString() ?: "",
        firstName = employee["firstName"]?.toString() ?: "",
        middleName = employee["middleName"]?.toString(),
        lastName = employee["lastName"]?.toString(),
        authorityLevel = employee["authorityLevel"]?.toString(),
        activeBranchId = branchId,
        activeBranchName = branchName,
        authenticatedAt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            .format(java.util.Date())
    )
}

private fun parseBranchesFromTree(nodes: List<*>?): List<Map<String, String>> {
    val list = mutableListOf<Map<String, String>>()
    if (nodes == null) return list

    fun traverse(nodeList: List<*>) {
        for (item in nodeList) {
            val node = item as? Map<*, *> ?: continue
            val id = node["id"]?.toString() ?: ""
            val name = node["name"]?.toString() ?: ""
            val type = node["type"]?.toString() ?: ""

            if (type == "sube" && id.isNotBlank()) {
                list.add(mapOf("id" to id, "name" to name))
            }
            val children = node["children"] as? List<*>
            if (children != null) {
                traverse(children)
            }
        }
    }
    traverse(nodes)
    return list
}

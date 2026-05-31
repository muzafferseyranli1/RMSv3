package com.suitable.musteri.ui.main

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.NavKey
import com.suitable.musteri.data.AppConfig
import com.suitable.musteri.data.CustomerInfo
import com.suitable.musteri.data.CustomerRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    config: AppConfig?,
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("MusteriPrefs", Context.MODE_PRIVATE)
    var customerId by remember { mutableStateOf(sharedPref.getString("customerId", null)) }
    var currentRoute by remember { mutableStateOf(if (customerId != null) "home" else "login") }
    var customerInfo by remember { mutableStateOf<CustomerInfo?>(null) }
    var isLoadingCustomer by remember { mutableStateOf(false) }

    LaunchedEffect(customerId) {
        val id = customerId
        if (id != null) {
            isLoadingCustomer = true
            val repo = CustomerRepository()
            customerInfo = repo.getCustomerInfo(id)
            isLoadingCustomer = false
        } else {
            customerInfo = null
        }
    }

    if (config?.maintenanceMode == true) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Sistem Bakımda", style = MaterialTheme.typography.headlineMedium)
        }
        return
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (currentRoute) {
            "login" -> {
                LoginScreen(
                    onLoginSuccess = { newId ->
                        sharedPref.edit().putString("customerId", newId).apply()
                        customerId = newId
                        currentRoute = "home"
                    }
                )
            }
            "home" -> {
                HomeScreen(
                    config = config,
                    customerInfo = customerInfo,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("customerId").apply()
                            customerId = null
                            customerInfo = null
                        }
                        currentRoute = dest
                    }
                )
            }
            "coupons" -> {
                CouponsScreen(
                    config = config,
                    customerInfo = customerInfo,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("customerId").apply()
                            customerId = null
                            customerInfo = null
                        }
                        currentRoute = dest
                    }
                )
            }
            "campaigns" -> {
                CampaignsScreen(
                    config = config,
                    customerInfo = customerInfo,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("customerId").apply()
                            customerId = null
                            customerInfo = null
                        }
                        currentRoute = dest
                    }
                )
            }
            else -> {
                // feedback:id1,id2,id3
                if (currentRoute.startsWith("feedback")) {
                    val idsParam = currentRoute.removePrefix("feedback:").trim()
                    val surveyIds = if (idsParam.isBlank()) emptyList()
                                   else idsParam.split(",").map { it.trim() }.filter { it.isNotBlank() }
                    FeedbackScreen(
                        surveyFormIds = surveyIds,
                        customerInfo = customerInfo,
                        config = config,
                        onNavigate = { dest ->
                            if (dest == "login") {
                                sharedPref.edit().remove("customerId").apply()
                                customerId = null
                                customerInfo = null
                            }
                            currentRoute = dest
                        }
                    )
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Yapım Aşamasında",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }
            }

        }
    }
}

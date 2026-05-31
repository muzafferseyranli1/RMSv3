package com.suitable.musteri.ui.main

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.NavKey
import com.suitable.musteri.data.AppConfig

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

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        if (config?.maintenanceMode == true) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Sistem Bakımda", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
            }
        } else {
            Box(modifier = modifier.padding(padding).fillMaxSize()) {
                when (currentRoute) {
                    "login" -> {
                        LoginScreen(
                            onLoginSuccess = { newId ->
                                customerId = newId
                                currentRoute = "home"
                            }
                        )
                    }
                    "home" -> {
                        HomeScreen(
                            config = config,
                            customerName = "", // We would need to fetch the customer name, but for now we'll just display config or leave blank until full fetch
                            onNavigate = { dest -> currentRoute = dest }
                        )
                    }
                    "coupons" -> {
                        CouponsScreen()
                    }
                    else -> {
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
}

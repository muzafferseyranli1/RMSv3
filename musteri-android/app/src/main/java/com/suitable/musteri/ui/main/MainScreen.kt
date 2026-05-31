package com.suitable.musteri.ui.main

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.NavKey
import com.suitable.musteri.data.AppConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    config: AppConfig?,
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    var currentTab by remember { mutableStateOf(TabItem.COUPONS) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(config?.headerLogo ?: "Müşteri App", color = MaterialTheme.colorScheme.onPrimary) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primary)
            )
        },
        bottomBar = {
            BottomNavigationBar(
                currentTab = currentTab,
                onTabSelected = { currentTab = it }
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        if (config?.maintenanceMode == true) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Sistem Bakımda", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
            }
        } else {
            Box(modifier = modifier.padding(padding).fillMaxSize()) {
                when (currentTab) {
                    TabItem.COUPONS -> CouponsScreen()
                    else -> {
                        // Placeholder for other tabs
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = "${currentTab.label} Yapım Aşamasında",
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


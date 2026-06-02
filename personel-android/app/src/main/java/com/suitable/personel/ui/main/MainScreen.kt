package com.suitable.personel.ui.main

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.NavKey
import com.google.gson.Gson
import com.suitable.personel.data.AppConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    config: AppConfig?,
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("PersonelPrefs", Context.MODE_PRIVATE)

    var staffSession by remember {
        mutableStateOf(
            sharedPref.getString("staffSession", null)?.let {
                try {
                    Gson().fromJson(it, StaffSession::class.java)
                } catch (e: Exception) {
                    null
                }
            }
        )
    }

    var currentRoute by remember { mutableStateOf(if (staffSession != null) "home" else "login") }

    if (config?.maintenanceMode == true) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Sistem Bakımda", style = MaterialTheme.typography.headlineMedium)
        }
        return
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (currentRoute) {
            "login" -> {
                PinLoginScreen(
                    onLoginSuccess = { session ->
                        val json = Gson().toJson(session)
                        sharedPref.edit().putString("staffSession", json).apply()
                        staffSession = session
                        currentRoute = "home"
                    }
                )
            }
            "home" -> {
                HomeScreen(
                    config = config,
                    staffSession = staffSession,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("staffSession").apply()
                            staffSession = null
                        }
                        currentRoute = dest
                    }
                )
            }
            "table" -> {
                TableScreen(
                    config = config,
                    staffSession = staffSession,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("staffSession").apply()
                            staffSession = null
                        }
                        currentRoute = dest
                    }
                )
            }
            "table_order" -> {
                TableOrderScreen(
                    config = config,
                    staffSession = staffSession,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("staffSession").apply()
                            staffSession = null
                        }
                        currentRoute = dest
                    }
                )
            }
            "table_orders" -> {
                TableOrdersScreen(
                    config = config,
                    staffSession = staffSession,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("staffSession").apply()
                            staffSession = null
                        }
                        currentRoute = dest
                    }
                )
            }
            "tasks" -> {
                TasksScreen(
                    config = config,
                    staffSession = staffSession,
                    onNavigate = { dest ->
                        if (dest == "login") {
                            sharedPref.edit().remove("staffSession").apply()
                            staffSession = null
                        }
                        currentRoute = dest
                    }
                )
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

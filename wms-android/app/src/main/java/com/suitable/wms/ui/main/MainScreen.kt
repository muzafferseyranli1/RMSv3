package com.suitable.wms.ui.main

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.NavKey
import com.google.gson.Gson

@Composable
fun MainScreen(
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sharedPref = context.getSharedPreferences("WmsPrefs", Context.MODE_PRIVATE)

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

    var currentRoute by remember { mutableStateOf(if (staffSession != null) "wms_mobile" else "login") }

    Box(modifier = modifier.fillMaxSize()) {
        when (currentRoute) {
            "login" -> {
                PinLoginScreen(
                    onLoginSuccess = { session ->
                        val json = Gson().toJson(session)
                        sharedPref.edit().putString("staffSession", json).apply()
                        staffSession = session
                        currentRoute = "wms_mobile"
                    }
                )
            }
            "wms_mobile" -> {
                val session = staffSession
                if (session != null) {
                    WmsMobileScreen(
                        staffSession = session,
                        onLogout = {
                            sharedPref.edit().remove("staffSession").apply()
                            staffSession = null
                            currentRoute = "login"
                        }
                    )
                } else {
                    currentRoute = "login"
                }
            }
            else -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "Yapım Aşamasında",
                        style = MaterialTheme.typography.headlineSmall
                    )
                }
            }
        }
    }
}

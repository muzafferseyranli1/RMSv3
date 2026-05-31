package com.suitable.musteri.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.util.Log

data class AppConfig(
    val branding: Map<String, Any>?,
    val homeButtons: List<Map<String, Any>>?,
    val maintenanceMode: Boolean
)

class ConfigRepository {
    suspend fun getAppConfig(): AppConfig? {
        return withContext(Dispatchers.IO) {
            try {
                val request = QueryRequest(
                    table = "customer_app_config",
                    operation = "select",
                    filters = mapOf("config_key" to "default")
                )
                val response = ApiClient.apiService.executeQuery(request)
                
                if (response.success && response.data != null && response.data.isNotEmpty()) {
                    val row = response.data[0]
                    val branding = row["branding"] as? Map<String, Any>
                    val homeButtons = row["home_buttons"] as? List<Map<String, Any>>
                    val active = row["active"] as? Boolean ?: true
                    
                    AppConfig(
                        branding = branding,
                        homeButtons = homeButtons,
                        maintenanceMode = !active
                    )
                } else {
                    null
                }
            } catch (e: Exception) {
                Log.e("ConfigRepository", "Error fetching config", e)
                null
            }
        }
    }
}

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
                    filters = listOf(mapOf("type" to "eq", "col" to "config_key", "val" to "default"))
                )
                val response = ApiClient.apiService.executeQuery(request)
                
                if (response.error == null) {
                    val dataList = response.data as? List<Map<String, Any>>
                    if (dataList != null && dataList.isNotEmpty()) {
                        val row = dataList[0]
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

package com.suitable.musteri.data

import android.util.Log
import com.google.gson.internal.LinkedTreeMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class AppConfig(
    val branding: Map<String, Any>?,
    val homeButtons: List<Map<String, Any>>?,
    val maintenanceMode: Boolean
)

@Suppress("UNCHECKED_CAST")
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
                    // Gson returns data as List<LinkedTreeMap>
                    val dataList = response.data as? List<*>
                    if (dataList != null && dataList.isNotEmpty()) {
                        val row = dataList[0] as? Map<String, Any> ?: return@withContext null
                        val branding = row["branding"] as? Map<String, Any>
                        val homeButtons = (row["home_buttons"] as? List<*>)?.mapNotNull { it as? Map<String, Any> }
                        val active = row["active"] as? Boolean ?: true

                        Log.d("ConfigRepository", "Branding: $branding")
                        Log.d("ConfigRepository", "Buttons: $homeButtons")

                        AppConfig(
                            branding = branding,
                            homeButtons = homeButtons,
                            maintenanceMode = !active
                        )
                    } else {
                        Log.w("ConfigRepository", "No config rows returned")
                        null
                    }
                } else {
                    Log.e("ConfigRepository", "API error: ${response.error}")
                    null
                }
            } catch (e: Exception) {
                Log.e("ConfigRepository", "Error fetching config", e)
                null
            }
        }
    }
}

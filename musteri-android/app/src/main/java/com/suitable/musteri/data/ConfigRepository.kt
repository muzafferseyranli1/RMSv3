package com.suitable.musteri.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.util.Log

data class AppConfig(
    val brandColor: String,
    val headerLogo: String?,
    val loyaltyEnabled: Boolean,
    val maintenanceMode: Boolean
)

class ConfigRepository {
    suspend fun getAppConfig(): AppConfig? {
        return withContext(Dispatchers.IO) {
            try {
                val query = "SELECT * FROM customer_app_config LIMIT 1"
                val response = ApiClient.apiService.executeQuery(QueryRequest(query = query))
                
                if (response.success && response.data != null && response.data.isNotEmpty()) {
                    val row = response.data[0]
                    val themeConfig = row["theme_config"] as? Map<*, *>
                    val brandColor = themeConfig?.get("primary_color") as? String ?: "#000000"
                    val headerLogo = themeConfig?.get("logo_url") as? String
                    
                    val features = row["features_enabled"] as? Map<*, *>
                    val loyaltyEnabled = features?.get("loyalty_program") as? Boolean ?: false
                    
                    val maintenanceMode = row["maintenance_mode"] as? Boolean ?: false
                    
                    AppConfig(
                        brandColor = brandColor,
                        headerLogo = headerLogo,
                        loyaltyEnabled = loyaltyEnabled,
                        maintenanceMode = maintenanceMode
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

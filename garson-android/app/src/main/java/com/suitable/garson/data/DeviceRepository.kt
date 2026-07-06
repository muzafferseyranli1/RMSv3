package com.suitable.garson.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class PosTerminal(
    val id: String,
    val terminalId: String,
    val terminalName: String?,
    val branchId: String,
    val deviceType: String,
    val screenMode: String,
    val isMaster: Boolean,
    val activationCode: String,
    val configData: Map<String, Any>
) {
    @Suppress("UNCHECKED_CAST")
    fun getAllowedZones(): List<String> {
        return (configData["allowed_zones"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    }
}

class DeviceRepository {

    suspend fun fetchGarsonTerminals(branchId: String): List<PosTerminal> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "pos_terminals",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "branch_id", "val" to branchId),
                        mapOf("type" to "eq", "col" to "device_type", "val" to "masa")
                    )
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = (res.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                rows.mapNotNull { row ->
                    val configDataObj = row["config_data"]
                    val configDataMap = when (configDataObj) {
                        is Map<*, *> -> configDataObj as Map<String, Any>
                        is String -> parseJsonToMap(configDataObj)
                        else -> emptyMap()
                    }

                    PosTerminal(
                        id = row["id"]?.toString() ?: return@mapNotNull null,
                        terminalId = row["terminal_id"]?.toString() ?: "",
                        terminalName = row["terminal_name"]?.toString(),
                        branchId = row["branch_id"]?.toString() ?: branchId,
                        deviceType = row["device_type"]?.toString() ?: "masa",
                        screenMode = row["screen_mode"]?.toString() ?: "garson",
                        isMaster = row["is_master"] as? Boolean ?: false,
                        activationCode = row["activation_code"]?.toString() ?: "",
                        configData = configDataMap
                    )
                }.sortedBy { it.terminalName ?: it.activationCode }
            } catch (e: Exception) {
                Log.e("DeviceRepository", "fetchGarsonTerminals error", e)
                emptyList()
            }
        }
    }

    suspend fun getGarsonActiveSessions(): Map<String, String> {
        return withContext(Dispatchers.IO) {
            try {
                val req = QueryRequest(
                    table = "settings",
                    filters = listOf(mapOf("type" to "eq", "col" to "key", "val" to "garson_active_sessions"))
                )
                val res = ApiClient.apiService.executeQuery(req)
                val rows = res.data as? List<*>
                val row = rows?.firstOrNull() as? Map<String, Any>
                if (row != null) {
                    val valueObj = row["value"]
                    if (valueObj is String) {
                        return@withContext parseJsonToStringMap(valueObj)
                    } else if (valueObj is Map<*, *>) {
                        return@withContext valueObj as Map<String, String>
                    }
                }
                emptyMap()
            } catch (e: Exception) {
                Log.e("DeviceRepository", "getGarsonActiveSessions error", e)
                emptyMap()
            }
        }
    }

    suspend fun updateGarsonActiveSession(terminalId: String, staffId: String?) {
        withContext(Dispatchers.IO) {
            try {
                val currentSessions = getGarsonActiveSessions().toMutableMap()
                if (staffId == null) {
                    currentSessions.remove(terminalId)
                } else {
                    currentSessions[terminalId] = staffId
                }
                
                val req = QueryRequest(
                    table = "settings",
                    operation = "upsert",
                    data = mapOf(
                        "key" to "garson_active_sessions",
                        "value" to currentSessions,
                        "description" to "Aktif Garson Oturumları"
                    )
                )
                ApiClient.apiService.executeQuery(req)
            } catch (e: Exception) {
                Log.e("DeviceRepository", "updateGarsonActiveSession error", e)
            }
        }
    }

    private fun parseJsonToStringMap(jsonString: String): Map<String, String> {
        return try {
            val type = object : com.google.gson.reflect.TypeToken<Map<String, String>>() {}.type
            com.google.gson.Gson().fromJson(jsonString, type) ?: emptyMap()
        } catch (e: Exception) {
            emptyMap()
        }
    }

    private fun parseJsonToMap(jsonString: String): Map<String, Any> {
        return try {
            val type = object : com.google.gson.reflect.TypeToken<Map<String, Any>>() {}.type
            com.google.gson.Gson().fromJson(jsonString, type) ?: emptyMap()
        } catch (e: Exception) {
            emptyMap()
        }
    }
}

package com.suitable.musteri.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class CustomerInfo(
    val id: String,
    val adSoyad: String,
    val telefon: String,
    val loyaltyMemberNo: String?,
    val pointsBalance: Int
)

class CustomerRepository {
    suspend fun getCustomerInfo(customerId: String): CustomerInfo? {
        return withContext(Dispatchers.IO) {
            try {
                // Fetch customer details
                val customerReq = QueryRequest(
                    table = "musteriler",
                    filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to customerId))
                )
                val customerRes = ApiClient.apiService.executeQuery(customerReq)
                val customerList = customerRes.data as? List<Map<String, Any>>
                val customer = customerList?.firstOrNull() ?: return@withContext null

                val adSoyad = customer["ad_soyad"] as? String ?: ""
                val telefon = customer["telefon"] as? String ?: ""
                val loyaltyMemberNo = customer["loyalty_member_no"] as? String

                // Fetch loyalty points
                val walletsReq = QueryRequest(
                    table = "loyalty_wallets",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "customer_id", "val" to customerId),
                        mapOf("type" to "eq", "col" to "wallet_type", "val" to "points")
                    )
                )
                val walletsRes = ApiClient.apiService.executeQuery(walletsReq)
                val walletsList = walletsRes.data as? List<Map<String, Any>> ?: emptyList()
                
                var totalPoints = 0
                for (wallet in walletsList) {
                    val balanceStr = wallet["current_points_balance"]?.toString() ?: "0"
                    totalPoints += balanceStr.toDoubleOrNull()?.toInt() ?: 0
                }

                CustomerInfo(
                    id = customerId,
                    adSoyad = adSoyad,
                    telefon = telefon,
                    loyaltyMemberNo = loyaltyMemberNo,
                    pointsBalance = totalPoints
                )
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }
    }
}

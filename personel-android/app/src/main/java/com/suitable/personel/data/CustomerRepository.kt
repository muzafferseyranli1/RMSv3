package com.suitable.personel.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class StampCampaignProgress(
    val campaignId: String,
    val campaignName: String,
    val current: Int,
    val target: Int,
    val completedCycles: Int,
    val productName: String?
)

data class CustomerInfo(
    val id: String,
    val adSoyad: String,
    val telefon: String,
    val loyaltyMemberNo: String?,
    val pointsBalance: Int,
    val stampCampaigns: List<StampCampaignProgress>
)

@Suppress("UNCHECKED_CAST")
class CustomerRepository {
    suspend fun getCustomerInfo(customerId: String): CustomerInfo? {
        return withContext(Dispatchers.IO) {
            try {
                // 1. Müşteri bilgileri
                val customerReq = QueryRequest(
                    table = "musteriler",
                    filters = listOf(mapOf("type" to "eq", "col" to "id", "val" to customerId))
                )
                val customerRes = ApiClient.apiService.executeQuery(customerReq)
                val customerList = customerRes.data as? List<*>
                val customer = (customerList?.firstOrNull() as? Map<String, Any>) ?: return@withContext null

                val adSoyad = customer["ad_soyad"] as? String ?: ""
                val telefon = customer["telefon"] as? String ?: ""
                val loyaltyMemberNo = customer["loyalty_member_no"] as? String

                // 2. Puan bakiyesi (loyalty_wallets)
                val walletsReq = QueryRequest(
                    table = "loyalty_wallets",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "customer_id", "val" to customerId)
                    )
                )
                val walletsRes = ApiClient.apiService.executeQuery(walletsReq)
                val walletsList = (walletsRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                var totalPoints = 0
                for (wallet in walletsList) {
                    val walletType = wallet["wallet_type"] as? String ?: ""
                    if (walletType == "points") {
                        val bal = wallet["current_points_balance"]?.toString() ?: "0"
                        totalPoints += bal.toDoubleOrNull()?.toInt() ?: 0
                    }
                }

                // 3. Damga kampanya kuralları (loyalty_campaign_rules)
                val stampRulesReq = QueryRequest(
                    table = "loyalty_campaign_rules",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "condition_key", "val" to "period_product_quantity"),
                        mapOf("type" to "eq", "col" to "active", "val" to true)
                    )
                )
                val stampRulesRes = ApiClient.apiService.executeQuery(stampRulesReq)
                val stampRules = (stampRulesRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                // Ayrıca sipariş sayısına dayalı damgaları da çek (period_order_count)
                val orderStampRulesReq = QueryRequest(
                    table = "loyalty_campaign_rules",
                    filters = listOf(
                        mapOf("type" to "eq", "col" to "condition_key", "val" to "period_order_count"),
                        mapOf("type" to "eq", "col" to "active", "val" to true)
                    )
                )
                val orderStampRulesRes = ApiClient.apiService.executeQuery(orderStampRulesReq)
                val orderStampRules = (orderStampRulesRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                val allStampRules = stampRules + orderStampRules

                // 4. Müşterinin frekans ilerleme kayıtları (loyalty_frequency_progress)
                val progressReq = QueryRequest(
                    table = "loyalty_frequency_progress",
                    filters = listOf<Map<String, Any>>(
                        mapOf("type" to "eq", "col" to "customer_id", "val" to customerId)
                    )
                )
                val progressRes = ApiClient.apiService.executeQuery(progressReq)
                val progressRows = (progressRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()

                // 5. Kampanya adlarını çek
                val campaignIds = allStampRules.mapNotNull { it["campaign_id"] as? String }.distinct()
                val campaignNames = mutableMapOf<String, String>()
                if (campaignIds.isNotEmpty()) {
                    val campReq = QueryRequest(
                        table = "loyalty_campaigns",
                        select = "id,name",
                        filters = listOf(
                            mapOf("type" to "in", "col" to "id", "val" to campaignIds) as Map<String, Any>
                        )
                    )
                    val campRes = ApiClient.apiService.executeQuery(campReq)
                    val campList = (campRes.data as? List<*>)?.mapNotNull { it as? Map<String, Any> } ?: emptyList()
                    for (camp in campList) {
                        val id = camp["id"] as? String ?: continue
                        val name = camp["name"] as? String ?: continue
                        campaignNames[id] = name
                    }
                }

                // 6. Damga kampanyalarını progress ile eşleştir
                val stampCampaigns = allStampRules.mapNotNull { rule ->
                    val campaignId = rule["campaign_id"] as? String ?: return@mapNotNull null
                    val condJson = rule["condition_json"] as? Map<String, Any>
                    val isStampMode = condJson?.get("isStampMode") as? Boolean ?: true
                    if (!isStampMode) return@mapNotNull null

                    val target = (condJson?.get("quantity") as? Double)?.toInt()
                        ?: (condJson?.get("threshold") as? Double)?.toInt()
                        ?: (rule["threshold_value"] as? String)?.toDoubleOrNull()?.toInt()
                        ?: 5

                    // Ürün adı
                    val productMasks = condJson?.get("productMasks") as? List<*>
                    val firstProduct = (productMasks?.firstOrNull() as? Map<String, Any>)?.get("name") as? String

                    // Progress
                    val progressRow = progressRows.find { it["campaign_id"]?.toString() == campaignId }
                    val current = (progressRow?.get("current_count") as? Double)?.toInt() ?: 0
                    val completedCycles = (progressRow?.get("completed_cycles") as? Double)?.toInt() ?: 0

                    val campName = campaignNames[campaignId] ?: "Damga Kampanyası"
                    Log.d("CustomerRepository", "Stamp: $campName $current/$target cycles=$completedCycles")

                    StampCampaignProgress(
                        campaignId = campaignId,
                        campaignName = campName,
                        current = current,
                        target = target,
                        completedCycles = completedCycles,
                        productName = firstProduct
                    )
                }

                Log.d("CustomerRepository", "Points=$totalPoints, StampCampaigns=${stampCampaigns.size}")

                CustomerInfo(
                    id = customerId,
                    adSoyad = adSoyad,
                    telefon = telefon,
                    loyaltyMemberNo = loyaltyMemberNo,
                    pointsBalance = totalPoints,
                    stampCampaigns = stampCampaigns
                )
            } catch (e: Exception) {
                Log.e("CustomerRepository", "Error fetching customer", e)
                null
            }
        }
    }
}


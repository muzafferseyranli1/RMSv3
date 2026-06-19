package com.suitable.kiosk.ui.shared

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.suitable.kiosk.data.model.CartItem
import com.suitable.kiosk.data.model.SaleItem

data class KioskSuggestion(
    val id: String,
    val stage: String, // "product" or "checkout"
    val title: String,
    val message: String,
    val actionLabel: String,
    val suggestionType: String, // "product" or "category" or "message"
    val targetId: String?,
)

object SuggestionEvaluator {

    fun matchProductSuggestion(
        rule: JsonObject,
        product: SaleItem,
        products: List<SaleItem>,
    ): Boolean {
        if (rule.get("active")?.asBoolean != true) return false
        val triggerType = rule.get("triggerType")?.asString ?: ""
        val triggerIds = rule.getAsJsonArray("triggerIds")?.mapNotNull { it.asString } ?: emptyList()

        if (triggerType == "category") {
            return product.categoryIds.any { it in triggerIds }
        }
        return product.id in triggerIds
    }

    fun evaluateCheckoutSuggestion(
        rule: JsonObject,
        cartItems: List<CartItem>,
        products: List<SaleItem>,
        totalAmount: Double,
    ): Boolean {
        if (rule.get("active")?.asBoolean != true) return false
        val conditions = rule.getAsJsonArray("conditions") ?: return false
        val logic = rule.get("logic")?.asString ?: "and"

        val checks = conditions.map { el ->
            if (!el.isJsonObject) return@map false
            val cond = el.asJsonObject
            val field = cond.get("field")?.asString ?: ""
            val value = cond.get("value")?.asString ?: ""
            val value2 = cond.get("value2")?.asString ?: ""

            when (field) {
                "always" -> true
                "has_product" -> cartItems.any { it.saleItem.id == value }
                "has_category" -> {
                    cartItems.any { item ->
                        item.saleItem.categoryIds.contains(value)
                    }
                }
                "total_gt" -> totalAmount > (value.toDoubleOrNull() ?: 0.0)
                "total_lt" -> totalAmount < (value.toDoubleOrNull() ?: 0.0)
                "total_between" -> {
                    val v1 = value.toDoubleOrNull() ?: 0.0
                    val v2 = value2.toDoubleOrNull() ?: 0.0
                    totalAmount in v1..v2
                }
                else -> false
            }
        }

        return if (logic == "or") {
            checks.any { it }
        } else {
            checks.all { it }
        }
    }

    fun buildSuggestion(
        rule: JsonObject,
        stage: String,
        products: List<SaleItem>,
    ): KioskSuggestion? {
        val id = rule.get("id")?.asString ?: ""
        val type = rule.get("suggestionType")?.asString ?: ""
        val title = rule.get("title")?.asString ?: ""
        val message = rule.get("message")?.asString ?: ""

        if (type == "product") {
            val suggestionProductId = rule.get("suggestionProductId")?.asString ?: ""
            val product = products.firstOrNull { it.id == suggestionProductId } ?: return null
            return KioskSuggestion(
                id = id,
                stage = stage,
                title = title.ifBlank { "${product.name} ekleyelim mi?" },
                message = message.ifBlank { product.channelDescriptionRaw?.asString ?: "" },
                actionLabel = "Sepete Ekle",
                suggestionType = "product",
                targetId = suggestionProductId
            )
        } else if (type == "category") {
            val suggestionCategoryId = rule.get("suggestionCategoryId")?.asString ?: ""
            return KioskSuggestion(
                id = id,
                stage = stage,
                title = title.ifBlank { "Bu Kategoriye Göz Atın" },
                message = message,
                actionLabel = "Kategoriye Git",
                suggestionType = "category",
                targetId = suggestionCategoryId
            )
        }

        return KioskSuggestion(
            id = id,
            stage = stage,
            title = title.ifBlank { "Önerimiz var" },
            message = message,
            actionLabel = "",
            suggestionType = "message",
            targetId = null
        )
    }
}

@Composable
fun SuggestionModal(
    suggestion: KioskSuggestion,
    onClose: () -> Unit,
    onAction: () -> Unit,
) {
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.65f)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)), // slate-900
                shape = RoundedCornerShape(20.dp),
                border = BorderStroke(1.dp, Color(0xFF334155)),
                modifier = Modifier
                    .fillMaxWidth(0.8f)
                    .padding(24.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "✨ Sizin İçin Öneri",
                        color = Color(0xFFF59E0B),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = suggestion.title,
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center
                    )
                    if (suggestion.message.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = suggestion.message,
                            color = Color(0xFF94A3B8),
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center
                        )
                    }

                    Spacer(Modifier.height(24.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Button(
                            onClick = onClose,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Kapat", color = Color.White, fontWeight = FontWeight.Bold)
                        }

                        if (suggestion.actionLabel.isNotEmpty()) {
                            Button(
                                onClick = onAction,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(suggestion.actionLabel, color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

package com.suitable.kiosk.ui.shared

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.suitable.kiosk.data.model.*
import java.util.*

sealed class ComboStep {
    abstract val key: String

    data class GroupStep(
        override val key: String,
        val groupId: String,
        val name: String,
        val primaryItemId: String,
        val alternatives: List<ComboAlternative>,
        val optionGroups: List<ComboOptionGroupLink>,
    ) : ComboStep()

    data class OptionStep(
        override val key: String,
        val title: String,
        val hint: String,
        val appliesToGroupId: String?, // null if combo level
        val optionGroupId: String,
        val minSelect: Int,
        val maxSelect: Int,
        val options: List<ComboOption>,
    ) : ComboStep()
}

data class ComboAlternative(
    val itemId: String,
    val manualAdjustments: Map<String, Double> = emptyMap(),
)

data class ComboOptionGroupLink(
    val optionGroupId: String,
)

data class ComboOption(
    val id: String,
    val name: String,
    val price: Double,
)

private val STATIC_OPTION_GROUPS = mapOf(
    "sos-secimi" to OptionGroup(
        id = "sos-secimi",
        name = "Sos Seçimi",
        minSelect = 0,
        maxSelect = 2,
        options = listOf(
            ItemOption("ketchup", "Ketçap", 0.0),
            ItemOption("mayonnaise", "Mayonez", 0.0),
            ItemOption("barbecue", "Barbekü", 5.0),
            ItemOption("ranch", "Ranch Sos", 5.0)
        )
    ),
    "peynir-secimi" to OptionGroup(
        id = "peynir-secimi",
        name = "Peynir Seçimi",
        minSelect = 0,
        maxSelect = 1,
        options = listOf(
            ItemOption("cheddar", "Cheddar Peyniri", 15.0),
            ItemOption("kasar", "Kaşar Peyniri", 10.0)
        )
    ),
    "icecek-buzu" to OptionGroup(
        id = "icecek-buzu",
        name = "Buz Tercihi",
        minSelect = 1,
        maxSelect = 1,
        options = listOf(
            ItemOption("buzlu", "Buzlu", 0.0),
            ItemOption("buzsuz", "Buzsuz", 0.0),
            ItemOption("az-buzlu", "Az Buzlu", 0.0)
        )
    )
)

private fun parseOptionGroupOptions(og: OptionGroup): Triple<Int, Int, List<ComboOption>> {
    val minSelect = og.minSelect
    val maxSelect = og.maxSelect
    val options = og.options.filter { it.isActive }.map {
        ComboOption(
            id = it.id.ifBlank { it.name },
            name = it.name,
            price = it.priceModifier
        )
    }
    return Triple(minSelect, maxSelect, options)
}

fun buildComboSteps(
    comboDefinition: JsonObject,
    optionGroupDefs: List<OptionGroup>,
    groupSelections: Map<String, String>,
): List<ComboStep> {
    val steps = mutableListOf<ComboStep>()
    val groups = comboDefinition.getAsJsonArray("groups") ?: JsonArray()

    // 1. Group steps
    for (el in groups) {
        if (!el.isJsonObject) continue
        val group = el.asJsonObject
        val groupId = group.get("id")?.asString ?: ""
        val groupName = group.get("name")?.asString ?: "Seçim Grubu"
        val primaryItemId = group.get("primaryItemId")?.asString ?: ""
        val alternatives = mutableListOf<ComboAlternative>()
        group.getAsJsonArray("alternatives")?.forEach { altEl ->
            if (altEl.isJsonObject) {
                val altObj = altEl.asJsonObject
                val itemId = altObj.get("itemId")?.asString ?: ""
                val manualAdjustments = mutableMapOf<String, Double>()
                altObj.getAsJsonObject("manualAdjustments")?.entrySet()?.forEach { entry ->
                    manualAdjustments[entry.key] = entry.value.asDouble
                }
                alternatives.add(ComboAlternative(itemId, manualAdjustments))
            }
        }
        val optionGroups = mutableListOf<ComboOptionGroupLink>()
        group.getAsJsonArray("optionGroups")?.forEach { optLinkEl ->
            if (optLinkEl.isJsonObject) {
                val optLinkObj = optLinkEl.asJsonObject
                val ogId = optLinkObj.get("optionGroupId")?.asString
                    ?: optLinkObj.get("option_group_id")?.asString
                    ?: ""
                optionGroups.add(ComboOptionGroupLink(ogId))
            }
        }

        steps.add(
            ComboStep.GroupStep(
                key = "group:$groupId",
                groupId = groupId,
                name = groupName,
                primaryItemId = primaryItemId,
                alternatives = alternatives,
                optionGroups = optionGroups
            )
        )
    }

    // 2. Option steps
    val defsById = optionGroupDefs.associateBy { it.id }

    // Group-level option steps
    for (el in groups) {
        if (!el.isJsonObject) continue
        val group = el.asJsonObject
        val groupId = group.get("id")?.asString ?: ""
        val selectedItemId = groupSelections[groupId] ?: continue

        group.getAsJsonArray("optionGroups")?.forEach { optLinkEl ->
            if (optLinkEl.isJsonObject) {
                val optLinkObj = optLinkEl.asJsonObject
                val ogId = optLinkObj.get("optionGroupId")?.asString
                    ?: optLinkObj.get("option_group_id")?.asString
                    ?: ""

                val def = defsById[ogId] ?: STATIC_OPTION_GROUPS[ogId]
                if (def != null) {
                    val groupName = group.get("name")?.asString ?: "Grup"
                    val defName = def.name.ifBlank { "Seçenek Grubu" }
                    val (minSelect, maxSelect, options) = parseOptionGroupOptions(def)
                    steps.add(
                        ComboStep.OptionStep(
                            key = "group:$groupId:$ogId",
                            title = "$groupName için $defName",
                            hint = "Seçimi tamamlamak için minimum ve maksimum sınırlara uyun.",
                            appliesToGroupId = groupId,
                            optionGroupId = ogId,
                            minSelect = minSelect,
                            maxSelect = maxSelect,
                            options = options
                        )
                    )
                }
            }
        }
    }

    // Combo-level option steps
    val form = comboDefinition.getAsJsonObject("form") ?: JsonObject()
    form.getAsJsonArray("comboOptionGroups")?.forEach { optLinkEl ->
        if (optLinkEl.isJsonObject) {
            val optLinkObj = optLinkEl.asJsonObject
            val ogId = optLinkObj.get("optionGroupId")?.asString
                ?: optLinkObj.get("option_group_id")?.asString
                ?: ""

            val def = defsById[ogId] ?: STATIC_OPTION_GROUPS[ogId]
            if (def != null) {
                val defName = def.name.ifBlank { "Seçenek Grubu" }
                val (minSelect, maxSelect, options) = parseOptionGroupOptions(def)
                steps.add(
                    ComboStep.OptionStep(
                        key = "combo:${comboDefinition.get("id")?.asString ?: "combo"}:$ogId",
                        title = "$defName seçiniz",
                        hint = "Bu seçim tüm combo menüye uygulanır.",
                        appliesToGroupId = null,
                        optionGroupId = ogId,
                        minSelect = minSelect,
                        maxSelect = maxSelect,
                        options = options
                    )
                )
            }
        }
    }

    return steps
}

@Composable
fun ComboBuilderModal(
    comboProduct: SaleItem,
    comboDefinition: JsonObject,
    saleItems: List<SaleItem>,
    optionGroupDefs: List<OptionGroup>,
    channelId: String?,
    baseUrl: String,
    onDismiss: () -> Unit,
    onConfirm: (CartItem) -> Unit,
) {
    val itemMap = remember(saleItems) { saleItems.associateBy { it.id } }

    // Seçim states
    val groupSelections = remember { mutableStateMapOf<String, String>() }
    // StepKey -> List of SelectedOptionIds
    val optionSelections = remember { mutableStateMapOf<String, List<String>>() }

    // Init default group selections (primaryItemId)
    LaunchedEffect(comboDefinition) {
        val groups = comboDefinition.getAsJsonArray("groups") ?: JsonArray()
        for (el in groups) {
            if (el.isJsonObject) {
                val group = el.asJsonObject
                val groupId = group.get("id")?.asString ?: ""
                val primaryItemId = group.get("primaryItemId")?.asString ?: ""
                if (groupId.isNotEmpty() && primaryItemId.isNotEmpty() && !groupSelections.containsKey(groupId)) {
                    groupSelections[groupId] = primaryItemId
                }
            }
        }
    }

    val steps = remember(comboDefinition, optionGroupDefs, groupSelections.toMap()) {
        buildComboSteps(comboDefinition, optionGroupDefs, groupSelections.toMap())
    }

    var currentStepIndex by remember { mutableIntStateOf(0) }
    val currentStep = steps.getOrNull(currentStepIndex)

    // Fiyat hesaplama
    val comboBasePrice = remember(comboDefinition, channelId) {
        val groups = comboDefinition.getAsJsonArray("groups") ?: JsonArray()
        val form = comboDefinition.getAsJsonObject("form") ?: JsonObject()
        val channelConfig = comboDefinition.getAsJsonObject("channelConfig")
        val config = if (channelId != null && channelConfig != null) {
            channelConfig.getAsJsonObject(channelId) ?: JsonObject()
        } else {
            JsonObject()
        }
        var baseTotal = 0.0
        for (el in groups) {
            if (el.isJsonObject) {
                val primary = el.asJsonObject.get("primaryItemId")?.asString ?: ""
                baseTotal += itemMap[primary]?.priceForChannel(channelId) ?: 0.0
            }
        }
        val pricingStrategy = form.get("pricingStrategy")?.asString ?: "set-price"
        when (pricingStrategy) {
            "percent" -> {
                val percent = config.get("percent")?.asDouble
                    ?: form.get("defaultPercent")?.asDouble
                    ?: 0.0
                Math.max(baseTotal * (1.0 - percent / 100.0), 0.0)
            }
            "fixed" -> {
                val fixed = config.get("fixed")?.asDouble
                    ?: form.get("defaultFixed")?.asDouble
                    ?: 0.0
                Math.max(baseTotal - fixed, 0.0)
            }
            else -> {
                config.get("comboPrice")?.asDouble
                    ?: form.get("defaultComboPrice")?.asDouble
                    ?: 0.0
            }
        }
    }

    // Seçimlerin ekstra fark toplamı
    val selectionAdjustments = groupSelections.map { (groupId, itemId) ->
        val groups = comboDefinition.getAsJsonArray("groups") ?: JsonArray()
        val group = groups.mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
            .firstOrNull { it.get("id")?.asString == groupId }
        if (group != null) {
            val primary = group.get("primaryItemId")?.asString ?: ""
            val reflectDiff = comboDefinition.getAsJsonObject("form")?.get("reflectPriceDiff")?.asBoolean == true
            if (itemId == primary) 0.0
            else {
                val alt = group.getAsJsonArray("alternatives")?.mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
                    ?.firstOrNull { it.get("itemId")?.asString == itemId }
                if (alt != null) {
                    if (reflectDiff) {
                        val pPrice = itemMap[primary]?.priceForChannel(channelId) ?: 0.0
                        val sPrice = itemMap[itemId]?.priceForChannel(channelId) ?: 0.0
                        Math.max(0.0, sPrice - pPrice)
                    } else {
                        val manual = alt.getAsJsonObject("manualAdjustments")
                        val diff = if (channelId != null && manual != null) {
                            manual.get(channelId)?.asDouble
                        } else null
                        diff ?: 0.0
                    }
                } else 0.0
            }
        } else 0.0
    }.sum()

    // Seçenek ekstra fiyatları
    val optionsPrices = optionSelections.flatMap { (stepKey, selectedIds) ->
        val step = steps.firstOrNull { it.key == stepKey } as? ComboStep.OptionStep
        if (step != null) {
            step.options.filter { it.id in selectedIds }.map { it.price }
        } else emptyList()
    }.sum()

    val totalComboPrice = comboBasePrice + selectionAdjustments + optionsPrices

    // Geçerlilik kontrolü
    val canProceed = remember(steps, groupSelections.toMap(), optionSelections.toMap(), currentStepIndex) {
        val step = steps.getOrNull(currentStepIndex) ?: return@remember false
        when (step) {
            is ComboStep.GroupStep -> groupSelections.containsKey(step.groupId)
            is ComboStep.OptionStep -> {
                val selectedCount = optionSelections[step.key]?.size ?: 0
                selectedCount >= step.minSelect && selectedCount <= step.maxSelect
            }
        }
    }

    val isLastStep = currentStepIndex == steps.size - 1

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.72f)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)), // dark theme slate-900
                shape = RoundedCornerShape(24.dp),
                border = BorderStroke(1.dp, Color(0xFF334155)),
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .fillMaxHeight(0.85f)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Header
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = comboProduct.name,
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "Menü tercihlerinizi belirleyin.",
                                color = Color(0xFF94A3B8),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier
                                .background(Color(0xFF334155), RoundedCornerShape(999.dp))
                        ) {
                            Text("✕", color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }

                    Divider(color = Color(0xFF334155))

                    // Steps row (horizontal indicator)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        steps.forEachIndexed { index, step ->
                            val isActive = index == currentStepIndex
                            val isCompleted = index < currentStepIndex
                            val title = when (step) {
                                is ComboStep.GroupStep -> step.name
                                is ComboStep.OptionStep -> step.title.substringBefore(" için").substringBefore(" seçiniz")
                            }
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(
                                        when {
                                            isActive -> Color(0xFFF59E0B)
                                            isCompleted -> Color(0xFF10B981)
                                            else -> Color(0xFF334155)
                                        }
                                    )
                            )
                        }
                    }

                    // Content Area (Two Columns: left steps navigation overview, right choices grid)
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp)
                    ) {
                        // Left overview (1/3 width)
                        Column(
                            modifier = Modifier
                                .weight(0.35f)
                                .fillMaxHeight()
                                .padding(end = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                "SEÇİM ADIMLARI",
                                color = Color(0xFF64748B),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                modifier = Modifier.padding(bottom = 8.dp)
                            )
                            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(steps.toList()) { step ->
                                    val index = steps.indexOf(step)
                                    val isActive = index == currentStepIndex
                                    val isSelected = when (step) {
                                        is ComboStep.GroupStep -> groupSelections.containsKey(step.groupId)
                                        is ComboStep.OptionStep -> optionSelections.containsKey(step.key)
                                    }
                                    val summary = when (step) {
                                        is ComboStep.GroupStep -> {
                                            val selId = groupSelections[step.groupId]
                                            itemMap[selId]?.name ?: "Seçilmedi"
                                        }
                                        is ComboStep.OptionStep -> {
                                            val selIds = optionSelections[step.key] ?: emptyList()
                                            if (selIds.isEmpty()) "Seçilmedi" else "${selIds.size} adet seçildi"
                                        }
                                    }

                                    Card(
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (isActive) Color(0xFF1E293B) else Color.Transparent
                                        ),
                                        border = BorderStroke(
                                            1.dp,
                                            if (isActive) Color(0xFFF59E0B) else Color.Transparent
                                        ),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { currentStepIndex = index }
                                    ) {
                                        Column(Modifier.padding(12.dp)) {
                                            Text(
                                                text = when (step) {
                                                    is ComboStep.GroupStep -> step.name
                                                    is ComboStep.OptionStep -> step.title
                                                },
                                                color = if (isActive) Color.White else Color(0xFF94A3B8),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp
                                            )
                                            Spacer(Modifier.height(4.dp))
                                            Text(
                                                text = summary,
                                                color = if (isSelected) Color(0xFF10B981) else Color(0xFF64748B),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Right details (2/3 width)
                        Box(
                            modifier = Modifier
                                .weight(0.65f)
                                .fillMaxHeight()
                                .background(Color(0xFF1E293B), RoundedCornerShape(16.dp))
                                .border(1.dp, Color(0xFF334155), RoundedCornerShape(16.dp))
                                .padding(20.dp)
                        ) {
                            when (currentStep) {
                                is ComboStep.GroupStep -> {
                                    Column(Modifier.fillMaxSize()) {
                                        Text(
                                            text = currentStep.name,
                                            color = Color.White,
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Black
                                        )
                                        Text(
                                            text = "Menüye eklemek istediğiniz ürünü seçiniz.",
                                            color = Color(0xFF94A3B8),
                                            fontSize = 12.sp,
                                            modifier = Modifier.padding(bottom = 16.dp)
                                        )

                                        val allChoices = remember(currentStep) {
                                            val choices = mutableListOf<Pair<String, Boolean>>()
                                            choices.add(Pair(currentStep.primaryItemId, true))
                                            currentStep.alternatives.forEach {
                                                choices.add(Pair(it.itemId, false))
                                            }
                                            choices
                                        }

                                        LazyColumn(
                                            verticalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            items(allChoices) { (itemId, isPrimary) ->
                                                val item = itemMap[itemId]
                                                val isSelected = groupSelections[currentStep.groupId] == itemId
                                                val delta = if (isPrimary) 0.0 else {
                                                    val reflectDiff = comboDefinition.getAsJsonObject("form")?.get("reflectPriceDiff")?.asBoolean == true
                                                    val alt = currentStep.alternatives.firstOrNull { it.itemId == itemId }
                                                    if (alt != null) {
                                                        if (reflectDiff) {
                                                            val pPrice = itemMap[currentStep.primaryItemId]?.priceForChannel(channelId) ?: 0.0
                                                            val sPrice = itemMap[itemId]?.priceForChannel(channelId) ?: 0.0
                                                            Math.max(0.0, sPrice - pPrice)
                                                        } else {
                                                            alt.manualAdjustments[channelId] ?: 0.0
                                                        }
                                                    } else 0.0
                                                }

                                                Card(
                                                    shape = RoundedCornerShape(14.dp),
                                                    colors = CardDefaults.cardColors(
                                                        containerColor = if (isSelected) Color(0xFF2E3F5F) else Color(0xFF0F172A)
                                                    ),
                                                    border = BorderStroke(
                                                        1.5.dp,
                                                        if (isSelected) Color(0xFFF59E0B) else Color(0xFF334155)
                                                    ),
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable {
                                                            groupSelections[currentStep.groupId] = itemId
                                                        }
                                                ) {
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(16.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                                                        ) {
                                                            val imgUrl = item?.imageUrlForChannel(channelId, baseUrl)
                                                            if (!imgUrl.isNullOrBlank()) {
                                                                AsyncImage(
                                                                    model = imgUrl,
                                                                    contentDescription = item.name,
                                                                    contentScale = ContentScale.Crop,
                                                                    modifier = Modifier
                                                                        .size(54.dp)
                                                                        .clip(RoundedCornerShape(8.dp))
                                                                )
                                                            }
                                                            Column {
                                                                Text(
                                                                    text = item?.name ?: "Ürün",
                                                                    color = Color.White,
                                                                    fontWeight = FontWeight.Bold,
                                                                    fontSize = 14.sp
                                                                )
                                                                Text(
                                                                    text = if (isPrimary) "Standart Seçim" else "Alternatif",
                                                                    color = if (isPrimary) Color(0xFFF59E0B) else Color(0xFF94A3B8),
                                                                    fontSize = 11.sp
                                                                )
                                                            }
                                                        }
                                                        if (delta > 0.0) {
                                                            Text(
                                                                text = "+${String.format(Locale.US, "%.2f", delta)} TL",
                                                                color = Color(0xFF10B981),
                                                                fontWeight = FontWeight.Black,
                                                                fontSize = 14.sp
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                is ComboStep.OptionStep -> {
                                    Column(Modifier.fillMaxSize()) {
                                        Text(
                                            text = currentStep.title,
                                            color = Color.White,
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Black
                                        )
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = "Bu adım için min ${currentStep.minSelect}, max ${currentStep.maxSelect} seçim yapmalısınız.",
                                                color = Color(0xFF94A3B8),
                                                fontSize = 11.sp
                                            )
                                        }

                                        val selectedIds = optionSelections[currentStep.key] ?: emptyList()

                                        LazyColumn(
                                            verticalArrangement = Arrangement.spacedBy(8.dp),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            items(currentStep.options) { option ->
                                                val isSelected = option.id in selectedIds

                                                Card(
                                                    shape = RoundedCornerShape(12.dp),
                                                    colors = CardDefaults.cardColors(
                                                        containerColor = if (isSelected) Color(0xFF2E3F5F) else Color(0xFF0F172A)
                                                    ),
                                                    border = BorderStroke(
                                                        1.5.dp,
                                                        if (isSelected) Color(0xFF10B981) else Color(0xFF334155)
                                                    ),
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable {
                                                            val newList = selectedIds.toMutableList()
                                                            if (isSelected) {
                                                                newList.remove(option.id)
                                                            } else {
                                                                if (currentStep.maxSelect == 1) {
                                                                    newList.clear()
                                                                    newList.add(option.id)
                                                                } else if (newList.size < currentStep.maxSelect) {
                                                                    newList.add(option.id)
                                                                }
                                                            }
                                                            optionSelections[currentStep.key] = newList
                                                        }
                                                ) {
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(14.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Text(
                                                            text = option.name,
                                                            color = Color.White,
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 13.sp
                                                        )
                                                        if (option.price > 0.0) {
                                                            Text(
                                                                    text = "+${String.format(Locale.US, "%.2f", option.price)} TL",
                                                                color = Color(0xFF10B981),
                                                                fontWeight = FontWeight.Black,
                                                                fontSize = 13.sp
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                null -> {
                                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                        Text("Yükleniyor...", color = Color.White)
                                    }
                                }
                            }
                        }
                    }

                    Divider(color = Color(0xFF334155), modifier = Modifier.padding(top = 16.dp))

                    // Footer with price and actions
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("TOPLAM MENÜ FİYATI", color = Color(0xFF64748B), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Text(
                                    text = "${String.format(Locale.US, "%.2f", totalComboPrice)} TL",
                                color = Color(0xFFF59E0B),
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (currentStepIndex > 0) {
                                Button(
                                    onClick = { currentStepIndex-- },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
                                    shape = RoundedCornerShape(12.dp),
                                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp)
                                ) {
                                    Text("Geri", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }

                            Button(
                                onClick = {
                                    if (isLastStep) {
                                        // Build CartItem and confirm
                                        val finalExpandedLines = mutableListOf<ComboExpandedLine>()
                                        val groups = comboDefinition.getAsJsonArray("groups") ?: JsonArray()
                                        
                                        var index = 0
                                        for (el in groups) {
                                            if (!el.isJsonObject) continue
                                            val group = el.asJsonObject
                                            val groupId = group.get("id")?.asString ?: ""
                                            val groupName = group.get("name")?.asString ?: "Grup"
                                            val primaryId = group.get("primaryItemId")?.asString ?: ""
                                            val selectedId = groupSelections[groupId] ?: primaryId
                                            val item = itemMap[selectedId] ?: continue

                                            // Options for this group
                                            val groupOptions = optionSelections.filter { it.key.startsWith("group:$groupId:") }
                                                .flatMap { (stepKey, selIds) ->
                                                    val step = steps.firstOrNull { it.key == stepKey } as? ComboStep.OptionStep
                                                    step?.options?.filter { it.id in selIds }?.map { opt ->
                                                        SelectedOption(
                                                            groupId = step.optionGroupId,
                                                            groupName = step.title.substringAfter(" için "),
                                                            optionId = opt.id,
                                                            optionName = opt.name,
                                                            priceModifier = opt.price
                                                        )
                                                    } ?: emptyList()
                                                }

                                            // Alternatives adjustment price
                                            val adjustment = if (selectedId == primaryId) 0.0 else {
                                                val reflectDiff = comboDefinition.getAsJsonObject("form")?.get("reflectPriceDiff")?.asBoolean == true
                                                val alt = group.getAsJsonArray("alternatives")?.mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
                                                    ?.firstOrNull { it.get("itemId")?.asString == selectedId }
                                                if (alt != null) {
                                                    if (reflectDiff) {
                                                        val pPrice = itemMap[primaryId]?.priceForChannel(channelId) ?: 0.0
                                                        val sPrice = itemMap[selectedId]?.priceForChannel(channelId) ?: 0.0
                                                        Math.max(0.0, sPrice - pPrice)
                                                    } else {
                                                        val manual = alt.getAsJsonObject("manualAdjustments")
                                                        if (channelId != null && manual != null) {
                                                            manual.get(channelId)?.asDouble ?: 0.0
                                                        } else 0.0
                                                    }
                                                } else 0.0
                                            }

                                            // Base price = item base price + options price modifier
                                            val basePrice = item.priceForChannel(channelId) + groupOptions.sumOf { it.priceModifier } + adjustment

                                            finalExpandedLines.add(
                                                ComboExpandedLine(
                                                    productId = selectedId,
                                                    productName = item.name,
                                                    productSku = item.sku,
                                                    groupName = groupName,
                                                    isPrimary = selectedId == primaryId,
                                                    baseUnitPrice = basePrice,
                                                    unitPrice = basePrice, // will be ratio adjusted
                                                    options = groupOptions,
                                                    prepTimeMinutes = item.prepTimeMinutes
                                                )
                                            )
                                            index++
                                        }

                                        // Apply ratio-based pricing allocation
                                        val realTotal = finalExpandedLines.sumOf { it.baseUnitPrice }
                                        
                                        // Combo level options
                                        val comboLevelOptions = optionSelections.filter { it.key.startsWith("combo:") }
                                            .flatMap { (stepKey, selIds) ->
                                                val step = steps.firstOrNull { it.key == stepKey } as? ComboStep.OptionStep
                                                step?.options?.filter { it.id in selIds }?.map { opt ->
                                                    SelectedOption(
                                                        groupId = step.optionGroupId,
                                                        groupName = step.title.substringBefore(" seçiniz"),
                                                        optionId = opt.id,
                                                        optionName = opt.name,
                                                        priceModifier = opt.price
                                                    )
                                                } ?: emptyList()
                                            }

                                        val targetTotal = comboBasePrice + selectionAdjustments + comboLevelOptions.sumOf { it.priceModifier }
                                        val ratio = if (realTotal > 0) (targetTotal / realTotal) else 1.0

                                        var allocated = 0.0
                                        val allocatedLines = finalExpandedLines.mapIndexed { idx, line ->
                                            val isLast = idx == finalExpandedLines.size - 1
                                            val calculatedPrice = if (isLast) {
                                                targetTotal - allocated
                                            } else {
                                                Math.round(line.baseUnitPrice * ratio * 100.0) / 100.0
                                            }
                                            allocated += calculatedPrice

                                            // Attach combo-level options to first item line
                                            val allOptions = if (idx == 0) line.options + comboLevelOptions else line.options

                                            line.copy(
                                                unitPrice = Math.max(0.0, calculatedPrice),
                                                options = allOptions
                                            )
                                        }

                                        val cartItem = CartItem(
                                            saleItem = comboProduct,
                                            quantity = 1,
                                            selectedOptions = emptyList(),
                                            portionId = null,
                                            portionName = null,
                                            note = "",
                                            unitPrice = totalComboPrice,
                                            comboBundle = ComboBundle(
                                                comboUnitPrice = totalComboPrice,
                                                realTotal = realTotal,
                                                comboBasePrice = comboBasePrice,
                                                adjustmentTotal = selectionAdjustments,
                                                expandedLines = allocatedLines
                                            )
                                        )
                                        onConfirm(cartItem)
                                    } else {
                                        currentStepIndex++
                                    }
                                },
                                enabled = canProceed,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (isLastStep) Color(0xFF10B981) else Color(0xFFF59E0B)
                                ),
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 14.dp)
                            ) {
                                Text(
                                    text = if (isLastStep) "Sepete Ekle" else "Sonraki",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

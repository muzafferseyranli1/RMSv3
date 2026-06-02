package com.suitable.personel.ui.main

import android.util.Log
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.suitable.personel.data.ApiClient
import com.suitable.personel.data.CustomerInfo
import com.suitable.personel.data.QueryRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ─── Data Models ─────────────────────────────────────────────────────────────

data class SurveyField(
    val id: String,
    val type: String,
    val label: String,
    val required: Boolean,
    val options: List<SurveyOption> = emptyList()
)

data class SurveyOption(val label: String, val points: Int = 0)

data class SurveySection(val id: String, val title: String, val fields: List<SurveyField>)

data class SurveyTemplate(val id: String, val title: String, val sections: List<SurveySection>)

// ─── Main FeedbackScreen ──────────────────────────────────────────────────────

@Composable
fun FeedbackScreen(
    surveyFormIds: List<String>,
    customerInfo: CustomerInfo?,
    config: com.suitable.personel.data.AppConfig?,
    onNavigate: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    var surveys by remember { mutableStateOf<List<SurveyTemplate>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedSurvey by remember { mutableStateOf<SurveyTemplate?>(null) }
    var submitted by remember { mutableStateOf(false) }

    val primaryColor = remember(config) {
        val hex = (config?.branding?.get("primaryColor") as? String) ?: "#be185d"
        try { Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { Color(0xFFBE185D) }
    }

    val bgImageUrl = config?.branding?.get("bodyBackgroundImageUrl") as? String
        ?: config?.branding?.get("backgroundImageUrl") as? String

    // Load survey templates
    LaunchedEffect(surveyFormIds) {
        isLoading = true
        val loaded = mutableListOf<SurveyTemplate>()
        for (id in surveyFormIds) {
            try {
                val res = withContext(Dispatchers.IO) {
                    ApiClient.apiService.executeQuery(
                        QueryRequest(
                            table = "form_templates",
                            select = "id,title,schema_json",
                            filters = listOf<Map<String, Any>>(
                                mapOf("type" to "eq", "col" to "id", "val" to id)
                            )
                        )
                    )
                }
                val list = res.data as? List<*>
                val row = list?.firstOrNull() as? Map<*, *> ?: continue
                val template = parseSurveyTemplate(row)
                if (template != null) loaded.add(template)
            } catch (e: Exception) {
                Log.e("FeedbackScreen", "Load error for $id", e)
            }
        }
        surveys = loaded
        // If only one survey, go directly to it
        if (loaded.size == 1) selectedSurvey = loaded[0]
        isLoading = false
    }

    AppScaffold(
        config = config,
        customerInfo = customerInfo,
        onNavigate = onNavigate
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF1A1A2E))  // koyu lacivert zemin
        ) {

            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            } else if (submitted) {
                SubmittedSuccess(primaryColor = primaryColor) { onNavigate("home") }
            } else if (selectedSurvey != null) {
                SurveyFormView(
                    survey = selectedSurvey!!,
                    customerInfo = customerInfo,
                    primaryColor = primaryColor,
                    onBack = { if (surveys.size > 1) selectedSurvey = null else onNavigate("home") },
                    onSubmit = { answers ->
                        scope.launch {
                            submitSurvey(selectedSurvey!!, customerInfo, answers)
                            submitted = true
                        }
                    }
                )
            } else {
                // List of surveys to pick
                SurveyListView(
                    surveys = surveys,
                    primaryColor = primaryColor,
                    onSelect = { selectedSurvey = it }
                )
            }
        }
    }
}

// ─── Survey List ──────────────────────────────────────────────────────────────

@Composable
fun SurveyListView(
    surveys: List<SurveyTemplate>,
    primaryColor: Color,
    onSelect: (SurveyTemplate) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Geri Bildirim",
            color = Color.White,
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        Text(
            text = "Deneyiminizi bizimle paylaşın",
            color = Color.White.copy(alpha = 0.8f),
            fontSize = 14.sp,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        if (surveys.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxWidth().padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("Henüz anket tanımlanmamış.", color = Color.White, textAlign = TextAlign.Center)
            }
        }

        surveys.forEach { survey ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(survey) },
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.95f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(CircleShape)
                            .background(primaryColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("📋", fontSize = 24.sp)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = survey.title,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = Color(0xFF1E293B)
                        )
                        Text(
                            text = "${survey.sections.size} bölüm · ${survey.sections.sumOf { it.fields.size }} soru",
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Text("›", fontSize = 28.sp, color = primaryColor, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// ─── Survey Form ──────────────────────────────────────────────────────────────

@Composable
fun SurveyFormView(
    survey: SurveyTemplate,
    customerInfo: CustomerInfo?,
    primaryColor: Color,
    onBack: () -> Unit,
    onSubmit: (Map<String, String>) -> Unit
) {
    val answers = remember { mutableStateMapOf<String, String>() }
    var isSubmitting by remember { mutableStateOf(false) }
    val allFields = survey.sections.flatMap { it.fields }
    val allRequired = allFields.filter { it.required }
    val canSubmit = allRequired.all { answers[it.id]?.isNotBlank() == true }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Black.copy(alpha = 0.5f), Color.Transparent)
                    )
                )
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Geri",
                        tint = Color.White
                    )
                }
                Text(
                    text = survey.title,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
        }

        // Scrollable content
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            survey.sections.forEach { section ->
                SurveySectionCard(
                    section = section,
                    answers = answers,
                    primaryColor = primaryColor
                )
            }
            Spacer(modifier = Modifier.height(80.dp))
        }

        // Submit button
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(16.dp)
                .navigationBarsPadding()
        ) {
            Button(
                onClick = {
                    isSubmitting = true
                    onSubmit(answers.toMap())
                },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                enabled = canSubmit && !isSubmitting,
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor)
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                } else {
                    Text(
                        text = "Gönder",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
fun SurveySectionCard(
    section: SurveySection,
    answers: MutableMap<String, String>,
    primaryColor: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.97f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            if (section.title.isNotBlank()) {
                Text(
                    text = section.title,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp,
                    color = Color(0xFF1E293B)
                )
                HorizontalDivider(color = Color(0xFFE2E8F0))
            }

            section.fields.forEach { field ->
                SurveyFieldView(
                    field = field,
                    value = answers[field.id] ?: "",
                    primaryColor = primaryColor,
                    onValueChange = { answers[field.id] = it }
                )
            }
        }
    }
}

@Composable
fun SurveyFieldView(
    field: SurveyField,
    value: String,
    primaryColor: Color,
    onValueChange: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                text = field.label,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                color = Color(0xFF1E293B),
                modifier = Modifier.weight(1f)
            )
            if (field.required) {
                Text(" *", color = Color(0xFFDC2626), fontWeight = FontWeight.Bold)
            }
        }

        when (field.type) {
            "rating", "rating_10" -> {
                val maxStars = if (field.type == "rating_10") 10 else 5
                val current = value.toIntOrNull() ?: 0
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (i in 1..maxStars) {
                        Icon(
                            imageVector = if (i <= current) Icons.Filled.Star else Icons.Outlined.StarOutline,
                            contentDescription = "$i yıldız",
                            tint = if (i <= current) Color(0xFFF59E0B) else Color(0xFFCBD5E1),
                            modifier = Modifier
                                .size(if (maxStars > 5) 28.dp else 36.dp)
                                .clickable { onValueChange(i.toString()) }
                        )
                    }
                }
            }

            "yes_no" -> {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf("Evet" to "yes", "Hayır" to "no").forEach { (label, v) ->
                        val selected = value == v
                        OutlinedButton(
                            onClick = { onValueChange(v) },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = if (selected) primaryColor else Color.Transparent,
                                contentColor = if (selected) Color.White else primaryColor
                            ),
                            border = BorderStroke(1.5.dp, primaryColor)
                        ) {
                            Text(label, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            "select" -> {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    field.options.forEach { opt ->
                        val selected = value == opt.label
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) primaryColor.copy(alpha = 0.1f) else Color(0xFFF8FAFC))
                                .border(
                                    1.dp,
                                    if (selected) primaryColor else Color(0xFFE2E8F0),
                                    RoundedCornerShape(12.dp)
                                )
                                .clickable { onValueChange(opt.label) }
                                .padding(horizontal = 16.dp, vertical = 12.dp)
                        ) {
                            RadioButton(
                                selected = selected,
                                onClick = { onValueChange(opt.label) },
                                colors = RadioButtonDefaults.colors(selectedColor = primaryColor)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(opt.label, fontSize = 14.sp, color = Color(0xFF1E293B))
                        }
                    }
                }
            }

            "nps" -> {
                val current = value.toIntOrNull() ?: -1
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        for (i in 0..10) {
                            val selected = current == i
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(if (selected) primaryColor else Color(0xFFF1F5F9))
                                    .clickable { onValueChange(i.toString()) },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = i.toString(),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (selected) Color.White else Color(0xFF64748B)
                                )
                            }
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Hiç Olmaz", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text("Kesinlikle", fontSize = 10.sp, color = Color(0xFF94A3B8))
                    }
                }
            }

            "text" -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                    placeholder = { Text("Yorumunuzu yazın...", color = Color(0xFF94A3B8)) },
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = primaryColor,
                        unfocusedBorderColor = Color(0xFFE2E8F0)
                    )
                )
            }

            "checkbox" -> {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onValueChange(if (value == "true") "false" else "true") }
                ) {
                    Checkbox(
                        checked = value == "true",
                        onCheckedChange = { onValueChange(if (it) "true" else "false") },
                        colors = CheckboxDefaults.colors(checkedColor = primaryColor)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Evet, onaylıyorum", fontSize = 14.sp, color = Color(0xFF1E293B))
                }
            }
        }
    }
}

// ─── Success Screen ───────────────────────────────────────────────────────────

@Composable
fun SubmittedSuccess(primaryColor: Color, onDone: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .clip(CircleShape)
                .background(Color(0xFF16A34A)),
            contentAlignment = Alignment.Center
        ) {
            Text("✓", fontSize = 50.sp, color = Color.White, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            "Teşekkürler!",
            fontSize = 28.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color.White
        )
        Text(
            "Geri bildiriminiz başarıyla iletildi.",
            fontSize = 15.sp,
            color = Color.White.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp)
        )
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = onDone,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = primaryColor)
        ) {
            Text("Ana Sayfaya Dön", fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

@Suppress("UNCHECKED_CAST")
fun parseSurveyTemplate(row: Map<*, *>): SurveyTemplate? {
    val id = row["id"] as? String ?: return null
    val title = row["title"] as? String ?: "Anket"
    val schemaJson = row["schema_json"] as? Map<*, *> ?: return null
    val sectionsRaw = schemaJson["sections"] as? List<*> ?: return null

    val sections = sectionsRaw.mapNotNull { secRaw ->
        val sec = secRaw as? Map<*, *> ?: return@mapNotNull null
        val secId = sec["id"] as? String ?: return@mapNotNull null
        val secTitle = sec["title"] as? String ?: ""
        val fieldsRaw = sec["fields"] as? List<*> ?: emptyList<Any>()

        val fields = fieldsRaw.mapNotNull { fRaw ->
            val f = fRaw as? Map<*, *> ?: return@mapNotNull null
            val fId = f["id"] as? String ?: return@mapNotNull null
            val fType = f["type"] as? String ?: "text"
            val fLabel = f["label"] as? String ?: ""
            val fRequired = f["required"] as? Boolean ?: false
            val optionsRaw = f["options"] as? List<*> ?: emptyList<Any>()
            val options = optionsRaw.mapNotNull { oRaw ->
                val o = oRaw as? Map<*, *> ?: return@mapNotNull null
                val oLabel = o["label"] as? String ?: return@mapNotNull null
                val oPoints = (o["points"] as? Double)?.toInt() ?: 0
                SurveyOption(oLabel, oPoints)
            }
            SurveyField(fId, fType, fLabel, fRequired, options)
        }

        SurveySection(secId, secTitle, fields)
    }

    return SurveyTemplate(id, title, sections)
}

suspend fun submitSurvey(
    survey: SurveyTemplate,
    customerInfo: CustomerInfo?,
    answers: Map<String, String>
) {
    try {
        val allFields = survey.sections.flatMap { it.fields }
        val answersJson = answers.map { (fieldId, value) ->
            mapOf("field_id" to fieldId, "value" to value, "note" to "")
        }

        val totalScore = answers.entries.sumOf { (fieldId, value) ->
            val field = allFields.find { it.id == fieldId }
            when (field?.type) {
                "rating" -> (value.toIntOrNull() ?: 0) * 2  // 1-5 → 2-10
                "rating_10", "nps" -> value.toIntOrNull() ?: 0
                "yes_no" -> if (value == "yes") 10 else 0
                else -> 0
            }
        }
        val maxScore = allFields.sumOf { it.options.maxOfOrNull { o -> o.points } ?: 10 }

        val payload = mapOf(
            "template_id" to survey.id,
            "submitted_by" to (customerInfo?.id ?: "anonymous"),
            "status" to "completed",
            "answers_json" to answersJson,
            "total_score" to totalScore,
            "max_possible_score" to maxScore,
            "score_percentage" to if (maxScore > 0) (totalScore.toDouble() / maxScore * 100) else 0.0,
            "metadata" to mapOf(
                "source" to "mobile_app",
                "customer_id" to (customerInfo?.id ?: ""),
                "customer_name" to (customerInfo?.adSoyad ?: "")
            )
        )

        withContext(Dispatchers.IO) {
            ApiClient.apiService.executeQuery(
                QueryRequest(
                    table = "form_submissions",
                    operation = "insert",
                    data = payload
                )
            )
        }
        Log.d("FeedbackScreen", "Survey submitted: ${survey.title}")
    } catch (e: Exception) {
        Log.e("FeedbackScreen", "Submit error", e)
    }
}


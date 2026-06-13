package com.suitable.wms.data

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Multipart
import retrofit2.http.Part
import okhttp3.MultipartBody
import com.google.gson.Gson

data class QueryRequest(
    val table: String? = null,
    val operation: String? = "select",
    val select: String? = "*",
    val filters: List<Map<String, Any?>>? = null,
    val data: Any? = null,
    val rpc: String? = null,
    val params: Any? = null
)

data class QueryResponse(
    val data: Any? = null,
    val error: Map<String, Any>? = null
)

data class ParseBarcodeRequest(
    val barcode: String,
    val branch_id: String,
    val task_id: String? = null,
    val personnel_id: String? = null,
    val terminal_id: String? = null
)

data class ParseBarcodeResponse(
    val data: com.suitable.wms.ui.scan.WmsScanResult? = null,
    val error: Map<String, Any>? = null
)

data class UploadResponse(
    val data: UploadData? = null,
    val error: Map<String, Any>? = null
)

data class UploadData(
    val file_url: String,
    val file_name: String,
    val file_size: Long,
    val mime_type: String
)

data class ShipmentCapacityResponse(
    val data: ShipmentCapacityData? = null,
    val error: Map<String, Any>? = null
)

data class ShipmentCapacityData(
    val shipment_id: String,
    val vehicle_id: String?,
    val plate_number: String?,
    val total_volume_m3: Double,
    val total_weight_kg: Double,
    val vehicle_max_volume_m3: Double,
    val vehicle_max_weight_kg: Double,
    val remaining_volume_m3: Double,
    val remaining_weight_kg: Double,
    val is_volume_exceeded: Boolean,
    val is_weight_exceeded: Boolean,
    val is_exceeded: Boolean
)

data class SubmitCountTaskRequest(
    val task_id: String,
    val personnel_id: String?,
    val counted_qty: Double,
    val reason: String?
)

data class SubmitCountTaskResponse(
    val data: SubmitCountTaskResult? = null,
    val error: Map<String, Any>? = null
)

data class SubmitCountTaskResult(
    val success: Boolean,
    val has_discrepancy: Boolean,
    val task_id: String,
    val approval_id: String? = null
)

import okhttp3.OkHttpClient

interface ApiService {
    @POST("api/query")
    suspend fun executeQuery(@Body request: QueryRequest): QueryResponse

    @POST("api/wms/parse-barcode")
    suspend fun parseBarcode(@Body request: ParseBarcodeRequest): ParseBarcodeResponse

    @GET("api/wms/shipment-capacity/{shipment_id}")
    suspend fun getShipmentCapacity(
        @Path("shipment_id") shipmentId: String
    ): ShipmentCapacityResponse

    @Multipart
    @POST("api/upload")
    suspend fun uploadFile(
        @Part file: MultipartBody.Part
    ): UploadResponse

    @POST("api/wms/tasks/count/submit")
    suspend fun submitCountTask(
        @Body request: SubmitCountTaskRequest
    ): SubmitCountTaskResponse

    @POST("api/wms/log-event")
    suspend fun logEvent(
        @Body request: Map<String, @JvmSuppressWildcards Any?>
    ): QueryResponse
}

object ApiClient {
    const val BASE_URL = "https://rms-api-production-219d.up.railway.app/"

    val gson: Gson = Gson()

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val original = chain.request()
                val request = original.newBuilder()
                    .header("x-app-version", "1.0")
                    .header("x-terminal-id", "TERMINAL-01")
                    .build()
                chain.proceed(request)
            }
            .build()
    }

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(ApiService::class.java)
    }

    fun resolveImageUrl(path: String?): String? {
        if (path.isNullOrBlank()) return null
        return if (path.startsWith("http://") || path.startsWith("https://")) path
        else BASE_URL.trimEnd('/') + "/" + path.trimStart('/')
    }
}

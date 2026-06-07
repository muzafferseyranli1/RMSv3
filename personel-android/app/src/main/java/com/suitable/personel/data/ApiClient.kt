package com.suitable.personel.data

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import com.google.gson.Gson

import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

data class QueryRequest(
    val table: String,
    val operation: String = "select",
    val select: String = "*",
    val filters: List<Map<String, Any?>>? = null,
    val data: Any? = null
)

data class QueryResponse(
    val data: Any? = null,
    val error: Map<String, Any>? = null
)

interface ApiService {
    @POST("api/query")
    suspend fun executeQuery(@Body request: QueryRequest): QueryResponse

    @GET("api/exchange-rate")
    suspend fun getExchangeRate(
        @Query("currency") currency: String,
        @Query("date") date: String?
    ): QueryResponse

    @PATCH("api/maintenance-tickets/{id}/resolve")
    suspend fun resolveMaintenanceTicket(
        @Path("id") id: String,
        @Body requestBody: Map<String, @kotlin.jvm.JvmSuppressWildcards Any?>
    ): QueryResponse
}


object ApiClient {
    const val BASE_URL = "https://rms-api-production-219d.up.railway.app/"

    val gson: Gson = Gson()

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(ApiService::class.java)
    }

    /**
     * Göreli path'i tam URL'ye dönüştür.
     *  "/api/files/abc.jpg" → "https://rms-api-production-219d.up.railway.app/api/files/abc.jpg"
     *  Zaten http(s):// ile başlıyorsa dokunma.
     */
    fun resolveImageUrl(path: String?): String? {
        if (path.isNullOrBlank()) return null
        return if (path.startsWith("http://") || path.startsWith("https://")) path
        else BASE_URL.trimEnd('/') + "/" + path.trimStart('/')
    }
}


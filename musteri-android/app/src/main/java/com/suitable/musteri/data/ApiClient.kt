package com.suitable.musteri.data

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import com.google.gson.Gson

data class QueryRequest(
    val table: String,
    val operation: String = "select",
    val select: String = "*",
    val filters: List<Map<String, Any>>? = null,
    val data: Map<String, Any>? = null
)

data class QueryResponse(
    val data: Any? = null,
    val error: Map<String, Any>? = null
)

interface ApiService {
    @POST("api/query")
    suspend fun executeQuery(@Body request: QueryRequest): QueryResponse
}

object ApiClient {
    private const val BASE_URL = "https://rms-api-production-219d.up.railway.app/"

    val gson: Gson = Gson()

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(ApiService::class.java)
    }
}

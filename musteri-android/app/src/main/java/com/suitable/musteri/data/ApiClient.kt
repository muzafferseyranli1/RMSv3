package com.suitable.musteri.data

import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST

data class QueryRequest(
    val table: String,
    val operation: String = "select",
    val filters: Map<String, Any>? = null,
    val data: Map<String, Any>? = null
)

data class QueryResponse(
    val success: Boolean,
    val data: List<Map<String, Any>>? = null,
    val error: String? = null
)

interface ApiService {
    @POST("api/query")
    suspend fun executeQuery(@Body request: QueryRequest): QueryResponse
}

object ApiClient {
    private const val BASE_URL = "https://rmsv3-production.up.railway.app/"

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}

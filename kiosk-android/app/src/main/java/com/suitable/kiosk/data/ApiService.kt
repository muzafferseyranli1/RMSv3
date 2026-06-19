package com.suitable.kiosk.data

import com.google.gson.JsonObject
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Railway /api/query endpoint'ini tüketen Retrofit interface.
 *
 * Web tarafındaki src/lib/db.js ile aynı protokolü kullanır:
 *   POST /api/query  { table, operation, filters?, data?, select?, order? }
 */
interface ApiService {

    /**
     * Genel amaçlı sorgu endpoint'i.
     * Web'deki db.from('tablo').select() / .insert() / .update() / .delete() çağrılarına karşılık gelir.
     */
    @POST("api/query")
    suspend fun query(@Body body: JsonObject): JsonObject
}

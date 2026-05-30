package com.suitable.musteri.ui.main

import android.annotation.SuppressLint
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation3.runtime.NavKey
import com.suitable.musteri.data.AppConfig

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen(
    config: AppConfig?,
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webViewClient = WebViewClient()
                webChromeClient = WebChromeClient()
                loadUrl("https://rmsv3-production.up.railway.app/musteri-app")
            }
        },
        update = { view ->
            // Update the view if needed
        }
    )
}

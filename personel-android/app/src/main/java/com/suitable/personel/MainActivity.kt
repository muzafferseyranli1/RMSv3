package com.suitable.personel

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.suitable.personel.theme.MusteriAppTheme

class MainActivity : ComponentActivity() {
  private val viewModel: MainViewModel by viewModels()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    enableEdgeToEdge()
    setContent {
      val isLoading by viewModel.isLoading.collectAsState()
      val config by viewModel.configState.collectAsState()

      if (isLoading) {
          Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
              CircularProgressIndicator()
          }
      } else {
          MusteriAppTheme(brandColorHex = config?.branding?.get("backgroundColor") as? String) { 
              Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { 
                  MainNavigation(config = config) 
              } 
          }
      }
    }
  }
}


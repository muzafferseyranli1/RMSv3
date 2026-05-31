package com.suitable.musteri.ui.main

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector

enum class TabItem(val label: String, val icon: ImageVector) {
    HOME("Ana Sayfa", Icons.Default.Home),
    CARD("Kartım", Icons.Default.CreditCard),
    COUPONS("Kuponlar", Icons.Default.ConfirmationNumber),
    CAMPAIGNS("Kampanyalar", Icons.Default.Campaign),
    ACCOUNT("Hesabım", Icons.Default.Person)
}

@Composable
fun BottomNavigationBar(
    currentTab: TabItem,
    onTabSelected: (TabItem) -> Unit
) {
    NavigationBar {
        TabItem.values().forEach { tab ->
            NavigationBarItem(
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label) },
                selected = currentTab == tab,
                onClick = { onTabSelected(tab) }
            )
        }
    }
}

package com.suitable.garson.ui.main

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun CouponCard(
    benefitText: String,
    title: String,
    code: String,
    expiry: String,
    gradientColors: List<Color>,
    isActivated: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val borderColor = if (isActivated) Color(0xFF22C55E) else Color.Transparent
    val borderWidth = if (isActivated) 3.dp else 0.dp

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(130.dp)
            .border(borderWidth, borderColor, TicketShape(6.dp, 4.dp))
            .clip(TicketShape(6.dp, 4.dp))
            .clickable(onClick = onClick)
            .background(Color.White) // The base color is white for the stub
    ) {
        // Left Stub
        Box(
            modifier = Modifier
                .width(105.dp)
                .fillMaxHeight(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = benefitText,
                modifier = Modifier.rotate(-90f),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 32.sp,
                color = gradientColors.first(),
                maxLines = 1
            )
        }

        // Dashed Divider
        Canvas(
            modifier = Modifier
                .width(2.dp)
                .fillMaxHeight()
        ) {
            drawLine(
                color = Color.LightGray,
                start = Offset(0f, 0f),
                end = Offset(0f, size.height),
                strokeWidth = 4f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
            )
        }

        // Right Body
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.linearGradient(colors = gradientColors))
                .padding(16.dp)
        ) {
            // Code badge
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .background(Color.Black.copy(alpha = 0.2f), shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = code,
                    color = Color.White,
                    fontSize = 10.sp,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }

            // Activated badge
            if (isActivated) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .background(Color(0xFF22C55E), shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "AKTİF",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Main Title & Expiry
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = title,
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 20.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .background(Color.Black.copy(alpha = 0.18f), shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = expiry,
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}


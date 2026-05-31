package com.suitable.musteri.ui.main

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

class TicketShape(
    private val scallopRadius: Dp = 6.dp,
    private val scallopGap: Dp = 4.dp
) : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: androidx.compose.ui.unit.LayoutDirection,
        density: Density
    ): Outline {
        val radiusPx = with(density) { scallopRadius.toPx() }
        val gapPx = with(density) { scallopGap.toPx() }
        val stepPx = (radiusPx * 2) + gapPx
        
        val path = Path().apply {
            // Top edge
            moveTo(0f, 0f)
            lineTo(size.width, 0f)
            
            // Right edge with scallops
            var currentY = 0f
            while (currentY < size.height) {
                lineTo(size.width, currentY + (gapPx / 2))
                arcTo(
                    rect = Rect(
                        left = size.width - radiusPx,
                        top = currentY + (gapPx / 2),
                        right = size.width + radiusPx,
                        bottom = currentY + (gapPx / 2) + (radiusPx * 2)
                    ),
                    startAngleDegrees = 270f,
                    sweepAngleDegrees = -180f,
                    forceMoveTo = false
                )
                currentY += stepPx
            }
            lineTo(size.width, size.height)
            
            // Bottom edge
            lineTo(0f, size.height)
            
            // Left edge with scallops (going up)
            currentY = size.height
            // Calculate how many scallops fit to properly align from bottom if needed,
            // or we just go from top down for the left edge too by doing it backwards.
            // Actually, easier to draw left edge from bottom up:
            // Let's just do a simple line for now and add scallops from top down by reversing the logic.
            // Or simpler: Use a path difference
        }
        
        // A cleaner way to punch holes is to create a rect path and use Path.op(difference)
        val rectPath = Path().apply {
            addRect(Rect(0f, 0f, size.width, size.height))
        }
        
        val holesPath = Path().apply {
            var y = 0f
            while (y < size.height) {
                val cy = y + (gapPx / 2) + radiusPx
                addOval(Rect(left = -radiusPx, top = cy - radiusPx, right = radiusPx, bottom = cy + radiusPx))
                addOval(Rect(left = size.width - radiusPx, top = cy - radiusPx, right = size.width + radiusPx, bottom = cy + radiusPx))
                y += stepPx
            }
        }
        
        val finalPath = Path().apply {
            op(rectPath, holesPath, androidx.compose.ui.graphics.PathOperation.Difference)
        }
        
        return Outline.Generic(finalPath)
    }
}

@echo off
title SuitableRMS - Cache Temizle ve Baslat
color 0A

echo.
echo ================================================
echo   SuitableRMS - Vite Cache Temizleme
echo ================================================
echo.

cd /d "C:\RMSggl\Dropbox\RMSv3"

echo [1/3] Vite cache siliniyor...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo        OK - node_modules\.vite silindi
) else (
    echo        Zaten temiz, cache yok
)

echo.
echo [2/3] dist klasoru siliniyor...
if exist "dist" (
    rmdir /s /q "dist"
    echo        OK - dist silindi
) else (
    echo        dist zaten yok
)

echo.
echo [3/3] Dev sunucu baslatiliyor...
echo        Ctrl+C ile durdurabilirsiniz
echo.
echo ================================================
echo.

npm.cmd run dev

pause

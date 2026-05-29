@echo off
title SuitableRMS POS - Yerel Test
echo ==========================================
echo SuitableRMS POS Masaustu Testi Baslatiliyor
echo ==========================================
echo.
echo Derleme yapiliyor ve RELEASE klasöründe EXE dosya oluşturuluyor ... lutfen bekleyin.
echo.

npm run build:desktop

if %errorlevel% neq 0 (
    echo.
    echo Bir hata olustu. Hata kodu: %errorlevel%
    pause
)

@echo off
title SuitableRMS POS - Yerel Test
echo ==========================================
echo SuitableRMS POS Masaustu Testi Baslatiliyor
echo ==========================================
echo.
echo Derleme yapiliyor ve Electron baslatiliyor... lutfen bekleyin.
echo.

npm run desktop:start

if %errorlevel% neq 0 (
    echo.
    echo Bir hata olustu. Hata kodu: %errorlevel%
    pause
)

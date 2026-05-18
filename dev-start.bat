@echo off
title SuitableRMS - Gelistirme Sunucusu
color 0A
chcp 65001 >nul

echo.
echo ╔══════════════════════════════════════════╗
echo ║   SuitableRMS v3 - Gelistirme Sunucusu  ║
echo ╚══════════════════════════════════════════╝
echo.

cd /d "C:\RMSggl\Dropbox\RMSv3"

:: ─────────────────────────────────────────
:: 1. TEMIZLIK
:: ─────────────────────────────────────────
echo [1/5] Cache ve gecici dosyalar temizleniyor...

if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo        OK - Vite cache silindi
) else (
    echo        Vite cache zaten temiz
)

if exist "dist" (
    rmdir /s /q "dist"
    echo        OK - dist silindi
) else (
    echo        dist zaten yok
)

:: Outdated Optimize Dep hatasini onlemek icin
:: node_modules/.cache varsa onu da temizle
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache"
    echo        OK - node_modules cache silindi
) else (
    echo        node_modules cache zaten temiz
)

echo.

:: ─────────────────────────────────────────
:: 2. PORT KONTROLU
:: ─────────────────────────────────────────
echo [2/5] Port kontrolu yapiliyor...

:: 5173 portunu kontrol et
netstat -ano | findstr ":5173" >nul 2>&1
if %errorlevel% == 0 (
    echo        UYARI: Port 5173 kullanımda, temizleniyor...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173"') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    echo        OK - Port 5173 serbest bırakıldı
) else (
    echo        OK - Port 5173 musait
)

:: 5174 portunu da kontrol et (vite fallback)
netstat -ano | findstr ":5174" >nul 2>&1
if %errorlevel% == 0 (
    echo        UYARI: Port 5174 kullanımda, temizleniyor...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174"') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    echo        OK - Port 5174 serbest bırakıldı
) else (
    echo        OK - Port 5174 musait
)

echo.

:: ─────────────────────────────────────────
:: 3. ENV KONTROL
:: ─────────────────────────────────────────
echo [3/5] Ortam degiskenleri kontrol ediliyor...

if not exist ".env" (
    echo        HATA: .env dosyasi bulunamadi!
    echo        C:\RMSggl\Dropbox\RMSv3\.env olusturulmali.
    echo.
    pause
    exit /b 1
)

:: VITE_API_URL var mi kontrol et
findstr /i "VITE_API_URL" .env >nul 2>&1
if %errorlevel% == 0 (
    echo        OK - VITE_API_URL mevcut
) else (
    echo        UYARI: VITE_API_URL .env dosyasinda bulunamadi!
)

:: VITE_DISABLE_AUTH=true var mi
findstr /i "VITE_DISABLE_AUTH=true" .env >nul 2>&1
if %errorlevel% == 0 (
    echo        OK - VITE_DISABLE_AUTH=true
) else (
    echo        UYARI: VITE_DISABLE_AUTH=true ayarli degil!
)

:: Supabase kalıntısı var mi
findstr /i "VITE_SUPABASE" .env >nul 2>&1
if %errorlevel% == 0 (
    echo        UYARI: .env icinde SUPABASE degiskeni var - governance ile celisiyor!
) else (
    echo        OK - Supabase kalintisi yok
)

echo.

:: ─────────────────────────────────────────
:: 4. API SAGLIK KONTROLU
:: ─────────────────────────────────────────
echo [4/5] Railway API saglik kontrolu...

curl -s --max-time 5 "https://rms-api-production-219d.up.railway.app/health" >nul 2>&1
if %errorlevel% == 0 (
    echo        OK - Railway API ayakta
) else (
    echo        UYARI: Railway API'ye ulasilamiyor
    echo        Uygulama calisir ama veri gelmeyebilir
)

echo.

:: ─────────────────────────────────────────
:: 5. SUNUCUYU BASLAT
:: ─────────────────────────────────────────
echo [5/5] Gelistirme sunucusu baslatiliyor...
echo.
echo ════════════════════════════════════════════
echo   Hazir! Tarayicida: http://localhost:5173
echo   Durdurmak icin: Ctrl+C
echo ════════════════════════════════════════════
echo.

npm.cmd run dev

:: Sunucu kapaninca buraya gelir
echo.
echo Sunucu durduruldu.
pause

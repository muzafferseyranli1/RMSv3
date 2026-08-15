@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ===================================================
echo     SuitableRMS Otomatik Canliya Alma & Senkronizasyon
echo     (Hosting Dunyam VPS & Coolify Integration)
echo ===================================================
echo.
echo    1) Full Canliya Al (Web & API - Hizli, Kontrollu & Otomatik)
echo    2) Yalnizca Veritabani Sema Kontrolu & Migration
echo    3) Canli Sunucu Durumunu Kontrol Et (Healthcheck)
echo    4) Masaustu Setup (.exe) Derle & GitHub'a Yukle
echo.
set /p modeChoice="[?] Seciminiz nedir? (1/2/3/4) [Varsayilan: 1]: "

if "%modeChoice%"=="" set modeChoice=1

if "%modeChoice%"=="2" (
    echo.
    node scripts/deploy-live.mjs --db-only
    goto bitis
)

if "%modeChoice%"=="3" (
    echo.
    node scripts/deploy-live.mjs --verify-only
    goto bitis
)

if "%modeChoice%"=="4" (
    echo.
    echo ===================================================
    echo Masaustu Program (.exe) Derleniyor ve Yukleniyor...
    echo ===================================================
    call npm run publish:desktop
    goto bitis
)

:: Option 1: Full Deploy
echo.
set /p userCommitMsg="[?] Yaptiginiz degisikliklerin ozeti nedir? (Enter = Otomatik): "

if "!userCommitMsg!"=="" (
    node scripts/deploy-live.mjs
) else (
    node scripts/deploy-live.mjs --commit-msg "!userCommitMsg!"
)

:bitis
echo.
echo ===================================================
echo ISLEM TAMAMLANDI!
echo ===================================================
pause

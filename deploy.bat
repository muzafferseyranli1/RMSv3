@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Proje ana dizinine gecis
cd /d "%~dp0"

echo ===================================================
echo     SuitableRMS Otomatik Canliya Alma ve Senkronizasyon
echo     VPS Hosting Dunyam Entegrasyonu (X:\RMSdrive Yedeği)
echo ===================================================
echo.
echo    1) Full Canliya Al (Web, API ve DB - Hizli ve Otomatik)
echo    2) Yalnizca Veritabani Sema Kontrolu ve Migration
echo    3) Canli Sunucu Durumunu Kontrol Et (Healthcheck)
echo    4) Yalnizca Masaustu Setup (.exe) Derle ve Yukle
echo.

set "modeChoice=1"
set /p modeChoice="[?] Seciminiz nedir? (1/2/3/4) [Varsayilan: 1]: "

if "%modeChoice%"=="2" goto opt_db
if "%modeChoice%"=="3" goto opt_verify
if "%modeChoice%"=="4" goto opt_desktop
goto opt_full

:opt_db
echo.
node scripts/deploy-live.mjs --db-only
goto bitis

:opt_verify
echo.
node scripts/deploy-live.mjs --verify-only
goto bitis

:opt_desktop
echo.
echo ===================================================
echo Masaustu Program (.exe) Derleniyor ve Yukleniyor...
echo ===================================================
call npm run publish:desktop
goto bitis

:opt_full
echo.
set "userCommitMsg="
set /p userCommitMsg="[?] Yaptiginiz degisikliklerin ozeti nedir? (Enter = Otomatik): "

echo.
set "buildDesktopChoice=H"
set /p buildDesktopChoice="[?] Masaustu Electron (.exe) uygulamasi da derlensin mi? (E/H) [Varsayilan: H]: "

set "desktopFlag="
if /i "%buildDesktopChoice%"=="E" set "desktopFlag=--build-desktop"

echo.
if "%userCommitMsg%"=="" (
    node scripts/deploy-live.mjs !desktopFlag!
) else (
    node scripts/deploy-live.mjs --commit-msg "%userCommitMsg%" !desktopFlag!
)

:bitis
echo.
echo ===================================================
echo ISLEM TAMAMLANDI!
echo ===================================================
pause

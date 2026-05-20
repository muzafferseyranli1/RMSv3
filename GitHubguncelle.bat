@echo off
chcp 65001 > nul

:: Proje klasörüne geçiş yapılıyor
cd /d "C:\RMSggl\Dropbox\RMSv3"

echo =======================================
echo      GIT MAKINE SENKRONIZASYON ARACI
echo =======================================

echo [1/4] Diger makineden gelen guncellemeler indiriliyor (Pull)...
git pull
if %errorlevel% neq 0 (
    echo.
    echo [UYARI] Pull islemi sirasinda bir sorun yasandi!
    goto bitis
)
echo ---------------------------------------

echo [2/4] Bu makinedeki degisiklikler sahneye ekleniyor...
git add .
echo ---------------------------------------

set /p commit_mesaji="[3/4] Ne degisiklik yaptin?: "
if "%commit_mesaji%"=="" set commit_mesaji=Makineler arasi guncelleme

git commit -m "%commit_mesaji%"
echo ---------------------------------------

echo [4/4] Kodlar buluta gonderiliyor (Push)...
git push

:bitis
echo =======================================
echo Islem tamamlandi.
echo =======================================
pause
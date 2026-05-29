@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ===================================================
echo SuitableRMS Otomatik Guncelleme ve Yayinlama Araci
echo ===================================================
echo.

:: 1. .env dosyasindan GH_TOKEN okuma (Her makine icin pratiklik)
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="GH_TOKEN" set "GH_TOKEN=%%B"
    )
)

if "!GH_TOKEN!"=="" (
    echo [HATA] GH_TOKEN bulunamadi!
    echo Farkli bir makineye gectiyseniz, klasorde yeni bir ".env" dosyasi olusturun
    echo ve icine sunu yazin:
    echo GH_TOKEN=ghp_sizin_token_kodunuz
    echo.
    echo (Bu .env dosyasi GitHub'a gonderilmez, sadece o bilgisayarda kalir ve isinizi kolaylastirir.)
    pause
    exit /b
)

echo [BILGI] GH_TOKEN dogrulandi.
echo.

:: 2. GitHub kodlarini senkronize etme (git add / commit / push)
echo 1/3: Kodlar GitHub'a (Web) yukleniyor...
set /p commitMsg="[?] Yaptiginiz degisikliklerin ozeti nedir? (ornek: yeni dugme eklendi): "
if "!commitMsg!"=="" set commitMsg="otomatik guncelleme"

git add .
git commit -m "!commitMsg!"
git push
echo [BASARILI] Kodlar GitHub'a gonderildi.
echo.

:: 3. Versiyon numarasi artirma (package.json version bump)
echo 2/3: Masaustu program versiyonu artiriliyor...
echo.
echo    1) Hata Duzeltmesi (Ufak degisiklik) [Orn: 2.0.0 -> 2.0.1]
echo    2) Yeni Ozellik (Orta degisiklik)   [Orn: 2.0.1 -> 2.1.0]
echo    3) Buyuk Degisim (Ana surum)        [Orn: 2.1.0 -> 3.0.0]
echo.
set /p bumpChoice="[?] Hangi tur bir guncelleme yapiyorsunuz? (1/2/3) [Varsayilan: 1]: "

set bumpType=patch
if "!bumpChoice!"=="2" set bumpType=minor
if "!bumpChoice!"=="3" set bumpType=major

:: Bu komut package.json'daki rakami artirir, git tag olusturur.
call npm version !bumpType!
:: Yeni versiyon tag'ini github'a yolla
git push --follow-tags
echo [BASARILI] Yeni versiyon numarasi alindi ve kaydedildi.
echo.

:: 4. Masaustu derleme ve Publish (GH_TOKEN kullanarak)
echo 3/3: Masaustu Setup (.exe) derleniyor ve GitHub Releases'a yukleniyor...
echo Lutfen bekleyin, bu islem yaklasik 1-2 dakika surebilir...
echo.

call npm run publish:desktop

echo.
echo ===================================================
echo ISLEM TAMAMLANDI! 
echo Sahadaki cihazlar yeni surumu fark edip indirecekler.
echo ===================================================
pause

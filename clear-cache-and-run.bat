@echo off
title Su@echo off
title SuitableRMS - Ağ Paylaşımı Aktif ve Başlat
color 0B

echo.
echo ================================================
echo   SuitableRMS - Vite Cache Temizleme ve AG PAYLASIMI
echo ================================================
echo.

cd /d "X:\RMSv3"

echo [1/3] Vite cache siliniyor... [cite: 1, 2]
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo        OK - node_modules\.vite silindi
) else (
    echo        Zaten temiz, cache yok
)

echo.
echo [2/3] dist klasoru siliniyor... [cite: 3]
if exist "dist" (
    rmdir /s /q "dist"
    echo        OK - dist silindi
) else (
    echo        dist zaten yok
)

echo.
echo [3/3] Dev sunucu AG PAYLASIMI ile baslatiliyor... [cite: 4]
echo        Diger cihazlardan IP adresinizle erisebilirsiniz.
echo        Ornegin: http://192.168.1.XX:5173
echo.
echo ================================================
echo.

:: --host parametresi Vite'in tum ag arayuzlerini dinlemesini saglar
npm.cmd run dev -- --host

pauseitableRMS - Cache Temizle ve Baslat
color 0A

echo.
echo ================================================
echo   SuitableRMS - Vite Cache Temizleme
echo ================================================
echo.

cd /d "X:\RMSv3"

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


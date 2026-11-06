@echo off
setlocal
cd /d "%~dp0"
title PARA Trading - Binance TR Ag Testi

echo.
echo ==================================================
echo     PARA Trading - Binance TR Ag Kontrolu
echo ==================================================
echo.
echo Bu test yalnizca iki herkese acik API adresini okur.
echo Binance TR API anahtari, parola veya hesap verisi istemez.
echo Gercek alim/satim emri gondermez.
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo HATA: Node.js bulunamadi.
    echo Node.js 22.13 veya ustunu kurun: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "scripts\check-binance-network.js" (
    echo HATA: Ag testi dosyasi bulunamadi.
    echo PR #32 dalinin guncel proje paketini indirin.
    echo.
    pause
    exit /b 1
)

node "scripts\check-binance-network.js"
set "PARA_TEST_EXIT=%ERRORLEVEL%"

echo.
if "%PARA_TEST_EXIT%"=="0" (
    echo SONUC: Windows agindan Binance TR genel API erisimi basarili.
    echo Bu sonuc hesap API anahtari yetkilerini dogrulamaz.
) else (
    echo SONUC: Windows agindan Binance TR genel API erisimi basarisiz.
    echo Ustteki hata kodunu paylasabilirsiniz. API anahtarinizi paylasmayin.
)
echo.
pause
exit /b %PARA_TEST_EXIT%

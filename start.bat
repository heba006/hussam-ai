@echo off
chcp 65001 >nul
title Hussam-Ai — منصة الاشتراكات
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║          Hussam-Ai  •  منصة الاشتراكات        ║
echo   ╚══════════════════════════════════════════════╝
echo.
echo   جارٍ تشغيل المنصة على: http://localhost:3000
echo   لإيقاف المنصة: أغلق هذه النافذة أو اضغط Ctrl+C
echo.

start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js

echo.
echo   توقفت المنصة. اضغط أي مفتاح للإغلاق...
pause >nul

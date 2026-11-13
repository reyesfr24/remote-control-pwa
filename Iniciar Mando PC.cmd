@echo off
rem Arranca el servidor del mando. Cierra esta ventana para detenerlo.
title Mando PC
cd /d "%~dp0"
if not exist "client\dist\index.html" (
  echo Compilando la app por primera vez...
  call npm run build
)
node server\index.js
echo.
echo El servidor se ha detenido.
pause

@echo off
rem Preview launcher: ensures Node.js is on PATH for spawned environments.
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0\.."
pnpm -C iGaming --filter @landfall/web dev

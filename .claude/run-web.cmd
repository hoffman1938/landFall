@echo off
rem Preview launcher: ensures the portable Node.js toolchain is on PATH.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0..\iGaming"
call pnpm --filter @landfall/web dev

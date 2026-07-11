@echo off
rem Preview launcher: ensures the portable Node.js toolchain is on PATH.
set "PATH=C:\Users\gtsulaia\tools\node-v22.23.1-win-x64;%PATH%"
cd /d "%~dp0..\iGaming"
call pnpm --filter @landfall/web dev

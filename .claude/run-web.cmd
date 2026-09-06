@echo off
rem Preview launcher: put the portable Node toolchain on PATH (falls back to a
rem system install if this machine has one instead).
set "PATH=C:\Users\gtsulaia\tools\node-v22.23.1-win-x64;C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0..\iGaming"
call pnpm --filter @landfall/web dev

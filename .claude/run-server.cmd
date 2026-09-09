@echo off
rem Preview launcher: put the portable Node toolchain on PATH (falls back to a
rem system install if this machine has one instead).
set "PATH=C:\Users\gtsulaia\tools\node-v22.23.1-win-x64;C:\Program Files\nodejs;%PATH%"
rem Local dev is the demo environment: practice bots are allowed (C5 policy —
rem any non-demo env with a bots room refuses to start). scripts/dev.ts sets
rem this too; keeping it here makes the launcher self-explanatory.
set "LANDFALL_ENV=demo"
cd /d "%~dp0..\iGaming"
call pnpm --filter @landfall/server dev

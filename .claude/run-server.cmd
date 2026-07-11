@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
rem Local dev is the demo environment: practice bots are allowed (C5 policy ???
rem any non-demo env with a bots room refuses to start).
set "LANDFALL_ENV=demo"
cd /d "%~dp0..\iGaming"
call pnpm --filter @landfall/server dev

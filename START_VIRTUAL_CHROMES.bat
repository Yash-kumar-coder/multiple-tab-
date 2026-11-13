@echo off
title IRCTC Multi-Virtual Chrome Parallel Runner
cd /d "%~dp0"

echo ==========================================================
echo   LAUNCHING MULTI-VIRTUAL CHROME FOR IRCTC TATKAL HIT
echo ==========================================================
echo.

node scripts/launch-virtual-chromes.js

echo.
echo Press any key to exit this launcher window...
pause >nul

@echo off
title Tatkal Booking - Admin Portal
cd /d "%~dp0admin-portal"
echo Starting Admin Portal at http://localhost:5500 ...
start "" http://localhost:5500
npx --yes serve . -l 5500

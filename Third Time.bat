@echo off
title Third Time
cd /d "%~dp0"
start "" http://localhost:4173
npx vite preview

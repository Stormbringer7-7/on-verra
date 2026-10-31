@echo off
rem Double-cliquer : redige les resumes du lot avec le modele qwen2.5:7b (Ollama doit etre lance).
cd /d "%~dp0"
chcp 65001 >nul
py -3 rediger.py lot-eau-potable.jsonl resultats-qwen.jsonl %*
if errorlevel 9009 python rediger.py lot-eau-potable.jsonl resultats-qwen.jsonl %*
echo.
pause

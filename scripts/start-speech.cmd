@echo off
cd /d "%~dp0"
set "speechModel=speech\vosk-model-small-en-us-0.15"
if exist "speech\vosk-model-en-us-0.22-lgraph\am\final.mdl" set "speechModel=speech\vosk-model-en-us-0.22-lgraph"
"speech\venv\Scripts\python.exe" "speech\speech.py" "%speechModel%"
if errorlevel 1 pause

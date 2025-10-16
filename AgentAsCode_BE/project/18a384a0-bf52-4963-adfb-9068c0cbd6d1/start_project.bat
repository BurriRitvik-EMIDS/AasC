@echo off
echo Starting project with virtual environment...
cd /d "%~dp0"
call venv\Scripts\activate.bat
python main.py
pause

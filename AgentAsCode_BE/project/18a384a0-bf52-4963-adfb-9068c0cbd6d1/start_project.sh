#!/bin/bash
echo "Starting project with virtual environment..."
cd "$(dirname "$0")"
source venv/bin/activate
python main.py

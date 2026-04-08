"""Run database cleanup from project root. Uses backend/scripts/clean_db.py"""
import os
import sys
import subprocess

backend_script = os.path.join(
    os.path.dirname(__file__), "..", "backend", "scripts", "clean_db.py"
)
backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
os.chdir(backend_dir)
cmd = [sys.executable, os.path.abspath(backend_script)] + sys.argv[1:]
sys.exit(subprocess.call(cmd))

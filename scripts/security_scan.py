import os
import re
import sys
from pathlib import Path

# Common patterns for secrets
SECRET_PATTERNS = {
    "SMTP_PASSWORD": re.compile(r"SMTP_PASSWORD\s*=\s*['\"]?(?!YOUR_APP_PASSWORD|REPLACE_)[a-zA-Z0-9]{8,}", re.IGNORECASE),
    "GENERIC_PASSWORD": re.compile(r"password\s*[:=]\s*['\"]?(?!your_password|admin|password|123|YOUR_APP_PASSWORD)[a-zA-Z0-9!@#$%^&*()_+]{8,}", re.IGNORECASE),
    "PRODUCTION_URL": re.compile(r"https://my-web-app-cyyv\.onrender\.com", re.IGNORECASE),
    "EMAIL_EXPOSURE": re.compile(r"gmc0011asdf@gmail\.com", re.IGNORECASE),
    "AWS_KEY": re.compile(r"AKIA[0-9A-Z]{16}", re.IGNORECASE),
}

EXCLUDE_DIRS = {".git", "node_modules", "venv", "__pycache__", "dist", "build"}
EXCLUDE_FILES = {"security_scan.py", "package-lock.json"}

def scan_file(file_path):
    issues = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            for name, pattern in SECRET_PATTERNS.items():
                matches = pattern.findall(content)
                if matches:
                    issues.append(f"Found potential {name}: {len(matches)} matches")
    except Exception as e:
        return [f"Error reading file: {e}"]
    return issues

def main():
    root_dir = Path(__file__).resolve().parents[1]
    print(f"--- 🛡️ Security Scan Started for: {root_dir} ---")
    
    total_issues = 0
    for root, dirs, files in os.walk(root_dir):
        # Filter directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            if file in EXCLUDE_FILES:
                continue
            
            file_path = Path(root) / file
            issues = scan_file(file_path)
            if issues:
                relative_path = file_path.relative_to(root_dir)
                print(f"[!] Issue in {relative_path}:")
                for issue in issues:
                    print(f"    - {issue}")
                total_issues += len(issues)

    print("-" * 40)
    if total_issues == 0:
        print("✅ Scan complete: No obvious secrets found.")
        sys.exit(0)
    else:
        print(f"❌ Scan complete: Found {total_issues} potential security issues.")
        sys.exit(1)

if __name__ == "__main__":
    main()

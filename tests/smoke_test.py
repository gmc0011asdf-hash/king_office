#!/usr/bin/env python3
"""
Smoke test for King Office API.
Verifies: /api/users returns 401 without token, /health returns 200.
"""
import os
import sys
import urllib.request
import urllib.error

BASE = os.environ.get(
    "API_BASE_URL",
    "https://my-web-app-cyyv.onrender.com",
).rstrip("/")


def test_health_ok() -> bool:
    """GET /health should return 200 OK."""
    try:
        req = urllib.request.Request(f"{BASE}/health")
        with urllib.request.urlopen(req, timeout=5) as r:
            if r.status != 200:
                print(f"FAIL: /health returned {r.status}, expected 200")
                return False
            data = r.read().decode()
            if "ok" not in data.lower():
                print(f"FAIL: /health body missing 'ok': {data[:200]}")
                return False
            print("PASS: /health returns 200 OK")
            return True
    except urllib.error.URLError as e:
        print(f"FAIL: /health - {e.reason} (is backend running?)")
        return False


def test_users_401_without_token() -> bool:
    """GET /api/users without token should return 401 Unauthorized."""
    try:
        req = urllib.request.Request(f"{BASE}/api/users")
        try:
            urllib.request.urlopen(req, timeout=5)
            print("FAIL: /api/users returned 200 - API is NOT protected!")
            return False
        except urllib.error.HTTPError as e:
            if e.code == 401:
                print("PASS: /api/users returns 401 without token (API protected)")
                return True
            print(f"FAIL: /api/users returned {e.code}, expected 401")
            return False
    except urllib.error.URLError as e:
        print(f"FAIL: /api/users - {e.reason} (is backend running?)")
        return False


def main() -> int:
    print("King Office Smoke Test")
    print("-" * 40)
    ok1 = test_health_ok()
    ok2 = test_users_401_without_token()
    print("-" * 40)
    if ok1 and ok2:
        print("All checks passed.")
        return 0
    print("Some checks failed.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

"""Build a one-line stdin payload without putting passwords in shell history."""
import getpass
import json
import sys

def ask(prompt):
    print(prompt, end="", file=sys.stderr, flush=True)
    return input().strip()

mode = sys.argv[1] if len(sys.argv) > 1 else "bootstrap"
if mode not in ("bootstrap", "reset"):
    raise SystemExit("Use bootstrap or reset")
value = {"email": ask("Email: ")}
if mode == "bootstrap":
    value["displayName"] = ask("Display name: ")
password = getpass.getpass("Password (12-128 characters): ")
if not 12 <= len(password) <= 128 or getpass.getpass("Confirm password: ") != password:
    raise SystemExit("Passwords must match and contain 12-128 characters")
value["password"] = password
print(json.dumps(value, ensure_ascii=False))

"""Build a one-line stdin payload without putting passwords in shell history."""
import getpass
import json
import re
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
password = getpass.getpass("Password (9-128 characters, including A-Z, a-z and 0-9): ")
if not 9 <= len(password.encode("utf-16-le")) // 2 <= 128 or not all(re.search(pattern, password) for pattern in ("[A-Z]", "[a-z]", "[0-9]")):
    raise SystemExit("Password must contain 9-128 characters, including A-Z, a-z and 0-9")
if getpass.getpass("Confirm password: ") != password:
    raise SystemExit("Passwords must match")
value["password"] = password
print(json.dumps(value, ensure_ascii=False))

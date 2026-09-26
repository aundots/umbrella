#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
project=$(python3 -c 'import json;print(json.load(open(".hybrid/project.json"))["project"])')
state="/workspaces/.project-backup/$project"
"$state/venv/bin/python" .hybrid/hybrid.py register
"$state/venv/bin/python" .hybrid/hybrid.py sync
nohup "$state/venv/bin/python" .hybrid/hybrid.py daemon >> "$state/automatic.log" 2>&1 < /dev/null &
echo 'Automatic encrypted backup starts every 5 minutes while this Codespace is running.'

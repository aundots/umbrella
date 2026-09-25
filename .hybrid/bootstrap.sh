#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
project=$(python3 -c 'import json;print(json.load(open(".hybrid/project.json"))["project"])')
state="/workspaces/.project-backup/$project"
mkdir -p "$state"
python3 -m venv "$state/venv"
"$state/venv/bin/pip" -q install 'cryptography==50.0.1'
"$state/venv/bin/python" .hybrid/install_tools.py --state "$state"
git config core.autocrlf false
git config user.name aundots
git config user.email aundots@users.noreply.github.com
git config commit.gpgsign false
mkdir -p "$HOME/.local/bin"
printf '#!/usr/bin/env bash\nexec "%s/venv/bin/python" "%s/.hybrid/hybrid.py" "$@"\n' "$state" "$PWD" > "$HOME/.local/bin/hybrid"
chmod 700 "$HOME/.local/bin/hybrid"
"$state/venv/bin/python" .hybrid/hybrid.py restore-private
# Install coding clients; their separate account login remains interactive.
npm install -g @openai/codex
curl -fsSL https://claude.ai/install.sh -o "$state/claude-install.sh"
bash "$state/claude-install.sh" stable
echo 'Backup and coding tools installed. Run hybrid sync before work, hybrid handoff before switching.'

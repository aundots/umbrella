#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project=$(python3 -c 'import json;print(json.load(open(".hybrid/project.json"))["project"])')
case "$project" in
  orea) npm install -g pnpm@10.12.1; pnpm install --frozen-lockfile ;;
  umbrella)
    for dir in . server apps/umbrella; do
      if [ -f "$dir/package-lock.json" ]; then npm ci --prefix "$dir"; else npm install --prefix "$dir"; fi
    done ;;
  parking|horserace) npm ci ;;
  platotracker2)
    if ! command -v flutter >/dev/null; then
      git clone --depth 1 --branch stable https://github.com/flutter/flutter.git /workspaces/flutter-sdk
      export PATH="/workspaces/flutter-sdk/bin:$PATH"
      printf '\nexport PATH="/workspaces/flutter-sdk/bin:$PATH"\n' >> "$HOME/.bashrc"
    fi
    flutter pub get ;;
  mute)
    echo 'Android project: use Java 17+ and Android SDK platform 36 / build tools. See .hybrid/README.md.'
    java -version
    if [ -f gradlew ]; then bash gradlew --version; else echo 'Gradle wrapper script missing; use the checked-in wrapper JAR with Java.'; fi ;;
esac

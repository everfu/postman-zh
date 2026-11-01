#!/bin/bash
set -euo pipefail

TASK_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
TASK_APP=""
TASK_ARGS=("$@")
for ((i=0; i<${#TASK_ARGS[@]}; i++)); do
  if [[ "${TASK_ARGS[$i]}" == "--app" ]] && ((i + 1 < ${#TASK_ARGS[@]})); then
    TASK_APP="${TASK_ARGS[$((i+1))]}"
  fi
done
if [[ -z "$TASK_APP" ]]; then
  for candidate in /Applications/Postman.app "$HOME/Applications/Postman.app"; do
    if [[ -d "$candidate" ]]; then TASK_APP="$candidate"; break; fi
  done
fi
TASK_NODE=""
for candidate in "$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [[ -x "$candidate" ]] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
    TASK_NODE="$candidate"; break
  fi
done
if [[ -z "$TASK_NODE" && -x "$TASK_APP/Contents/MacOS/Postman" ]]; then
  # Official Postman includes a Node runtime. No download or npm install required.
  if ELECTRON_RUN_AS_NODE=1 "$TASK_APP/Contents/MacOS/Postman" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
    TASK_NODE="$TASK_APP/Contents/MacOS/Postman"
  fi
fi
if [[ -z "$TASK_NODE" ]]; then
  echo '无法使用 Postman 内置运行环境。请安装 Node.js 22 或更高版本后重试。'
  exit 1
fi
if [[ $# -eq 0 ]]; then set -- --install --quit --open; fi
TASK_RESULT=0
ELECTRON_RUN_AS_NODE=1 "$TASK_NODE" "$TASK_DIR/src/cli.cjs" "$@" || TASK_RESULT=$?
if [[ -t 0 ]]; then
  echo
  read -r -p '按回车关闭窗口…' _
fi
exit "$TASK_RESULT"

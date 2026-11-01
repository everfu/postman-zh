#!/bin/bash
set -euo pipefail
TASK_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "$TASK_DIR/postman-zh.command" --restore --quit --open "$@"

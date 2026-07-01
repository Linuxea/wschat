#!/usr/bin/env bash
# wschat 一键停止：关依赖容器 + 清理占用 3000/3001 的 dev 进程
# 前台起的 dev 用 Ctrl-C 即可，本脚本主要兜底后台/残留进程
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

COMPOSE_CMD="${COMPOSE_CMD:-podman-compose}"

log()  { printf '\033[36m[stop]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*" >&2; }

log "清理占用 3000/3001 的 dev 进程"
if command -v ss >/dev/null 2>&1; then
  pids="$(ss -ltnp 2>/dev/null | grep -oE ':(3000|3001)\b.*pid=[0-9]+' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
  if [ -n "$pids" ]; then
    for p in $pids; do
      cmd="$(ps -p "$p" -o args= 2>/dev/null || echo '?')"
      warn "kill $p  ($cmd)"
      kill "$p" 2>/dev/null || true
    done
    sleep 1
    ok "已发送 SIGTERM"
  else
    ok "无 dev 进程占用"
  fi
fi

if command -v "$COMPOSE_CMD" >/dev/null 2>&1; then
  log "关闭依赖容器：$COMPOSE_CMD down"
  "$COMPOSE_CMD" down
  ok "容器已关闭"
else
  warn "未找到 $COMPOSE_CMD，跳过容器关闭（可用 COMPOSE_CMD=docker-compose 重试）"
fi

log "如需保留/清除数据卷："
echo "  保留：$COMPOSE_CMD down            （默认，数据卷保留）"
echo "  清空：$COMPOSE_CMD down -v         （会删 pg/redis/minio 数据，慎用）"

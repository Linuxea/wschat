#!/usr/bin/env bash
# wschat 一键前置启动：检查端口/配置 → 起依赖容器 → 等就绪 → 迁移数据库
# dev 进程（前后端）请按脚本末尾提示手动前台启动
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

COMPOSE_CMD="${COMPOSE_CMD:-podman-compose}"
HEALTH_TIMEOUT=120

log()  { printf '\033[36m[start]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[32m[ok]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[err]\033[0m %s\n' "$*" >&2; exit 1; }

command -v "$COMPOSE_CMD" >/dev/null 2>&1 || die "未找到 $COMPOSE_CMD（可用 COMPOSE_CMD=docker-compose 重试）"
command -v pnpm >/dev/null 2>&1 || die "未找到 pnpm（需 Node>=20 + pnpm 9）"

log "检查配置文件"
[ -f "$ROOT/.env" ]         || die "缺少 .env（先 cp .env.example .env 并填好密钥）"
[ -f "$ROOT/livekit.yaml" ] || die "缺少 livekit.yaml（先 cp livekit.yaml.example livekit.yaml）"
if grep -q "replace-with-openssl\|^LIVEKIT_API_SECRET=replace" "$ROOT/.env"; then
  die ".env 仍有未填的密钥占位符，请先生成并填入"
fi
ok "配置就绪"

if command -v ss >/dev/null 2>&1; then
  log "检查 3000/3001 端口"
  if ss -ltn 2>/dev/null | grep -qE ':(3000|3001)\b'; then
    warn "3000/3001 已被占用（可能是上次残留的 dev 进程）："
    ss -ltnp 2>/dev/null | grep -E ':(3000|3001)\b' || true
    warn "请先 kill 旧进程再手动 pnpm dev，否则会 EADDRINUSE"
  else
    ok "端口空闲"
  fi
fi

log "启动依赖服务：$COMPOSE_CMD up -d"
"$COMPOSE_CMD" up -d

log "等待容器 healthy（最多 ${HEALTH_TIMEOUT}s）"
wait_health() {
  local name="$1" elapsed=0
  while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    local s
    s="$(podman inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo unknown)"
    [ "$s" = "healthy" ] && return 0
    sleep 3; elapsed=$((elapsed + 3))
  done
  return 1
}
for c in wschat-pg wschat-redis wschat-minio; do
  if wait_health "$c"; then ok "$c healthy"; else warn "$c 未在限时内 healthy（继续尝试，若后续迁移失败再排查）"; fi
done

log "应用数据库迁移（server/）"
( cd "$ROOT/server" && pnpm prisma migrate deploy && pnpm prisma generate ) || die "prisma 迁移失败"
ok "数据库就绪"

cat <<EOF

\033[32m全部前置完成。\033[0m 现在打开两个终端分别启动：

  后端：  cd server && pnpm dev      → http://localhost:3001/api
  前端：  cd web    && pnpm dev      → http://localhost:3000

健康检查： curl http://localhost:3001/api/health
停止容器： $COMPOSE_CMD down
EOF

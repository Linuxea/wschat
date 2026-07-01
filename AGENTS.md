# AGENTS.md

Guidance for OpenCode sessions working in this repo. wschat is a WeChat-style
full-stack chat demo (personal/learning project).

## Repository layout

pnpm monorepo (`pnpm-workspace.yaml`), two packages:

- `server/` — NestJS 10 backend (REST + Socket.io gateway), port **3001**. Postgres 16 + Redis 7 + MinIO + LiveKit.
- `web/` — Next.js 14 App Router (React 18, TS, Tailwind, Zustand, TanStack Query), port **3000**.

Node ≥ 20, pnpm 9 (`packageManager: pnpm@9.15.0`). Run scripts with
`pnpm --filter <server|web> <script>` from root, or `cd` into the package.

## Path aliases — different per package (easy to get wrong)

- `web/`: `@/*` → web project root, e.g. `@/lib/socket`. (tsconfig)
- `server/`: `@/*` → `server/src/*`, `@common/*` → `server/src/common/*`, and `@test/*` → `server/test/*` (jest only). (tsconfig + `jest.config.ts`)

## Verification commands

- **Web typecheck**: `cd web && npx tsc --noEmit` — there is **no `typecheck` script**.
- **Web lint**: `pnpm --filter web lint` (next lint; config in `web/.eslintrc.json`, `next/core-web-vitals`).
- **Server tests**: `pnpm --filter server test` (jest, ts-jest preset). One file: `pnpm --filter server test -- messages.service.spec`. By name: `-- --testPathPattern=messages`.
- **Server has no lint script.**
- Server specs are `*.spec.ts` colocated next to source under `src/`; shared mock at `server/test/helpers/prisma.mock.ts` (import via `@test/...`).

## Dev workflow (full stack needs infra + two dev servers)

1. `./start.sh` — checks `.env`/`livekit.yaml`, starts containers (`podman-compose` by default; `COMPOSE_CMD=docker-compose` to override), waits for healthy, then runs `prisma migrate deploy && prisma generate`.
2. Start **both** dev servers in separate terminals — there is no combined dev command:
   - `pnpm dev:server` → http://localhost:3001/api
   - `pnpm dev:web`    → http://localhost:3000
3. `./stop.sh` — stops containers + kills any leftover processes on 3000/3001.
- Health check: `curl http://localhost:3001/api/health`

## Required setup (hard requirements)

- Copy `.env.example` → `.env` and `livekit.yaml.example` → `livekit.yaml`.
- Generate real secrets (`openssl rand -hex`): `DATA_ENCRYPTION_KEY` (64 hex), `JWT_SECRET` (96 hex), `LIVEKIT_API_KEY/SECRET`. `start.sh` **aborts if `replace-with-openssl` / `replace` placeholders remain**.
- `LIVEKIT_API_KEY`/`SECRET` **must match** between `.env` and `livekit.yaml` `keys:`.

## Prisma (server/)

- From root: `pnpm db:migrate` (= `prisma migrate dev`), `pnpm db:push`, `pnpm db:seed`, `pnpm db:studio`.
- After pulling `prisma/schema.prisma` changes, always run `pnpm --filter server prisma:generate` — the Prisma client is generated, not committed as source.

## Architecture notes that change how you work

- **Realtime**: Socket.io gateway in `server/src/events/`; client wrapper `web/lib/socket.ts`. Events: `message:send` / `message:new` / `message:sync` (catch-up on connect) / `message:ack` / `message:recall`.
- **Message reliability**: per-conversation atomic `seq` via `UPDATE "Conversation" SET "currentSeq" = currentSeq + 1 RETURNING`. `(conversationId, clientMsgId)` is `@@unique` for idempotency. **Unread = `currentSeq - lastReadSeq` (computed — there is no unread-counter column; do not add one).**
- **Encryption is NOT E2EE by design**: message content is AES-256-GCM at rest (key = `DATA_ENCRYPTION_KEY`), server can decrypt. This is a deliberate tradeoff to enable `tsvector` full-text search. CJK search works via `tokenizeForSearch` (spaces inserted between CJK chars under `simple` config). Do not "fix" either as a bug without discussing.
- **Block ≠ mute** (WeChat semantics): `friendship.isBlocked` stops delivery and returns `ack.rejected` to sender; `conversation_member.isMuted` still delivers, only silences notifications.
- **Auth**: JWT access(15m)+refresh(7d) carrying `tokenVersion`. Password change bumps `tokenVersion` → all prior tokens invalidated immediately.

## Frontend conventions

- Client state: Zustand stores persisted to `localStorage` with the **`wschat-` key prefix** (e.g. `wschat-theme`, `wschat-sound`). Follow this for any new user preference.
- Server data: TanStack Query. Socket listeners invalidate query keys (e.g. `['conversations']`, `['messages', conversationId]`) rather than mutating local copies.

## Commit style

Conventional Commits with optional scope, matching existing history:
`feat(web|server):`, `fix:`, `chore:`, `test(server):`.

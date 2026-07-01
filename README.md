# wschat · 微信风格 Web 聊天

一个功能完整的微信风格 Web 聊天演示项目，覆盖单聊/群聊/朋友圈/视频通话等核心场景。

> 定位：**个人学习 / 演示项目**。架构上预留了水平扩展口（Socket.io Redis Adapter、原子 seq），但部署以单机 Docker Compose 为目标。

---

## ✨ 功能清单

| 需求 | 状态 | 实现位置 |
|---|:---:|---|
| 单聊 | ✅ | `messages` + Socket.io |
| 群聊（建群/邀请/踢人/退群/公告） | ✅ | `groups` |
| 加好友（用户名搜索） | ✅ | `friends` + 通讯录 |
| 朋友圈（可见范围/点赞/评论/屏蔽） | ✅ | `moments` |
| 视频通话（1v1 + 群） | ✅ | `call` + LiveKit |
| 发送文字 / emoji / 图片 / 语音 / 视频 / 文件 | ✅ | `messages` + `upload` (MinIO) |
| 拉黑（拦截消息） | ✅ | `friendship.isBlocked` |
| 屏蔽（消息免打扰 + 朋友圈屏蔽） | ✅ | `isMuted` / `momentsBlocked` |
| 密码登录（JWT access + refresh） | ✅ | `auth` |
| 密保问题找回密码（旧 token 即时失效） | ✅ | `tokenVersion` |
| 置顶 / 免打扰 | ✅ | `conversation_member` |
| 好友备注 | ✅ | `friendship.remark` |
| 好友标签 | ✅ | `tags` / `friend_tags` |
| 消息撤回（2 分钟内） | ✅ | `messages.recall` |
| 消息历史分页（游标） | ✅ | `messages.history` |
| 消息全文搜索（中英文） | ✅ | PostgreSQL `tsvector` + GIN |
| 消息可靠投递（seq/ack/幂等） | ✅ | 见下「消息分发」 |

---

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| **前端** | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Zustand · TanStack Query · livekit-client · emoji-mart |
| **后端** | NestJS 10 · Socket.io · Prisma 5 · JWT |
| **数据库** | PostgreSQL 16（主） · Redis 7（在线状态/未读数/Pub-Sub） |
| **媒体存储** | MinIO（S3 兼容） |
| **视频通话** | LiveKit Server（自部署 SFU） |
| **部署** | Docker Compose / podman-compose |

---

## 🚀 快速启动

### 前置要求
- Node.js ≥ 20、pnpm 9
- Docker 或 Podman（含 podman-compose）

### 1. 克隆并安装依赖
```bash
pnpm install
```

### 2. 准备环境变量
```bash
cp .env.example .env
cp livekit.yaml.example livekit.yaml
# 生成密钥并填入 .env：
#   DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)
#   JWT_SECRET=$(openssl rand -hex 48)
#   LIVEKIT_API_KEY=$(openssl rand -hex 4)
#   LIVEKIT_API_SECRET=$(openssl rand -hex 16)
# 然后把 LIVEKIT_API_KEY/SECRET 同步到 livekit.yaml 的 keys 字段（两边必须一致）
```

### 3. 启动依赖服务
```bash
podman-compose up -d   # 或 docker compose up -d
# 起 PostgreSQL / Redis / MinIO / LiveKit
```

### 4. 初始化数据库
```bash
cd server
pnpm prisma migrate deploy   # 应用迁移（含 tsvector 全文索引）
pnpm prisma generate
```

### 5. 启动应用
```bash
# 后端（终端 1）
cd server && pnpm dev          # http://localhost:3001/api

# 前端（终端 2）
cd web && pnpm dev             # http://localhost:3000
```

打开 http://localhost:3000 注册即可体验。

> 健康检查：`curl http://localhost:3001/api/health`

---

## 🏗️ 架构

```
浏览器 (Next.js)
   │  REST (TanStack Query)     Socket.io (WS 长连接)     WebRTC (LiveKit)
   ▼                            ▼                          ▼
┌──────────────────── NestJS API (port 3001) ────────────────────┐
│ auth · users · friends · conversations · messages · groups ·  │
│ moments · call · upload · events(Socket.io gateway)            │
└──────┬──────────────────┬──────────────────┬──────────────────┘
       │ Prisma           │ ioredis          │ livekit-server-sdk
       ▼                  ▼                  ▼
   PostgreSQL          Redis            LiveKit (7880/7881/50000-50050)
                          ▲
                       MinIO (9000) — 媒体
```

### 目录结构
```
wschat/
├── docker-compose.yml          # 依赖服务编排
├── livekit.yaml                # LiveKit 配置
├── server/                     # NestJS 后端
│   ├── prisma/schema.prisma    # 数据模型（覆盖全部功能）
│   └── src/
│       ├── common/             # prisma/redis/crypto/realtime/guards
│       ├── auth/               # 注册/登录/找回密码/JWT
│       ├── users/ friends/ upload/
│       ├── conversations/ messages/   # M3 核心
│       ├── groups/ moments/ call/
│       └── events/             # Socket.io 网关
└── web/                        # Next.js 前端
    ├── app/
    │   ├── (auth)/             # login / register / forgot-password
    │   └── (main)/             # chat / contacts / moments / profile
    ├── components/             # chat / contacts / moments / call / ui
    └── lib/                    # api / socket / auth-store / types
```

---

## 🔑 关键设计决策

### 1. 消息分发：推拉结合 + 读扩散
- **推（Push）**：在线成员经 Socket.io `message:new` 实时推送。
- **拉（Pull）**：客户端连上后发 `message:sync`，按 `seq > lastSeq` 增量补全（覆盖离线堆积 / 丢包 / 换设备）。
- **读扩散**：消息在会话时间线上只存一份，每个成员维护自己的 `lastReadSeq` 过滤。

### 2. 消息可靠投递
- 会话内 `seq` 由 `UPDATE "Conversation" SET "currentSeq" = "currentSeq" + 1 RETURNING` **原子分配**（永不丢/乱序）。
- 客户端带 `clientMsgId`，服务端 `@@unique([conversationId, clientMsgId])` 做**幂等去重**。
- 发送方收 `message:ack { seq, id }` 后才标记「已发送」。
- 未读数 = `currentSeq - lastReadSeq`（**纯计算**，避免增量计数不一致）。

### 3. 加密：服务端静态加密（伪 E2EE）
- WSS/TLS 传输加密 + 消息内容 **AES-256-GCM** 落库（随机 IV + authTag）。
- 主密钥仅存于服务端环境变量，抵御「数据库/备份泄露」。
- ⚠️ 服务端可解密 → **非真正端到端加密**（这是「加密 vs 全文搜索」权衡的结果，见下）。

### 4. 全文搜索 vs 加密的权衡
- 真 E2EE 下服务端只能见密文，无法建索引搜索。
- 本项目选择「服务端静态加密 + `tsvector` 列」：INSERT 时同步写入明文分词向量，搜索用 `content_tsv @@ plainto_tsquery`。
- **中文支持**：应用层在 CJK 字符间插空格（`tokenizeForSearch`），让 `simple` 配置能按字索引。
- 权衡代价：`tsvector` 词元列部分暴露内容（可接受的中间地带）。

### 5. 认证与密保找回
- JWT access(15m) + refresh(7d)，payload 带 `tokenVersion`。
- 密保答案 bcrypt 哈希存储（大小写不敏感）。
- 改密码时 `tokenVersion++` → **所有旧 token 即时失效**。

### 6. 拉黑 vs 屏蔽（复刻微信语义）
| 操作 | 字段 | 行为 |
|---|---|---|
| A 拉黑 B | `friendship[A→B].isBlocked` | B 发给 A **不投递**，且给 B 回 `ack.rejected`（红感叹号） |
| 会话免打扰 | `conversation_member.isMuted` | 照常投递，仅不响铃 |

---

## 🧪 已验证的端到端场景

Playwright 多用户脚本（`/tmp/e2e.py` 思路）已通过：
- ✅ 注册 / 登录 / 密保找回密码 / 旧 token 失效
- ✅ 用户名搜索加好友 / 接受 / 备注 / 标签 / 拉黑 / 屏蔽
- ✅ 单聊实时收发（seq/ack/幂等/中文搜索/撤回/typing）
- ✅ 群聊（创建 / 成员 / 消息）
- ✅ 朋友圈（发布加密 / 可见性过滤 / 点赞 / 评论）
- ✅ 视频通话信令（LiveKit token 下发 / 来电浮窗）
- ✅ 多端实时推送（alice 发 → bob 在线即时收到）

---

## ⚠️ 已知限制（演示项目简化项）

1. **LiveKit UDP 端口**：rootless Podman 下 WebRTC 媒体端口可能受限；同机两浏览器可经 host/loopback 候选连通，跨机需正确的外部 IP / TURN。
2. **限流**：`@Throttle` 当前为占位，生产前应接 `@nestjs/throttler` + Redis。
3. **消息批量推送优化**未做（大群 fan-out 性能未优化）。
4. **中文搜索**为按字匹配（允许分散命中），非语义/分词级精确。
5. 未做端到端加密的前向保密（Double Ratchet）。

---

## 📜 脚本速查

```bash
# 根目录
pnpm dev:server        # 后端开发
pnpm dev:web           # 前端开发
pnpm up                # podman-compose up -d
pnpm down              # podman-compose down
pnpm db:migrate        # prisma migrate dev
pnpm db:studio         # prisma studio

# 测试 API
curl http://localhost:3001/api/health
```

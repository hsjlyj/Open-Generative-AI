# Open Generative AI · Seedance Studio

一个部署在 Vercel 的私有视频生成工作台，集成银河 AIGC / Seedance 视频接口，并提供：

- 邮箱密码注册与登录
- 每个账户独立的积分余额与任务历史
- 提交任务前按模型和时长扣除积分
- Provider 拒绝或请求失败时自动退还本次积分
- 生成完成后将视频归档到 Cloudflare R2
- Cloudflare D1 持久化账户、价格、任务和积分账本
- 管理后台：用户列表、积分调整、模型定价
- 签名图片上传：参考图、首帧和尾帧

生产站点：<https://video.zdc.mom>

备用 Vercel 地址：<https://open-generative-ai-beige.vercel.app>

---

## 功能概览

### 用户工作台

用户注册并登录后可以：

1. 查看当前积分余额；
2. 选择 Seedance 模型、画幅、分辨率、时长和音频；
3. 上传参考图或成对的首帧/尾帧；
4. 提交生成任务；
5. 在“生成历史”中查看任务状态、积分消耗、错误原因和 R2 视频链接。

新注册用户默认获得 **0 积分**。管理员需要在后台手动分配可用积分。

### 积分规则

积分成本 = `模型每秒积分价格 × 视频时长（秒）`。

系统在提交给 Provider 前预留并扣除积分：

- Provider 成功接收任务：预留保持有效；
- Provider 连接失败或拒绝创建任务：自动退款；
- 任务最终失败或取消：自动退款；
- 任务成功：积分保持扣除状态。

### 管理后台

管理员登录后，在“账户控制台”中可看到“管理后台”标签页：

- 设置每个模型的积分/秒价格；
- 查看用户、角色和当前余额；
- 输入正整数增加积分，输入负整数扣减积分；
- 价格和余额保存后立即生效。

管理员由 Cloudflare Data Worker 中的 `ADMIN_EMAILS` 环境变量指定。

---

## 架构

```text
Browser
  │
  ├── Vercel / Next.js
  │     ├── 身份会话、密码哈希、Provider 请求
  │     ├── /api/yinhe/session
  │     ├── /api/yinhe/videos
  │     ├── /api/yinhe/history
  │     └── /api/yinhe/admin
  │
  ├── 银河 AIGC / Seedance Provider
  │
  ├── Cloudflare Media Worker
  │     └── KV：短期签名图片上传与读取
  │
  └── Cloudflare Data Worker
        ├── D1：用户、价格、任务、积分账本
        └── R2：完成视频归档
```

Provider API Key、会话密钥和 Data Worker 密钥始终只保存在服务端；浏览器不会收到这些密钥。

---

## 自定义域名与 CDN

生产域名 `video.zdc.mom` 使用 Cloudflare DNS 和 Edge Worker 反向代理到 Vercel：

```text
video.zdc.mom
  └── Cloudflare DNS CNAME（橙云代理）
        └── open-generative-ai-edge Worker
              └── open-generative-ai-beige.vercel.app
```

配置文件位于：

```text
cloudflare/vercel-edge-proxy/
```

策略：

- HTML、登录页、API、任务状态和用户数据保持动态，不缓存；
- `/_next/static/` 资源在 Cloudflare Edge 缓存 24 小时；
- Cookie 和认证请求不会被静态资源缓存规则污染；
- Worker 添加 `X-Edge-Proxy: Cloudflare Worker` 方便验证边缘路径。

部署或更新 Edge Worker：

```bash
wrangler deploy --config cloudflare/vercel-edge-proxy/wrangler.toml
```

验证 CDN：

```bash
curl -I https://video.zdc.mom/studio
curl -I https://video.zdc.mom/_next/static/chunks/<asset>.js
```

动态 HTML 应看到 `cf-cache-status: DYNAMIC`，静态 Next.js 资源应看到 `cf-cache-status: HIT`。

---

## 目录说明

```text
app/api/yinhe/
  session/               注册、登录、登出与账户会话
  videos/                提交视频任务与轮询状态
  history/               当前用户任务历史
  admin/                 管理员价格与用户额度操作
  media/uploads/         签名图片上传能力

components/
  YinheVideoStudio.js        视频生成工作台
  YinheAccountDashboard.js   账户控制台、历史和管理后台

lib/
  yinhe-auth.js          HMAC 会话签名与验证
  yinhe-password.js      scrypt 密码哈希与校验
  yinhe-data.js          Vercel 到 Data Worker 的服务端请求
  yinhe-account.js       当前账户会话解析
  yinhe-media.js         签名图片上传/读取 URL
  yinhe-task.js          Provider 状态字段归一化
  yinhe-video.js         Provider 视频参数校验与构造

cloudflare/
  yinhe-media-worker/    KV 图片上传 Worker
  yinhe-data-worker/     D1/R2 用户与任务数据 Worker
```

---

## 本地开发

### 前置条件

- Node.js 22+
- npm
- Vercel CLI（部署时）
- Wrangler CLI（Cloudflare Worker、D1、R2 操作时）

```bash
npm install
npm run build:packages
npm run build
```

运行测试：

```bash
node --test tests/*.test.mjs
```

运行 ESLint：

```bash
npm run lint
```

本地开发服务器：

```bash
npm run dev
```

> 说明：完整 Studio 首次开发编译的内存需求较高。低内存机器可优先用 `npm run build` 验证生产构建，或在更高内存环境运行开发服务器。

---

## Vercel 环境变量

在 Vercel 的 **Production** 环境配置下列变量。不要将真实值提交到 Git。

| 变量 | 用途 |
| --- | --- |
| `AIGC_API_BASE_URL` | 银河 AIGC Provider API 基地址，必须是 HTTPS |
| `AIGC_API_KEY` | 银河 AIGC Provider 服务端 API Key |
| `AIGC_STUDIO_SESSION_SECRET` | 账户 Cookie/HMAC 会话签名密钥 |
| `AIGC_STUDIO_ACCESS_TOKEN` | 旧版单一访问口令兼容变量；新账户流不依赖它 |
| `AIGC_MEDIA_WORKER_URL` | Cloudflare Media Worker 公网地址 |
| `AIGC_MEDIA_SIGNING_SECRET` | 图片上传与读取 URL 的 HMAC 密钥 |
| `AIGC_DATA_WORKER_URL` | Cloudflare Data Worker 公网地址 |
| `AIGC_DATA_API_SECRET` | Vercel 调用 Data Worker 的 Bearer 密钥 |

示例命令（只展示变量名，不要把密钥写进 shell 历史）：

```bash
vercel env add AIGC_API_BASE_URL production
vercel env add AIGC_API_KEY production
vercel env add AIGC_STUDIO_SESSION_SECRET production
vercel env add AIGC_MEDIA_WORKER_URL production
vercel env add AIGC_MEDIA_SIGNING_SECRET production
vercel env add AIGC_DATA_WORKER_URL production
vercel env add AIGC_DATA_API_SECRET production
```

部署：

```bash
vercel --prod --yes
```

---

## Cloudflare 配置

### 1. 创建 D1 数据库

```bash
wrangler d1 create open-generative-ai-db
```

将返回的 `database_id` 写入：

```text
cloudflare/yinhe-data-worker/wrangler.toml
```

应用数据库结构：

```bash
wrangler d1 execute open-generative-ai-db \
  --remote \
  --file=cloudflare/yinhe-data-worker/schema.sql
```

D1 会建立：

- `users`：邮箱、密码哈希、角色、积分；
- `model_prices`：每个模型的积分/秒价格；
- `tasks`：账户归属、Provider 任务号、状态、结果和 R2 存储键；
- `credit_ledger`：积分预留、退款和管理员调整记录。

### 2. 创建 R2 Bucket

```bash
wrangler r2 bucket create open-generative-ai-videos
```

R2 用于归档完成视频，避免上游 Provider 的临时结果 URL 过期后无法播放。

### 3. 部署 Data Worker

在 `cloudflare/yinhe-data-worker/wrangler.toml` 中确认 D1 与 R2 bindings，然后设置服务端密钥：

```bash
wrangler secret put DATA_API_SECRET --name open-generative-ai-data
wrangler deploy --config cloudflare/yinhe-data-worker/wrangler.toml
```

在 `[vars]` 中设置：

```toml
DEFAULT_CREDITS = "0"
ADMIN_EMAILS = "admin@example.com"
```

`ADMIN_EMAILS` 支持逗号分隔的多个邮箱。邮箱必须先注册，登录后才会显示管理后台。

### 4. 图片 Media Worker

图片上传使用独立 Worker 与 KV，默认策略：

- 仅接受 JPG、PNG、WebP；
- 单文件最大 10 MiB；
- 上传 URL 有短期签名；
- 图片保存 7 天；
- Provider 只接收服务端生成的签名读取地址；
- 不接受用户直接提供的任意远程媒体 URL。

配置与部署：

```bash
cd cloudflare/yinhe-media-worker
wrangler secret put AIGC_MEDIA_SIGNING_SECRET
wrangler deploy
```

并在 `wrangler.toml` 中把 `ALLOWED_ORIGIN` 配置为你的 Vercel 域名。

---

## 安全说明

- 密码使用 Node.js `scrypt` 加盐哈希，不保存明文。
- 登录 Cookie 为 `HttpOnly`、`SameSite=Lax`，生产环境启用 `Secure`。
- 用户只能读取自己的任务历史。
- 管理动作在 Vercel 和 Data Worker 两层都检查管理员角色。
- Data Worker 仅接收持有 `DATA_API_SECRET` 的服务端请求。
- 图片上传 URL 与读取 URL 均为 HMAC 签名、限时且绑定媒体归属。
- `.env`、`.vercel`、Node 构建目录和密钥文件被 `.gitignore` 排除。

建议：

1. 定期轮换 `AIGC_DATA_API_SECRET`、Provider Key 和签名密钥；
2. 为 R2 设置生命周期策略，控制长期视频存储成本；
3. 生产环境为管理员账户使用强密码；
4. 接入公开注册前配置业务侧的滥用控制和额度审批流程。

---

## 验证清单

提交或部署前执行：

```bash
npm run lint
npm run build
node --test tests/*.test.mjs
node --check cloudflare/yinhe-data-worker/src/index.js
```

生产部署后建议检查：

```bash
vercel inspect https://YOUR_PROJECT.vercel.app
curl -fsS https://YOUR_PROJECT.vercel.app/api/yinhe/session
```

预期会话接口在未登录时返回：

```json
{
  "configured": true,
  "mediaConfigured": true,
  "authenticated": false
}
```

---

## 已知限制

- 账户系统接入前创建的 Provider 历史任务没有用户归属，不能自动迁移到新历史列表；
- 当前版本不包含支付网关、订阅、邮箱验证或密码找回；
- R2 归档在 Provider 返回可下载结果 URL 后执行，受上游 URL 可用性和 Worker 请求限制影响；
- 本项目展示的模型和 Provider 接口取决于账户实际开通权限。

---

## License

本仓库基于上游 Open Generative AI 项目扩展。请在发布、再分发或商用前核对上游仓库许可证及第三方依赖的许可证要求。

# ishare 配置

本站 Worker 从私有的 `jsw-teams/web` 仓库部署，项目根目录是 `/ishare.js.gripe`。公开的 [jsw-teams/ishare](https://github.com/jsw-teams/ishare) 分发完整项目源码，不作为本站 Worker 的部署来源。

## Cloudflare 构建

在现有 **ishare Worker → Settings → Build** 连接 GitHub，并授权 Cloudflare 读取 `jsw-teams/web`。使用以下设置：

| 设置 | 值 |
| --- | --- |
| Git repository | `jsw-teams/web` |
| Production branch | `main` |
| Root directory | `/ishare.js.gripe` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | `24`，可在构建环境设置 `NODE_VERSION` |

依赖使用项目中的 `package-lock.json` 安装；页面构建使用 EdgePress，生成结果写入 `dist/`。部署入口是 `/backend/cloudflare/worker.js`。不需要新建另一个 Worker；SQLite Durable Object 的绑定和迁移已经在 Wrangler 配置中。

域名路由由你配置为 `ishare.js.gripe`，指向现有 ishare Worker。`workers.dev` 和预览域名保持关闭。构建变量与运行时 Secret 是不同配置位置，见 [Cloudflare 构建设置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。

## 运行时 Secret

在 **ishare Worker → Settings → Variables and Secrets** 中添加下列值，类型均选 **Secret**。已有同名条目请直接编辑。

| 名称 | 填写内容 |
| --- | --- |
| `STREAM_ACCOUNT_ID` | Images 与 Stream 共用的资源 Cloudflare 账户 ID |
| `MEDIA_API_TOKEN` | 同时授权 Images 和 Stream 资源账户的 API Token（Images Edit、Stream Edit） |
| `GITHUB_CLIENT_ID` | ishare 登录应用的 GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | 同一登录应用的 Client Secret |

Images 与 Stream 使用同一个资源账户，此账户可以与 Worker 所在账户不同。只需一份账户 ID 和一个 `MEDIA_API_TOKEN`：在个人 API Tokens 中选择 Account → Cloudflare Images → Edit、Account → Stream → Edit，并将 Account Resources 限定到该资源账户。通过 API Token 接入，不添加 Images/Stream Worker binding。Secret 不放入源码、`config.yml`、构建变量或聊天中，见 [Cloudflare Token 配置](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)。

已有 Secret 无需重复填写：读取顺序为 `STREAM_ACCOUNT_ID` → `IMAGES_ACCOUNT_ID` → 旧名 `STREAM_CUSTOMER_CODE`。旧名兼容的是你此前存入的 **账户 ID**，不是播放器 customer code。后端通过 Stream API 获取播放域名，缓存签名播放地址；无需手填 customer code。以后整理 Secret 时可保留 `STREAM_ACCOUNT_ID` 一个账户条目，但加密值不能由部署工具读取并自动改名。

当前 ishare 的登录回调为 `https://ishare.js.gripe/auth/callback`。现有 iask App 的回调保持原配置；使用独立 OAuth App 时，Homepage 填 `https://ishare.js.gripe`，Authorization callback URL 填上述 ishare 回调。现有实现不会自动把 ishare 登录转发到 iask。

业务域名由 Worker 当前请求自动取得，不依赖 `SITE_ORIGIN` 或 `WEBSITE_ORIGINS`，旧条目可以删除。公开元数据允许任意网站读取；登录、账户管理及写入仍限同源并校验 CSRF。只需在 `config.yml` 的 `site.url` 填写静态页面的正式网址。运营者数字 ID `228026986` 保留在 `wrangler.jsonc`。运营者使用该 GitHub 账户登录，进入“我的分享 → 平台配额”，在线调整新用户默认额度与共享容量；在“用户管理”调整个人配额、权限及处理隐私请求。配额存于 SQLite，不再读取 `MAX_*` 或 `QUOTA_*` 系统变量。普通共享容量降低提前七天通知；新用户默认额度变化保留已有用户当前及已排定额度。

初次接入可以不配置 Stream 本地签名密钥。后续如使用它，`STREAM_SIGNING_KEY_ID` 与 `STREAM_SIGNING_KEY` 必须成对填写；否则默认使用缓存的服务端播放令牌。

## 平台嵌入与页面元素

本站 `plugins.consent.services: []`，不放行任何通用媒体平台。其他 EdgePress/web 站点的通用媒体预设仅保留 X 与 YouTube，访客授权且点击加载后可用。以下是框架的配置方式；本站没有启用下方示例服务。

设为 `enabled: false` 会移除授权条目和该服务的网络权限，对应元素保留本地未加载说明及原始链接，不在构建时请求其 oEmbed。新增自己的服务时，填写 `provider: oembed`、服务名和授权说明、`backendUrl`、`oembedEndpoint`、`sourceOrigins`、`embedOrigins`；需要外部组件脚本时填写 `embedScripts` 的完整 HTTPS 地址。需认证的第三方接口应由自己的 `/backend/[平台名]` 服务负责，凭据不能出现在公开配置中。

```yaml
blocks:
  - columns: 2
    cells:
      - - type: text
          heading: 视频说明
          text: 文字与播放器可排列在同一行。
      - - type: oembed
          integration: youtube
          url: https://www.youtube.com/watch?v=jNQXAC9IVRw
          title: 分享视频
          caption: 保留原链接，支持直接查看。
          width: 640
          height: 360
```

导航与页脚配置支持 `url` 指向站内路径或完整外部 URL，可选 `target: _self` 或 `target: _blank`。外部链接不会被加上站内语言路径，下拉导航也遵循目标设置。


## 按配置生成 CSP

EdgePress 自动生成 CSP 响应头与 HTML 策略，适配静态托管。启用的可选服务按自身配置加入网络权限，关闭后移除其权限；未获访客同意或尚未点击的嵌入只显示本地提示与原始链接。自定义服务可用 `csp` 映射增加 HTTPS 来源，例如 `connect-src: [https://api.example.com]`。CSP 许可不等于访客授权；后端凭据不应写入配置文件。

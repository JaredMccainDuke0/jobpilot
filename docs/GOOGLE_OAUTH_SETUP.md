# Gmail 一键连接（OAuth）配置指南

代码已经写好。要让「用 Google 连接」真正跳转到 Google，需要你在 **Google Cloud Console** 注册一个 OAuth 客户端（一次性），然后把 client id / secret 填进 `.env`。只有你的 Google 账号能做这一步。

## 一、创建项目与 OAuth 客户端

1. 打开 https://console.cloud.google.com/ ，右上角选/建一个项目（名字随意，如 `JobPilot`）。
2. 左侧「APIs & Services → Enabled APIs & services → + ENABLE APIS AND SERVICES」，搜索 **Gmail API** 并启用。
3. 左侧「APIs & Services → OAuth consent screen」：
   - User type 选 **External** → Create。
   - App name 填 `JobPilot`，User support email 选你的邮箱，Developer contact 填你的邮箱 → Save。
   - **Scopes**：Add or remove scopes，手动加入 `https://www.googleapis.com/auth/gmail.send`（以及默认的 `openid`、`.../auth/userinfo.email`）→ Update → Save。
   - **Test users**：Add users，把**所有要用这个功能的邮箱**都加进去（包括你自己 `jinanliu49@gmail.com`，以及你要发给的新用户的 Gmail）。测试模式最多 100 个。
4. 左侧「APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID」：
   - Application type 选 **Web application**。
   - **Authorized redirect URIs** 添加（必须一字不差）：
     - `https://cartwheel-synopsis-handyman.ngrok-free.dev/api/oauth/google/callback`
     - （可选，本地调试再加）`http://localhost:3000/api/oauth/google/callback`
   - Create → 弹窗给你 **Client ID** 和 **Client secret**，复制下来。

## 二、把 client id / secret 交给我（或自己填）

填进项目根目录的 `.env`：

```
JOBPILOT_PUBLIC_URL="https://cartwheel-synopsis-handyman.ngrok-free.dev"
GOOGLE_OAUTH_CLIENT_ID="粘贴 Client ID"
GOOGLE_OAUTH_CLIENT_SECRET="粘贴 Client secret"
```

secret 会留在服务器 `.env`、不发送到浏览器、不回显。改完 `.env` 需要**重启服务**才生效。

## 三、使用与验证

1. 打开网站 → 先输**访问密码 `jobpilot2026`** 进站 → 到达登录页。
2. 点**「用 Google 登录（Gmail）」**→ 跳转 Google：**密码输给 Google,不是我们**。测试模式会出现「未验证应用」警告页 → Advanced → 继续。
3. 勾选「代表你发送邮件」权限 → 自动回到本站并**已登录**(账号就是你的 Gmail),同时已获得发信授权。
4. 之后「匹配 → 勾选 → 确认投递」就会用你的 Gmail 自动发信;SMTP/端口/密码都不用填。

> 说明:Google 登录**同时完成"登录"和"发信授权"**两件事,不需要在本站另设密码。

## 已知限制（测试模式）

- **刷新令牌 7 天过期**：Google 对「Testing」状态的应用，refresh token 约 7 天失效，届时用户需再点一次「用 Google 连接」。要长期有效需把应用 Publish 并通过 Google 验证（更大的工程）。
- **未验证警告**：测试用户会看到一次「未验证应用」提示，点继续即可；正式去掉需要通过 Google 验证（gmail.send 属敏感/受限范围，服务器持有令牌通常还需 CASA 年度安全评估）。
- **仅 Gmail / Outlook 能走 OAuth**：163 / QQ 不对第三方开放发信 OAuth，仍用「邮箱授权」里的手动 SMTP + 授权码。

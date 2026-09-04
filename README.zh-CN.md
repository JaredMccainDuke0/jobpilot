# JobPilot

[![CI](https://github.com/VELIR5/jobpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/VELIR5/jobpilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![版本](https://img.shields.io/github/package-json/v/VELIR5/jobpilot)](https://github.com/VELIR5/jobpilot)

[English](README.md) · [在线演示](https://job.vcrelay.com:8443) · [Issues](https://github.com/VELIR5/jobpilot/issues)

JobPilot 是一个结合简历信息的岗位匹配与投递辅助工具，帮助求职者完成
简历解析、求职偏好设置、真实岗位搜索、匹配证据查看，以及在用户明确
确认后准备或提交投递。

仓库包含 Next.js 网页端和原生微信小程序端。两个客户端共用服务端领域
逻辑和 API 契约。

> 在线演示地址只是一个部署端点，不代表可用性或邮件送达保证。岗位数据、
> 模型返回内容和邮件送达状态都必须由用户独立复核。

## 功能范围

- 邮箱访问和签名 HttpOnly 浏览器会话。
- 简历上传，以及 PDF/DOCX 文本提取和用户确认。
- 目标城市、岗位方向、行业和工作方式设置。
- 模型联网搜索、结构校验、城市匹配、来源证据、去重、分页和本地筛选。
- 明确区分“可邮件投递岗位”和“官方入口手动投递岗位”。
- 投递任务、幂等控制、状态历史和按用户隔离的数据记录。
- 可选 Google OAuth，以及通过 Resend 的平台统一邮件代发。
- 微信小程序登录、简历、偏好、岗位匹配和投递记录页面。

## 安全边界

JobPilot 选择如实返回较少结果，而不是用虚构结果补足数量。

- 外部招聘页面和模型输出都被视为不可信输入。
- 岗位必须通过配置的来源、URL、城市和结构校验，才能成为正式结果。
- 系统不会猜测招聘邮箱、公司、岗位、URL、任职条件或送达结果。
- 没有直接核验招聘邮箱的岗位只能作为手动或官方入口操作，不能自动发邮件。
- 真实邮件投递必须经过用户选择、最终确认、有效发信配置和幂等任务控制。
- 测试和 CI 使用模拟适配器，不发送真实邮件，也不读取用户简历进行搜索。
- 不绕过登录、验证码、访问频率限制、访问控制或招聘网站规则。

完整边界见 [`docs/SECURITY_PRIVACY.md`](docs/SECURITY_PRIVACY.md) 和
[`SECURITY.md`](SECURITY.md)。

## 环境要求

- Node.js 22.5 或更高版本。内置 SQLite 运行时要求 Node 22。
- npm，以及安装锁定依赖所需的网络连接。
- 一个兼容 OpenAI Responses 接口的模型服务，用于实时搜索。
- 启用 Google 登录时需要 Google Cloud OAuth 凭据。
- 启用微信登录交换时需要微信小程序凭据。
- 启用平台统一代发时需要 Resend 发信凭据。

## 本地开发

```powershell
npm ci
Copy-Item .env.example .env
# 使用你自己的本地密钥填写 .env
npm run db:push
npm run dev
```

打开 `http://localhost:3000`。`.env`、数据库、上传文件和日志都被 Git
忽略，不得提交。

最小可用服务配置包括：

| 变量 | 用途 |
| --- | --- |
| `JOBPILOT_SESSION_SECRET` | 签名浏览器和 Bearer 会话，应使用长随机值。 |
| `JOBPILOT_ACCESS_PASSWORD_HASH` | 进入登录页的共享访问密码哈希。 |
| `JOBPILOT_INVITE_PASSWORD_HASH` | 注册用户时使用的邀请码哈希。 |
| `JOBPILOT_MODEL_BASE_URL` | 兼容 OpenAI 的模型服务地址。 |
| `JOBPILOT_MODEL_API_KEY` | 仅服务端使用的模型密钥。 |
| `JOBPILOT_MODEL_NAME` | 模型服务中的模型标识。 |
| `JOBPILOT_MODEL_REASONING` | 模型服务接受的可选推理强度。 |

全部变量和安全说明见 [`.env.example`](.env.example)。当前运行时不会读取
`DATABASE_URL`；SQLite 位置由 Node 运行时和 `LOCALAPPDATA` 决定。

## 生产启动

```powershell
npm ci
npm run db:push
npm run build
npm run start
```

`next start` 启动时只加载一次生产构建。修改服务端代码或环境配置后，必须
重新构建并重启进程。部署时应使用 HTTPS 和独立的访问控制；隧道只提供传输，
不能替代身份认证和租户隔离。

## 微信小程序

1. 将 [`miniapp/`](miniapp/) 导入微信开发者工具。
2. 将 `project.config.json` 中的占位 AppID 换成自己的 AppID。
3. 在 [`miniapp/config.js`](miniapp/config.js) 中设置生产 HTTPS API 地址。
4. 在微信平台配置合法 request/upload 域名。
5. 真机测试前运行 `npm run check:miniapp`。

小程序包不包含模型密钥、邮件密钥、数据库、简历或服务端会话密钥。微信
真实登录、上传、页面跳转和设备验收仍必须在微信开发者工具和真机中完成。

## 许可证和安全

JobPilot 使用 [MIT License](LICENSE) 发布。安全问题请按照 [`SECURITY.md`](SECURITY.md)
私下报告。

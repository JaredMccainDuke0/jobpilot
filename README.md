# JobPilot

JobPilot 是手机网页优先的多用户简历匹配与安全投递应用。模型服务由站点管理员统一配置，每位用户的数据和邮箱授权相互隔离。

## Windows 启动

```powershell
.\scripts\install.ps1
.\scripts\start.ps1
```

浏览器访问 `http://localhost:3000`。首次进入直接开始上传简历、确认信息和描述需求。

## 演示与测试

演示职位由 `data/seed/jobs.json` 导入，均带来源和核验状态。运行：

```powershell
.\scripts\test.ps1
```

本地数据库位于 `%LOCALAPPDATA%\JobPilot\jobpilot.db`，上传文件位于 `data/uploads/`，两者均不提交。数据层使用 Node.js 22 内置 SQLite；数据库放在 LocalAppData 可避免 OneDrive 和非 ASCII 工程路径的同步锁问题。删除本地数据库后重新执行安装脚本可重置演示数据。

## 模型配置

公开配置只允许占位符。支持 `JOBPILOT_MODEL_BASE_URL`、`JOBPILOT_MODEL_API_KEY`、`JOBPILOT_MODEL_NAME`、`JOBPILOT_MODEL_REASONING`。访问密钥只能通过环境变量、当前进程内存或操作系统安全存储提供，不能写入项目文件、数据库或日志。当前首版设置页保存非敏感连接参数；未配置密钥时始终使用模拟模型。

真实邮件适配器可在明确配置和最终确认后启用。所有自动化测试和默认演示只使用无外部副作用的模拟适配器。

## 邀请访问与 ngrok

应用通过 `JOBPILOT_INVITE_PASSWORD_HASH` 控制注册资格，并用 `JOBPILOT_SESSION_SECRET` 签发用户会话。新用户使用自己的邮箱和密码注册，注册时额外填写邀请密码；登录后只能访问自己的简历、需求、匹配、投递和 SMTP 设置。修改邀请密码时运行 `scripts/set-invite-password.ps1`。

ngrok 地址通常会在免费隧道重启后变化。不要把 ngrok 管理令牌、模型密钥或邮箱授权码写入仓库。

## 真实邮件投递

真实邮件只用于来源已核验且类型为 `verified_email` 的结构化职位。每位用户在“我的”中填写自己的 SMTP 主机、端口、账号、发件地址和应用专用密码；密码用服务器密钥进行 AES-GCM 加密后按用户保存且不回显。最终确认、用户级唯一幂等键和状态历史仍然生效。示例职位、自动化测试和模拟渠道不会发送真实邮件。

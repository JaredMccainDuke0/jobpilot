# JobPilot 微信小程序前端

[English](#jobpilot-wechat-mini-program-client)

## JobPilot WeChat mini-program client

This is the native mini-program client kept separate from the existing Next.js
H5 application. It contains page code and an API client only; it does not
contain mail keys, databases, or resume files. Import this directory
into WeChat Developer Tools.

## Configuration

`config.js` points to the current public HTTPS API. When the deployment domain
changes, update only `apiBaseUrl`; never put a server secret in this directory.
Add the domain to the mini-program legal request/upload domain list before
testing.

Select your own AppID in WeChat Developer Tools. The repository's
`touristappid` is only for inspecting the page structure and cannot be used for
production release.

Real login, upload, navigation, and application-flow acceptance require WeChat
Developer Tools and a real device. Run `npm run check:miniapp` before importing.

---

## 中文说明

这是与现有 Next.js H5 隔离的原生小程序前端目录。它只保存页面代码和 API 客户端，不保存邮件密钥、数据库或简历文件。可直接将此目录导入微信开发者工具。

## 配置

`config.js` 已指向当前公网 HTTPS 地址。更换部署域名时，只修改 `apiBaseUrl`；不要把任何服务端密钥写入此目录。导入微信开发者工具前，应将该域名加入小程序的合法 request/upload 域名。

正式开发时，请在微信开发者工具中选择你自己的 AppID；仓库中的 `touristappid` 仅用于无 AppID 时查看页面结构，不能用于正式发布。

## 当前阶段

已提供微信 `wx.login()` 会话交换和邮箱绑定起始页；业务资源继续调用统一服务器 API。现有网页仍使用原有邮箱登录和 Cookie 会话，不会被小程序代码影响。

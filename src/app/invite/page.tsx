"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";

const AUTH_ERRORS: Record<string, string> = {
  google_unconfigured: "管理员尚未配置 Gmail 登录，请联系管理员后重试。",
  google_denied: "你取消了 Gmail 授权。",
  google_state: "登录校验失败，请重新点击「使用 Gmail 登录」。",
  google_token: "Gmail 登录失败，请重试。",
  google_norefresh: "登录失败：未取得发信授权，请重试并同意「代表你发送邮件」。",
};

export default function InvitePage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const authError =
    typeof location !== "undefined" ? new URLSearchParams(location.search).get("authError") : null;
  return (
    <main className="invite-page">
      <div className="invite-panel">
        <LockKeyhole />
        <div className="eyebrow">JobPilot 登录</div>
        <h1>邮箱登录</h1>
        {authError && AUTH_ERRORS[authError] && (
          <p className="oauth-banner warn" role="alert">{AUTH_ERRORS[authError]}</p>
        )}
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const values = Object.fromEntries(new FormData(event.currentTarget));
            const response = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
            const data = await response.json();
            if (!response.ok) { setError(data.error || "验证失败"); setBusy(false); return; }
            location.href = new URLSearchParams(location.search).get("next") || "/";
          }}
        >
          <label>邮箱地址<input required name="email" type="email" autoComplete="email" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "正在登录…" : "直接登录"}</button>
        </form>
        <div className="signin-or">或</div>
        <button className="oauth-btn" type="button" disabled>使用 Gmail 登录（暂无权限）</button>
        <section className="usage" aria-label="使用步骤">
          <p className="usage-title">三步开始投递</p>
          <ol className="usage-steps">
            <li>登录你的邮箱</li>
            <li>上传并确认简历</li>
            <li>搜索岗位或指定邮箱投递</li>
          </ol>
        </section>
      </div>
    </main>
  );
}

"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export default function GatePage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="invite-page">
      <div className="invite-panel">
        <LockKeyhole />
        <div className="eyebrow">JobPilot 访问</div>
        <h1>输入访问密码</h1>
        <p className="muted">
          这是进入本站的访问密码。进入后，用你自己的邮箱登录（无需在本站设置额外密码）。
        </p>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const values = Object.fromEntries(new FormData(event.currentTarget));
            const response = await fetch("/api/gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
            const data = await response.json();
            if (!response.ok) { setError(data.error || "验证失败"); setBusy(false); return; }
            location.href = new URLSearchParams(location.search).get("next") || "/";
          }}
        >
          <label>访问密码<input autoFocus required name="password" type="password" autoComplete="off" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "正在验证…" : "进入"}</button>
        </form>
      </div>
    </main>
  );
}

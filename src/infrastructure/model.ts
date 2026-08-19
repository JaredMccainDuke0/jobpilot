import { getSecret } from "./secrets";

export interface ModelAdapter { health(): Promise<{ ok: boolean; mode: string; detail?: string }>; }

export class MockModelAdapter implements ModelAdapter {
  async health() { return { ok: true, mode: "mock" }; }
}

export class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(private baseUrl: string, private model: string) {}

  async health() {
    const key = await getSecret("model-api-key");
    if (!key) return { ok: false, mode: "external", detail: "访问密钥未配置" };
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), cache: "no-store",
      });
      if (!response.ok) return { ok: false, mode: "external", detail: `服务返回 ${response.status}` };
      return { ok: true, mode: "external", detail: this.model };
    } catch {
      return { ok: false, mode: "external", detail: "无法连接模型服务" };
    }
  }
}

export async function getSecret(account: "model-api-key") {
  return account === "model-api-key" ? process.env.JOBPILOT_MODEL_API_KEY || null : null;
}

export async function setSecret() {
  throw new Error("敏感值只能在本机 .env 中更新，修改后请重启服务");
}

function request(path, options = {}) {
  const app = getApp();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: { "content-type": "application/json", ...(app.globalData.sessionToken ? { Authorization: `Bearer ${app.globalData.sessionToken}` } : {}) },
      success: (response) => {
        const data = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(data);
        const error = new Error(data.error || "服务暂时不可用");
        error.status = response.statusCode;
        error.code = data.code;
        reject(error);
      },
      fail: () => reject(new Error("无法连接 JobPilot 服务，请检查网络后重试")),
    });
  });
}

module.exports = { request };

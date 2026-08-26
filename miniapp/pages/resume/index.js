Page({
  data: { busy: false, error: "", success: "" },
  chooseResume() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: "", success: "" });
    wx.chooseMessageFile({ count: 1, type: "file", extension: ["pdf", "docx", "txt"], success: ({ tempFiles }) => {
      const file = tempFiles && tempFiles[0];
      if (!file) return this.setData({ busy: false, error: "请选择 PDF、DOCX 或 TXT 简历" });
      const app = getApp();
      wx.uploadFile({ url: `${app.globalData.apiBaseUrl}/api/resume`, filePath: file.path, name: "file", header: app.globalData.sessionToken ? { Authorization: `Bearer ${app.globalData.sessionToken}` } : {}, success: (response) => {
        let payload = {};
        try { payload = JSON.parse(response.data || "{}"); } catch { payload = {}; }
        if (response.statusCode >= 200 && response.statusCode < 300) this.setData({ busy: false, success: "简历已上传，请回到网页登录确认解析结果" });
        else this.setData({ busy: false, error: payload.error || "简历上传失败，请重试" });
      }, fail: () => this.setData({ busy: false, error: "无法连接上传服务，请检查网络后重试" }) });
    }, fail: () => this.setData({ busy: false }) });
  },
});

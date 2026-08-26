const { request } = require("../../utils/api");

Page({
  data: { email: "", busy: false, error: "" },
  onEmailInput(event) { this.setData({ email: event.detail.value }); },
  onLoad() { this.exchangeCode(); },
  exchangeCode() {
    wx.login({ success: ({ code }) => request("/api/miniapp/session", { method: "POST", data: { code } }).then((data) => {
      if (data.ok) { getApp().globalData.sessionToken = data.token; wx.setStorageSync("jobpilot_session", data.token); wx.reLaunch({ url: "/pages/home/index" }); return; }
      this.setData({ bindingToken: data.bindingToken });
    }).catch((error) => this.setData({ error: error.message })) });
  },
  bindAccount() {
    const email = String(this.data.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || !this.data.bindingToken) return this.setData({ error: "请输入有效邮箱并重新登录" });
    this.setData({ busy: true, error: "" });
    request("/api/miniapp/session", { method: "PUT", data: { bindingToken: this.data.bindingToken, email } }).then((data) => {
      getApp().globalData.sessionToken = data.token; wx.setStorageSync("jobpilot_session", data.token); wx.reLaunch({ url: "/pages/home/index" });
    }).catch((error) => this.setData({ error: error.message, busy: false }));
  },
});

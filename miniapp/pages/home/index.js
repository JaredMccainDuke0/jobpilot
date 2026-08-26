const { request } = require("../../utils/api");
Page({
  data: { loading: true, error: "", state: null },
  onShow() { this.load(); },
  load() {
    this.setData({ loading: true, error: "" });
    request("/api/state").then((state) => this.setData({ state, loading: false })).catch((error) => this.setData({ error: error.message, loading: false }));
  },
  openMatches() { wx.navigateTo({ url: "/pages/matches/index" }); },
  openResume() { wx.navigateTo({ url: "/pages/resume/index" }); },
});

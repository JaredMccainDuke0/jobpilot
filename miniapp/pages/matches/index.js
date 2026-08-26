const { request } = require("../../utils/api");
Page({
  data: { loading: true, searching: false, error: "", state: null },
  onShow() { this.load(); },
  load() { this.setData({ loading: true, error: "" }); request("/api/state").then((state) => this.setData({ state, loading: false })).catch((error) => this.setData({ error: error.message, loading: false })); },
  search() {
    if (this.data.searching) return;
    this.setData({ searching: true, error: "" });
    request("/api/matches", { method: "POST" }).then(() => this.load()).catch((error) => this.setData({ searching: false, error: error.message })).finally(() => this.setData({ searching: false }));
  },
  toggle(event) {
    const id = event.currentTarget.dataset.id;
    const results = this.data.state.run.results || [];
    const item = results.find((result) => result.id === id);
    request("/api/matches/select", { method: "POST", data: { id, selected: !item.selected, visibleIds: results.map((result) => result.id) } }).then(() => this.load()).catch((error) => this.setData({ error: error.message }));
  },
  detail(event) { wx.navigateTo({ url: `/pages/matches/detail?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
});

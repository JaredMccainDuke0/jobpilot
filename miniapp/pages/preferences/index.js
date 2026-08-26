const { request } = require("../../utils/api");
Page({
  data: { rawText: "", city: "", jobType: "", industry: "", workMode: "", busy: false, error: "", success: "" },
  onInput(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  save() {
    if (this.data.busy) return;
    const rawText = this.data.rawText.trim();
    if (rawText.length < 5) return this.setData({ error: "请用一句话描述求职需求" });
    this.setData({ busy: true, error: "", success: "" });
    request("/api/preferences", { method: "POST", data: { rawText, city: this.data.city.trim(), jobType: this.data.jobType.trim(), industry: this.data.industry.trim(), workMode: this.data.workMode.trim() } }).then(() => this.setData({ busy: false, success: "求职条件已保存" })).catch((error) => this.setData({ busy: false, error: error.message }));
  },
});

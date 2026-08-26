const { request } = require("../../utils/api");
Page({ data: { loading: true, error: "", tasks: [] }, onShow() { this.load(); }, load() { this.setData({ loading: true, error: "" }); request("/api/state").then((state) => this.setData({ tasks: state.tasks || [], loading: false })).catch((error) => this.setData({ error: error.message, loading: false })); } });

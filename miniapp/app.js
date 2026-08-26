const config = require("./config");

App({
  globalData: { apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ""), sessionToken: wx.getStorageSync("jobpilot_session") || "" },
});

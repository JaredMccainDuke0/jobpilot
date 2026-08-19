import { describe, expect, it } from "vitest";
import { buildApplicationEmail } from "./application-email";

describe("application email builder", () => {
  const job = { title: "AI 应用工程师", company: "示例科技有限公司" };

  it("personalizes with real resume facts and the specific company/role", () => {
    const mail = buildApplicationEmail(
      { name: "刘三", school: "华南理工大学", major: "计算机", education: "本科", phone: "13800000000", email: "a@b.com", skills: ["Python", "机器学习", "大模型"] },
      job,
    );
    expect(mail.subject).toBe("应聘AI 应用工程师｜刘三");
    expect(mail.text).toContain("尊敬的示例科技有限公司招聘团队");
    expect(mail.text).toContain("我是 刘三，华南理工大学计算机专业本科背景");
    expect(mail.text).toContain("「AI 应用工程师」");
    expect(mail.text).toContain("Python、机器学习、大模型");
    expect(mail.text).toContain("电话：13800000000");
    expect(mail.text).toContain("邮箱：a@b.com");
  });

  it("degrades gracefully when fields are missing (no invented content)", () => {
    const mail = buildApplicationEmail({ skills: [] }, job);
    expect(mail.subject).toBe("应聘AI 应用工程师｜求职简历");
    expect(mail.text).toContain("我是一名求职者");
    expect(mail.text).not.toContain("专业"); // no fabricated school/major
    expect(mail.text).not.toContain("等方向有相关经验"); // no skills line when none
    expect(mail.text).toContain("随信附上我的简历（见附件）");
  });
});

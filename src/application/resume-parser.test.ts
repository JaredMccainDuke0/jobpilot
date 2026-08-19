import { describe, expect, it } from "vitest";
import { structureResume } from "./resume-parser";

describe("structureResume",()=>{
  it("extracts deterministic resume fields without inventing facts",()=>{
    const result=structureResume("姓名：张三\n邮箱 zhangsan@example.com\n手机 13800138000\n本科 通信工程专业 2027年毕业\n技能 Python PyTorch 机器学习");
    expect(result.name).toBe("张三");expect(result.email).toBe("zhangsan@example.com");expect(result.phone).toBe("13800138000");expect(result.education).toBe("本科");expect(result.graduationYear).toBe(2027);expect(result.skills).toContain("Python");
  });
  it("keeps absent data empty",()=>{const result=structureResume("只有一段没有联系方式的普通经历描述文本");expect(result.email).toBe("");expect(result.graduationYear).toBeUndefined()});
  it("understands bilingual Chinese education layouts",()=>{const result=structureResume("刘锦安 Jinan Liu 联系方式\n2023.09 – 2027.07 东莞理工学院 / 通信工程 / 本科");expect(result.name).toBe("刘锦安");expect(result.major).toBe("通信工程");expect(result.graduationYear).toBe(2027)});
  it("parses a leading name+English header, spaced phone, and backend skills",()=>{
    const result=structureResume("陈屿川  CHEN YUCHUAN | 后端开发工程师 / Java / Go  电话： 138 7264 1903  邮箱： cyc@outlook.com  现居：杭州");
    expect(result.name).toBe("陈屿川");
    expect(result.phone).toBe("13872641903");
    expect(result.city).toBe("杭州");
    expect(result.skills).toEqual(expect.arrayContaining(["Java","Go"]));
    expect(result.skills).not.toContain("JavaScript");
  });
});

import {describe,expect,it} from "vitest";
import {hashPassword,verifyPassword} from "./auth";

describe("account passwords",()=>{
  it("accepts the matching password and rejects another password",()=>{const stored=hashPassword("A-secure-password-2026");expect(verifyPassword("A-secure-password-2026",{passwordHash:stored.hash,passwordSalt:stored.salt})).toBe(true);expect(verifyPassword("wrong-password",{passwordHash:stored.hash,passwordSalt:stored.salt})).toBe(false)});
});

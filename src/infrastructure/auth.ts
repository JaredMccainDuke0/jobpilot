import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,scryptSync,timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";
import {id,now,one,run} from "./db";

const COOKIE="jobpilot_session";
const secret=()=>process.env.JOBPILOT_SESSION_SECRET||"";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

export function hashPassword(password:string,salt=randomBytes(16).toString("hex")){return {salt,hash:scryptSync(password,salt,32).toString("hex")}}
export function verifyPassword(password:string,user:{passwordHash:string;passwordSalt:string}){if(user.passwordSalt==="legacy-sha256")return timingSafeEqual(Buffer.from(digest(password)),Buffer.from(user.passwordHash));const actual=scryptSync(password,user.passwordSalt,32);return timingSafeEqual(actual,Buffer.from(user.passwordHash,"hex"))}
export function createUser(email:string,password:string,role="user"){const passwordData=hashPassword(password),userId=id();run("INSERT INTO users VALUES(?,?,?,?,?,?)",userId,email.toLowerCase(),passwordData.hash,passwordData.salt,role,now());return userId}
// OAuth login: identity comes from the provider, so there is no user-facing password. Reuse an existing
// account by email (keeps the owner's role) or create one with a random, unusable password.
export function findOrCreateOAuthUser(email:string){const normalized=email.toLowerCase();const existing=one<any>("SELECT id FROM users WHERE email=?",normalized);if(existing)return existing.id as string;return createUser(normalized,randomBytes(24).toString("hex"))}
function sign(userId:string){return createHmac("sha256",secret()).update(userId).digest("hex")}
export async function setSession(userId:string){(await cookies()).set(COOKIE,`${userId}.${sign(userId)}`,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:604800,path:"/"})}
// Session cookie descriptor for callers that must set it explicitly on a redirect Response (e.g. OAuth callback).
export function sessionCookie(userId:string){return {name:COOKIE,value:`${userId}.${sign(userId)}`,options:{httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",maxAge:604800,path:"/"}}}
export async function clearSession(){(await cookies()).delete(COOKIE)}
export async function currentUser(){const value=(await cookies()).get(COOKIE)?.value;if(!value||!secret())return null;const [userId,signature]=value.split(".");if(!userId||!signature)return null;const expected=sign(userId);if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;return one<any>("SELECT id,email,role FROM users WHERE id=?",userId)||null}
export async function requireUser(){const user=await currentUser();if(!user)throw new Error("UNAUTHENTICATED");return user}

// Bearer session for non-browser clients (for example a future mini-program). Web Cookie
// sessions remain unchanged; this token carries only an opaque user id and an HMAC signature.
export function createBearerSession(userId:string){return `${userId}.${sign(userId)}`}
export function verifyBearerSession(value:string){const [userId,signature]=value.split(".");if(!userId||!signature||!secret())return null;const expected=sign(userId);if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;return one<any>("SELECT id,email,role FROM users WHERE id=?",userId)||null}
export function createMiniappBindingToken(openid:string){return `bind.${openid}.${createHmac("sha256",secret()).update(`bind:${openid}`).digest("hex")}`}
export function verifyMiniappBindingToken(value:string){const parts=value.split(".");if(parts.length!==3||parts[0]!=="bind"||!secret())return null;const expected=createHmac("sha256",secret()).update(`bind:${parts[1]}`).digest("hex");if(parts[2].length!==expected.length||!timingSafeEqual(Buffer.from(parts[2]),Buffer.from(expected)))return null;return parts[1]}

function encryptionKey(){return createHash("sha256").update(secret()).digest()}
export function encryptUserSecret(userId:string,key:string,value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);cipher.setAAD(Buffer.from(`${userId}:${key}`));const ciphertext=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),tag=cipher.getAuthTag();run("INSERT INTO user_secrets VALUES(?,?,?,?,?,?) ON CONFLICT(userId,key) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,updatedAt=excluded.updatedAt",userId,key,ciphertext.toString("base64"),iv.toString("base64"),tag.toString("base64"),now())}
export function decryptUserSecret(userId:string,key:string){const row=one<any>("SELECT * FROM user_secrets WHERE userId=? AND key=?",userId,key);if(!row)return null;const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(row.iv,"base64"));decipher.setAAD(Buffer.from(`${userId}:${key}`));decipher.setAuthTag(Buffer.from(row.tag,"base64"));return Buffer.concat([decipher.update(Buffer.from(row.ciphertext,"base64")),decipher.final()]).toString("utf8")}

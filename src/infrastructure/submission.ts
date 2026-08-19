import MailComposer from "nodemailer/lib/mail-composer";
import { readFileSync } from "node:fs";
import { googleAccessToken } from "./oauth-google";

export interface SubmissionAdapter { submit(taskId:string): Promise<{ok:boolean; reference?:string; error?:string}>; }
// replyTo/fromName/bcc are used by the central Resend sender. Gmail already keeps its own sent copy and
// therefore deliberately ignores bcc.
export type SendInput = { to:string; subject:string; text:string; resumePath:string; resumeName:string; replyTo?:string; fromName?:string; bcc?:string; idempotencyKey?:string };

const EMAIL_REQUEST_TIMEOUT_MS = 30_000;
function timedOut(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export class MockSubmissionAdapter implements SubmissionAdapter {
  async submit(taskId:string){ return {ok:true, reference:`mock-${taskId}`}; }
}

// Gmail: send through the Gmail API (messages/send), which works with the narrow gmail.send scope.
// (Gmail's SMTP submission requires the full https://mail.google.com/ scope, which we deliberately do not
// request.) The stored refresh token is exchanged for an access token per request; verify() sends nothing.
export class GmailApiSubmissionAdapter implements SubmissionAdapter {
  constructor(private config:{user:string;from:string;clientId:string;clientSecret:string;refreshToken:string}) {}
  private token(){ return googleAccessToken({clientId:this.config.clientId,clientSecret:this.config.clientSecret,refreshToken:this.config.refreshToken}); }
  async verify(){
    try {
      const token=await this.token();
      return token?{ok:true}:{ok:false,error:"Google 授权失败或已过期，请重新用 Google 登录"};
    } catch (error) {
      return {ok:false,error:timedOut(error)?"连接 Google 超时，请稍后重试":"无法连接 Google"};
    }
  }
  async submit(){return {ok:false,error:"邮件任务缺少经过应用层校验的投递载荷"}}
  async send(input:SendInput){
    try{
      const token=await this.token();
      if(!token)return {ok:false,error:"Google 授权失败或已过期"};
      const stableId=(input.idempotencyKey||"").replace(/[^a-zA-Z0-9._-]/g,"");
      const mime=await new MailComposer({
        from:this.config.from,
        to:input.to,
        subject:input.subject,
        text:input.text,
        messageId:stableId?`<jobpilot-${stableId}@jobpilot.local>`:undefined,
        attachments:[{filename:input.resumeName,path:input.resumePath}],
      }).compile().build();
      const raw=mime.toString("base64url");
      const res=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
        body:JSON.stringify({raw}),
        signal:AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
      });
      if(res.ok){
        const body=await res.json().catch(()=>null) as {id?:unknown}|null;
        const reference=typeof body?.id==="string"&&body.id.trim()?"gmail:"+body.id.trim():"gmail-api";
        return {ok:true,reference};
      }
      return {ok:false,error:`Gmail 发送失败（HTTP ${res.status}）`};
    }catch(error){return {ok:false,error:timedOut(error)?"Gmail 发送超时，发送状态未知；请先检查 Gmail 已发送邮件再决定是否重试":"Gmail 邮件发送失败"}}
  }
}

// Central platform sender via Resend: one API key + one verified domain sends for ALL users (zero per-user
// config). Mail is From the platform domain, while the visible name includes the applicant's name and login
// email. Reply-To routes employer replies to the applicant, and every relayed message is blind-copied there.
export class ResendSubmissionAdapter implements SubmissionAdapter {
  constructor(private config:{apiKey:string;fromAddress:string}) {}
  async verify(){
    if(!this.config.apiKey)return {ok:false,error:"平台代发未配置（缺少 Resend API Key）"};
    try{
      const res=await fetch("https://api.resend.com/domains",{headers:{Authorization:`Bearer ${this.config.apiKey}`},signal:AbortSignal.timeout(15_000)});
      if(res.ok)return {ok:true};
      // A send-only ("restricted") key can't read /domains but is a valid sending key → treat as OK.
      if(res.status===401){
        try{const j=await res.json() as any; if(j?.name==="restricted_api_key")return {ok:true};}catch{}
        return {ok:false,error:"Resend API Key 无效"};
      }
      return {ok:false,error:`Resend 校验失败（${res.status}）`};
    }catch(error){return {ok:false,error:timedOut(error)?"连接平台代发服务超时":"无法连接 Resend"}}
  }
  async submit(){return {ok:false,error:"邮件任务缺少经过应用层校验的投递载荷"}}
  async send(input:SendInput){
    try{
      const content=readFileSync(input.resumePath).toString("base64");
      const displayName=(input.fromName||"求职者").replace(/[<>"\\\r\n]/g,"").trim()||"求职者";
      const visibleEmail=(input.replyTo||"").replace(/[<>"\\\r\n]/g,"").trim();
      const visibleSender=visibleEmail?`${visibleEmail} via JobPilot`:`${displayName} via JobPilot`;
      const from=`"${visibleSender}" <${this.config.fromAddress}>`;
      const text=visibleEmail
        ? `候选人联系邮箱：${visibleEmail}\n直接回复本邮件即可联系候选人。\n\n${input.text}`
        : input.text;
      const body:any={from,to:[input.to],subject:input.subject,text,attachments:[{filename:input.resumeName,content}]};
      if(input.replyTo)body.reply_to=input.replyTo;
      const copyAddress=input.bcc||input.replyTo;
      if(copyAddress)body.bcc=[copyAddress];
      const headers:Record<string,string>={Authorization:`Bearer ${this.config.apiKey}`,"Content-Type":"application/json"};
      if(input.idempotencyKey)headers["Idempotency-Key"]=input.idempotencyKey;
      const res=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers,
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
      });
      if(res.ok){
        const body=await res.json().catch(()=>null) as {id?:unknown}|null;
        const reference=typeof body?.id==="string"&&body.id.trim()?"resend:"+body.id.trim():"resend";
        return {ok:true,reference};
      }
      return {ok:false,error:`平台代发失败（HTTP ${res.status}）`};
    }catch(error){return {ok:false,error:timedOut(error)?"平台代发超时，发送状态未知；请稍后刷新记录再决定是否重试":"平台代发邮件失败"}}
  }
}

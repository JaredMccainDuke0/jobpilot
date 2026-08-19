import { id, now, one, run, transaction } from "@/infrastructure/db";
import {requireUser} from "@/infrastructure/auth";
export async function POST(req:Request){
  const user=await requireUser();
  const body=await req.json();
  const resume=one("SELECT * FROM resumes WHERE id=? AND userId=?",body.resumeId,user.id); if(!resume) return Response.json({error:"简历不存在"},{status:404});
  const missing=Object.entries(body.parsed||{}).filter(([,v])=>!v).map(([k])=>k);
  const versionId=id();transaction(()=>{run("INSERT INTO resume_versions VALUES(?,?,?,?,?,?)",versionId,body.resumeId,JSON.stringify(body.parsed),JSON.stringify(missing),"user_confirmed",now());run("UPDATE resumes SET confirmed=1,currentVersionId=?,updatedAt=? WHERE id=?",versionId,now(),body.resumeId)});
  return Response.json({ok:true,versionId});
}

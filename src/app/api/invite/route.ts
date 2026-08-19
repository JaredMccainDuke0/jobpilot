import {clearSession,findOrCreateOAuthUser,setSession} from "@/infrastructure/auth";
import {z} from "zod";

// Interim, temporary sign-in behind the site gate: identify by email only (no per-user password — that was
// dropped as redundant now that the shared access gate controls entry). To be removed once OAuth-only.
const schema=z.object({email:z.string().email()});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return Response.json({error:"请输入有效邮箱"},{status:400});
  const email=parsed.data.email.toLowerCase();
  const userId=findOrCreateOAuthUser(email);
  await setSession(userId);
  return Response.json({ok:true});
}
export async function DELETE(){await clearSession();return Response.json({ok:true})}

import { id,now,run } from "@/infrastructure/db";
import { z } from "zod";
import {requireUser} from "@/infrastructure/auth";
const schema=z.object({rawText:z.string().trim().min(5),city:z.string().optional(),jobType:z.string().optional(),industry:z.string().optional(),workMode:z.string().optional()});
export async function POST(req:Request){const user=await requireUser();const parsed=schema.safeParse(await req.json());if(!parsed.success)return Response.json({error:"请用一句话描述求职需求"},{status:400});const p={id:id(),...parsed.data,confirmed:1,createdAt:now(),updatedAt:now()};run("INSERT INTO preferences(id,rawText,city,jobType,industry,workMode,confirmed,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?,?,?,?,?)",p.id,p.rawText,p.city||null,p.jobType||null,p.industry||null,p.workMode||null,1,p.createdAt,p.updatedAt,user.id);return Response.json(p);}

import {MockModelAdapter,OpenAICompatibleAdapter} from "@/infrastructure/model";
import {requireUser} from "@/infrastructure/auth";
export async function POST(){await requireUser();const baseUrl=process.env.JOBPILOT_MODEL_BASE_URL,model=process.env.JOBPILOT_MODEL_NAME;const adapter=baseUrl&&model?new OpenAICompatibleAdapter(baseUrl,model):new MockModelAdapter();const result=await adapter.health();return Response.json({ok:result.ok,mode:baseUrl&&model?"server":"mock"},{status:result.ok?200:502})}

import { aiConfiguration, checkAiConnection } from "@/lib/ai";
import { accessFor } from "@/lib/authorization";
import { localRequest } from "@/lib/http";
import { UploadError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let running = false;

export async function GET(request: Request) {
  try {
    localRequest(request);
    await accessFor(request, ["lender"]);
    return Response.json(aiConfiguration(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Available on localhost only." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    localRequest(request, true);
    await accessFor(request, ["lender"]);
    if (request.headers.get("x-portal-ai-check") !== "1")
      throw new UploadError("Use the connection check button in the local app.", 403);
  } catch {
    return Response.json({ error: "Use the connection check button in the local app." }, { status: 403 });
  }
  if (!aiConfiguration().configured)
    return Response.json({ error: "Add OPENROUTER_API_KEY to .env.local and restart the app." }, { status: 503 });
  if (running)
    return Response.json({ error: "A connection check is already running." }, { status: 429 });
  running = true;
  try {
    return Response.json(await checkAiConnection(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Provider errors may include request details. Never log or return raw errors.
    return Response.json({ error: "Could not complete the model request. Check your OpenRouter key, credits, and model availability, then retry." }, { status: 502 });
  } finally {
    running = false;
  }
}

import { adapters } from "@/lib/runtime";
import { failure, localRequest } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    localRequest(request);
    return Response.json(await (await adapters(request, ["borrower", "lender"])).repository.snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}

import type { StatusResponse } from "@/lib/api-schemas";
import { MODEL, isConfigured } from "@/lib/server/claude";

export const dynamic = "force-dynamic";

export function GET() {
  const body: StatusResponse = { configured: isConfigured(), model: MODEL };
  return Response.json(body);
}

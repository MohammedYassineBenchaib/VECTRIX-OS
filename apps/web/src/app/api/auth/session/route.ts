import { apiRoute, json } from "@/server/api";
import { getSessionUser } from "@/server/auth";

export async function GET() {
  return apiRoute(async () => {
    const user = await getSessionUser();
    return json({ user });
  });
}

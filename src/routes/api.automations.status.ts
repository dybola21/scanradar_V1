import { createFileRoute } from "@tanstack/react-router";
import { uuid } from "@/lib/automation-contract";
export const Route = createFileRoute("/api/automations/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { api, authenticateUser, getStatus, json } =
          await import("@/lib/server/automation.server");
        return api(async () => {
          const userId = await authenticateUser(request);
          const searchId = uuid.parse(new URL(request.url).searchParams.get("searchId"));
          return json(await getStatus(searchId, userId));
        });
      },
    },
  },
});

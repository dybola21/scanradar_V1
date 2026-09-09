import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/automations/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { api, startAutomation } = await import("@/lib/server/automation.server");
        return api(() => startAutomation(request));
      },
    },
  },
});

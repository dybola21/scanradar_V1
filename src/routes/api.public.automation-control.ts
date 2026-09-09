import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/automation-control")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { api, automationControl } = await import("@/lib/server/automation.server");
        return api(() => automationControl(request));
      },
    },
  },
});

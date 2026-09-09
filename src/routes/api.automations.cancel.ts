import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/automations/cancel")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { api } = await import("@/lib/server/automation.server");
        const { getCancelContext } = await import("@/lib/server/automation-cancel.server");
        return api(() => getCancelContext(request));
      },
      POST: async ({ request }) => {
        const { api } = await import("@/lib/server/automation.server");
        const { cancelAutomation } = await import("@/lib/server/automation-cancel.server");
        return api(() => cancelAutomation(request));
      },
    },
  },
});

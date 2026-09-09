import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/automations/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { api } = await import("@/lib/server/automation.server");
        const { reconcileAutomation } = await import("@/lib/server/automation-cancel.server");
        return api(() => reconcileAutomation(request));
      },
    },
  },
});

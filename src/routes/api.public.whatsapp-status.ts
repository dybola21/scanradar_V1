import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/whatsapp-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { api, whatsappStatus } = await import("@/lib/server/automation.server");
        return api(() => whatsappStatus(request));
      },
    },
  },
});

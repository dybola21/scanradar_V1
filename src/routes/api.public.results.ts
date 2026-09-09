import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/results")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { api } = await import("@/lib/server/automation.server");
        const { saveResults } = await import("@/lib/server/results.server");
        return api(() => saveResults(request));
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/start-search")({server: {handlers: {POST: async ({request}) => {
  const {api} = await import("@/lib/server/automation.server");
  const {dispatchSearch} = await import("@/lib/server/search-dispatch.server");
  return api(() => dispatchSearch(request));
}}}});

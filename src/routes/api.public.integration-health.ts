import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/integration-health")({server: {handlers: {GET: () => Response.json({service: "scanradar", protocolVersion: 3, build: "scanradar-independent-20260909", actions: ["claim","check","reserve","begin_send","finish"]}, {headers: {"Cache-Control":"no-store"}})}}});

// Preview artifacts cannot control production n8n, even with copied runtime variables.
export function assertNotPreview() {
  const preview = typeof __SCANRADAR_PREVIEW__ !== "undefined" && __SCANRADAR_PREVIEW__;
  if (preview || ["deploy-preview", "branch-deploy"].includes(process.env["CONTEXT"] || ""))
    throw new Error("O n8n está desativado em previews.");
}
export function assertDispatchEnabled() {
  assertNotPreview();
  if (process.env["SCANRADAR_ENABLE_AUTOMATIONS"] !== "true")
    throw new Error("Novas execuções desativadas. Configure SCANRADAR_ENABLE_AUTOMATIONS no servidor de produção.");
}

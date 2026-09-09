import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
// Standard fetch entry consumed by the hosting adapter; API responses keep JSON/status codes.
export default { fetch: createStartHandler(defaultStreamHandler) };

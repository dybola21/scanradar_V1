import {afterEach,describe,expect,test,vi} from "vitest";
import {encrypt,decrypt} from "../src/lib/server/encryption";
import {assertDispatchEnabled,assertNotPreview} from "../src/lib/server/dispatch-policy";
afterEach(()=>vi.unstubAllEnvs());
describe("Independent installation",()=>{
 test("secrets roundtrip and tampering / wrong encryption key fail closed",()=>{
  vi.stubEnv("ENCRYPTION_KEY","a".repeat(64));const encoded=encrypt("private-test-secret");expect(decrypt(encoded)).toBe("private-test-secret");
  const parts=encoded.split(":");parts[3]=(parts[3]!.startsWith("00")?"01":"00")+parts[3]!.slice(2);expect(()=>decrypt(parts.join(":"))).toThrow();
  vi.stubEnv("ENCRYPTION_KEY","b".repeat(64));expect(()=>decrypt(encoded)).toThrow();expect(()=>decrypt("plaintext-or-legacy-secret")).toThrow();
 });
 test("missing encryption key fails only when secret encryption is requested",()=>{vi.stubEnv("ENCRYPTION_KEY","");expect(()=>encrypt("secret")).toThrow();});
 test("preview cannot dispatch or stop n8n even when the dispatch switch is enabled",()=>{vi.stubEnv("CONTEXT","deploy-preview");vi.stubEnv("SCANRADAR_ENABLE_AUTOMATIONS","true");expect(()=>assertDispatchEnabled()).toThrow();expect(()=>assertNotPreview()).toThrow();});
 test("production pause prevents starts while keeping cancellation available",()=>{vi.stubEnv("CONTEXT","production");vi.stubEnv("SCANRADAR_ENABLE_AUTOMATIONS","false");expect(()=>assertDispatchEnabled()).toThrow();expect(()=>assertNotPreview()).not.toThrow();vi.stubEnv("SCANRADAR_ENABLE_AUTOMATIONS","true");expect(()=>assertDispatchEnabled()).not.toThrow();});
});

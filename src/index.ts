// ---------------------------------------------------------------------------
// API publica do pacote. Import unico independente do provider por baixo:
//
//   import { WhatsAppClient, InMemoryTenantStore } from "@paulorogge/whatsapp-gateway";
//
// ---------------------------------------------------------------------------

export { WhatsAppClient } from "./core/WhatsAppClient.js";
export { WhatsAppGatewayError, TenantNotFoundError, InvalidWebhookSignatureError } from "./core/errors.js";
export type { IWhatsAppProvider } from "./core/IWhatsAppProvider.js";
export * from "./core/types.js";

export { createProvider } from "./providers/createProvider.js";
export { MetaCloudApiProvider } from "./providers/meta/MetaCloudApiProvider.js";
export { AzureAcsProvider } from "./providers/azure/AzureAcsProvider.js";

export {
  verifyMetaWebhookSignature,
  verifyMetaWebhookSubscription,
  parseMetaWebhookPayload,
} from "./providers/meta/metaWebhook.js";
export { parseAzureEventGridPayload } from "./providers/azure/azureWebhook.js";
export { attachTenant } from "./webhook/attachTenant.js";

export type { Tenant, TenantCredentials, MetaTenantCredentials, AzureTenantCredentials } from "./tenancy/types.js";
export type { TenantStore } from "./tenancy/TenantStore.js";
export { InMemoryTenantStore, createSingleTenantStoreFromEnv } from "./tenancy/InMemoryTenantStore.js";

import type { Tenant } from "./types.js";
import type { TenantStore } from "./TenantStore.js";

function routingKeyOf(tenant: Tenant): string {
  return tenant.credentials.provider === "meta"
    ? tenant.credentials.phoneNumberId
    : tenant.credentials.channelRegistrationId;
}

/**
 * Implementacao de referencia, pensada para: testes, um unico tenant lido
 * do .env, ou uma lista pequena e estatica de clientes carregada na
 * inicializacao do processo (ex: de um arquivo JSON).
 *
 * Para multi-tenant "de verdade" (clientes cadastrados dinamicamente),
 * implemente `TenantStore` contra o seu banco de dados - a assinatura e
 * so essas duas funcoes.
 */
export class InMemoryTenantStore implements TenantStore {
  private readonly byId = new Map<string, Tenant>();
  private readonly byRoutingKey = new Map<string, Tenant>();

  constructor(tenants: Tenant[] = []) {
    for (const tenant of tenants) this.addTenant(tenant);
  }

  addTenant(tenant: Tenant): void {
    this.byId.set(tenant.id, tenant);
    this.byRoutingKey.set(routingKeyOf(tenant), tenant);
  }

  removeTenant(tenantId: string): void {
    const tenant = this.byId.get(tenantId);
    if (!tenant) return;
    this.byId.delete(tenantId);
    this.byRoutingKey.delete(routingKeyOf(tenant));
  }

  async getTenantById(tenantId: string): Promise<Tenant | undefined> {
    return this.byId.get(tenantId);
  }

  async getTenantByRoutingKey(routingKey: string): Promise<Tenant | undefined> {
    return this.byRoutingKey.get(routingKey);
  }
}

/**
 * Atalho para o caso de uso mais simples: um unico tenant ("default"),
 * configurado 100% por variaveis de ambiente. Util para comecar rapido
 * ou para projetos que ainda nao precisam de multi-tenant.
 *
 * Le `WHATSAPP_DEFAULT_PROVIDER` para decidir entre Meta e Azure, e as
 * demais variaveis descritas em `.env.example`.
 */
export function createSingleTenantStoreFromEnv(env: NodeJS.ProcessEnv = process.env): InMemoryTenantStore {
  const provider = (env.WHATSAPP_DEFAULT_PROVIDER ?? "meta").toLowerCase();

  if (provider === "azure") {
    const connectionString = required(env.AZURE_ACS_CONNECTION_STRING, "AZURE_ACS_CONNECTION_STRING");
    const channelRegistrationId = required(env.AZURE_CHANNEL_REGISTRATION_ID, "AZURE_CHANNEL_REGISTRATION_ID");

    return new InMemoryTenantStore([
      {
        id: "default",
        credentials: { provider: "azure", connectionString, channelRegistrationId },
      },
    ]);
  }

  if (provider === "meta") {
    const accessToken = required(env.META_ACCESS_TOKEN, "META_ACCESS_TOKEN");
    const phoneNumberId = required(env.META_PHONE_NUMBER_ID, "META_PHONE_NUMBER_ID");
    const appSecret = required(env.META_APP_SECRET, "META_APP_SECRET");
    const webhookVerifyToken = required(env.META_WEBHOOK_VERIFY_TOKEN, "META_WEBHOOK_VERIFY_TOKEN");

    return new InMemoryTenantStore([
      {
        id: "default",
        credentials: {
          provider: "meta",
          accessToken,
          phoneNumberId,
          appSecret,
          webhookVerifyToken,
          graphApiVersion: env.META_GRAPH_API_VERSION,
        },
      },
    ]);
  }

  throw new Error(`WHATSAPP_DEFAULT_PROVIDER invalido: "${provider}". Use "meta" ou "azure".`);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  return value;
}

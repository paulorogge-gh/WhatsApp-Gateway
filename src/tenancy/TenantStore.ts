import type { Tenant } from "./types.js";

/**
 * Fonte de credenciais por tenant. E a peca que voce substitui em produzao
 * (por uma implementacao com Postgres, Cosmos DB, Key Vault, etc.) sem
 * mudar nada no resto do modulo.
 */
export interface TenantStore {
  /** Busca um tenant pelo ID interno do seu sistema. */
  getTenantById(tenantId: string): Promise<Tenant | undefined>;

  /**
   * Busca um tenant pela "routing key" que vem dentro do payload de um
   * webhook: `phone_number_id` (Meta) ou `channelRegistrationId` (Azure).
   * E assim que o modulo descobre de qual cliente/projeto e uma mensagem
   * recebida, antes mesmo de voce saber o tenantId.
   */
  getTenantByRoutingKey(routingKey: string): Promise<Tenant | undefined>;
}

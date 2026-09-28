import type { InboundEvent } from "../core/types.js";
import type { TenantStore } from "../tenancy/TenantStore.js";

/**
 * Depois de fazer o parse de um payload de webhook (Meta ou Azure) para
 * `InboundEvent[]`, chame esta funcao para descobrir de qual tenant e cada
 * evento (usando a `routingKey` ja presente em cada evento) e preencher
 * `tenantId`. E o passo que fecha o ciclo multi-tenant no recebimento.
 */
export async function attachTenant(events: InboundEvent[], tenantStore: TenantStore): Promise<InboundEvent[]> {
  const result: InboundEvent[] = [];

  for (const event of events) {
    const routingKey = event.kind === "message" ? event.message.routingKey : event.status.routingKey;
    const tenant = await tenantStore.getTenantByRoutingKey(routingKey);

    if (event.kind === "message") {
      result.push({ kind: "message", message: { ...event.message, tenantId: tenant?.id } });
    } else {
      result.push({ kind: "status", status: { ...event.status, tenantId: tenant?.id } });
    }
  }

  return result;
}

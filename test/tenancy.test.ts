import { describe, expect, it } from "vitest";
import { InMemoryTenantStore, createSingleTenantStoreFromEnv } from "../src/tenancy/InMemoryTenantStore.js";
import { attachTenant } from "../src/webhook/attachTenant.js";
import type { InboundEvent } from "../src/core/types.js";

describe("InMemoryTenantStore", () => {
  it("resolve um tenant Meta por id e por routing key (phoneNumberId)", async () => {
    const store = new InMemoryTenantStore([
      {
        id: "cliente-a",
        credentials: {
          provider: "meta",
          phoneNumberId: "111",
          accessToken: "token",
          appSecret: "secret",
          webhookVerifyToken: "verify",
        },
      },
    ]);

    expect((await store.getTenantById("cliente-a"))?.id).toBe("cliente-a");
    expect((await store.getTenantByRoutingKey("111"))?.id).toBe("cliente-a");
    expect(await store.getTenantByRoutingKey("999")).toBeUndefined();
  });

  it("resolve um tenant Azure por routing key (channelRegistrationId)", async () => {
    const store = new InMemoryTenantStore([
      {
        id: "cliente-b",
        credentials: { provider: "azure", connectionString: "endpoint=...;accessKey=...", channelRegistrationId: "guid-1" },
      },
    ]);

    expect((await store.getTenantByRoutingKey("guid-1"))?.id).toBe("cliente-b");
  });
});

describe("createSingleTenantStoreFromEnv", () => {
  it("monta um tenant Meta a partir do .env", async () => {
    const store = createSingleTenantStoreFromEnv({
      WHATSAPP_DEFAULT_PROVIDER: "meta",
      META_ACCESS_TOKEN: "token",
      META_PHONE_NUMBER_ID: "555",
      META_APP_SECRET: "secret",
      META_WEBHOOK_VERIFY_TOKEN: "verify",
    } as unknown as NodeJS.ProcessEnv);

    const tenant = await store.getTenantById("default");
    expect(tenant?.credentials.provider).toBe("meta");
  });

  it("lanca erro claro quando falta variavel obrigatoria", () => {
    expect(() =>
      createSingleTenantStoreFromEnv({ WHATSAPP_DEFAULT_PROVIDER: "meta" } as unknown as NodeJS.ProcessEnv)
    ).toThrow(/META_ACCESS_TOKEN/);
  });
});

describe("attachTenant", () => {
  it("preenche tenantId em eventos de mensagem e status a partir da routing key", async () => {
    const store = new InMemoryTenantStore([
      {
        id: "cliente-a",
        credentials: {
          provider: "meta",
          phoneNumberId: "111",
          accessToken: "t",
          appSecret: "s",
          webhookVerifyToken: "v",
        },
      },
    ]);

    const events: InboundEvent[] = [
      {
        kind: "message",
        message: {
          provider: "meta",
          messageId: "m1",
          from: "5511999998888",
          routingKey: "111",
          timestamp: new Date().toISOString(),
          type: "text",
          text: "oi",
          raw: {},
        },
      },
    ];

    const [result] = await attachTenant(events, store);
    expect(result.kind).toBe("message");
    if (result.kind === "message") {
      expect(result.message.tenantId).toBe("cliente-a");
    }
  });
});

import { describe, expect, it } from "vitest";
import { createProvider } from "../src/providers/createProvider.js";
import { MetaCloudApiProvider } from "../src/providers/meta/MetaCloudApiProvider.js";
import { AzureAcsProvider } from "../src/providers/azure/AzureAcsProvider.js";

describe("createProvider", () => {
  it("instancia MetaCloudApiProvider para credenciais meta", () => {
    const provider = createProvider({
      provider: "meta",
      phoneNumberId: "111",
      accessToken: "token",
      appSecret: "secret",
      webhookVerifyToken: "verify",
    });

    expect(provider).toBeInstanceOf(MetaCloudApiProvider);
    expect(provider.kind).toBe("meta");
  });

  it("instancia AzureAcsProvider para credenciais azure", () => {
    const provider = createProvider({
      provider: "azure",
      connectionString: "endpoint=https://exemplo.communication.azure.com/;accesskey=Zm9v",
      channelRegistrationId: "guid-1",
    });

    expect(provider).toBeInstanceOf(AzureAcsProvider);
    expect(provider.kind).toBe("azure");
  });
});

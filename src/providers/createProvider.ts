import type { IWhatsAppProvider } from "../core/IWhatsAppProvider.js";
import type { TenantCredentials } from "../tenancy/types.js";
import { AzureAcsProvider } from "./azure/AzureAcsProvider.js";
import { MetaCloudApiProvider } from "./meta/MetaCloudApiProvider.js";

/**
 * Fabrica que instancia o provider correto a partir das credenciais do
 * tenant. E o unico lugar do pacote que sabe que "meta" vira
 * `MetaCloudApiProvider` e "azure" vira `AzureAcsProvider` - trocar de
 * provider e so trocar `credentials.provider` (ou a variavel de ambiente
 * que alimenta o TenantStore).
 */
export function createProvider(credentials: TenantCredentials): IWhatsAppProvider {
  switch (credentials.provider) {
    case "meta":
      return new MetaCloudApiProvider(credentials);
    case "azure":
      return new AzureAcsProvider(credentials);
    default: {
      const exhaustiveCheck: never = credentials;
      throw new Error(`Provider desconhecido: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

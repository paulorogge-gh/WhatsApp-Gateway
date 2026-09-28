import { createProvider } from "../providers/createProvider.js";
import type { TenantStore } from "../tenancy/TenantStore.js";
import { TenantNotFoundError } from "./errors.js";
import type {
  InteractiveButtonsMessageInput,
  MediaMessageInput,
  SendResult,
  TemplateMessageInput,
  TextMessageInput,
} from "./types.js";

/**
 * Fachada publica do modulo. E a unica classe que a aplicacao host precisa
 * conhecer para ENVIAR mensagens - ela resolve o tenant, escolhe o
 * provider certo (Meta ou Azure) e delega a chamada, sem o chamador
 * precisar saber qual dos dois esta por baixo.
 *
 * Para RECEBER mensagens (webhooks), use as funcoes exportadas em
 * `providers/meta/metaWebhook.ts`, `providers/azure/azureWebhook.ts` e
 * `webhook/attachTenant.ts` diretamente na rota HTTP da sua aplicacao -
 * de proposito, este pacote nao inclui um servidor HTTP.
 */
export class WhatsAppClient {
  constructor(private readonly tenantStore: TenantStore) {}

  async sendText(tenantId: string, input: TextMessageInput): Promise<SendResult> {
    const provider = await this.resolveProvider(tenantId);
    return provider.sendText(input);
  }

  async sendTemplate(tenantId: string, input: TemplateMessageInput): Promise<SendResult> {
    const provider = await this.resolveProvider(tenantId);
    return provider.sendTemplate(input);
  }

  async sendMedia(tenantId: string, input: MediaMessageInput): Promise<SendResult> {
    const provider = await this.resolveProvider(tenantId);
    return provider.sendMedia(input);
  }

  async sendInteractiveButtons(tenantId: string, input: InteractiveButtonsMessageInput): Promise<SendResult> {
    const provider = await this.resolveProvider(tenantId);
    return provider.sendInteractiveButtons(input);
  }

  private async resolveProvider(tenantId: string) {
    const tenant = await this.tenantStore.getTenantById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return createProvider(tenant.credentials);
  }
}

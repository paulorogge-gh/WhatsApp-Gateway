import type { IWhatsAppProvider } from "../../core/IWhatsAppProvider.js";
import { WhatsAppGatewayError } from "../../core/errors.js";
import type {
  InteractiveButtonsMessageInput,
  MediaMessageInput,
  SendResult,
  TemplateMessageInput,
  TextMessageInput,
} from "../../core/types.js";
import type { MetaTenantCredentials } from "../../tenancy/types.js";

const DEFAULT_GRAPH_API_VERSION = "v21.0";

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface MetaSendMessageResponse {
  messaging_product: "whatsapp";
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}

/**
 * Provider que fala direto com a Graph API da Meta (WhatsApp Business
 * Platform / Cloud API). E a via "padrao de mercado": voce cadastra um
 * cartao no Meta Business Manager e paga a Meta diretamente pelo consumo
 * de conversas/mensagens.
 */
export class MetaCloudApiProvider implements IWhatsAppProvider {
  public readonly kind = "meta" as const;

  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(credentials: MetaTenantCredentials) {
    const version = credentials.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION;
    this.baseUrl = `https://graph.facebook.com/${version}/${credentials.phoneNumberId}/messages`;
    this.accessToken = credentials.accessToken;
  }

  async sendText(input: TextMessageInput): Promise<SendResult> {
    return this.send(input.to, {
      type: "text",
      text: { body: input.body, preview_url: input.previewUrl ?? false },
    });
  }

  async sendTemplate(input: TemplateMessageInput): Promise<SendResult> {
    return this.send(input.to, {
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(input.components ? { components: toMetaComponents(input.components) } : {}),
      },
    });
  }

  async sendMedia(input: MediaMessageInput): Promise<SendResult> {
    if (!input.link && !input.mediaId) {
      throw new WhatsAppGatewayError("sendMedia requer `link` ou `mediaId`.", { provider: "meta" });
    }

    const mediaObject: Record<string, unknown> = {
      ...(input.link ? { link: input.link } : { id: input.mediaId }),
      ...(input.caption ? { caption: input.caption } : {}),
      ...(input.kind === "document" && input.filename ? { filename: input.filename } : {}),
    };

    return this.send(input.to, {
      type: input.kind,
      [input.kind]: mediaObject,
    });
  }

  async sendInteractiveButtons(input: InteractiveButtonsMessageInput): Promise<SendResult> {
    return this.send(input.to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: input.bodyText },
        ...(input.footerText ? { footer: { text: input.footerText } } : {}),
        action: {
          buttons: input.buttons.map((button) => ({
            type: "reply",
            reply: { id: button.id, title: button.title },
          })),
        },
      },
    });
  }

  private async send(to: string, payload: Record<string, unknown>): Promise<SendResult> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    });

    const body = (await response.json().catch(() => ({}))) as MetaSendMessageResponse & MetaErrorBody;

    if (!response.ok || !body.messages?.[0]?.id) {
      throw new WhatsAppGatewayError(body.error?.message ?? `Falha ao enviar mensagem via Meta Cloud API (HTTP ${response.status}).`, {
        provider: "meta",
        statusCode: response.status,
        details: body.error ?? body,
      });
    }

    return {
      provider: "meta",
      providerMessageId: body.messages[0].id,
      to,
      raw: body,
    };
  }
}

function toMetaComponents(components: TemplateMessageInput["components"]): unknown[] {
  return (components ?? []).map((component) => {
    if (component.type === "button") {
      return {
        type: "button",
        sub_type: component.subType,
        index: component.index,
        parameters: component.parameters,
      };
    }
    return { type: component.type, parameters: component.parameters };
  });
}

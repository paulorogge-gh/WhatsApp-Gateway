import createNotificationClient, { isUnexpected } from "@azure-rest/communication-messages";
import type { NotificationContent } from "@azure-rest/communication-messages";
import type { IWhatsAppProvider } from "../../core/IWhatsAppProvider.js";
import { WhatsAppGatewayError } from "../../core/errors.js";
import type {
  InteractiveButtonsMessageInput,
  MediaMessageInput,
  SendResult,
  TemplateComponent,
  TemplateMessageInput,
  TemplateParameter,
  TextMessageInput,
} from "../../core/types.js";
import type { AzureTenantCredentials } from "../../tenancy/types.js";

interface NotificationReceipt {
  to: string;
  messageId: string;
}

interface SendNotificationSuccessBody {
  receipts: NotificationReceipt[];
}

/** `Omit` que distribui sobre cada membro de uma uniao discriminada, em vez de colapsar para os campos comuns. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Conteudo aceito por `NotificationContent`, sem os campos de roteamento
 * (`channelRegistrationId`/`to`) que o provider ja preenche em `send()`.
 * Notar que "interactive" NAO faz parte desta uniao: a versao estavel do
 * SDK (`@azure-rest/communication-messages`) ainda nao tipa/suporta
 * mensagens interativas (botoes/listas) - por isso `sendInteractiveButtons`
 * lanca erro explicito neste provider (ver abaixo).
 */
type AzureSendableContent = DistributiveOmit<NotificationContent, "channelRegistrationId" | "to">;

/**
 * Provider que envia WhatsApp atraves do Azure Communication Services
 * (Advanced Messaging for WhatsApp). Toda a cobranca (a da Meta + a taxa
 * propria de mensagem da Azure) cai numa unica fatura da Azure - mas voce
 * ainda precisa de uma WhatsApp Business Account verificada na Meta e
 * conectada ao recurso de Communication Services (ver README).
 *
 * SDK: `@azure-rest/communication-messages` (cliente REST de baixo nivel
 * gerado a partir do TypeSpec da Azure; por isso o padrao `.path(...).post(...)`
 * em vez de metodos como `client.sendText(...)`).
 */
export class AzureAcsProvider implements IWhatsAppProvider {
  public readonly kind = "azure" as const;

  private readonly client: ReturnType<typeof createNotificationClient>;
  private readonly channelRegistrationId: string;

  constructor(credentials: AzureTenantCredentials) {
    this.client = createNotificationClient(credentials.connectionString);
    this.channelRegistrationId = credentials.channelRegistrationId;
  }

  async sendText(input: TextMessageInput): Promise<SendResult> {
    return this.send(input.to, { kind: "text", content: input.body });
  }

  async sendTemplate(input: TemplateMessageInput): Promise<SendResult> {
    const { values, bindings } = toAzureTemplateBindings(input.components);
    return this.send(input.to, {
      kind: "template",
      template: {
        name: input.templateName,
        language: input.languageCode,
        ...(values.length ? { values } : {}),
        ...(bindings ? { bindings } : {}),
      },
    });
  }

  async sendMedia(input: MediaMessageInput): Promise<SendResult> {
    if (input.kind === "sticker") {
      throw new WhatsAppGatewayError("O provider Azure (Advanced Messaging) nao suporta envio de sticker.", {
        provider: "azure",
      });
    }
    if (!input.link) {
      throw new WhatsAppGatewayError(
        "O provider Azure requer `link` (mediaUri, URL publica) para midia; `mediaId` e exclusivo do provider Meta.",
        { provider: "azure" }
      );
    }

    // A API do Azure Advanced Messaging so aceita `caption` para image/document/video,
    // nao para audio.
    const supportsCaption = input.kind === "image" || input.kind === "document" || input.kind === "video";
    if (input.caption && !supportsCaption) {
      console.warn(`[whatsapp-gateway] provider azure: \`caption\` nao e suportado para kind="${input.kind}" e foi ignorado.`);
    }

    return this.send(input.to, {
      kind: input.kind,
      mediaUri: input.link,
      ...(input.caption && supportsCaption ? { caption: input.caption } : {}),
      ...(input.kind === "document" && input.filename ? { fileName: input.filename } : {}),
    });
  }

  async sendInteractiveButtons(_input: InteractiveButtonsMessageInput): Promise<SendResult> {
    throw new WhatsAppGatewayError(
      "O provider Azure (Advanced Messaging) nao suporta mensagens interativas (botoes) na versao estavel atual do SDK " +
        "(@azure-rest/communication-messages). Use o provider Meta para este recurso, ou envie um texto simples com as opcoes numeradas.",
      { provider: "azure" }
    );
  }

  private async send(to: string, content: AzureSendableContent): Promise<SendResult> {
    const result = await this.client.path("/messages/notifications:send").post({
      contentType: "application/json",
      body: {
        channelRegistrationId: this.channelRegistrationId,
        to: [to],
        ...content,
      } as NotificationContent,
    });

    if (isUnexpected(result)) {
      throw new WhatsAppGatewayError(
        `Falha ao enviar mensagem via Azure Communication Services (HTTP ${result.status}).`,
        { provider: "azure", statusCode: Number(result.status), details: result.body }
      );
    }

    const body = result.body as unknown as SendNotificationSuccessBody;
    const receipt = body.receipts?.[0];
    if (!receipt) {
      throw new WhatsAppGatewayError("Azure Communication Services nao retornou nenhum receipt de envio.", {
        provider: "azure",
        details: body,
      });
    }

    return { provider: "azure", providerMessageId: receipt.messageId, to, raw: body };
  }
}

/**
 * Traduz os componentes de template no formato Meta (usado como modelo
 * comum do pacote) para o formato `values` + `bindings` do Azure Advanced
 * Messaging. Cobre parametros do tipo texto em header/body/botoes, que e o
 * caso de uso mais comum; tipos ricos (currency, date_time, midia) caem
 * para o `fallbackValue`/link como texto simples.
 */
/** Meta usa `quick_reply`/`url`; o Azure Advanced Messaging usa `quickReply`/`url`. */
function toAzureButtonSubType(subType: "quick_reply" | "url"): "quickReply" | "url" {
  return subType === "quick_reply" ? "quickReply" : "url";
}

function toAzureTemplateBindings(components: TemplateComponent[] = []): {
  values: { kind: "text"; name: string; text: string }[];
  bindings?: {
    kind: "whatsApp";
    header?: { refValue: string }[];
    body?: { refValue: string }[];
    buttons?: { subType: "quickReply" | "url"; refValue: string }[];
  };
} {
  const values: { kind: "text"; name: string; text: string }[] = [];
  const bindings: {
    header?: { refValue: string }[];
    body?: { refValue: string }[];
    buttons?: { subType: "quickReply" | "url"; refValue: string }[];
  } = {};

  for (const component of components) {
    if (component.type === "header") {
      bindings.header = component.parameters.map((param, index) => {
        const name = `header_${index + 1}`;
        values.push({ kind: "text", name, text: paramToText(param) });
        return { refValue: name };
      });
    } else if (component.type === "body") {
      bindings.body = component.parameters.map((param, index) => {
        const name = `body_${index + 1}`;
        values.push({ kind: "text", name, text: paramToText(param) });
        return { refValue: name };
      });
    } else if (component.type === "button") {
      bindings.buttons = bindings.buttons ?? [];
      component.parameters.forEach((param, index) => {
        const name = `button_${component.index}_${index + 1}`;
        values.push({ kind: "text", name, text: paramToText(param) });
        bindings.buttons?.push({ subType: toAzureButtonSubType(component.subType), refValue: name });
      });
    }
  }

  return {
    values,
    bindings: Object.keys(bindings).length > 0 ? { kind: "whatsApp", ...bindings } : undefined,
  };
}

function paramToText(param: TemplateParameter): string {
  switch (param.type) {
    case "text":
      return param.text;
    case "currency":
      return param.currency.fallbackValue;
    case "date_time":
      return param.dateTime.fallbackValue;
    case "image":
      return param.image.link;
    case "document":
      return param.document.link;
    case "video":
      return param.video.link;
    default:
      return "";
  }
}

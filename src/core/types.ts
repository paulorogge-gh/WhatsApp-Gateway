/**
 * Modelos normalizados: o resto da aplicacao (e os projetos que consomem
 * este pacote) trabalham sempre com estes tipos, independente de o
 * provider por baixo ser a Meta Cloud API ou o Azure Communication
 * Services (Advanced Messaging for WhatsApp).
 */

export type WhatsAppProviderKind = "meta" | "azure";

// ---------------------------------------------------------------------------
// Envio (outbound)
// ---------------------------------------------------------------------------

export interface TextMessageInput {
  /** Numero do destinatario em E.164, sem "+" (ex: "5511999998888"). */
  to: string;
  body: string;
  /** Gera preview de link quando o corpo contem uma URL (suportado apenas na Meta). */
  previewUrl?: boolean;
}

export type TemplateParameter =
  | { type: "text"; text: string }
  | { type: "currency"; currency: { fallbackValue: string; code: string; amount1000: number } }
  | { type: "date_time"; dateTime: { fallbackValue: string } }
  | { type: "image"; image: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } }
  | { type: "video"; video: { link: string } };

export type TemplateComponent =
  | { type: "header"; parameters: TemplateParameter[] }
  | { type: "body"; parameters: TemplateParameter[] }
  | { type: "button"; subType: "quick_reply" | "url"; index: string; parameters: TemplateParameter[] };

export interface TemplateMessageInput {
  to: string;
  templateName: string;
  /** Codigo de idioma do template, ex: "pt_BR". */
  languageCode: string;
  /**
   * Componentes com variaveis do template (header/body/buttons).
   * Vazio/omitido para templates sem variaveis.
   */
  components?: TemplateComponent[];
}

export type MediaKind = "image" | "document" | "audio" | "video" | "sticker";

export interface MediaMessageInput {
  to: string;
  kind: MediaKind;
  /** URL publica da midia. Use `link` OU `mediaId`, nunca os dois. */
  link?: string;
  /** ID de midia previamente enviado (upload) ao provider. Somente Meta. */
  mediaId?: string;
  /** Legenda. Suportado pela Meta em image/document/video; nao suportado pelo Azure ACS. */
  caption?: string;
  /** Nome do arquivo, usado em `kind: "document"`. */
  filename?: string;
}

export interface InteractiveButtonsMessageInput {
  to: string;
  bodyText: string;
  /** Maximo de 3 botoes, regra da propria WhatsApp Business Platform. */
  buttons: { id: string; title: string }[];
  footerText?: string;
}

export interface SendResult {
  provider: WhatsAppProviderKind;
  providerMessageId: string;
  to: string;
  /** Resposta crua do provider, util para log/auditoria. */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Recebimento (inbound) e status de entrega
// ---------------------------------------------------------------------------

export type InboundMessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "location"
  | "button"
  | "interactive"
  | "unknown";

export interface InboundMessage {
  provider: WhatsAppProviderKind;
  /** Preenchido pelo WhatsAppClient depois de resolver o tenant pelo routing key do payload. */
  tenantId?: string;
  messageId: string;
  /** Numero/identificador de quem enviou a mensagem. */
  from: string;
  /**
   * Chave de roteamento presente no proprio payload do webhook:
   * phone_number_id (Meta) ou channelRegistrationId (Azure).
   * Usada para descobrir o tenant antes mesmo de `tenantId` existir.
   */
  routingKey: string;
  timestamp: string;
  type: InboundMessageType;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  caption?: string;
  raw: unknown;
}

export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export interface MessageStatusUpdate {
  provider: WhatsAppProviderKind;
  tenantId?: string;
  providerMessageId: string;
  routingKey: string;
  status: MessageStatus;
  timestamp: string;
  recipient: string;
  errorMessage?: string;
  raw: unknown;
}

export type InboundEvent =
  | { kind: "message"; message: InboundMessage }
  | { kind: "status"; status: MessageStatusUpdate };

/** Retorno especial para o handshake de validacao de subscription do Azure Event Grid. */
export interface EventGridValidationResponse {
  kind: "validation";
  /** Responda o POST do Event Grid com `{ validationResponse: code }` e HTTP 200. */
  validationResponse: string;
}

import type {
  InteractiveButtonsMessageInput,
  MediaMessageInput,
  SendResult,
  TemplateMessageInput,
  TextMessageInput,
  WhatsAppProviderKind,
} from "./types.js";

/**
 * Contrato que qualquer provider (Meta, Azure, ou um futuro terceiro) tem
 * que implementar. O WhatsAppClient so conhece esta interface, nunca os
 * detalhes de cada provider - e assim que a troca por variavel de
 * ambiente funciona sem tocar no resto da aplicacao.
 */
export interface IWhatsAppProvider {
  readonly kind: WhatsAppProviderKind;
  sendText(input: TextMessageInput): Promise<SendResult>;
  sendTemplate(input: TemplateMessageInput): Promise<SendResult>;
  sendMedia(input: MediaMessageInput): Promise<SendResult>;
  sendInteractiveButtons(input: InteractiveButtonsMessageInput): Promise<SendResult>;
}

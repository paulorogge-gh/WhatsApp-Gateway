/**
 * Erro base do modulo. Toda falha de provider (Meta ou Azure) e traduzida
 * para este tipo, com os dados originais preservados em `details` para
 * quem quiser logar/depurar a resposta crua da API.
 */
export class WhatsAppGatewayError extends Error {
  public readonly provider?: "meta" | "azure";
  public readonly statusCode?: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    options?: { provider?: "meta" | "azure"; statusCode?: number; details?: unknown; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = "WhatsAppGatewayError";
    this.provider = options?.provider;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }
}

/** Lancado quando um tenant nao e encontrado no TenantStore configurado. */
export class TenantNotFoundError extends WhatsAppGatewayError {
  constructor(tenantOrRoutingKey: string) {
    super(`Tenant nao encontrado: "${tenantOrRoutingKey}"`);
    this.name = "TenantNotFoundError";
  }
}

/** Lancado quando a assinatura de um webhook nao pode ser validada. */
export class InvalidWebhookSignatureError extends WhatsAppGatewayError {
  constructor(provider: "meta" | "azure", details?: unknown) {
    super("Assinatura de webhook invalida ou ausente.", { provider, details });
    this.name = "InvalidWebhookSignatureError";
  }
}

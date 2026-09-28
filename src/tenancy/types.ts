export interface MetaTenantCredentials {
  provider: "meta";
  /** ID do numero de telefone no WhatsApp Manager (tambem serve de routing key nos webhooks). */
  phoneNumberId: string;
  accessToken: string;
  /** App secret usado para validar a assinatura HMAC dos webhooks deste tenant. */
  appSecret: string;
  /** Verify token usado no handshake GET de configuracao do webhook. */
  webhookVerifyToken: string;
  graphApiVersion?: string;
}

export interface AzureTenantCredentials {
  provider: "azure";
  /** Connection string do recurso Azure Communication Services. */
  connectionString: string;
  /** ID do Channel Registration do WhatsApp conectado (tambem serve de routing key). */
  channelRegistrationId: string;
}

export type TenantCredentials = MetaTenantCredentials | AzureTenantCredentials;

export interface Tenant {
  /** Identificador interno do seu sistema (ex: id do cliente/empresa). */
  id: string;
  credentials: TenantCredentials;
}

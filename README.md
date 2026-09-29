# @paulorogge/whatsapp-gateway

Modulo TypeScript para integracao com o WhatsApp Business Platform, com dois
providers intercambiaveis:

- **Meta Cloud API** (chamada direta na Graph API da Meta)
- **Azure Communication Services** (Advanced Messaging for WhatsApp), que
  repassa a chamada para a Meta por baixo

E uma biblioteca standalone, sem framework HTTP embutido: as funcoes e
classes sao importadas no projeto host (Express, Fastify, NestJS, Azure
Functions, etc.) e plugadas nas rotas ja existentes. O pacote nao inclui
servidor nem dependencia de banco de dados; a unica peca implementada por
fora e o `TenantStore`, para multi-tenant.

## Indice

1. [Instalacao](#1-instalacao)
2. [Configuracao](#2-configuracao)
3. [Arquitetura](#3-arquitetura)
4. [Providers: Meta Cloud API vs Azure Communication Services](#4-providers-meta-cloud-api-vs-azure-communication-services)
5. [Enviar mensagens](#5-enviar-mensagens)
6. [Receber mensagens (webhook)](#6-receber-mensagens-webhook)
7. [Multi-tenant](#7-multi-tenant)
8. [Limitacoes conhecidas do provider Azure](#8-limitacoes-conhecidas-do-provider-azure)
9. [Scripts](#9-scripts)

---

## 1. Instalacao

O pacote e distribuido pelo repositorio git (nao publicado num registry
publico). Para instalar numa aplicacao:

```bash
npm install git+https://github.com/paulorogge-gh/WhatsApp-Gateway.git#v0.1.1
```

A tag (`#v0.1.1`) fixa a versao instalada. Ao atualizar o modulo, publique
uma tag nova no repositorio e aponte o `npm install` (ou o `package.json` da
aplicacao consumidora) para ela.

O pacote tem um script `prepare` que roda o build (`tsup`) automaticamente
apos a instalacao via git, gerando `dist/` dentro de
`node_modules/@paulorogge/whatsapp-gateway`. Nao e necessario nenhum passo
manual de build depois do `npm install`.

Alternativas de distribuicao (nao configuradas neste repositorio, mas
compativeis com a mesma base de codigo):

- **GitHub Packages**: `npm publish` com `publishConfig.registry` apontando
  para `https://npm.pkg.github.com`, e `.npmrc` correspondente no projeto
  consumidor.
- **Azure Artifacts**: feed em Azure DevOps, `publishConfig.registry`
  apontando para a URL do feed, `npm publish` com um PAT com escopo de
  packaging.

## 2. Configuracao

Copie `.env.example` para `.env` na aplicacao que for consumir o pacote e
preencha as variaveis do provider escolhido:

```bash
cp .env.example .env
```

| Variavel | Uso |
|---|---|
| `WHATSAPP_DEFAULT_PROVIDER` | `meta` ou `azure`. Usado por `createSingleTenantStoreFromEnv()`. |
| `META_GRAPH_API_VERSION` | Versao da Graph API (padrao `v21.0`). |
| `META_ACCESS_TOKEN` | Token de acesso (system user) do app na Meta. |
| `META_PHONE_NUMBER_ID` | ID do numero de telefone no WhatsApp Manager. |
| `META_APP_SECRET` | App Secret, usado para validar a assinatura HMAC dos webhooks. |
| `META_WEBHOOK_VERIFY_TOKEN` | Verify token definido na configuracao do webhook no App Dashboard. |
| `AZURE_ACS_CONNECTION_STRING` | Connection string do recurso Azure Communication Services. |
| `AZURE_CHANNEL_REGISTRATION_ID` | ID do Channel Registration do canal WhatsApp conectado no ACS. |

Essas variaveis alimentam apenas o tenant `"default"` (via
`createSingleTenantStoreFromEnv()`). Multi-tenant real usa uma implementacao
propria de `TenantStore` (secao 7).

## 3. Arquitetura

```
src/
  core/
    types.ts              modelos normalizados (mensagens, status, eventos)
    IWhatsAppProvider.ts   contrato que os providers implementam
    WhatsAppClient.ts      fachada publica para ENVIO (resolve tenant -> provider)
    errors.ts
  providers/
    createProvider.ts      fabrica: credentials.provider -> instancia do provider certo
    meta/
      MetaCloudApiProvider.ts   envio via Graph API
      metaWebhook.ts            assinatura HMAC + parser de payload de RECEBIMENTO
    azure/
      AzureAcsProvider.ts       envio via SDK @azure-rest/communication-messages
      azureWebhook.ts           parser de eventos do Event Grid (RECEBIMENTO)
  tenancy/
    types.ts, TenantStore.ts, InMemoryTenantStore.ts
  webhook/
    attachTenant.ts         resolve o tenantId de um evento recebido pela routing key
  index.ts                  API publica do pacote
```

`WhatsAppClient` e a unica classe que o codigo de aplicacao usa para enviar
mensagens: ela resolve o tenant, escolhe o provider (`MetaCloudApiProvider`
ou `AzureAcsProvider`) a partir das credenciais do tenant e delega a
chamada. O provider por baixo nunca e importado diretamente fora do pacote.

Para recebimento, cada provider expoe seu proprio parser (os formatos de
webhook da Meta e do Azure Event Grid sao diferentes), mas ambos produzem os
mesmos tipos normalizados: `InboundEvent`, `InboundMessage`,
`MessageStatusUpdate`.

## 4. Providers: Meta Cloud API vs Azure Communication Services

| | Meta Cloud API | Azure Communication Services |
|---|---|---|
| Entidade de cobranca | Meta (cartao no Business Manager) | Azure (fatura unica, inclui repasse do custo Meta) |
| Requer WABA verificada na Meta | Sim | Sim (o recurso Azure se conecta a uma WABA existente) |
| Taxa adicional | Nao | Sim, taxa de mensagem propria da Azure (US$ 0,005 por mensagem enviada/recebida) |
| API chamada pelo modulo | Graph API da Meta | API REST da Azure (`@azure-rest/communication-messages`) |
| Recursos suportados | Conjunto completo (inclui mensagens interativas) | Subconjunto (ver secao 8) |

Fontes: [Precos de Mensagens Avancadas](https://learn.microsoft.com/en-us/azure/communication-services/concepts/advanced-messaging/whatsapp/pricing), [Visao geral de Mensagens Avancadas para WhatsApp](https://learn.microsoft.com/en-us/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-overview).

O provider ativo e definido por `credentials.provider` (`"meta"` ou
`"azure"`) em cada tenant, portanto pode variar por tenant dentro da mesma
aplicacao. `createSingleTenantStoreFromEnv()` usa `WHATSAPP_DEFAULT_PROVIDER`
para decidir o provider do tenant `"default"`.

## 5. Enviar mensagens

```ts
import { WhatsAppClient, InMemoryTenantStore } from "@paulorogge/whatsapp-gateway";

const tenantStore = new InMemoryTenantStore([
  {
    id: "cliente-a",
    credentials: {
      provider: "meta", // ou "azure"
      phoneNumberId: "123456789",
      accessToken: process.env.META_ACCESS_TOKEN!,
      appSecret: process.env.META_APP_SECRET!,
      webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN!,
    },
  },
]);

const whatsapp = new WhatsAppClient(tenantStore);

await whatsapp.sendText("cliente-a", { to: "5511999998888", body: "Ola!" });

await whatsapp.sendTemplate("cliente-a", {
  to: "5511999998888",
  templateName: "confirmacao_pedido",
  languageCode: "pt_BR",
  components: [{ type: "body", parameters: [{ type: "text", text: "12345" }] }],
});

await whatsapp.sendMedia("cliente-a", {
  to: "5511999998888",
  kind: "image",
  link: "https://meusite.com/imagem.jpg",
  caption: "Segue a imagem",
});
```

Trocar o provider de um tenant e uma mudanca nas `credentials` passadas ao
`TenantStore`; nenhuma chamada a `whatsapp.sendX(...)` muda.

`sendText` so e aceito pela WhatsApp Business Platform dentro da janela de
24h aberta pela ultima mensagem recebida do destinatario. Fora dessa janela,
o envio precisa ser feito com `sendTemplate`, usando um template aprovado
previamente no WhatsApp Manager (Meta) ou equivalente.

## 6. Receber mensagens (webhook)

O pacote nao cria rotas HTTP; expoe funcoes puras para serem chamadas dentro
das rotas da aplicacao host. Exemplo com Express:

```ts
import express from "express";
import {
  verifyMetaWebhookSubscription,
  verifyMetaWebhookSignature,
  parseMetaWebhookPayload,
  parseAzureEventGridPayload,
  attachTenant,
} from "@paulorogge/whatsapp-gateway";

const app = express();

// O corpo bruto (raw body) e obrigatorio para validar a assinatura da Meta.
app.use("/webhooks/meta", express.raw({ type: "application/json" }));
app.use("/webhooks/azure", express.json());

// Meta: handshake de verificacao (GET, configurado uma vez no App Dashboard)
app.get("/webhooks/meta", (req, res) => {
  const challenge = verifyMetaWebhookSubscription(req.query as Record<string, string>, process.env.META_WEBHOOK_VERIFY_TOKEN!);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// Meta: recebimento de mensagens e status de entrega
app.post("/webhooks/meta", async (req, res) => {
  const rawBody = req.body as Buffer;
  const signature = req.header("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signature, process.env.META_APP_SECRET!)) {
    return res.sendStatus(401);
  }

  const events = parseMetaWebhookPayload(JSON.parse(rawBody.toString("utf8")));
  const withTenant = await attachTenant(events, tenantStore);

  for (const event of withTenant) {
    if (event.kind === "message") {
      console.log(`[${event.message.tenantId}] mensagem de ${event.message.from}: ${event.message.text}`);
    } else {
      console.log(`[${event.status.tenantId}] status ${event.status.status} para ${event.status.providerMessageId}`);
    }
  }

  res.sendStatus(200);
});

// Azure: Event Grid (handshake de validacao + eventos, no mesmo endpoint)
app.post("/webhooks/azure", async (req, res) => {
  const result = parseAzureEventGridPayload(req.body);

  if (!Array.isArray(result)) {
    return res.status(200).json({ validationResponse: result.validationResponse });
  }

  const withTenant = await attachTenant(result, tenantStore);
  // mesmo tratamento de `withTenant` do exemplo acima
  res.sendStatus(200);
});
```

A seguranca dos dois webhooks difere por natureza da propria plataforma: a
Meta assina cada requisicao com HMAC (validado por
`verifyMetaWebhookSignature`); o Azure Event Grid nao assina, por isso o
endpoint `/webhooks/azure` deve ser protegido por outro meio (segredo na
URL, Azure AD), conforme a documentacao do Event Grid.

## 7. Multi-tenant

`TenantStore` e a interface a implementar para multi-tenant real (varios
clientes/projetos, cada um com seu proprio numero WhatsApp e,
potencialmente, provider diferente):

```ts
import type { TenantStore, Tenant } from "@paulorogge/whatsapp-gateway";

export class PostgresTenantStore implements TenantStore {
  async getTenantById(tenantId: string): Promise<Tenant | undefined> {
    // SELECT ... FROM tenants WHERE id = $1
  }

  async getTenantByRoutingKey(routingKey: string): Promise<Tenant | undefined> {
    // routingKey = phone_number_id (Meta) ou channelRegistrationId (Azure)
    // SELECT ... FROM tenants WHERE phone_number_id = $1 OR channel_registration_id = $1
  }
}
```

`InMemoryTenantStore` (incluido no pacote) cobre desenvolvimento, testes e
o caso de poucos tenants carregados na inicializacao do processo.
`createSingleTenantStoreFromEnv()` e um atalho que monta um
`InMemoryTenantStore` com um unico tenant `"default"` a partir das
variaveis de ambiente descritas na secao 2.

## 8. Limitacoes conhecidas do provider Azure

A versao estavel atual do SDK Node (`@azure-rest/communication-messages@2.x`)
tem um subconjunto dos recursos da Graph API da Meta:

- Sem mensagens interativas (botoes/listas): `sendInteractiveButtons` lanca
  `WhatsAppGatewayError` nesse provider.
- Sem envio de sticker.
- Sem `caption` em mensagens de audio (image/document/video suportam).
- Templates com variaveis: o modulo converte automaticamente para o formato
  `values`/`bindings` da Azure, mas cobre apenas parametros de texto.
  Parametros ricos (currency, date_time, midia dentro do template) sao
  enviados como texto (`fallbackValue`/link).

Nenhuma dessas limitacoes existe no provider Meta.

## 9. Scripts

```bash
npm install       # instala dependencias (e roda o build via "prepare")
npm run typecheck # tsc --noEmit
npm test          # roda a suite (vitest)
npm run build     # gera dist/ (esm + cjs + .d.ts) via tsup
```

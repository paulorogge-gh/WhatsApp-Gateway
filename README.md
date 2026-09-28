# @paulorogge/whatsapp-gateway

Modulo TypeScript plugavel para integracao com o **WhatsApp Business Platform**,
com dois providers intercambiaveis:

- **Meta Cloud API** - chamada direta na Graph API da Meta.
- **Azure Communication Services (Advanced Messaging for WhatsApp)** - chamada via SDK da Azure, que repassa para a Meta por baixo.

E uma **biblioteca standalone, sem framework HTTP embutido**: voce importa as
funcoes/classes no seu projeto (Express, Fastify, NestJS, Azure Functions,
o que for) e pluga nas suas proprias rotas. Nao ha servidor, nao ha
dependencia de banco de dados - a unica coisa que voce implementa por fora
e o `TenantStore` (para multi-tenant "de verdade").

---

## 1. A duvida Azure x Meta (billing)

**Existe sim** uma forma de nunca colocar cartao de credito direto na Meta:
o **Azure Communication Services - Advanced Messaging for WhatsApp**.
Quando voce conecta sua WhatsApp Business Account (WABA) ao recurso da
Azure, a Azure vira a entidade de cobranca: a fatura da Azure inclui o
custo repassado da Meta **mais** uma taxa propria da Azure por mensagem
(US$ 0,005 por mensagem enviada/recebida, segundo a documentacao oficial).

O que isso muda, na pratica, e o que **nao** muda:

| | Meta Cloud API direta | Azure Communication Services |
|---|---|---|
| Quem cobra | Meta (cartao no Business Manager) | Azure (fatura unica) |
| Precisa de WABA verificada na Meta? | Sim | **Sim, tambem** - a Azure conecta numa WABA existente, nao substitui o cadastro |
| Taxa extra alem do custo Meta | Nao | Sim, taxa de mensagem da propria Azure |
| API que voce chama | Graph API da Meta | API REST da Azure (`@azure-rest/communication-messages`) |
| Maturidade/documentacao | Padrao de mercado, mais madura | Mais nova, com menos recursos (ex: sem mensagens interativas na versao estavel atual do SDK Node) |

Ou seja: da para consolidar tudo na fatura da Azure, mas isso nao elimina o
cadastro na Meta (Business Manager + WABA), so muda quem te cobra pelo uso.
Por isso este modulo trata os dois como **providers igualmente validos**,
selecionaveis por variavel de ambiente (`WHATSAPP_DEFAULT_PROVIDER=meta|azure`)
ou por tenant.

Fontes: [Preco de Mensagens Avancadas - Azure Communication Services](https://learn.microsoft.com/en-us/azure/communication-services/concepts/advanced-messaging/whatsapp/pricing), [Visao geral de Mensagens Avancadas para WhatsApp](https://learn.microsoft.com/en-us/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-overview).

---

## 2. Arquitetura

```
src/
  core/
    types.ts            modelos normalizados (mensagens, status, eventos)
    IWhatsAppProvider.ts contrato que os providers implementam
    WhatsAppClient.ts    fachada publica para ENVIO (resolve tenant -> provider)
    errors.ts
  providers/
    createProvider.ts    fabrica: credentials.provider -> instancia do provider certo
    meta/
      MetaCloudApiProvider.ts   envio via Graph API
      metaWebhook.ts            assinatura HMAC + parser de payload de RECEBIMENTO
    azure/
      AzureAcsProvider.ts       envio via SDK @azure-rest/communication-messages
      azureWebhook.ts           parser de eventos do Event Grid (RECEBIMENTO)
  tenancy/
    types.ts, TenantStore.ts, InMemoryTenantStore.ts
  webhook/
    attachTenant.ts       resolve o tenantId de um evento recebido pela routing key
  index.ts                 tudo que e exportado publicamente
```

Principio central: **o resto da sua aplicacao nunca importa `MetaCloudApiProvider`
ou `AzureAcsProvider` diretamente** para enviar mensagens - ela usa
`WhatsAppClient`, que escolhe o provider certo a partir das credenciais do
tenant resolvido. Trocar de provider e trocar dado (credenciais), nunca
codigo de chamada.

Para RECEBER mensagens, cada provider tem seu proprio parser (os formatos de
webhook da Meta e do Azure Event Grid sao bem diferentes), mas ambos
produzem os mesmos tipos normalizados (`InboundEvent`, `InboundMessage`,
`MessageStatusUpdate`).

---

## 3. Instalacao

Este pacote nao esta no npm publico (`private` de proposito). Publique num
registry privado e instale normalmente:

### Opcao A - GitHub Packages (mais simples, gratis para repos privados)

```bash
# dentro do repositorio do pacote
npm publish
```

Com um `.npmrc` no projeto que for consumir:

```
@paulorogge:registry=https://npm.pkg.github.com
```

```bash
npm install @paulorogge/whatsapp-gateway
```

### Opcao B - Azure Artifacts (faz sentido se voce ja centraliza tudo na Azure)

Crie um feed em Azure DevOps > Artifacts, aponte o `publishConfig.registry`
do `package.json` para a URL do feed e rode `npm publish` com um token de
acesso (PAT) com escopo de packaging.

### Opcao C - instalar direto do Git (sem registry)

```bash
npm install git+https://github.com/<sua-org>/whatsapp-gateway.git#v0.1.0
```

Qualquer uma das tres formas resolve o objetivo original: **plugar o
modulo num projeto novo com um `npm install`**, sem copiar pastas.

---

## 4. Configuracao

Copie `.env.example` para `.env` e preencha o provider que for usar.
Para multi-tenant real, essas variaveis viram apenas o "tenant default";
os demais tenants vem do seu `TenantStore` (banco de dados).

```bash
cp .env.example .env
```

---

## 5. Uso - enviar mensagens

```ts
import { WhatsAppClient, InMemoryTenantStore } from "@paulorogge/whatsapp-gateway";

// Single-tenant simples (le do .env) - ou monte o InMemoryTenantStore manualmente:
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

Trocar esse mesmo cliente para Azure e so mudar as `credentials` no
`TenantStore` - nenhuma linha acima muda.

---

## 6. Uso - receber mensagens (webhook)

O pacote **nao** cria rotas HTTP; ele expoe funcoes puras para voce plugar
onde quiser. Exemplo com Express:

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

// Importante: capturar o RAW body para validar a assinatura da Meta.
app.use("/webhooks/meta", express.raw({ type: "application/json" }));
app.use("/webhooks/azure", express.json());

// --- Meta: handshake de verificacao (uma vez, ao configurar o webhook) ---
app.get("/webhooks/meta", (req, res) => {
  const challenge = verifyMetaWebhookSubscription(req.query as Record<string, string>, process.env.META_WEBHOOK_VERIFY_TOKEN!);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// --- Meta: recebimento de mensagens/status ---
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

// --- Azure: Event Grid (validacao + eventos, no mesmo endpoint) ---
app.post("/webhooks/azure", async (req, res) => {
  const result = parseAzureEventGridPayload(req.body);

  if (!Array.isArray(result)) {
    // handshake de validacao da subscription
    return res.status(200).json({ validationResponse: result.validationResponse });
  }

  const withTenant = await attachTenant(result, tenantStore);
  // mesmo tratamento de `withTenant` do exemplo acima
  res.sendStatus(200);
});
```

Note que a seguranca dos dois webhooks e diferente por natureza da propria
plataforma: a Meta assina cada requisicao (HMAC), o Azure Event Grid nao -
proteja o endpoint `/webhooks/azure` com um segredo na URL e/ou Azure AD,
conforme a documentacao do Event Grid.

---

## 7. Multi-tenant

`TenantStore` e a unica interface que voce precisa implementar para
multi-tenant real (varios clientes/projetos, cada um com seu proprio numero
WhatsApp e, potencialmente, provider diferente):

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

`InMemoryTenantStore` (incluso) cobre desenvolvimento, testes e o caso de
poucos tenants carregados na inicializacao do processo.

---

## 8. Limitacoes conhecidas do provider Azure

A versao estavel atual do SDK Node (`@azure-rest/communication-messages@2.x`)
tem menos recursos que a Graph API da Meta:

- **Sem mensagens interativas** (botoes/listas) - `sendInteractiveButtons`
  lanca `WhatsAppGatewayError` nesse provider. Use o provider Meta para isso.
- **Sem envio de sticker.**
- **Sem `caption` em audio** (image/document/video suportam).
- Templates com variaveis: o modulo converte automaticamente para o formato
  `values`/`bindings` da Azure, mas so para parametros de texto (cobre a
  maioria dos casos). Parametros ricos (currency, date_time, midia dentro do
  template) sao enviados como texto (`fallbackValue`/link).

Nenhuma dessas limitacoes existe no provider Meta.

---

## 9. Scripts

```bash
npm install       # instala dependencias
npm run typecheck # tsc --noEmit
npm test          # roda a suite (vitest)
npm run build     # gera dist/ (esm + cjs + .d.ts) via tsup
```

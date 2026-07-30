# Pesquisa de Evasão — Subprojeto A: Fundação Segura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o envio da pesquisa de evasão em uma fundação segura: usuário autenticado, permissão por unidade, assinatura automática de Fabi/Jéssica, prévia idêntica ao envio, modo teste isolado, dados paginados e RLS sem leitura ampla de respostas privadas.

**Architecture:** O navegador deixa de controlar operador, mensagem e telefone final. A Edge Function valida o JWT, resolve o usuário interno e suas permissões, renderiza e persiste uma prévia imutável e, na confirmação, envia exatamente o snapshot aprovado. O banco concentra templates, assinaturas, status, auditoria e RLS. Escritas operacionais passam pela Edge/RPC governada; o frontend mantém apenas leitura autorizada e confirmação explícita.

**Tech Stack:** React 19, TypeScript, Supabase Auth/Postgres/RLS/Edge Functions, Deno tests, Node `node:test`, UAZAPI/WAHA.

---

## Premissas e fronteiras

- Este plano parte da spec aprovada em `docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md`.
- Preservar as correções locais já existentes em:
  - `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`;
  - `supabase/functions/enviar-pesquisa-evasao/index.ts`;
  - `supabase/functions/webhook-whatsapp-inbox/index.ts`;
  - `supabase/functions/enviar-pesquisa-evasao/contract.ts`;
  - `supabase/functions/enviar-pesquisa-evasao/contract.test.ts`;
  - `supabase/migrations/20260730134500_pesquisa_evasao_movimentacao_canonica.sql`;
  - `tests/pesquisaEvasaoCanonica.test.mjs`.
- Não aplicar migração nem fazer deploy antes de revisar o diff local e confirmar o alvo Supabase `ouqwbbermlzqqvtqwlul`.
- Não alterar timing de disparo nem política de lembrete; são decisões do Subprojeto C.
- Não dar acesso bruto a respostas para Lia, Sol, Fábio, Mila ou roles restritos. Agentes consumirão contratos governados em subprojetos posteriores.
- A implementação deve manter a pesquisa pós-1ª aula intacta; a regressão completa desse fluxo será coberta no Subprojeto B.

## Contratos decididos

### Permissões

| Código | Uso |
|---|---|
| `sucesso_aluno.evasao.ver` | listar cabeçalhos e ler conversa privada da unidade autorizada |
| `sucesso_aluno.evasao.enviar` | gerar prévia e confirmar envio |
| `sucesso_aluno.evasao.revisar` | revisar/concluir resposta |
| `sucesso_aluno.evasao.gerir_acoes` | criar e acompanhar ações |
| `sucesso_aluno.evasao.relatorios` | consultar apenas read models agregados |
| `sucesso_aluno.evasao.modo_teste` | informar telefone de teste autorizado |

### Ações da Edge Function

```ts
type EnviarPesquisaRequest =
  | {
      acao: 'previsualizar';
      evasao_id: number;
      modo_teste: boolean;
      telefone_teste?: string;
    }
  | {
      acao: 'confirmar';
      preview_id: string;
    };
```

O request não aceita `operador`, `mensagem`, `assinatura_nome`, `telefone_override` em produção nem qualquer campo equivalente. Campo desconhecido sensível deve ser rejeitado com `400`.

### Status

```text
envio_status:
nao_enviado | enviando | enviado | falhou | entregue | lido

resposta_status:
sem_resposta | coletando | pronta_para_revisao | em_revisao |
revisada | expirada | invalidada | recusada_opt_out
```

`pesquisa_evasao.status` permanece como compatibilidade temporária e é derivado dos dois campos novos.

## Task 1: Fixar o contrato de banco e segurança em testes

**Files:**

- Create: `tests/pesquisaEvasaoFundacaoSegura.test.mjs`
- Modify: `tests/pesquisaEvasaoCanonica.test.mjs`
- Target migration: `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`

- [ ] **Step 1: Escrever os testes que falham**

Cobrir por leitura estrutural da migração:

```js
test('remove policy ALL aberta de pesquisa_evasao', () => {
  assert.match(sql, /drop policy if exists pesquisa_evasao_all/i);
  assert.doesNotMatch(sql, /for all\s+to\s+authenticated\s+using\s*\(\s*true\s*\)/i);
});

test('RLS usa permissoes do dominio e unidade da linha', () => {
  assert.match(sql, /sucesso_aluno\.evasao\.ver/i);
  assert.match(sql, /fn_usuario_atual_tem_permissao/i);
  assert.match(sql, /unidade_id/i);
});

test('roles de agentes nao recebem resposta privada', () => {
  assert.match(sql, /revoke[\s\S]+mila_acesso_restrito/i);
  assert.match(sql, /revoke[\s\S]+sol_acesso_restrito/i);
});

test('novas tabelas privadas nascem com RLS e grants minimos', () => {
  for (const table of [
    'pesquisa_evasao_templates',
    'pesquisa_evasao_assinaturas',
    'pesquisa_evasao_previews',
    'pesquisa_evasao_mensagens',
    'pesquisa_evasao_transcricoes',
    'pesquisa_evasao_analises',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});
```

- [ ] **Step 2: Executar e confirmar a falha**

Run:

```powershell
node --test tests/pesquisaEvasaoFundacaoSegura.test.mjs
```

Expected: FAIL informando que a migração da fundação ainda não existe.

- [ ] **Step 3: Acrescentar testes para status, preview e isolamento de teste**

Exigir:

- colunas novas de entrega/resposta;
- `modo_teste`;
- telefone de destino em snapshot, sem alteração do cadastro do aluno;
- preview com expiração, hash e uso único;
- chave idempotente;
- vínculo de assinatura, usuário autenticado, template e caixa;
- constraints que incluam `recusada_opt_out`.

- [ ] **Step 4: Commit dos testes vermelhos**

```powershell
git add -- tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoCanonica.test.mjs
git commit -m "test: definir fundacao segura da pesquisa de evasao"
```

## Task 2: Criar schema, permissões e RLS da fundação

**Files:**

- Create: `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`
- Test: `tests/pesquisaEvasaoFundacaoSegura.test.mjs`

- [ ] **Step 1: Criar catálogo de permissões de forma idempotente**

Inserir os seis códigos em `public.permissoes`, respeitando as colunas reais verificadas no banco. Antes de escrever a migração, rodar somente leitura:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('permissoes', 'perfis', 'perfil_permissoes', 'usuario_perfis')
order by table_name, ordinal_position;
```

A migração não deve atribuir permissões por comparação frouxa de nome. Criar os códigos primeiro; a atribuição a Fabi/Jéssica deve usar IDs de `usuarios` e perfis confirmados no checklist de rollout.

- [ ] **Step 2: Criar tabelas de configuração e auditoria**

Implementar:

```sql
create table public.pesquisa_evasao_assinaturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id integer not null references public.usuarios(id),
  nome_assinatura text not null,
  cargo_assinatura text not null default 'Sucesso do Aluno',
  ativo boolean not null default true,
  valido_desde timestamptz not null default now(),
  valido_ate timestamptz,
  criado_em timestamptz not null default now()
);

create unique index pesquisa_evasao_assinaturas_usuario_ativa_uidx
  on public.pesquisa_evasao_assinaturas (usuario_id)
  where ativo;

create table public.pesquisa_evasao_templates (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  versao integer not null,
  publico text not null check (publico in ('direto', 'responsavel')),
  corpo text not null,
  ativo boolean not null default false,
  criado_por_usuario_id integer references public.usuarios(id),
  criado_em timestamptz not null default now(),
  unique (chave, versao, publico)
);

create table public.pesquisa_evasao_previews (
  id uuid primary key default gen_random_uuid(),
  evasao_id integer not null references public.movimentacoes_admin(id),
  usuario_id integer not null references public.usuarios(id),
  auth_user_id uuid not null,
  assinatura_id uuid not null references public.pesquisa_evasao_assinaturas(id),
  template_id uuid not null references public.pesquisa_evasao_templates(id),
  caixa_id integer not null references public.whatsapp_caixas(id),
  modo_teste boolean not null,
  destinatario_tipo text not null check (destinatario_tipo in ('aluno', 'responsavel', 'teste')),
  telefone_destino text not null,
  mensagem_renderizada text not null,
  payload_hash text not null,
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default now()
);
```

Se `usuarios.id` não for `integer` na inspeção real, usar o tipo exato do FK; não fazer cast silencioso.

- [ ] **Step 3: Criar antecipadamente as tabelas privadas usadas por B**

Criar o schema mínimo, ainda sem ativar o novo roteamento:

- `pesquisa_evasao_mensagens`;
- `pesquisa_evasao_transcricoes`;
- `pesquisa_evasao_analises`.

Campos obrigatórios:

```text
pesquisa_evasao_mensagens:
id, pesquisa_id nullable, caixa_id, direcao, provider_message_id,
telefone_normalizado, tipo, texto, audio_storage_path,
provider_created_at, recebido_em, resolution_status,
substantividade, correlation_id, criado_em

pesquisa_evasao_transcricoes:
id, mensagem_id, versao, status, texto, erro_codigo,
modelo, criado_em, concluido_em

pesquisa_evasao_analises:
id, pesquisa_id, versao, texto_consolidado, status,
revisor_usuario_id, revisado_em, criado_em
```

Restrições:

- `unique (caixa_id, provider_message_id)` quando o ID não for nulo;
- `unique (mensagem_id, versao)` para transcrição;
- `unique (pesquisa_id, versao)` para análise;
- nenhuma URL pública de mídia;
- texto bruto só nas tabelas privadas.

- [ ] **Step 4: Evoluir `pesquisa_evasao` de forma aditiva**

Adicionar, sem remover as colunas legadas:

```text
envio_status, resposta_status, modo_teste,
telefone_destino_snapshot, caixa_id,
executado_por_usuario_id, executado_por_auth_user_id,
assinatura_id, assinatura_nome_snapshot,
template_id, template_versao,
mensagem_renderizada, provider_message_id,
idempotency_key, primeira_interacao_em,
ultima_interacao_em, pronta_para_revisao_em
```

Backfill:

- `status='respondido'` → `envio_status='enviado'`, `resposta_status='pronta_para_revisao'`;
- `status='enviado'` → `envio_status='enviado'`, `resposta_status='sem_resposta'`;
- falhas/pendências mantêm equivalência documentada;
- registros existentes ficam `modo_teste=false` somente porque não há evidência contrária; anotar a limitação em comentário SQL.

- [ ] **Step 5: Reescrever grants e policies**

Para `pesquisa_evasao` e cada tabela privada:

1. `enable row level security`;
2. remover `pesquisa_evasao_all` e qualquer policy `USING (true)`;
3. revogar `ALL` de `anon`, `authenticated`, `mila_acesso_restrito`, `sol_acesso_restrito`;
4. conceder apenas `SELECT` a `authenticated`;
5. policy de leitura exige:

```sql
public.fn_usuario_atual_tem_permissao(
  'sucesso_aluno.evasao.ver'::varchar,
  unidade_id_da_pesquisa
)
```

Nas tabelas filhas, obter a unidade por `exists` no cabeçalho. Não duplicar `unidade_id` apenas para simplificar policy.

Não criar policy de escrita direta para o navegador. Edge Functions usam service role depois de autenticar/autorização; revisão humana ganhará RPC governada no B/C.

- [ ] **Step 6: Proteger RPCs legadas**

Substituir as implementações de:

- `listar_evadidos_para_pesquisa(uuid, integer, integer, varchar, integer, integer)`;
- `stats_pesquisa_evasao(uuid, integer, integer)`;
- `criar_pesquisa_evasao(integer, text)`;
- `pode_enviar_pesquisa_evasao(integer)`.

Regras:

- `listar` e `stats` exigem `sucesso_aluno.evasao.ver` e escopo de unidade;
- `criar_pesquisa_evasao` deixa de ser executável por `authenticated` e fica somente `service_role`;
- nenhuma RPC retorna resposta bruta a quem possui apenas `relatorios`;
- `anon` perde `EXECUTE`;
- `search_path = public, pg_temp`;
- funções `SECURITY DEFINER` validam permissão explicitamente.

- [ ] **Step 7: Executar testes estruturais**

Run:

```powershell
node --test tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoCanonica.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Validar a migração em PostgreSQL local**

Run, com stack local ativa:

```powershell
npx supabase db reset
npx supabase db lint --local
```

Expected: migração aplicada e lint sem erro novo relacionado ao domínio.

Se o PostgreSQL local não estiver disponível, não aplicar em produção para “testar”. Registrar o bloqueio e usar CI/ambiente de homologação.

- [ ] **Step 9: Commit**

```powershell
git add -- supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoCanonica.test.mjs
git commit -m "feat: criar fundacao e rls da pesquisa de evasao"
```

## Task 3: Criar contrato puro de autenticação, assinatura e renderização

**Files:**

- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.test.ts`
- Create: `supabase/functions/enviar-pesquisa-evasao/auth.ts`
- Create: `supabase/functions/enviar-pesquisa-evasao/auth.test.ts`

- [ ] **Step 1: Escrever testes vermelhos do request**

Cobrir:

- rejeição de `operador`;
- rejeição de `mensagem`;
- rejeição de `telefone_override`;
- `telefone_teste` aceito apenas quando `modo_teste=true`;
- ação `confirmar` aceita somente `preview_id`;
- telefone de produção sempre vem dos snapshots canônicos;
- número de teste não é gravado em `alunos` nem `movimentacoes_admin`.

- [ ] **Step 2: Escrever testes vermelhos de template**

Criar funções puras:

```ts
export function validarRequest(input: unknown): EnviarPesquisaRequest;
export function renderizarMensagem(input: RenderInput): string;
export function hashPreview(input: PreviewSnapshot): Promise<string>;
export function mascararTelefone(telefone: string): string;
```

Testar variantes:

- aluno adulto;
- responsável por menor;
- assinatura Fabi;
- assinatura Jéssica;
- placeholders ausentes causam erro, não texto quebrado;
- mesma entrada produz mesmo hash;
- mudança de um caractere muda o hash.

- [ ] **Step 3: Escrever testes vermelhos de identidade**

`auth.ts` deve expor uma função testável que recebe adapters:

```ts
export interface ContextoOperador {
  usuarioId: number;
  authUserId: string;
  nomeUsuario: string;
  unidadeId: string | null;
  assinaturaId: string;
  assinaturaNome: string;
}
```

Casos:

- token ausente → `401`;
- token inválido → `401`;
- usuário sem linha ativa em `usuarios` → `403`;
- assinatura inativa/ausente → `403`;
- sem `sucesso_aluno.evasao.enviar` → `403`;
- teste sem `sucesso_aluno.evasao.modo_teste` → `403`;
- Fabi/Jéssica recebem sua própria assinatura;
- o request não consegue trocar a identidade.

- [ ] **Step 4: Executar e confirmar a falha**

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts
```

Expected: FAIL nos contratos novos.

- [ ] **Step 5: Implementar o mínimo para passar**

Usar `crypto.subtle.digest('SHA-256', ...)` para o hash do snapshot. A autorização deve distinguir:

1. validação criptográfica do token via `auth.getUser`;
2. resolução de `usuarios.auth_user_id`;
3. verificação explícita de `usuario_tem_permissao(usuario.id, codigo, unidade_id)`;
4. resolução de uma única assinatura ativa.

Não usar `fn_usuario_atual_tem_permissao` com o cliente service role, porque `auth.role()='service_role'` faria a checagem sempre passar.

- [ ] **Step 6: Executar testes**

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- supabase/functions/enviar-pesquisa-evasao/contract.ts supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts
git commit -m "feat: validar identidade e preview da pesquisa"
```

## Task 4: Implementar a Edge em duas fases

**Files:**

- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`
- Modify: `supabase/config.toml`
- Create: `tests/pesquisaEvasaoEdgeSegura.test.mjs`

- [ ] **Step 1: Escrever teste estrutural vermelho**

Exigir:

- `[functions.enviar-pesquisa-evasao] verify_jwt = true`;
- leitura do `Authorization`;
- `auth.getUser`;
- ausência de default `operador='sistema'`;
- ações `previsualizar` e `confirmar`;
- `preview_id` consumido atomicamente;
- nenhuma atualização de `alunos`/`movimentacoes_admin` com telefone de teste;
- envio grava `executado_por_*`, assinatura, template e mensagem renderizada.

- [ ] **Step 2: Implementar `previsualizar`**

Ordem obrigatória:

1. validar método e JWT;
2. validar request;
3. carregar movimentação canônica com `is_movimentacao_admin_retencao_valida`;
4. validar unidade e `sucesso_aluno.evasao.enviar`;
5. se teste, validar `modo_teste` e permissão própria;
6. resolver assinatura ativa do usuário;
7. resolver template ativo por público;
8. resolver destinatário e telefone;
9. renderizar no servidor;
10. persistir `pesquisa_evasao_previews` com hash e expiração de 10 minutos;
11. retornar dados de exibição, telefone mascarado e `preview_id`.

Resposta esperada:

```json
{
  "preview_id": "uuid",
  "expira_em": "ISO-8601",
  "aluno": "...",
  "destinatario": "...",
  "destinatario_tipo": "aluno|responsavel|teste",
  "telefone_mascarado": "55••••••1234",
  "assinatura": "Fabi",
  "mensagem": "...",
  "modo_teste": false,
  "alertas": []
}
```

- [ ] **Step 3: Implementar confirmação atômica**

Criar RPC service-only na migração ou uma segunda migração pequena, caso necessário:

```sql
claim_pesquisa_evasao_preview(p_preview_id uuid, p_auth_user_id uuid)
```

Ela deve:

- fazer `FOR UPDATE`;
- validar autor, expiração e `consumido_em is null`;
- marcar `consumido_em`;
- criar/atualizar cabeçalho com `envio_status='enviando'`;
- devolver snapshot completo;
- impedir clique duplo.

A Edge envia somente o `mensagem_renderizada` do snapshot. Em sucesso:

- `envio_status='enviado'`;
- `status='enviado'` para compatibilidade;
- `provider_message_id`;
- `enviado_em`.

Em falha conhecida:

- `envio_status='falhou'`;
- erro técnico sanitizado;
- preview continua consumido;
- nova tentativa exige nova prévia.

Timeout incerto não deve disparar novamente sem reconciliação pelo `idempotency_key`.

- [ ] **Step 4: Configurar JWT no repositório**

Acrescentar:

```toml
[functions.enviar-pesquisa-evasao]
verify_jwt = true
```

O deploy não deve usar `--no-verify-jwt`.

- [ ] **Step 5: Rodar testes**

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts
node --test tests/pesquisaEvasaoEdgeSegura.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/functions/enviar-pesquisa-evasao/index.ts supabase/config.toml tests/pesquisaEvasaoEdgeSegura.test.mjs
git commit -m "feat: exigir preview autenticado no envio de evasao"
```

## Task 5: Substituir o clique direto pela prévia obrigatória

**Files:**

- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Create: `src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx`
- Create: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Create: `tests/pesquisaEvasaoPreviewFrontend.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos do frontend**

Exigir:

- botão chama `acao:'previsualizar'`;
- request não contém `operador`;
- modal mostra aluno, destinatário, telefone mascarado, unidade, curso, professor, assinatura, mensagem, ambiente e alertas;
- apenas “Confirmar envio” chama `acao:'confirmar'`;
- confirmação usa somente `preview_id`;
- modal expira e força nova prévia;
- modo teste é visualmente distinto;
- erro HTTP usa o corpo JSON retornado pela Edge.

- [ ] **Step 2: Criar tipos explícitos**

```ts
export interface PesquisaEvasaoPreview {
  preview_id: string;
  expira_em: string;
  aluno: string;
  destinatario: string;
  destinatario_tipo: 'aluno' | 'responsavel' | 'teste';
  telefone_mascarado: string;
  unidade: string;
  curso: string | null;
  professor: string | null;
  assinatura: string;
  mensagem: string;
  modo_teste: boolean;
  alertas: string[];
}
```

- [ ] **Step 3: Implementar o modal**

Regras de UX:

- foco inicial no título;
- `aria-labelledby` e descrição do efeito irreversível;
- botão de confirmar mostra o nome de quem assina;
- botão bloqueado durante confirmação;
- fechar não envia;
- não mostrar telefone completo;
- alertas de cadastro aparecem acima da confirmação;
- em teste, cabeçalho amarelo “TESTE — não será enviado ao aluno”.

- [ ] **Step 4: Remover identidade e mensagem do cliente**

Em `PesquisaEvasaoTab.tsx`:

- remover `operador: 'sistema'`;
- renomear `telefoneOverride` para `telefone_teste` apenas no request de prévia;
- manter a validação local de teste como conveniência, mas confiar na validação do servidor;
- não montar a mensagem no React;
- recarregar a listagem somente após confirmação bem-sucedida.

- [ ] **Step 5: Executar testes e build**

```powershell
node --test tests/pesquisaEvasaoPreviewFrontend.test.mjs
npm run build
```

Expected: PASS e build sem erro TypeScript/Vite.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx src/components/App/SucessoCliente/pesquisaEvasao.types.ts tests/pesquisaEvasaoPreviewFrontend.test.mjs
git commit -m "feat: adicionar preview obrigatorio da pesquisa"
```

## Task 6: Paginação, bloqueios e correção governada de cadastro

**Files:**

- Modify: `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`
- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Create: `tests/pesquisaEvasaoListagemSegura.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos**

Cobrir:

- listagem retorna `total_count`;
- UI não fixa silenciosamente `p_limite:100`;
- existem controles de próxima/anterior ou carregamento incremental;
- saída sem telefone continua visível com `bloqueio_codigo`;
- motivo legado aparece quando catálogo está ausente;
- colaborador/professor é flag explícita, não inferência por nome;
- nenhuma escrita direta em `movimentacoes_admin` ou `alunos` permanece no componente.

- [ ] **Step 2: Evoluir a RPC de listagem**

Retornar:

```text
total_count
bloqueio_codigo:
  null | sem_aluno | sem_telefone | telefone_invalido |
  motivo_nao_catalogado | publico_interno | pesquisa_aberta_no_mesmo_numero
motivo_catalogado
motivo_legado
publico_tipo
elegivel_envio
elegibilidade_regra
```

Aplicar permissão e escopo antes da paginação. A contagem deve refletir os mesmos filtros.

- [ ] **Step 3: Remover edição direta de telefone**

Remover `salvarTelefone` e qualquer:

```ts
supabase.from('movimentacoes_admin').update(...)
supabase.from('alunos').update(...)
```

Na primeira entrega, exibir “Corrigir no cadastro do aluno” e abrir a ficha canônica existente. Se a navegação contextual ainda não existir, deixar o item bloqueado e emitir uma ação interna; não criar um segundo cadastro de contato dentro da pesquisa.

- [ ] **Step 4: Implementar paginação**

Usar páginas de 50 registros, resetar para a página 1 quando filtros mudarem e exibir:

```text
Mostrando 1–50 de 283
```

- [ ] **Step 5: Testar**

```powershell
node --test tests/pesquisaEvasaoListagemSegura.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx src/components/App/SucessoCliente/pesquisaEvasao.types.ts tests/pesquisaEvasaoListagemSegura.test.mjs
git commit -m "feat: paginar e sinalizar bloqueios da evasao"
```

## Task 7: Tipos gerados, RLS real e matriz de acesso

**Files:**

- Modify: `src/types/supabase.ts`
- Create: `scripts/verify-pesquisa-evasao-rls.sql`
- Create: `docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md`

- [ ] **Step 1: Regenerar tipos contra o schema validado**

Após migração em ambiente local/homologação:

```powershell
npx supabase gen types typescript --local | Out-File -Encoding utf8 src/types/supabase.ts
```

Se a geração for contra projeto remoto, confirmar explicitamente o project ref antes e não aplicar nenhuma escrita.

- [ ] **Step 2: Criar verificação SQL de RLS**

O script deve verificar:

- ausência de policy `ALL ... true`;
- ausência de grants de escrita para `anon` e `authenticated`;
- ausência de acesso direto de `mila_acesso_restrito` e `sol_acesso_restrito`;
- usuário sem permissão não lê;
- usuário com `ver` lê apenas sua unidade;
- usuário com `relatorios` sem `ver` não lê texto bruto;
- service role continua operando;
- todas as tabelas filhas têm RLS habilitada.

Use transações e `set local role`; o script não deixa dados de teste após `rollback`.

- [ ] **Step 3: Documentar a atribuição de Fabi e Jéssica**

O runbook deve exigir esta consulta somente leitura:

```sql
select id, auth_user_id, nome, email, perfil, unidade_id, ativo
from public.usuarios
where lower(nome) like any (array['%fabi%', '%jéssica%', '%jessica%'])
order by nome;
```

Antes do go-live:

- cada pessoa deve ter exatamente um `auth_user_id`;
- cada pessoa deve ter exatamente uma assinatura ativa;
- permissões `ver` e `enviar` devem estar efetivas;
- `modo_teste` só para quem foi aprovado;
- validar cada unidade necessária;
- não conceder `admin` apenas para fazer a tela funcionar.

- [ ] **Step 4: Rodar verificação completa**

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts
node --test tests/pesquisaEvasaoCanonica.test.mjs tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoPreviewFrontend.test.mjs tests/pesquisaEvasaoListagemSegura.test.mjs
npm run build
npx supabase db lint --local
```

Expected: tudo PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/types/supabase.ts scripts/verify-pesquisa-evasao-rls.sql docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md
git commit -m "docs: fechar rollout e verificacao da fundacao de evasao"
```

## Task 8: Homologação e rollout controlado

**Files:**

- Verify: `docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md`

- [ ] **Step 1: Homologar com quatro identidades**

Executar:

1. usuário anônimo;
2. usuário autenticado sem permissão;
3. Fabi;
4. Jéssica.

Comprovar:

- anônimo recebe `401`;
- sem permissão recebe `403`;
- Fabi vê e envia assinatura Fabi;
- Jéssica vê e envia assinatura Jéssica;
- nenhuma delas troca identidade pelo DevTools;
- outra unidade é negada;
- modo teste não altera cadastro nem analytics.

- [ ] **Step 2: Conferir prévia versus mensagem real**

Para um número interno autorizado:

- salvar screenshot da prévia;
- confirmar;
- comparar texto recebido byte a byte com `mensagem_renderizada`;
- validar `preview_id` consumido;
- repetir clique e confirmar `409`, sem segundo envio.

- [ ] **Step 3: Fazer rollout**

Ordem:

1. backup lógico/DDL das tabelas afetadas;
2. aplicar migração;
3. atribuir permissões e assinaturas confirmadas;
4. validar `scripts/verify-pesquisa-evasao-rls.sql`;
5. deploy de `enviar-pesquisa-evasao` com JWT;
6. deploy do frontend;
7. smoke test em modo teste;
8. um envio real autorizado;
9. monitorar erros, duplicidades e status por 30 minutos.

Comando de deploy:

```powershell
npx supabase functions deploy enviar-pesquisa-evasao --project-ref ouqwbbermlzqqvtqwlul
```

Não usar `--no-verify-jwt`.

- [ ] **Step 4: Critério de parada**

Interromper rollout se:

- Fabi/Jéssica não forem resolvidas de forma inequívoca;
- a prévia diferir do recebido;
- usuário sem permissão ler resposta;
- o modo teste tocar cadastro/analytics;
- houver duplicidade de envio;
- a listagem perder registros bloqueados.

- [ ] **Step 5: Registrar evidência**

Anexar ao runbook:

- commit implantado;
- versão da função;
- migration version;
- IDs internos dos testes, sem telefone ou texto privado;
- resultado da matriz RLS;
- horário do smoke test;
- responsável pela validação.

## Definition of Done

- [ ] `enviar-pesquisa-evasao` exige JWT e autorização por permissão/unidade.
- [ ] Operador não vem do navegador.
- [ ] Fabi e Jéssica usam automaticamente sua própria assinatura.
- [ ] Toda produção exige prévia e confirmação.
- [ ] A mensagem enviada é o snapshot aprovado.
- [ ] Modo teste é separado e não contamina cadastro/analytics.
- [ ] `pesquisa_evasao` e tabelas novas não têm policy ampla.
- [ ] Mila e Sol não leem respostas privadas.
- [ ] Listagem é paginada e mantém bloqueios visíveis.
- [ ] Escrita direta de telefone sai do componente.
- [ ] Testes Deno, Node, build e lint SQL passam.
- [ ] Evidência de homologação e rollback está documentada.

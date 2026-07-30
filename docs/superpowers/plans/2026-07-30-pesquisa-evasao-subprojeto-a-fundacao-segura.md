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
nao_enviado | enviando | incerto | enviado | falhou | entregue | lido

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
  assert.match(sql, /fn_usuario_atual_tem_permissao_estrita/i);
  assert.match(sql, /unidade_id/i);
});

test('admin legado nao substitui permissao granular do dominio', () => {
  assert.match(sql, /usuario_tem_permissao_estrita/i);
  assert.doesNotMatch(sql, /perfil\s*=\s*['"]admin['"][\s\S]+sucesso_aluno\.evasao/i);
});

test('modo teste nao disputa unicidade nem sobrescreve producao', () => {
  assert.match(sql, /unique[\s\S]+evasao_id[\s\S]+where[\s\S]+modo_teste\s*=\s*false/i);
  assert.doesNotMatch(sql, /unique\s*\(\s*evasao_id\s*\)/i);
});

test('as duas overloads filtram cada linha pelas unidades autorizadas', () => {
  assert.match(sql, /listar_evadidos_para_pesquisa\(uuid,\s*integer,\s*integer,\s*varchar\)/i);
  assert.match(sql, /listar_evadidos_para_pesquisa\(uuid,\s*integer,\s*integer,\s*varchar,\s*integer,\s*integer\)/i);
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
- os seis registros legados confirmados por Alf como testes, sem participação em analytics ou ações;
- telefone de destino em snapshot, sem alteração do cadastro do aluno;
- preview com expiração, hash e uso único;
- chave idempotente;
- estados `enviando` e `incerto`, sem reenvio automático depois de resultado ambíguo;
- modo teste em linha própria, sem sobrescrever ou bloquear produção;
- escopo negativo: usuário da unidade A não lista A+B passando `p_unidade_id=NULL`, em nenhuma overload;
- escopo negativo: `stats_pesquisa_evasao(NULL, ...)` de usuário da unidade A não agrega a unidade B;
- vínculo único entre preview, chave idempotente e pesquisa;
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

- [ ] **Step 1: Criar catálogo, perfil dedicado e helper estrito de forma idempotente**

Inserir os seis códigos em `public.permissoes`, respeitando as colunas reais verificadas no banco. Antes de escrever a migração, rodar somente leitura:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('permissoes', 'perfis', 'perfil_permissoes', 'usuario_perfis')
order by table_name, ordinal_position;
```

A migração não deve atribuir permissões por comparação frouxa de nome. Criar os códigos primeiro; a atribuição a Fabi/Jessica usa exclusivamente os IDs verificados `30` e `29` — ou os emails exatos associados — no checklist de rollout.

- As duas titulares recebem `sucesso_aluno.evasao.ver`, `.enviar`, `.revisar`, `.gerir_acoes` e `.modo_teste`. Não atribuir `.relatorios` por implicação.
- O escopo é explícito nas três unidades ativas — Barra, Campo Grande e Recreio — por linhas de `usuario_perfis` vinculadas à unidade concreta. Não usar `usuarios.perfil='admin'`, `usuarios.unidade_id=NULL` nem perfil global como prova ou atalho de autorização.
- Criar o perfil dedicado `Sucesso do Aluno - Evasão`, nível operacional `30`, ligado somente às cinco permissões aprovadas. O código `.relatorios` existe no catálogo, mas não é ligado a esse perfil.
- Criar `usuario_tem_permissao_estrita(usuario_id, codigo, unidade_id)` e `fn_usuario_atual_tem_permissao_estrita(codigo, unidade_id)`. Para códigos `sucesso_aluno.evasao.*`, elas exigem unidade não nula e uma linha ativa em `usuario_perfis` com a mesma unidade; não consultam nem aceitam o bypass legado `usuarios.perfil='admin'`.
- RLS, RPCs e Edge deste domínio usam exclusivamente os helpers estritos. O bypass de `service_role` continua restrito ao backend depois da autenticação/autorização do usuário.

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
  unidade_id uuid not null references public.unidades(id),
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
  idempotency_key uuid not null unique default gen_random_uuid(),
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
substantividade, correlation_id, idempotency_key, criado_em

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
preview_id, idempotency_key, envio_iniciado_em,
primeira_interacao_em,
ultima_interacao_em, pronta_para_revisao_em
```

Backfill:

- `status='respondido'` → `envio_status='enviado'`, `resposta_status='pronta_para_revisao'`;
- `status='enviado'` → `envio_status='enviado'`, `resposta_status='sem_resposta'`;
- falhas/pendências mantêm equivalência documentada;
- os seis registros existentes ficam `modo_teste=true`, porque Alf confirmou que todos foram disparados para o mesmo número interno de teste antes da produção;
- antes da migração, registrar em evidência privada de rollout os seis UUIDs verificados em produção, sem telefone ou conteúdo de resposta;
- o backfill usa uma allowlist explícita desses seis UUIDs e falha de forma segura se ela não resolver exatamente seis registros, um único telefone normalizado e nenhum telefone vazio;
- somente os seis UUIDs aprovados são atualizados; linhas criadas depois da verificação não são classificadas por abrangência da tabela ou por semelhança de telefone;
- um comentário SQL registra a origem da decisão, a data da confirmação e a regra de exclusão analítica;
- qualquer registro futuro usa `modo_teste=false` por padrão e só vira teste pelo fluxo autorizado;
- `stats_pesquisa_evasao`, read models, taxas de resposta, causas, baselines, ações e indicadores de professor filtram `modo_teste=false`;
- a listagem operacional mantém os seis registros visíveis com badge inequívoco `TESTE`, sem oferecê-los como trabalho real para Fabi/Jéssica.
- remover a unicidade global de `evasao_id` e criar índice único parcial apenas para produção: `unique (evasao_id) where modo_teste=false`;
- `preview_id` referencia `pesquisa_evasao_previews(id)` e é único; `idempotency_key` também é único e é copiado da preview, nunca regenerado no claim;
- um índice único parcial de slot ativo de teste impede duas tentativas simultâneas para a mesma evasão e telefone de teste enquanto o estado for `enviando` ou `incerto`, sem bloquear produção;
- todo claim de teste insere linha própria; nunca usa `ON CONFLICT` contra o cabeçalho produtivo.

Contrato do backfill, sem versionar o telefone interno:

```sql
do $$
declare
  v_ids uuid[] := array[
    -- preencher na implementação com os seis UUIDs confirmados
  ]::uuid[];
  v_total integer;
  v_telefones integer;
  v_telefones_vazios integer;
begin
  select
    count(*),
    count(distinct nullif(regexp_replace(coalesce(aluno_telefone, ''), '\D', '', 'g'), '')),
    count(*) filter (
      where nullif(regexp_replace(coalesce(aluno_telefone, ''), '\D', '', 'g'), '') is null
  )
  into v_total, v_telefones, v_telefones_vazios
  from public.pesquisa_evasao
  where id = any(v_ids);

  if cardinality(v_ids) <> 6
     or v_total <> 6
     or v_telefones <> 1
     or v_telefones_vazios <> 0 then
    raise exception
      'Backfill legado de modo_teste abortado: esperados 6 registros, 1 telefone e nenhum telefone vazio';
  end if;

  update public.pesquisa_evasao pe
  set modo_teste = true,
      updated_at = now()
  where pe.id = any(v_ids);
end;
$$;

comment on column public.pesquisa_evasao.modo_teste is
  'Os 6 registros anteriores a producao foram confirmados por Alf em 2026-07-30 como testes no numero interno; ficam fora de analytics, acoes e indicadores.';
```

- [ ] **Step 5: Reescrever grants e policies por classe de tabela**

Matriz obrigatória:

- `pesquisa_evasao`: `SELECT` de `authenticated` somente com `sucesso_aluno.evasao.ver` na `unidade_id` da própria linha;
- `pesquisa_evasao_mensagens`, `pesquisa_evasao_transcricoes` e `pesquisa_evasao_analises`: `SELECT` de `authenticated` somente com `ver`, resolvendo a unidade pelo cabeçalho;
- `pesquisa_evasao_previews`, `pesquisa_evasao_templates` e `pesquisa_evasao_assinaturas`: service-only, sem `SELECT` direto de `authenticated`; a Edge devolve apenas a projeção autorizada necessária à tela;
- todas: RLS habilitada, sem policy `USING (true)`, e `ALL` revogado de `PUBLIC`, `anon`, `authenticated`, `mila_acesso_restrito` e `sol_acesso_restrito` antes dos grants mínimos explícitos;
- sequences relacionadas também perdem grants de `PUBLIC`/`anon`/roles restritos.

A policy de leitura do cabeçalho exige:

```sql
public.fn_usuario_atual_tem_permissao_estrita(
  'sucesso_aluno.evasao.ver'::varchar,
  unidade_id_da_pesquisa
)
```

Nas tabelas filhas de conversa, obter a unidade por `exists` no cabeçalho. A preview é service-only e guarda `unidade_id` como snapshot de autorização/auditoria porque existe antes do cabeçalho.

Não criar policy de escrita direta para o navegador. Edge Functions usam service role depois de autenticar/autorização; revisão humana ganhará RPC governada no B/C.

- [ ] **Step 6: Proteger RPCs legadas**

Substituir as implementações de:

- `listar_evadidos_para_pesquisa(uuid, integer, integer, varchar)`;
- `listar_evadidos_para_pesquisa(uuid, integer, integer, varchar, integer, integer)`;
- `stats_pesquisa_evasao(uuid, integer, integer)`;
- `criar_pesquisa_evasao(integer, text)`;
- `pode_enviar_pesquisa_evasao(integer)`.

Regras:

- o frontend atual chama a sobrecarga de seis argumentos, mas a de quatro também é endurecida para não permanecer como bypass de compatibilidade;
- nesta etapa, preservar exatamente o `RETURNS TABLE` de cada overload; PostgreSQL não permite mudar retorno por `CREATE OR REPLACE`;
- ambas as sobrecargas de `listar` e `stats` exigem `sucesso_aluno.evasao.ver` e filtram cada linha pela unidade real de `movimentacoes_admin`;
- `p_unidade_id=NULL` significa “todas as unidades autorizadas”, nunca “todas as unidades”: a função avalia cada linha contra `usuario_perfis.unidade_id`; perfil global ou admin legado não amplia o escopo deste domínio;
- nenhuma autorização do domínio chama `usuario_tem_permissao_estrita(..., NULL)`; a Edge e as RPCs sempre usam a unidade concreta da movimentação;
- testes legados continuam visíveis e marcados na listagem operacional, mas `stats` e qualquer agregado excluem `modo_teste=true`;
- revogar `EXECUTE` de `PUBLIC` e `anon` nas cinco assinaturas;
- `criar_pesquisa_evasao` passa a `SECURITY DEFINER`, fixa `search_path = public, pg_temp`, valida `auth.role()='service_role'`, perde `EXECUTE` de `authenticated` e fica somente para `service_role`;
- o claim novo é o único caminho da nova Edge para criar/transicionar pesquisa; `criar_pesquisa_evasao` fica como compatibilidade service-only, não marca `enviado` antes do provedor e usa o conflito parcial de produção;
- `pode_enviar_pesquisa_evasao` permanece disponível apenas a ator autenticado com `sucesso_aluno.evasao.enviar` ou a `service_role`;
- nenhuma RPC retorna resposta bruta a quem possui apenas `relatorios`;
- `search_path = public, pg_temp`;
- funções `SECURITY DEFINER` validam permissão explicitamente.
- além dos testes por texto, validar o estado real com `pg_policies`, `has_table_privilege` e `has_function_privilege` para todas as assinaturas e roles.

Grants mínimos esperados:

```sql
revoke all on function public.listar_evadidos_para_pesquisa(uuid, integer, integer, varchar)
  from public, anon;
revoke all on function public.listar_evadidos_para_pesquisa(uuid, integer, integer, varchar, integer, integer)
  from public, anon;
revoke all on function public.stats_pesquisa_evasao(uuid, integer, integer)
  from public, anon;
revoke all on function public.criar_pesquisa_evasao(integer, text)
  from public, anon, authenticated;
revoke all on function public.pode_enviar_pesquisa_evasao(integer)
  from public, anon;
```

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
3. verificação explícita de `usuario_tem_permissao_estrita(usuario.id, codigo, unidade_id)`;
4. resolução de uma única assinatura ativa.

`ContextoOperador` não carrega uma única “unidade do usuário”. O schema permite vários `usuario_perfis`; cada operação autoriza o operador contra a `unidade_id` concreta da movimentação. Nunca chamar o helper com unidade nula para decidir escopo.

Não usar `fn_usuario_atual_tem_permissao_estrita` com o cliente service role para autorizar o operador, porque o bypass técnico do backend faria a checagem passar. A Edge chama `usuario_tem_permissao_estrita` com o `usuario.id` resolvido e a unidade concreta.

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
- chave idempotente estável criada no claim e reutilizada em toda reconciliação;
- estados `enviando` e `incerto`, sem segundo dispatch automático;
- nenhuma atualização de `alunos`/`movimentacoes_admin` com telefone de teste;
- envio de teste cria linha própria e não conflita com o cabeçalho produtivo;
- a nova Edge usa somente `claim_pesquisa_evasao_preview`, sem upsert direto e sem chamar a compatibilidade `criar_pesquisa_evasao`;
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
- validar autor e, no primeiro consumo, expiração;
- se `consumido_em is not null` e a preview já estiver vinculada por `preview_id`, devolver o estado existente com `deve_despachar=false`;
- se estiver consumida sem pesquisa vinculada, falhar de forma segura como inconsistência interna;
- no primeiro consumo válido, marcar `consumido_em`;
- copiar para a pesquisa a `idempotency_key` criada na preview; nunca gerar uma segunda chave;
- serializar claims concorrentes pelo slot lógico: `(evasao_id, produção)` para produção e `(evasao_id, telefone_teste, teste)` para teste;
- em produção, criar/atualizar somente o cabeçalho `modo_teste=false` protegido pelo índice único parcial;
- em teste, sempre inserir uma linha `modo_teste=true` própria, sem atualizar ou bloquear o cabeçalho produtivo;
- marcar `envio_status='enviando'` e `envio_iniciado_em`;
- devolver snapshot completo e `deve_despachar=true` apenas ao primeiro claim;
- em repetição do mesmo `preview_id`, devolver o estado existente com `deve_despachar=false`;
- impedir clique duplo e bloquear nova prévia/confirmação enquanto o mesmo slot lógico estiver `enviando` ou `incerto`;
- um teste `enviando`/`incerto` bloqueia outro teste do mesmo slot, mas nunca bloqueia produção da mesma evasão.

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

Em timeout, queda depois do início do request ou qualquer resultado ambíguo:

- marcar `envio_status='incerto'`;
- manter preview consumido e a mesma `idempotency_key`;
- não reenviar automaticamente;
- reconciliar por caixa, telefone, janela de horário e `provider_message_id`;
- enviar a mesma chave ao provedor em campo idempotente, se o contrato real do canal suportar;
- se o provedor não oferecer idempotência, só permitir reenvio após decisão humana auditada.

O claim deve tratar `enviando` antigo acima do TTL operacional como `incerto`, nunca como autorização para novo dispatch. Testar crash/timeout, repetição durante `enviando`, repetição em `incerto`, reconciliação para `enviado` ou `falhou` e concorrência entre dois `preview_id` diferentes da mesma evasão produtiva — exatamente um pode receber `deve_despachar=true`.

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
- registros legados de teste exibem badge `TESTE` mesmo fora do toggle de teste;
- registros de teste não oferecem ação operacional, apuração ou encaminhamento;
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
- múltiplos testes da mesma evasão não duplicam a linha principal;
- histórico de teste retorna `modo_teste=true` e a UI exibe badge `TESTE`;
- status/resposta produtivos nunca são preenchidos a partir de um teste;
- nenhuma escrita direta em `movimentacoes_admin` ou `alunos` permanece no componente.

- [ ] **Step 2: Evoluir a RPC de listagem**

Criar uma RPC versionada, por exemplo:

```sql
public.listar_evadidos_para_pesquisa_v2(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer
)
```

Não tentar mudar o `RETURNS TABLE` das overloads antigas com `CREATE OR REPLACE`. Mantê-las endurecidas e com retorno compatível durante a migração do frontend. A RPC v2 retorna:

```sql
returns table (
  total_count bigint,
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_catalogado text,
  motivo_legado text,
  pesquisa_producao_status text,
  pesquisa_producao_id uuid,
  resposta_producao_texto text,
  resposta_producao_audio_url text,
  resposta_producao_tipo text,
  respondido_producao_em timestamptz,
  is_menor boolean,
  responsavel_nome text,
  publico_tipo text,
  bloqueio_codigo text,
  elegivel_envio boolean,
  elegibilidade_regra text,
  possui_historico_teste boolean,
  quantidade_testes bigint,
  ultimo_teste_em timestamptz
)
```

`bloqueio_codigo` aceita `null | sem_aluno | sem_telefone | telefone_invalido | motivo_nao_catalogado | publico_interno | pesquisa_aberta_no_mesmo_numero`.

A v2 tem grão de uma linha por `movimentacoes_admin`: associa em `pesquisa_producao_*` apenas `pesquisa_evasao.modo_teste=false` e agrega testes em lateral/subconsulta, sem multiplicar a movimentação. Aplicar permissão por unidade de cada linha antes da paginação. `p_unidade_id=NULL` agrega somente unidades autorizadas. A contagem deve refletir os mesmos filtros.

Criar também um contrato restrito para o histórico:

```sql
public.listar_pesquisas_evasao_teste_v1(p_evasao_id integer)
returns table (
  pesquisa_id uuid,
  modo_teste boolean,
  envio_status text,
  resposta_status text,
  enviado_em timestamptz,
  respondido_em timestamptz
)
```

Essa RPC exige `sucesso_aluno.evasao.ver` na unidade concreta, retorna somente `modo_teste=true` e alimenta a expansão “Histórico de testes”. Assim, os seis legados aparecem com badge `TESTE`, mas nunca substituem `pesquisa_producao_status`, contam como resposta produtiva ou duplicam a paginação principal.

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

Migrar o frontend para `listar_evadidos_para_pesquisa_v2`. Só considerar remoção das overloads legadas depois de busca de consumidores, telemetria e janela de compatibilidade; até lá, ambas permanecem sem acesso `anon` e sem bypass de unidade.

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
- ausência de `EXECUTE` para `PUBLIC`/`anon` nas duas overloads legadas, `stats`, `criar`, `pode_enviar`, na v2 e no histórico de testes;
- ausência de `SELECT` direto de `authenticated` em previews, templates e assinaturas;
- usuário sem permissão não lê;
- usuário com `ver` lê apenas sua unidade;
- usuário da unidade A usando `p_unidade_id=NULL` não lê a unidade B em nenhuma overload, na v2 ou em `stats`;
- usuário com `relatorios` sem `ver` não lê texto bruto;
- service role continua operando;
- todas as tabelas filhas têm RLS habilitada.

Use transações e `set local role`; consulte também `pg_policies`, `has_table_privilege` e `has_function_privilege` para as assinaturas exatas. O script não deixa dados de teste após `rollback`.

- [ ] **Step 3: Documentar a atribuição de Fabi e Jéssica**

O runbook deve exigir esta consulta somente leitura por identidade estável:

```sql
select id, auth_user_id, nome, email, perfil, unidade_id, ativo
from public.usuarios
where (id, email) in (
  (29, 'jessyca@lamusic.com.br'),
  (30, 'fabi@gmail.com')
)
order by id;
```

Antes do go-live:

- a consulta deve retornar exatamente Jessica `id=29`/`jessyca@lamusic.com.br` e Fabi `id=30`/`fabi@gmail.com`;
- cada pessoa deve ter exatamente um `auth_user_id`;
- cada pessoa deve ter exatamente uma assinatura ativa;
- as cinco permissões aprovadas (`ver`, `enviar`, `revisar`, `gerir_acoes`, `modo_teste`) devem estar efetivas para cada titular;
- cada uma deve possuir escopo explícito em Barra, Campo Grande e Recreio pelo mecanismo `usuario_perfis.unidade_id`;
- validar que não houve concessão implícita de `.relatorios`;
- não conceder `admin` apenas para fazer a tela funcionar.

Escopo fixado no runbook:

| Unidade | ID |
|---|---|
| Barra | `368d47f5-2d88-4475-bc14-ba084a9a348e` |
| Campo Grande | `2ec861f6-023f-4d7b-9927-3960ad8c2a92` |
| Recreio | `95553e96-971b-4590-a6eb-0201d013c14d` |

O rollout cria de forma idempotente seis vínculos ativos em `usuario_perfis`: dois usuários × três unidades, todos usando o perfil exato `Sucesso do Aluno - Evasão`. A verificação deve falhar se houver vínculo global (`unidade_id is null`), unidade diferente, menos/mais de seis vínculos ou se o perfil contiver permissão fora das cinco aprovadas.

Testar também que `usuario_tem_permissao_estrita` retorna `false` para Fabi/Jessica antes desses vínculos, apesar do `perfil='admin'`, e `true` nas três unidades depois da atribuição. Isso prova que o admin legado não está sendo usado como atalho.

Estado verificado em 2026-07-30, somente leitura: Jessica (`usuarios.id=29`, email `jessyca@lamusic.com.br`) e Fabi (`usuarios.id=30`, email `fabi@gmail.com`) estão ativas, com `auth_user_id`, `perfil='admin'` e `unidade_id=NULL`. A homologação nominal está desbloqueada, mas o rollout continua condicionado à atribuição granular acima. A grafia de nome não participa de identificação, autorização ou seed.

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

- [ ] **Step 1: Homologar com cinco identidades**

Executar:

1. usuário anônimo;
2. usuário autenticado sem permissão;
3. terceiro usuário de homologação com permissão em apenas uma unidade;
4. Fabi (`usuarios.id=30`);
5. Jessica (`usuarios.id=29`).

O terceiro usuário é registrado no runbook por `usuarios.id` e email exato antes do teste, nunca por nome. Ele recebe o perfil dedicado em somente uma das três unidades e não pode ser `id=29` ou `id=30`.

Comprovar:

- anônimo recebe `401`;
- sem permissão recebe `403`;
- Fabi vê e envia assinatura Fabi;
- Jessica vê e envia assinatura Jessica;
- nenhuma delas troca identidade pelo DevTools;
- Fabi e Jessica operam Barra, Campo Grande e Recreio;
- o terceiro usuário de homologação opera somente sua unidade e recebe negação ao tentar consultar ou enviar por outra;
- modo teste não altera cadastro nem analytics.
- envio de teste para uma evasão com cabeçalho produtivo não o sobrescreve nem o bloqueia;
- timeout ambíguo fica `incerto` e uma repetição não chama o provedor novamente.

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
- um teste conflitar com o cabeçalho de produção;
- um envio `incerto` puder ser repetido sem reconciliação;
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
- [ ] Fabi `30` e Jessica `29` possuem as cinco permissões aprovadas em Barra, Campo Grande e Recreio por vínculos explícitos de unidade; o admin legado não autoriza este domínio.
- [ ] Toda produção exige prévia e confirmação.
- [ ] A mensagem enviada é o snapshot aprovado.
- [ ] Modo teste é separado e não contamina cadastro/analytics.
- [ ] Modo teste não sobrescreve nem bloqueia a pesquisa produtiva da mesma evasão.
- [ ] Os seis registros legados aparecem como `TESTE` e não alimentam ações, causas, baseline ou indicadores de professor.
- [ ] `pesquisa_evasao` e tabelas novas não têm policy ampla.
- [ ] Mila e Sol não leem respostas privadas.
- [ ] Listagem é paginada e mantém bloqueios visíveis.
- [ ] `p_unidade_id=NULL` retorna somente unidades autorizadas e não amplia escopo.
- [ ] Timeout ambíguo entra em `incerto` e não redispara sem reconciliação.
- [ ] Escrita direta de telefone sai do componente.
- [ ] Testes Deno, Node, build e lint SQL passam.
- [ ] Evidência de homologação e rollback está documentada.

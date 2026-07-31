# Relatório Comercial com Experimentais Frescas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o relatório comercial diário rico e detalhado sobre um snapshot fresco do GET `/aulas`, publicar KPIs canônicos — incluindo os tickets médios de parcelas e passaportes — e eliminar a divergência entre tela, dry-run e cron.

**Architecture:** `sync-presenca-emusys` continua sendo o único adaptador do Emusys. Ele busca todas as páginas do início do mês até D+7 antes de escrever, transforma as participações experimentais em linhas com identidade estável e entrega o lote inteiro a uma RPC transacional que ativa o snapshot novo e inativa o anterior. Um módulo puro monta o payload e o texto unificado; `relatorio-admin-whatsapp` faz o refresh e reúne as fontes canônicas, enquanto tela, dry-run e cron consomem o mesmo resultado. O produtor legado só é desligado depois de paridade comprovada nas três unidades.

**Tech Stack:** Deno/TypeScript, Supabase Edge Functions, PostgreSQL 17, React/Vite, Node test runner, Deno test runner, Docker para fixtures SQL, Supabase MCP para migration/deploy e consultas operacionais.

---

## Restrições e baseline

- Trabalhar no worktree `D:\2026\LA-performance-report\.worktrees\relatorio-experimentais-fresco`, branch `fix/relatorio-experimentais-fresco`.
- Não alterar migrations aplicadas; toda mudança de banco entra em migration nova.
- Não usar `supabase db push` indiscriminadamente. Comparar o histórico remoto e aplicar somente as migrations deste plano, na ordem.
- Não apagar linhas de `emusys_experimentais_raw`; histórico fica inativo e auditável.
- Não enviar WhatsApp durante validação. Usar `dry_run_comercial` até o gate de corte.
- Atualizar `docs/MAPA-SISTEMA.md`, `docs/METRICAS.md` e `docs/MAPA-INTEGRACAO-EMUSYS.md` no mesmo commit que alterar edge, página, RPC ou métrica.
- Baseline local já registrado: 620 testes, 614 passam e 6 falham em áreas preexistentes e fora deste escopo. Os testes direcionados novos devem passar; a suíte completa não pode ganhar falhas adicionais.
- As contagens ao vivo são evidência de aceite, não fixture fixa. O caso da Barra em 30/07/2026 foi `32 presentes`, `5 faltas`, `5 canceladas`; no momento do corte deve-se comparar novamente com o Emusys.

## Contratos que não podem regredir

```text
identidade vigente = unidade_id + emusys_aula_id + participante_chave

participante_chave:
  lead:<id_lead>                  quando id_lead > 0
  aluno:<id_aluno>               quando id_aluno > 0
  pessoa:<nome_norm>:<telefone>   fallback preferencial
  pessoa:<nome_norm>:<nascimento> fallback final
```

- A resposta incompleta do Emusys nunca pode inativar o snapshot anterior.
- Um refresh bem-sucedido é aplicado em uma única transação PostgreSQL.
- A leitura operacional e a conciliação usam apenas `snapshot_ativo = true`.
- Aula futura com `presenca = 'ausente'` continua `agendada` até o horário de início; não gera falta antecipada.
- O refresh do relatório cobre do primeiro dia do mês até D+7, inclusive na virada do mês.
- Presença bruta ativa prevalece sobre heurística de reagendamento.
- No relatório diário, pendência adiciona aviso; não substitui a taxa por `BLOQUEADA`.
- Sem denominador, o relatório publica `SEM BASE`.
- Ticket médio das parcelas e ticket médio dos passaportes são calculados separadamente sobre a mesma coorte comercial detalhada.
- A meta `ticket_medio` é aplicada somente ao ticket das parcelas.
- O relatório preserva resumo diário, mês/meta, funil, registros do dia, canais, cursos, agenda futura, alertas e lista detalhada.
- `ComercialPage`, `dry_run_comercial` e cron recebem texto do mesmo gerador diário.

---

### Task 1: Extrair e testar o contrato puro do snapshot Emusys

**Files:**

- Create: `supabase/functions/_shared/experimental-snapshot.ts`
- Create: `supabase/functions/_shared/experimental-snapshot.test.ts`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Escrever os testes vermelhos de identidade e paginação**

Criar testes Deno para:

1. preferir `id_lead` a qualquer dado textual;
2. usar `id_aluno` quando não houver lead;
3. manter a mesma chave após mudança de nome/telefone quando houver ID externo;
4. distinguir duas pessoas na mesma aula;
5. mapear aula passada com `presente`, `matriculado`, `faltou`, `ausente` e cancelamento;
6. mapear participante futuro com `presenca='ausente'` para `agendada`;
7. manter uma aula futura cancelada como `cancelada`;
8. comparar data e horário no fuso `America/Sao_Paulo`;
9. aceitar duas páginas com cursores diferentes;
10. falhar quando `tem_mais=true` vier sem `proximo_cursor`;
11. falhar quando o cursor repetir;
12. não devolver lote parcial após erro HTTP ou JSON inválido.

O contrato principal do teste deve chamar:

```ts
participanteChave(aluno)
montarLinhasSnapshot({ unidadeId, execucaoId, aulas })
buscarTodasAulas({ dataInicio, dataFim, fetchPage })
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run:

```powershell
deno test supabase/functions/_shared/experimental-snapshot.test.ts
```

Expected: `Module not found` ou exports ausentes.

- [ ] **Step 3: Implementar o módulo puro**

O arquivo não deve importar Supabase nem secrets. Exportar tipos reduzidos de aula/aluno e:

```ts
export type SituacaoExperimental =
  | 'agendada'
  | 'presente'
  | 'faltou'
  | 'cancelada'
  | 'sem_status'

export function participanteChave(aluno: ExperimentalAluno): string
export function normalizarSituacaoExperimental(
  input: {
    presenca: string | null | undefined
    cancelada: boolean
    dataHoraInicio: string
    agora: Date
  },
): SituacaoExperimental
export function montarLinhasSnapshot(input: SnapshotInput): SnapshotRow[]
export async function buscarTodasAulas(input: FetchTodasAulasInput): Promise<AulaEmusys[]>
```

`buscarTodasAulas` deve:

- usar limite 100;
- manter `Set<string>` de cursores já consumidos;
- exigir cursor não vazio quando `tem_mais=true`;
- lançar erro em resposta não OK, payload inválido ou cursor repetido;
- só retornar depois de alcançar `tem_mais=false`.

`montarLinhasSnapshot` deve filtrar `categoria=experimental`, ignorar participante sem nome e gerar `raw_key` único por execução:

```text
<unidade>:<aula>:<participante>:<execucao>
```

A chave de negócio não depende de `raw_key`; ela fica nas colunas próprias.
Cada linha preserva `data_aula`, `horario_aula`, cancelamento no payload bruto e
`situacao_operacional='agendada'` quando o início ainda está no futuro.

- [ ] **Step 4: Rodar o teste verde**

Run:

```powershell
deno test supabase/functions/_shared/experimental-snapshot.test.ts
```

Expected: todos os testes passam.

- [ ] **Step 5: Documentar o adaptador único**

Nos três mapas, registrar o novo módulo compartilhado e, em
`docs/MAPA-INTEGRACAO-EMUSYS.md`, detalhar que:

- `/aulas` é paginado até o fim antes da aplicação;
- o modo `experimentais` usa o helper compartilhado;
- `metadados` reaproveita as aulas já obtidas.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/functions/_shared/experimental-snapshot.ts supabase/functions/_shared/experimental-snapshot.test.ts docs/MAPA-SISTEMA.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "test: definir contrato do snapshot de experimentais"
```

---

### Task 2: Criar snapshot transacional, backfill e leitura operacional vigente

**Files:**

- Create: `supabase/migrations/20260730204500_snapshot_experimentais_emusys.sql`
- Create: `tests/comercialExperimentaisSnapshotSchema.test.mjs`
- Create: `tests/comercialExperimentaisSnapshotPostgres.test.mjs`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Escrever o teste estrutural vermelho**

O teste deve exigir:

- as sete colunas aprovadas em `emusys_experimentais_raw`;
- tabela `emusys_experimentais_snapshot_execucoes`;
- índice único parcial em `(unidade_id, emusys_aula_id, participante_chave) where snapshot_ativo`;
- backfill por `row_number()` deixando uma linha ativa por chave;
- RPC privada `aplicar_snapshot_experimentais_emusys_v1`;
- RPC booleana `pode_gerar_relatorio_comercial_v1` validando usuário, unidade e
  permissão `comercial.ver`;
- `REVOKE` de `public`, `anon` e `authenticated`, com `GRANT` somente para `service_role`;
- `get_experimentais_emusys_operacional_v1` filtrando `snapshot_ativo is true`;
- metadados `snapshot_atualizado_em`, `snapshot_execucao_id`, `snapshot_linhas_inativas` e `snapshot_status`.

- [ ] **Step 2: Escrever a fixture PostgreSQL vermelha**

A fixture Docker deve criar os papéis `anon`, `authenticated`, `service_role` e o schema mínimo necessário, aplicar a migration e provar:

1. o backfill mantém uma ativa entre duplicatas;
2. duas pessoas na mesma aula permanecem ativas;
3. mudar nome/telefone com a mesma `participante_chave` atualiza a linha ativa;
4. uma aula ausente do lote novo é inativada;
5. reentrada posterior cria nova linha ativa sem apagar a antiga;
6. lote inválido causa rollback total;
7. lote vazio inativa o intervalo e ainda registra uma execução completa;
8. a RPC operacional conta somente linhas ativas;
9. a RPC de autorização aceita a unidade própria/permissão válida e rejeita
   unidade fora do escopo.

Usar a convenção:

```text
COMERCIAL_EXP_REQUIRE_POSTGRES=1
COMERCIAL_EXP_POSTGRES_IMAGE=postgres:17-alpine
```

- [ ] **Step 3: Executar e confirmar vermelho**

Run:

```powershell
node --test tests/comercialExperimentaisSnapshotSchema.test.mjs
$env:COMERCIAL_EXP_REQUIRE_POSTGRES='1'
node --test tests/comercialExperimentaisSnapshotPostgres.test.mjs
Remove-Item Env:COMERCIAL_EXP_REQUIRE_POSTGRES
```

Expected: migration ausente.

- [ ] **Step 4: Implementar a migration aditiva**

Adicionar a `emusys_experimentais_raw`:

```sql
emusys_lead_id integer,
emusys_aluno_id integer,
participante_chave text,
snapshot_ativo boolean not null default false,
snapshot_execucao_id uuid,
snapshot_visto_em timestamptz,
snapshot_inativado_em timestamptz
```

Criar:

```sql
public.emusys_experimentais_snapshot_execucoes (
  id uuid primary key,
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  status text not null check (status = 'completo'),
  linhas_recebidas integer not null,
  linhas_ativas integer not null,
  linhas_inativadas integer not null,
  iniciado_em timestamptz not null,
  concluido_em timestamptz not null,
  constraint intervalo_valido check (data_fim >= data_inicio)
)
```

O backfill deve extrair IDs do `payload`, montar a chave na prioridade aprovada e usar `row_number()` particionado pela chave de negócio, ordenado por `updated_at desc, id desc`. A primeira linha fica ativa; as demais recebem `snapshot_inativado_em`.

Criar o índice somente depois do backfill:

```sql
create unique index ... on public.emusys_experimentais_raw
  (unidade_id, emusys_aula_id, participante_chave)
  where snapshot_ativo is true;
```

A RPC `aplicar_snapshot_experimentais_emusys_v1` deve:

- validar unidade, intervalo máximo de 45 dias, execução e JSON array;
- materializar `jsonb_to_recordset` em tabela temporária;
- rejeitar chave vazia, aula/unidade divergente e duplicidade no próprio lote;
- fazer `INSERT ... ON CONFLICT (...) WHERE snapshot_ativo IS TRUE DO UPDATE`;
- preservar IDs locais já conhecidos com `coalesce(excluded.aluno_id, raw.aluno_id)` e equivalentes;
- inativar somente o mesmo `unidade_id` e intervalo que não foi visto na execução;
- inserir a execução completa por último;
- retornar JSON com recebidas, ativas, atualizadas/inseridas e inativadas.

Como a função PostgreSQL é transacional, qualquer exceção desfaz upserts, inativação e registro da execução.

Criar `pode_gerar_relatorio_comercial_v1(p_unidade_id uuid)` como
`SECURITY DEFINER`, com `search_path` fixo. Ela deve localizar o usuário ativo
por `auth.uid()`, aceitar o perfil de unidade somente para a própria unidade e
usar `usuario_tem_permissao(..., 'comercial.ver', p_unidade_id)` para os demais
perfis. Conceder execução a `authenticated`; revogar de `public` e `anon`.

Recriar `get_experimentais_emusys_operacional_v1` sem mudar assinatura. Tanto `base` quanto agregados devem usar somente linhas ativas. A seção `resumo` deve acrescentar os metadados de frescor consultando a última execução completa que cobre o período solicitado.

- [ ] **Step 5: Rodar os testes direcionados**

Run:

```powershell
node --test tests/comercialExperimentaisSnapshotSchema.test.mjs
$env:COMERCIAL_EXP_REQUIRE_POSTGRES='1'
node --test tests/comercialExperimentaisSnapshotPostgres.test.mjs
Remove-Item Env:COMERCIAL_EXP_REQUIRE_POSTGRES
```

Expected: ambos passam.

- [ ] **Step 6: Atualizar os três mapas**

Documentar:

- tabela de execuções e vigência do raw em `MAPA-SISTEMA`;
- denominador operacional ativo e metadados de frescor em `METRICAS`;
- aplicação atômica e falha fechada em `MAPA-INTEGRACAO-EMUSYS`.

- [ ] **Step 7: Commit**

```powershell
git add -- supabase/migrations/20260730204500_snapshot_experimentais_emusys.sql tests/comercialExperimentaisSnapshotSchema.test.mjs tests/comercialExperimentaisSnapshotPostgres.test.mjs docs/MAPA-SISTEMA.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "feat: versionar snapshot vigente de experimentais"
```

---

### Task 3: Implementar o modo leve `experimentais` no sync

**Files:**

- Modify: `supabase/functions/sync-presenca-emusys/index.ts`
- Modify: `supabase/functions/_shared/experimental-snapshot.ts`
- Modify: `supabase/functions/_shared/experimental-snapshot.test.ts`
- Create: `tests/syncExperimentaisSnapshotContrato.test.mjs`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Escrever testes vermelhos do modo**

Exigir:

- união do tipo de modo com `'experimentais'`;
- entrada `unidade_id`, `data_inicio`, `data_fim`;
- rejeição de unidade desconhecida e intervalo maior que 45 dias;
- uma única unidade obrigatória nesse modo;
- chamada de `buscarTodasAulas`;
- aplicação por `aplicar_snapshot_experimentais_emusys_v1`;
- reconciliação somente depois da aplicação completa;
- resposta sem PII;
- o modo `metadados` chama o mesmo aplicador usando as aulas já carregadas;
- nenhum caminho novo usa `fetchAulasDia`, que tolera resposta parcial.

- [ ] **Step 2: Executar e confirmar vermelho**

Run:

```powershell
node --test tests/syncExperimentaisSnapshotContrato.test.mjs
deno test supabase/functions/_shared/experimental-snapshot.test.ts
```

Expected: modo e chamada transacional ausentes.

- [ ] **Step 3: Refatorar a busca sem duplicar integração**

Substituir o corpo de `fetchAulasRange` pela função pura testada, passando um `fetchPage` que:

- monta a URL do GET `/aulas`;
- envia o token somente no header;
- valida HTTP e JSON;
- não registra payload nem PII em log.

Fazer `sincronizarMetadadosAulas` retornar também, internamente, as aulas carregadas por unidade para que o snapshot use exatamente a mesma resposta, sem segundo GET.

- [ ] **Step 4: Criar o aplicador de snapshot da edge**

Adicionar:

```ts
async function aplicarSnapshotExperimentais(
  supabase: SupabaseClient,
  unidade: UnidadeEmusys,
  dataInicio: string,
  dataFim: string,
  aulas: AulaEmusys[],
): Promise<SnapshotResultado>
```

Ele deve:

1. gerar `crypto.randomUUID()`;
2. resolver professor/curso/aluno local quando os mapas já estiverem disponíveis;
3. montar todas as linhas com `montarLinhasSnapshot`;
4. chamar uma vez `aplicar_snapshot_experimentais_emusys_v1`;
5. montar apenas o conjunto reduzido necessário para `reconciliarExperimentaisOrfas`;
6. retornar agregados, nunca nomes, telefone, nascimento ou payload.

- [ ] **Step 5: Adicionar o modo `experimentais`**

Para esse modo:

- exigir `unidade_id`, `data_inicio` e `data_fim`;
- localizar a unidade pelo UUID, sem regra por nome;
- buscar todas as páginas;
- aplicar o snapshot;
- executar `reconciliarExperimentaisOrfas`;
- responder `success`, unidade, intervalo, execução e contagens;
- retornar HTTP 502 em falha/incompletude de upstream e HTTP 500 em falha transacional.

Não executar sincronização de presença regular nem `atualizar_percentual_presenca`.

- [ ] **Step 6: Fazer `metadados` renovar o snapshot**

Depois do upsert de `aulas_emusys`, chamar `aplicarSnapshotExperimentais` com as aulas que já foram buscadas. Se a aplicação falhar, o modo inteiro deve falhar; não responder sucesso parcial.

- [ ] **Step 7: Rodar testes**

Run:

```powershell
node --test tests/syncExperimentaisSnapshotContrato.test.mjs tests/emusysAulasCamposNovosSync.test.mjs tests/syncPresencaEvidenciaBruta.test.mjs
deno test supabase/functions/_shared/experimental-snapshot.test.ts
```

Expected: todos passam.

- [ ] **Step 8: Atualizar mapas e commit**

```powershell
git add -- supabase/functions/sync-presenca-emusys/index.ts supabase/functions/_shared/experimental-snapshot.ts supabase/functions/_shared/experimental-snapshot.test.ts tests/syncExperimentaisSnapshotContrato.test.mjs docs/MAPA-SISTEMA.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "feat: atualizar experimentais sob demanda"
```

---

### Task 4: Recalcular conciliação somente com snapshot ativo

**Files:**

- Create: `supabase/migrations/20260730205500_conciliacao_experimentais_snapshot_ativo.sql`
- Create: `tests/conciliacaoExperimentaisSnapshotAtivo.test.mjs`
- Create: `tests/conciliacaoExperimentaisSnapshotPostgres.test.mjs`
- Modify: `tests/regressoesComercialPermanencia.test.mjs`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Escrever os testes vermelhos**

O teste estrutural deve exigir um novo núcleo privado, por exemplo:

```sql
get_conciliacao_experimentais_snapshot_v1(...)
```

e provar que todos os acessos a `emusys_experimentais_raw` no núcleo têm `snapshot_ativo is true`.

A fixture PostgreSQL deve cobrir:

1. realizada antiga seguida de falta ativa não gera pendência;
2. realizada antiga seguida de cancelamento ativo não gera pendência;
3. linha posterior no mesmo dia e horário posterior substitui a anterior;
4. linha posterior em data posterior substitui a anterior;
5. presença raw ativa na linha antiga prevalece e mantém duas experimentais legítimas;
6. raw inativo não entra no denominador;
7. duplicatas históricas não multiplicam pendências;
8. cap comercial P21 e deduplicação P22 continuam presentes;
9. validação de usuário/unidade e ACL P23 continuam presentes.

- [ ] **Step 2: Executar e confirmar vermelho**

Run:

```powershell
node --test tests/conciliacaoExperimentaisSnapshotAtivo.test.mjs tests/regressoesComercialPermanencia.test.mjs
$env:COMERCIAL_EXP_REQUIRE_POSTGRES='1'
node --test tests/conciliacaoExperimentaisSnapshotPostgres.test.mjs
Remove-Item Env:COMERCIAL_EXP_REQUIRE_POSTGRES
```

Expected: núcleo/migration ausente.

- [ ] **Step 3: Criar o núcleo canônico vigente**

Copiar integralmente para a nova migration o corpo SQL canônico que hoje está encapsulado em `get_conciliacao_experimentais_v2_legacy_p21_20260707`, dando novo nome privado. Não editar a função legada aplicada.

No novo núcleo:

- filtrar `r.snapshot_ativo is true` no lateral de evidência por evento;
- filtrar `r.snapshot_ativo is true` em `raw_por_unidade`;
- trocar `substituida_por_reagendamento` por comparação de timestamp lógico:

```sql
(le_reagendada.data_experimental, coalesce(le_reagendada.horario_experimental, time '00:00'))
>
(le.data_experimental, coalesce(le.horario_experimental, time '00:00'))
```

- aceitar como estado posterior conhecido:

```text
experimental_agendada, experimental_realizada, convertido, matriculado,
experimental_faltou, faltou, no_show, no-show,
cancelada, cancelado, experimental_cancelada
```

- só ignorar a anterior quando ela não tiver presença nem falta raw ativa.

- [ ] **Step 4: Recriar a fachada pública sem perder P21/P22/P23**

`get_conciliacao_experimentais_v2` deve permanecer com a mesma assinatura e:

1. validar usuário, perfil, unidade e `comercial.ver` como P23;
2. chamar o novo núcleo;
3. aplicar o cap de matrículas comerciais do P21;
4. aplicar a correção de sobra pequena do P22;
5. manter os campos JSON existentes e acrescentar fonte `snapshot_ativo_p24`;
6. revogar acesso direto ao núcleo de `public`, `anon` e `authenticated`;
7. conceder a fachada somente a `authenticated` e `service_role`.

- [ ] **Step 5: Rodar fixtures e regressões**

Run:

```powershell
node --test tests/conciliacaoExperimentaisSnapshotAtivo.test.mjs tests/regressoesComercialPermanencia.test.mjs
$env:COMERCIAL_EXP_REQUIRE_POSTGRES='1'
node --test tests/conciliacaoExperimentaisSnapshotPostgres.test.mjs
Remove-Item Env:COMERCIAL_EXP_REQUIRE_POSTGRES
```

Expected: todos passam e a fixture confirma os nove cenários.

- [ ] **Step 6: Atualizar mapas e commit**

```powershell
git add -- supabase/migrations/20260730205500_conciliacao_experimentais_snapshot_ativo.sql tests/conciliacaoExperimentaisSnapshotAtivo.test.mjs tests/conciliacaoExperimentaisSnapshotPostgres.test.mjs tests/regressoesComercialPermanencia.test.mjs docs/MAPA-SISTEMA.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "fix: conciliar apenas experimentais vigentes"
```

---

### Task 5: Criar o payload e o formatador puro do relatório unificado

**Files:**

- Create: `supabase/functions/_shared/relatorio-comercial.ts`
- Create: `supabase/functions/_shared/relatorio-comercial.test.ts`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`

- [ ] **Step 1: Escrever os testes vermelhos das regras puras**

Criar fixtures com a Barra em 30/07/2026 e testar:

```ts
const matriculas = [
  { valorParcela: 497, valorPassaporte: 550 },
  { valorParcela: 460, valorPassaporte: 450 },
  { valorParcela: 467, valorPassaporte: 499 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 350, valorPassaporte: 400 },
  { valorParcela: 440, valorPassaporte: 450 },
  { valorParcela: 450, valorPassaporte: 399 },
  { valorParcela: 450, valorPassaporte: 450 },
  { valorParcela: 385, valorPassaporte: 450 },
  { valorParcela: 460, valorPassaporte: 450 },
  { valorParcela: 380, valorPassaporte: 499 },
  { valorParcela: 380, valorPassaporte: 499 },
  { valorParcela: 460, valorPassaporte: 450 },
]

calcularTicketsMatriculas(matriculas)
```

Expected:

```ts
{
  parcelas: { soma: 6819, denominador: 16, media: 426.19 },
  passaportes: { soma: 7142, denominador: 16, media: 446.38 },
}
```

Testar separadamente:

1. parcela ou passaporte zero não entra no respectivo denominador;
2. lista vazia retorna soma, denominador e média zero;
3. segundo curso já agrupado não cria um segundo denominador;
4. `formatarTaxaExpMatDiaria` publica `*40,6%* (13/32) — ⚠️ 2 pendências em auditoria`;
5. denominador zero publica `*SEM BASE*`;
6. nenhum caminho gera `BLOQUEADA`, `NaN` ou `Infinity`;
7. próximas experimentais excluem Bento e Olivia às 20h05;
8. aula futura no mesmo dia permanece;
9. cancelada, inativa e linha do mesmo dia sem horário ficam fora;
10. virada do mês e ordenação por data/hora/nome funcionam;
11. 11 itens retornam 10 linhas e `… e mais 1`.

- [ ] **Step 2: Escrever o teste de ouro vermelho do texto inteiro**

Montar um `RelatorioComercialDados` com:

```ts
{
  referencia: { data: '2026-07-30', hora: '20:05', fuso: 'America/Sao_Paulo' },
  unidade: { nome: 'Barra', hunter: 'Kailane' },
  dia: {
    leads: 9,
    experimentaisPrevistas: 3,
    experimentaisRealizadas: 2,
    faltas: 0,
    canceladas: 1,
    visitas: 0,
    matriculas: 0,
    passaportes: 0,
  },
  mes: {
    leads: 251,
    experimentaisRealizadas: 32,
    presencasVinculadas: 32,
    faltas: 5,
    matriculas: 16,
  },
  metas: { leads: 160, experimentais: 24, matriculas: 15, ticketParcelas: 444 },
  tickets: {
    parcelas: { soma: 6819, denominador: 16, media: 426.19 },
    passaportes: { soma: 7142, denominador: 16, media: 446.38 },
  },
  conciliacao: { taxa: 40.6, conversoes: 13, denominador: 32, pendencias: 2 },
  registrosHoje: { leads: 9, experimentais: 4, matriculas: 0 },
  canais: [
    { nome: 'Instagram', quantidade: 3 },
    { nome: 'Sem canal', quantidade: 3 },
    { nome: 'Ex-aluno', quantidade: 1 },
    { nome: 'Indicação', quantidade: 1 },
    { nome: 'Visita/Placa', quantidade: 1 },
  ],
  cursos: [
    { nome: 'Sem curso', quantidade: 5 },
    { nome: 'Musicalização Infantil', quantidade: 3 },
    { nome: 'Canto', quantidade: 1 },
  ],
  proximas: [],
  alertas: ['2 pendências em auditoria'],
  matriculasDetalhadas: [],
  snapshot: { atualizadoEm: '2026-07-30T22:50:07Z', status: 'completo' },
}
```

O texto deve conter todos os blocos aprovados, `251`, `32`, `5`, `16`,
`R$ 426,19`, `R$ 446,38`, meta `R$ 444,00` somente junto ao ticket das
parcelas, taxa com ressalva, fonte composta e horário do snapshot. Não pode
conter `214`, `Experimentais: *7*`, `BLOQUEADA` nem o rodapé genérico
“campos seguem em validação canônica”.

- [ ] **Step 3: Executar e confirmar vermelho**

Run:

```powershell
deno test supabase/functions/_shared/relatorio-comercial.test.ts
```

Expected: módulo ausente.

- [ ] **Step 4: Implementar os tipos e cálculos puros**

Exportar:

```ts
export interface ProximaExperimental {
  snapshotAtivo: boolean
  cancelada: boolean
  situacao: 'agendada' | 'presente' | 'faltou' | 'cancelada' | 'sem_status'
  dataAula: string
  horarioAula: string | null
  alunoNome: string
  cursoNome: string
}

export function parcelasDoGrupo(matricula: {
  valor_parcela?: number | null
  parcelas_relatorio?: number[] | null
}): number

export function passaporteDoGrupo(matricula: {
  valor_passaporte?: number | null
}): number

export function calcularTicketsMatriculas(
  matriculas: Array<{ valorParcela: number; valorPassaporte: number }>,
): TicketsMatriculas

export function selecionarProximasExperimentais(
  linhas: ProximaExperimental[],
  instanteGeracao: Date,
  limite = 10,
): { itens: ProximaExperimental[]; excedentes: number }

export function formatarTaxaExpMatDiaria(input: TaxaExpMatInput): string

export function formatarRelatorioComercialDiario(
  dados: RelatorioComercialDados,
): string
```

`calcularTicketsMatriculas` arredonda apenas o resultado final para duas casas.
`selecionarProximasExperimentais` monta o instante BRT com data + horário,
filtra `snapshotAtivo`, `!cancelada`, `situacao='agendada'`, início estritamente
posterior e máximo inclusivo D+7.

- [ ] **Step 5: Implementar o formatador unificado**

Gerar as dez seções na ordem da especificação. Usar `Intl.NumberFormat('pt-BR',
{ style: 'currency', currency: 'BRL' })` para dinheiro. Top canais/cursos devem
usar os itens recebidos, sem campos de matrícula que hoje estão fixados em zero.
Se não houver alertas, publicar `Nenhum gap operacional identificado`.

- [ ] **Step 6: Rodar o teste verde**

Run:

```powershell
deno test supabase/functions/_shared/relatorio-comercial.test.ts
```

Expected: todos os testes puros passam.

- [ ] **Step 7: Atualizar mapas e commit**

```powershell
git add -- supabase/functions/_shared/relatorio-comercial.ts supabase/functions/_shared/relatorio-comercial.test.ts docs/MAPA-SISTEMA.md docs/METRICAS.md
git commit -m "test: definir relatorio comercial unificado"
```

---

### Task 6: Integrar o relatório unificado ao backend canônico

**Files:**

- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Modify: `supabase/functions/_shared/relatorio-comercial.ts`
- Modify: `supabase/functions/_shared/relatorio-comercial.test.ts`
- Create: `tests/relatorioComercialExperimentaisFrescas.test.mjs`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Escrever o teste vermelho de orquestração**

O teste estrutural deve exigir, dentro de
`gerarRelatorioComercialDiario(supabase, unidadeId, dataReferencia?)`:

1. cálculo BRT determinístico ou uso de `data_referencia`;
2. `dataInicioSnapshot` no primeiro dia do mês;
3. `dataFimSnapshot` em D+7, inclusive quando cair no mês seguinte;
4. `await atualizarSnapshotExperimentais(...)` antes das leituras;
5. validação de `snapshot_status === 'completo'`;
6. carga das RPCs mensal/diária, conciliação, metas, registros criados,
   próximas e matrículas detalhadas;
7. chamada única a `formatarRelatorioComercialDiario`;
8. `dry_run_comercial` e cron usando a mesma função;
9. cron canônico inserindo em `fila_relatorios_whatsapp`, nunca em
   `fila_relatorios_sol_hermes`;
10. nenhuma chamada a `get_dados_comercial_ia`.

- [ ] **Step 2: Escrever testes vermelhos dos agregados**

Adicionar testes puros para:

```ts
parcelasDoGrupo({
  valor_parcela: 395,
  parcelas_relatorio: [395, 395],
}) === 790

passaporteDoGrupo({
  valor_passaporte: 400,
  parcelas_relatorio: [395, 395],
}) === 400
```

Isso garante que segundo curso pode elevar o ticket consolidado de parcelas da
pessoa, sem virar uma segunda matrícula comercial nem duplicar o passaporte.
Também exigir que a lista detalhada, o total mensal e os denominadores dos dois
tickets recebam exatamente o mesmo array `matriculasNovas`.

- [ ] **Step 3: Executar e confirmar vermelho**

Run:

```powershell
deno test supabase/functions/_shared/relatorio-comercial.test.ts
node --test tests/relatorioComercialExperimentaisFrescas.test.mjs
```

Expected: preflight D+7, agregador rico e proibição do legado ausentes.

- [ ] **Step 4: Implementar o refresh mês + D+7**

Criar:

```ts
async function atualizarSnapshotExperimentais(
  unidadeId: string,
  dataInicio: string,
  dataFim: string,
): Promise<SnapshotRefreshResponse>
```

O body servidor-servidor será:

```json
{
  "modo": "experimentais",
  "unidade_id": "368d47f5-2d88-4475-bc14-ba084a9a348e",
  "data_inicio": "2026-07-01",
  "data_fim": "2026-08-06"
}
```

Exigir HTTP OK, `success=true`, mesmo UUID/intervalo e
`snapshot_execucao_id`. Não fazer fallback para snapshot antigo ou zero.
O body acima é o exemplo de referência da Barra em
`data_referencia=2026-07-30`; em produção UUID e datas são calculados, não
fixados.

- [ ] **Step 5: Implementar autorização explícita do preview**

Como a Edge usa `verify_jwt=false` para aceitar cron:

- reconhecer `service_role` para `modo=cron`;
- para `dry_run_comercial`, validar o JWT com client de usuário;
- chamar `pode_gerar_relatorio_comercial_v1(p_unidade_id)`;
- rejeitar 401 sem JWT, 403 fora da unidade e 400 para `todos`;
- nunca confiar apenas no UUID enviado pelo navegador.

- [ ] **Step 6: Carregar as fontes canônicas depois do refresh**

Depois do preflight, carregar em paralelo:

```ts
get_kpis_comercial_canonicos_v2(mensal)
get_kpis_comercial_canonicos_v2(diario)
get_conciliacao_experimentais_v2(mensal)
get_experimentais_emusys_operacional_v1(mensal)
get_experimentais_emusys_operacional_v1(diario)
metas_kpi(unidade, ano, mes, tipos aprovados)
emusys_experimentais_raw(snapshot_ativo, data entre referência e D+7)
leads(created_at no dia BRT)
lead_experimentais(created_at no dia BRT)
alunos(created_at no dia BRT)
```

As queries de `created_at` usam intervalo semiaberto
`[00:00:00-03:00, dia seguinte 00:00:00-03:00)`. O snapshot futuro seleciona
somente `emusys_aula_id`, IDs estáveis, data, horário, nome, curso, situação e
cancelamento; nunca retorna telefone, nascimento ou payload ao navegador.

- [ ] **Step 7: Enriquecer próximas experimentais sem join por nome**

Resolver curso nesta ordem:

1. curso específico do raw quando diferente de `Aula Experimental`;
2. `lead_experimental_id -> lead_experimentais.curso_interesse_id -> cursos`;
3. `lead_id -> leads.curso_interesse_id -> cursos`;
4. `emusys_lead_id` junto com `unidade_id`;
5. `N/A`.

Nome serve apenas para exibição. Nenhum vínculo ou deduplicação usa nome
isolado. A chave é `unidade_id + emusys_aula_id + participante_chave`.

- [ ] **Step 8: Montar a mesma coorte para lista e tickets**

Após `agruparMatriculasComerciais(...).filter(ehMatriculaComercialCanonicaEdge)`:

```ts
const tickets = calcularTicketsMatriculas(
  matriculasNovas.map((mat) => ({
    valorParcela: parcelasDoGrupo(mat),
    valorPassaporte: passaporteDoGrupo(mat),
  })),
)
```

Passar `matriculasNovas` sem nova filtragem ao formatador detalhado. Conferir
que `tickets.parcelas.denominador` e
`tickets.passaportes.denominador` são auditáveis contra essa lista.

- [ ] **Step 9: Montar e formatar o payload único**

Mapear:

```text
dia.leads                         <- kpisDia.leads_entrantes
dia.experimentaisPrevistas        <- resumoEmusysDia.linhas_raw
dia.experimentaisRealizadas       <- resumoEmusysDia.realizadas_emusys
dia.faltas                        <- resumoEmusysDia.faltas
dia.canceladas                    <- resumoEmusysDia.canceladas
dia.visitas                       <- kpisDia.visitas
dia.matriculas                    <- kpisDia.matriculas_comerciais_principais
dia.passaportes                   <- kpisDia.passaportes_total
mes.leads                         <- kpisMes.leads_entrantes
mes.experimentaisRealizadas       <- resumoEmusysMes.realizadas_emusys
mes.presencasVinculadas           <- conciliacao.experimentais_realizadas_confirmadas
mes.faltas                        <- resumoEmusysMes.faltas
mes.matriculas                    <- matriculasNovas.length
```

Metas vêm diretamente de `metas_kpi`. Canais/cursos vêm apenas dos arrays
diários da RPC v2. Alertas combinam gaps reais, frescor e pendências, sem texto
genérico quando não houver ocorrência.

- [ ] **Step 10: Preservar idempotência sem colisão manual × automático**

O cron canônico continua na `fila_relatorios_whatsapp`. A coluna
`tipo_relatorio` e a chave `tipo + unidade + JID + dia` permitem que os
documentos administrativo e comercial coexistam no mesmo destino, mantendo a
deduplicação individual. O envio manual continua na `fila_relatorios_sol_hermes`.
Remover qualquer consulta do produtor canônico à fila Sol/Hermes; assim um
manual não suprime o automático. A migration forward-only preserva as linhas
anteriores como `relatorio_admin` antes de substituir a chave única antiga.

- [ ] **Step 11: Rodar testes verdes**

Run:

```powershell
deno test supabase/functions/_shared/relatorio-comercial.test.ts
node --test tests/relatorioComercialExperimentaisFrescas.test.mjs tests/comercialExperimentaisSnapshotSchema.test.mjs
```

Expected: testes puros, contrato da Edge e coorte/tickets passam.

- [ ] **Step 12: Atualizar mapas e commit**

```powershell
git add -- supabase/functions/relatorio-admin-whatsapp/index.ts supabase/functions/_shared/relatorio-comercial.ts supabase/functions/_shared/relatorio-comercial.test.ts tests/relatorioComercialExperimentaisFrescas.test.mjs docs/MAPA-SISTEMA.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "fix: gerar relatorio comercial canonico unificado"
```

---

### Task 7: Fazer a tela diária consumir o gerador canônico

**Files:**

- Modify: `src/components/App/Comercial/ComercialPage.tsx`
- Modify: `tests/regressoesComercialPermanencia.test.mjs`
- Modify: `tests/relatorioComercialExperimentaisFrescas.test.mjs`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Escrever o teste vermelho do frontend**

Para o relatório `diario`, exigir:

```ts
supabase.functions.invoke('relatorio-admin-whatsapp', {
  body: {
    modo: 'dry_run_comercial',
    unidade: unidadeRelatorioId,
    data_referencia: dataFim,
  },
})
```

O teste deve confirmar:

- unidade consolidada `todos` é rejeitada com mensagem clara;
- `data_referencia` é repassada à edge, aceita somente calendário estrito
  `YYYY-MM-DD` e governa tanto o dia publicado quanto a janela mês até D+7;
- timestamp, offset, ausência e data impossível recebem `400`, enquanto o cron
  sem data externa continua usando o instante atual em BRT;
- erro da edge vira o estado `relatorioErro`;
- o texto exibido é exatamente `data.texto`;
- o texto inclui `Ticket médio das parcelas` e
  `Ticket médio dos passaportes`;
- copiar e enfileirar usam o mesmo `relatorioTexto`;
- `gerarRelatorioDiario` não consulta diretamente as três RPCs comerciais;
- semanal, mensal e comparativos continuam funcionando como antes.

- [ ] **Step 2: Executar e confirmar vermelho**

Run:

```powershell
node --test tests/relatorioComercialExperimentaisFrescas.test.mjs tests/regressoesComercialPermanencia.test.mjs
```

Expected: a tela ainda monta o relatório diário localmente.

- [ ] **Step 3: Substituir somente o gerador diário**

Manter o nome `gerarRelatorioDiario`, mas reduzir seu corpo a:

1. resolver unidade e `dataFim`;
2. exigir unidade específica;
3. invocar `dry_run_comercial`;
4. validar `error`, `success` e `texto`;
5. devolver o texto.

Não chamar `sync-presenca-emusys` diretamente no navegador; a autorização e o refresh acontecem na edge canônica.

- [ ] **Step 4: Verificar estados da interface**

Garantir que:

- o spinner permanece ativo enquanto refresh + geração executam;
- a mensagem de falha não mostra zero nem texto antigo;
- botão de enviar só habilita depois de `relatorioTexto` novo;
- mudança de unidade invalida uma geração anterior pelo `relatorioGeracaoIdRef`.

- [ ] **Step 5: Rodar testes e build**

Run:

```powershell
node --test tests/relatorioComercialExperimentaisFrescas.test.mjs tests/regressoesComercialPermanencia.test.mjs
npm run build
```

Expected: testes passam e Vite conclui sem erro.

- [ ] **Step 6: Atualizar mapas e commit**

```powershell
git add -- src/components/App/Comercial/ComercialPage.tsx tests/regressoesComercialPermanencia.test.mjs tests/relatorioComercialExperimentaisFrescas.test.mjs docs/MAPA-SISTEMA.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md
git commit -m "refactor: unificar relatorio diario comercial"
```

---

### Task 8: Verificação local completa e revisão de segurança

**Files:**

- Modify only if a regression is found in files already listed above.

- [ ] **Step 1: Rodar todos os testes direcionados**

```powershell
deno test supabase/functions/_shared/experimental-snapshot.test.ts supabase/functions/_shared/relatorio-comercial.test.ts
node --test tests/comercialExperimentaisSnapshotSchema.test.mjs tests/comercialExperimentaisSnapshotPostgres.test.mjs tests/syncExperimentaisSnapshotContrato.test.mjs tests/conciliacaoExperimentaisSnapshotAtivo.test.mjs tests/conciliacaoExperimentaisSnapshotPostgres.test.mjs tests/relatorioComercialExperimentaisFrescas.test.mjs tests/regressoesComercialPermanencia.test.mjs tests/emusysAulasCamposNovosSync.test.mjs tests/syncPresencaEvidenciaBruta.test.mjs
npm run build
```

Expected: tudo verde.

- [ ] **Step 2: Rodar a suíte completa e comparar com baseline**

```powershell
node --test
```

Expected: nenhuma falha nova. Se as seis falhas preexistentes permanecerem, registrar os mesmos nomes e continuar; qualquer falha adicional bloqueia deploy.

- [ ] **Step 3: Auditar segredos, PII e permissões**

```powershell
rg -n "EMUSYS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|telefone_aluno|data_nascimento_aluno" supabase/functions/sync-presenca-emusys supabase/functions/relatorio-admin-whatsapp supabase/functions/_shared/experimental-snapshot.ts
rg -n "grant execute|revoke all|security definer|set search_path" supabase/migrations/20260730204500_snapshot_experimentais_emusys.sql supabase/migrations/20260730205500_conciliacao_experimentais_snapshot_ativo.sql
```

Expected:

- secrets apenas lidos de env e usados em headers;
- nenhum retorno/log novo contém PII;
- RPC mutadora restrita a `service_role`;
- RPCs de leitura mantêm o escopo autenticado;
- todas as `SECURITY DEFINER` fixam `search_path`.

- [ ] **Step 4: Revisar diff**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: sem whitespace errors, sem arquivos inesperados e somente commits desta feature após o commit da especificação.

---

### Task 9: Implantação segura, paridade nas três unidades e corte do legado

**Files:**

- No local code change expected.
- Operational evidence: Supabase migration history, edge versions, dry-run payload summaries, queue rows and exact legacy scheduler entry.

- [ ] **Step 1: Confirmar alvo e estado remoto em modo leitura**

Usar Supabase MCP:

1. confirmar project URL/ref `ouqwbbermlzqqvtqwlul`;
2. listar migrations remotas e verificar que os dois nomes novos ainda não existem;
3. inspecionar versões atuais de `sync-presenca-emusys` e `relatorio-admin-whatsapp`;
4. consultar flags `relatorio_comercial_diario_cron_ativo`;
5. consultar jobs que chamam `relatorio-admin-whatsapp`;
6. consultar as últimas filas `auto_cron` e `relatorio_comercial_diario`.

Não escrever nesta etapa.

- [ ] **Step 2: Aplicar migrations individualmente**

Aplicar, nesta ordem, via `apply_migration`:

```text
snapshot_experimentais_emusys
conciliacao_experimentais_snapshot_ativo
```

Executar esse intervalo fora do horário dos syncs completos. Se houver risco de
sobreposição, pausar somente os jobs exatos de `sync-presenca-emusys`, registrar
a configuração anterior e reativá-los depois da Task 3. Depois de cada
migration, executar consultas read-only que confirmem colunas, índices, ACLs e
funções. Parar se qualquer verificação divergir.

- [ ] **Step 3: Implantar primeiro o produtor do snapshot**

Deploy de:

```text
sync-presenca-emusys
```

Executar `modo=experimentais` para Barra, Campo Grande e Recreio, uma unidade
por vez, do primeiro dia do mês até D+7 em BRT. Em cada resposta exigir
`success=true`, execução, intervalo integral e contagens. Confirmar
explicitamente a virada de mês quando D+7 cair na competência seguinte.

Se os jobs de sync foram pausados no passo anterior, reativá-los com a
configuração exatamente registrada e confirmar o próximo horário.

- [ ] **Step 4: Comparar snapshot com GET `/aulas`**

Para cada unidade, fazer GET read-only paginado no mesmo intervalo e comparar:

```text
presentes/matriculados
faltas
canceladas
total de participantes experimentais
participações futuras ativas e não canceladas
```

Comparar com `get_experimentais_emusys_operacional_v1`. Diferença diferente de zero bloqueia a implantação do relatório.

No caso de referência da Barra, o teste de 30/07/2026 deve reproduzir `32 realizadas` quando executado contra aquele recorte histórico; para o dia corrente, usar os números atuais do Emusys.

- [ ] **Step 5: Validar conciliação sem envio**

Executar `get_conciliacao_experimentais_v2` nas três unidades e confirmar:

- raw inativo fora do denominador;
- pendências antigas de reagendamento/falta/cancelamento removidas;
- pendências reais ainda visíveis;
- taxa e fração numerador/denominador coerentes.

- [ ] **Step 6: Implantar o gerador e o frontend**

Deploy de:

```text
relatorio-admin-whatsapp
frontend da branch/commit verificado
```

Não ativar cron novo nem desativar legado ainda.

- [ ] **Step 7: Rodar dry-run triplo**

Chamar `dry_run_comercial` para Barra, Campo Grande e Recreio. Validar:

- texto usa contagem do snapshot recém-atualizado;
- texto preserva resumo diário, mês/meta, funil, registros, canais, cursos,
  próximas, alertas e lista detalhada;
- ticket de parcelas fecha com soma e denominador da lista;
- ticket de passaportes fecha com soma e denominador da lista;
- meta `ticket_medio` aparece apenas no ticket das parcelas;
- nenhuma ocorrência de `BLOQUEADA`;
- taxa aparece com aviso quando houver pendência;
- nenhuma aula passada aparece em próximas;
- aula futura no mesmo dia aparece e participante futuro com `ausente` não
  vira falta antecipada;
- `SEM BASE` apenas quando denominador for zero;
- nenhuma linha foi enfileirada/enviada pelo dry-run.

Abrir a tela Comercial em uma unidade, gerar o diário e confirmar texto idêntico ao dry-run da edge para a mesma data.

- [ ] **Step 8: Identificar e congelar o produtor legado exato**

No host da Sol/Hermes, listar de forma read-only o scheduler que executa:

```text
/home/sol/.openclaw/workspace/scripts/send-lareport-comercial-hermes.py
```

Registrar:

- tipo do scheduler;
- nome/linha exata;
- expressão de horário;
- comando completo;
- último disparo;
- procedimento exato de reativação.

Não usar busca ampla como alvo de remoção. Desabilitar somente a entrada exata confirmada e preservar uma cópia recuperável da configuração.

- [ ] **Step 9: Ativar somente o produtor canônico**

Depois de confirmar que o legado está desabilitado:

1. ativar `relatorio_comercial_diario_cron_ativo` apenas nas unidades aprovadas;
2. confirmar um único job canônico chamando a edge;
3. monitorar a primeira execução;
4. verificar uma única linha por unidade/dia na fila;
5. confirmar horário do snapshot, texto unificado e status de envio;
6. comprovar que uma linha manual existente em `fila_relatorios_sol_hermes`
   não impede a linha automática em `fila_relatorios_whatsapp`.

Se houver duplicidade, contagem divergente ou refresh falho, desativar o canônico antes de considerar reativar o legado.

- [ ] **Step 10: Registrar aceite e rollback**

Guardar no handoff:

- commits implantados;
- IDs das migrations;
- versões das duas edges;
- contagens GET × RPC por unidade;
- textos dos três dry-runs;
- entrada legada desabilitada;
- primeira fila canônica;
- resultado da suíte e as seis falhas preexistentes.

Rollback:

1. desligar o cron canônico;
2. reverter edges para versões anteriores se necessário;
3. manter colunas, execuções e linhas inativas para auditoria;
4. só reativar o legado depois de confirmar que o canônico não enviará;
5. nunca executar `DELETE` no raw.

---

## Critérios finais de aceite

- Barra, Campo Grande e Recreio usam o mesmo caminho.
- O relatório diário espera um refresh completo do mês antes de ler KPIs.
- O mesmo refresh cobre as próximas experimentais até D+7.
- O número publicado é igual ao GET `/aulas` do mesmo intervalo.
- Snapshot incompleto ou falho impede geração e envio.
- Só uma linha vigente existe por unidade/aula/participante.
- Histórico obsoleto permanece armazenado, mas não entra em contagem nem conciliação.
- A taxa diária é publicada com fração e aviso de auditoria; `BLOQUEADA` não aparece.
- O relatório exibe separadamente ticket médio das parcelas e ticket médio dos
  passaportes, ambos conciliados com a lista detalhada.
- A meta de ticket é aplicada somente às parcelas.
- Próximas experimentais excluem passadas, canceladas e duplicatas; futuras
  com `ausente` continuam agendadas.
- Os blocos ricos do automático e a lista detalhada do manual aparecem no
  mesmo texto.
- Tela, dry-run e cron geram o mesmo texto.
- Envio manual não suprime o cron canônico.
- Há exatamente um produtor automático ativo.
- Testes direcionados e build passam; a suíte completa não ganha regressões.

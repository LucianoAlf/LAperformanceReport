# Saúde das Automações — Spec

## Objetivo

Módulo de monitoramento passivo dos 3 webhooks Emusys (lead, experimental, matrícula) que captura todo evento, valida invariantes de negócio (matrícula sem professor, experimental sem lead, etc.) e expõe ao admin uma visão de jornada por pessoa/lead + feed cronológico. Foco: observação e diagnóstico, sem ação automática.

## Abordagem

Estender `automacao_log` (já gravada pelas edge functions) com 4 colunas (status, lead_id, payload_bruto, idempotency_key) + nova tabela auxiliar `automacao_invariantes` (1 linha por regra violada). Helper compartilhado em `_shared/invariantes.ts` checa regras após processar e grava as violações. Edge functions continuam não-bloqueantes — invariantes só observam.

## Banco de Dados

### Tabela: `automacao_log` (existente, expandida)

Campos novos:
- `status TEXT NOT NULL DEFAULT 'ok'` — `ok` | `warn` | `erro` (derivado das invariantes)
- `lead_id BIGINT NULL` — FK lógica para `leads.id` quando aplicável
- `payload_bruto JSONB NULL` — webhook payload original
- `idempotency_key TEXT UNIQUE NULL` — hash do payload para detectar reentrega

Campos existentes mantidos: `id`, `aluno_nome`, `aluno_id`, `unidade_nome`, `evento`, `acao`, `detalhes`, `workflow_id`, `execution_id`, `created_at`.

Backfill: linhas antigas recebem `status='ok'` pelo DEFAULT (não significa "validado"; significa "não checado"). `payload_bruto` fica NULL para histórico.

### Tabela: `automacao_invariantes` (nova)

```sql
CREATE TABLE automacao_invariantes (
  id           BIGSERIAL PRIMARY KEY,
  log_id       BIGINT NOT NULL REFERENCES automacao_log(id) ON DELETE CASCADE,
  regra        TEXT NOT NULL,        -- ex: 'matricula_sem_professor'
  severidade   TEXT NOT NULL,        -- 'critico' | 'aviso'
  mensagem     TEXT NOT NULL,
  visto_em     TIMESTAMPTZ NULL,
  visto_por    UUID NULL,            -- auth.uid()
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Índices

Em `automacao_log`:
- `(aluno_id, created_at DESC)` — jornada por aluno
- `(lead_id, created_at DESC)` — jornada por lead
- `(status, created_at DESC)` — feed filtrado por status
- `(idempotency_key)` UNIQUE já vem da coluna

Em `automacao_invariantes`:
- `(visto_em) WHERE visto_em IS NULL` — contagem do badge
- `(severidade, created_at DESC)` — feed por severidade
- `(regra, created_at DESC)` — filtro por regra específica
- `(log_id)` — join com log

### RLS

```sql
ALTER TABLE automacao_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE automacao_invariantes ENABLE ROW LEVEL SECURITY;
```

Políticas:
- SELECT em `automacao_log`: qualquer `authenticated` (compatibilidade — 4 telas existentes leem essa tabela com client anon: `ModalNovoLead.tsx`, `TabAutomacaoLeads.tsx`, `TabAutomacao.tsx`, `FormLead.tsx`). Habilitar RLS admin-only quebraria essas leituras.
- SELECT em `automacao_invariantes`: qualquer `authenticated` (tabela nova, mas mesma política por consistência)
- UPDATE em `automacao_invariantes` (`visto_em`/`visto_por`): admin only (`perfis.tipo = 'admin'` ou `admin_automacoes`)
- INSERT em ambas: via `service_role` (edge functions), bypassa RLS
- DELETE: ninguém via UI

Gatekeeping de quem ENXERGA o módulo (item de menu + rota `/automacoes`) fica no frontend via `hasPermission('admin_automacoes')`. RLS é defesa em profundidade, não autorização de UI.

### Retenção

Sem cron. Volume estimado: ~75 MB/ano. Acumula. Reversível se um dia incomodar.

## Catálogo de Invariantes

Identificadores estáveis (`regra`), severidade (`critico` = entra ruim no banco, requer correção; `aviso` = subótimo mas funcional).

### Lead novo
- `lead_sem_nome` (crítico)
- `lead_sem_telefone` (crítico)
- `lead_telefone_invalido` (aviso)
- `lead_sem_unidade` (crítico)
- `lead_duplicado_mesmo_dia` (aviso)
- `lead_origem_desconhecida` (aviso)

### Experimental marcada
- `experimental_sem_lead` (crítico) — webhook chegou mas não achou lead por telefone (mesmo após criar)
- `experimental_data_passada` (aviso) — `data_experimental` < hoje no momento da marcação
- `experimental_sem_professor` (crítico) — `id_professor` ausente no payload
- `experimental_professor_nao_resolvido` (crítico) — id veio mas `professores_unidades` não tem
- `experimental_professor_resolvido_por_nome` (aviso) — auto-curou via nome (gravou emusys_id retroativo)
- `experimental_sem_curso` (aviso) — `curso_id` ausente
- `experimental_remarcacao_sem_motivo` (aviso) — mudou data e não veio motivo

### Experimental reagendada
- `experimental_reagendada_data_passada` (aviso) — reagendou pra data já passada
- `experimental_reagendada_mesmo_horario` (aviso) — webhook chegou mas data/hora idênticas (no-op)
- `experimental_reagendada_apos_realizada` (crítico) — paradoxo: já estava marcada como realizada
- `experimental_reagendada_apos_cancelada` (aviso) — reativando exp cancelada (provável OK, registrar)

### Experimental cancelada
- `experimental_cancelada_sem_motivo` (aviso) — `motivo_cancelamento` null/vazio
- `experimental_cancelada_apos_realizada` (crítico) — paradoxo
- `experimental_cancelada_aluno_ja_matriculado` (aviso) — virou aluno e ainda chega cancelamento

### Experimental realizada
- `experimental_realizada_data_futura` (crítico) — marcou compareceu antes da data marcada
- `experimental_realizada_sem_professor_atribuido` (aviso) — `id_professor` veio NULL no realizada
- `experimental_realizada_professor_diverge_marcacao` (aviso) — `id_professor` no realizada ≠ do marcada (trocou professor de última hora — registrar)
- `experimental_realizada_e_faltou` (crítico) — flags `experimental_realizada=true` e `faltou_experimental=true` simultâneas

### Experimental faltou
- `experimental_faltou_data_futura` (crítico) — marcou faltou antes da data
- `experimental_faltou_apos_realizada` (crítico) — paradoxo

### Matrícula nova / segundo curso
- `matricula_sem_aluno_nome` (crítico)
- `matricula_sem_emusys_matricula_id` (crítico)
- `matricula_sem_disciplinas` (crítico)
- `matricula_sem_professor` (crítico)
- `matricula_professor_nao_resolvido` (crítico)
- `matricula_professor_resolvido_por_nome` (aviso)
- `matricula_sem_curso` (crítico)
- `matricula_sem_lead_origem` (aviso) — matrícula direta sem lead anterior
- `matricula_sem_valor_passaporte` (aviso)
- `matricula_aluno_ja_ativo_mesmo_curso` (aviso)
- `matricula_duplicada` (aviso) — `idempotency_key` já existia

### Renovação
- `renovacao_sem_matricula_anterior` (crítico)
- `renovacao_mudou_unidade` (aviso)
- `renovacao_mudou_professor` (aviso)
- `renovacao_reajuste_acima_30pct` (aviso)

### Trancamento
- `trancamento_aluno_nao_encontrado` (crítico)
- `trancamento_aluno_ja_inativo` (aviso)
- `trancamento_sem_motivo` (aviso)

### Finalização (evasão)
- `evasao_aluno_nao_encontrado` (crítico)
- `evasao_sem_motivo_saida_id` (aviso) — impacta score do professor
- `evasao_motivo_nulo` (aviso)
- `evasao_aluno_ja_inativo` (aviso)
- `evasao_sem_historico_ltv` (aviso) — saiu de tudo e `alunos_historico` não recebeu linha

### Transversais (qualquer webhook)
- `payload_json_invalido` (crítico)
- `payload_sem_unidade_resolvida` (crítico)
- `webhook_reentregue` (aviso) — `idempotency_key` repetida em < 5min
- `processamento_falhou_excecao` (crítico)

Total: ~44 regras. Em produção saudável, `crítico` deve tender a zero.

### Meta-invariante (do próprio módulo)
- `invariante_checagem_falhou` (crítico) — alguma função `checar*` lançou exceção inesperada durante a checagem (payload em formato não previsto, bug no helper, etc.). Garante observabilidade do próprio módulo de observabilidade.

## Captura nas Edge Functions

### Helper compartilhado: `supabase/functions/_shared/invariantes.ts`

```typescript
type Severidade = 'critico' | 'aviso';
type Invariante = { regra: string; severidade: Severidade; mensagem: string };

// Cada checar* é envelopado internamente em try/catch.
// Se a checagem em si falhar, retorna [{ regra: 'invariante_checagem_falhou', ... }]
// em vez de lançar — protege o fluxo principal da edge.
export function checarLead(payload, resultado): Invariante[];
export function checarExperimentalMarcada(payload, resultado): Invariante[];
export function checarExperimentalReagendada(payload, resultado): Invariante[];
export function checarExperimentalCancelada(payload, resultado): Invariante[];
export function checarExperimentalRealizada(payload, resultado): Invariante[];
export function checarExperimentalFaltou(payload, resultado): Invariante[];
export function checarMatricula(payload, resultado): Invariante[];
export function checarRenovacao(payload, resultado): Invariante[];
export function checarTrancamento(payload, resultado): Invariante[];
export function checarFinalizacao(payload, resultado): Invariante[];

// Wrapper compartilhado por todas as checar*
function comFallback(fn: () => Invariante[]): Invariante[] {
  try {
    return fn();
  } catch (e) {
    return [{
      regra: 'invariante_checagem_falhou',
      severidade: 'critico',
      mensagem: `Checagem lançou exceção: ${e.message}`,
    }];
  }
}

export async function gravarLog(supabase, params: {
  evento: string;
  acao: string;
  aluno_id?: number;
  aluno_nome: string;
  lead_id?: number;
  unidade_nome?: string;
  payload_bruto: any;
  idempotency_key: string;
  invariantes: Invariante[];
  detalhes?: any;
}): Promise<void>;
```

Status derivado:
- `erro` se alguma invariante tem `severidade='critico'`
- `warn` se tem só `aviso`
- `ok` se array vazio

### Fluxo nas edges

Edges modificadas (3):
- `processar-lead-emusys` — chama `checarLead` ao final
- `processar-experimental-emusys` — chama `checarExperimental` ao final
- `processar-matricula-emusys` — chama `checarMatricula`/`Renovacao`/`Trancamento`/`Finalizacao` conforme `tipo_evento`

Padrão:

```typescript
const payload = await req.json();
const idempotency_key = computarHash(payload);

try {
  const resultado = await processarMatricula(supabase, payload);
  const invariantes = checarMatricula(payload, resultado);
  await gravarLog(supabase, { ...resultado, payload_bruto: payload, idempotency_key, invariantes });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
} catch (e) {
  await gravarLog(supabase, {
    payload_bruto: payload,
    idempotency_key,
    invariantes: [{ regra: 'processamento_falhou_excecao', severidade: 'critico', mensagem: e.message }],
    aluno_nome: payload.aluno?.nome ?? '(desconhecido)',
    evento: payload.tipo_evento ?? 'desconhecido',
    acao: 'erro',
  });
  return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
}
```

Princípio: invariantes nunca bloqueiam. Webhook continua entrando — só observa.

### Idempotência

`idempotency_key` = hash estável de campos do payload (ex: SHA-256 de `emusys_matricula_id + tipo_evento + data_evento`). `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` → reentrega vira no-op + grava invariante `webhook_reentregue`.

## Frontend

### Tela: `src/components/App/Automacoes/AutomacoesPage.tsx` (nova)

Rota: `/automacoes` — lazy load no `router.tsx`.

Menu lateral: novo item "Saúde das Automações" condicionado a `hasPermission('admin_automacoes')`, com badge vermelho mostrando contagem de invariantes críticas `visto_em IS NULL`.

### Aba 1: Jornadas (default)

Lista agrupada por pessoa (aluno_id OR lead_id OR telefone). Cada card = 1 pessoa, expansível em timeline cronológica de todos os eventos dela.

**Filtros (barra superior):**
- Período: presets (Hoje, 7 dias, 30 dias, Mês corrente) + custom range
- Unidade: multi-select (CG, Recreio, Barra)
- Status da jornada: Todas / Com erro / Com aviso / Apenas OK / Apenas não vistas
- Fluxo de entrada: Lead direto / Experimental / Matrícula direta
- Busca: text input (nome, telefone) — debounce 300ms, ILIKE em `aluno_nome` + lead.nome + telefone
- Toggle "Apenas não vistos"

**Card de jornada (collapsed):**
- Nome + telefone + unidade
- Resumo da timeline: "Lead 02/05 → Exp 05/05 → Matrícula 12/05"
- Indicadores: X críticos · Y avisos · botão "Marcar visto"

**Card expandido:**
- Timeline vertical: 1 linha por evento com ícone de status (verde/amarelo/vermelho)
- Cada linha: data/hora, tipo de evento, ação, link "Ver payload" (abre modal com `payload_bruto` formatado)
- Invariantes violadas listadas abaixo do evento, expansível

### Aba 2: Feed de eventos

Lista plana cronológica de `automacao_log`. Linhas: data/hora, status badge, evento, aluno/lead, unidade, contagem de invariantes, botão "ver detalhes".

Filtros adicionais (além dos da aba 1):
- Tipo de evento: multi-select (lead, experimental, matricula_nova, matricula_renovacao, matricula_trancamento, matricula_finalizacao)
- Regra violada: dropdown com as ~30 regras
- Severidade: Crítico / Aviso

### Marcar como visto

Botão "Marcar todas como vistas" no topo (escopo: filtros aplicados em tela). Marcação grava `visto_em = now()` e `visto_por = auth.uid()` em `automacao_invariantes`. Items continuam visíveis na tela — só somem do contador do badge.

### Atualização

Auto-refresh polling a cada 30s na aba aberta. Botão manual de refresh no topo. Sem WebSocket.

### Componentes a criar

- `AutomacoesPage.tsx` — container com tabs
- `TabJornadas.tsx` — aba 1
- `TabFeedEventos.tsx` — aba 2
- `CardJornada.tsx` — card colapsado/expandido
- `LinhaEvento.tsx` — linha do feed e timeline
- `ModalPayloadBruto.tsx` — visualização JSON formatado
- `useAutomacoesData.ts` — hook de fetch com filtros
- `useBadgeAutomacoes.ts` — hook do contador do menu

## Permissões

- Nova permissão granular: `admin_automacoes`
- Admin geral recebe por default; pode ser delegada individualmente
- Função utilitária em AuthContext: `hasPermission('admin_automacoes')`

## Estimativas

- Volume atual: ~250 webhooks/semana (~13k/ano)
- Cada linha completa: ~5 KB (com payload bruto) → ~75 MB/ano em `automacao_log`
- Invariantes: 0–3 linhas por log, ~0.5 KB cada → ~10 MB/ano em `automacao_invariantes`
- **Total: ~85 MB/ano**, irrelevante para Supabase Pro (8 GB+)
- Latência adicional na edge: ~2-5ms (checagem + 1-2 inserts via service_role)

## Não inclui

- Reprocessamento de webhooks antigos (sem payload bruto salvo)
- Backfill de invariantes retroativas
- Alertas externos (WhatsApp/email) — só badge no menu
- Sync de presença, sync de professores, WhatsApp/UAZAPI — fora do escopo desta v1
- Botão "reprocessar" no UI — observação pura, sem ação
- Cron de limpeza — manter tudo

## Sucesso (critério de aceite)

1. Ao chegar webhook de matrícula sem professor: linha em `automacao_log` com `status='erro'` + linha em `automacao_invariantes` com `regra='matricula_sem_professor'`. Aluno é inserido normalmente.
2. Admin abre `/automacoes`, vê jornada de João Silva com timeline destacando o evento problemático em vermelho.
3. Badge no menu mostra "1" enquanto invariante crítica permanece com `visto_em IS NULL`.
4. Admin marca como visto, badge zera. Linha continua visível na lista.
5. Reentrega do mesmo webhook em 5min: gera invariante `webhook_reentregue` (aviso), não duplica aluno.

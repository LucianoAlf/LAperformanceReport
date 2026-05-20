# Saúde das Automações — Spec

## Objetivo

Módulo de monitoramento passivo dos 3 webhooks Emusys (lead, experimental, matrícula) que captura divergências de negócio (matrícula sem professor, experimental sem lead, etc.) e expõe ao admin uma visão de jornada por pessoa/lead + feed cronológico. Foco: observação e diagnóstico, sem ação automática.

## Abordagem (arquitetura híbrida)

Estado atual da infra: somente **matrícula** tem edge function nossa (`processar-matricula-emusys`). **Lead** e **experimental** entram via workflows n8n com lógica complexa (UPSERT direto, IA SDR Mila, waits, NocoDB). Migrar esses workflows traz risco alto.

Solução híbrida:
1. **Matrícula** — validação em tempo real: a edge existente chama helper de invariantes ao final do processamento e grava `automacao_log` + `automacao_invariantes`.
2. **Lead + Experimental + Alunos** — auditoria periódica: nova edge `auditor-divergencias-emusys` roda via pg_cron horário (e por botão manual no frontend) varrendo tabelas com queries SQL idempotentes.

Vantagens:
- Zero migração de workflows n8n
- Captura também cadastros manuais via frontend (FormLead, etc.) e registros antigos quebrados
- Edge crítica de matrícula tocada minimamente (helper com `comFallback`)
- Latência aceitável (1h por padrão, ajustável; botão manual dá feedback imediato)

Storage: estender `automacao_log` com 4 colunas (status, lead_id, payload_bruto, idempotency_key) + nova tabela auxiliar `automacao_invariantes` (1 linha por regra violada).

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

### Fluxo na edge de matrícula (única edge modificada)

`processar-matricula-emusys` chama `checarMatricula`/`Renovacao`/`Trancamento`/`Finalizacao` conforme `tipo_evento` ao final do processamento.

Padrão:

```typescript
const payload = await req.json();
const idempotency_key = computarHash(payload);

try {
  const resultado = await processarMatricula(supabase, payload);
  const invariantes = comFallback(() => checarMatricula(payload, resultado));
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

### Edge auditor (lead + experimental + alunos)

Nova edge function `auditor-divergencias-emusys` cobre os pilares que NÃO têm edge nossa (workflows n8n complexos: `EB0LibpOJCLhKp7M` para leads e `Fucq0bQwF4oeuWnv` para experimentais).

Disparo em 2 modos:
1. **Automático**: pg_cron horário (`auditor-divergencias-cron`, every hour at minute 0)
2. **Manual**: botão "Rodar agora" no frontend chama `supabase.functions.invoke('auditor-divergencias-emusys', { body: { trigger: 'manual', user_id } })`

Estrutura interna:

```typescript
type Trigger = 'cron' | 'manual';

const REGRAS = [
  {
    regra: 'lead_sem_telefone',
    severidade: 'critico' as const,
    query: `
      SELECT id, nome, unidade_id, created_at
      FROM leads
      WHERE (telefone IS NULL OR telefone = '')
        AND created_at > now() - interval '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM automacao_invariantes ai
          WHERE ai.regra = 'lead_sem_telefone' AND ai.mensagem LIKE 'lead_id=' || leads.id || '%'
        )
    `,
    construirMensagem: (row) => `lead_id=${row.id} nome=${row.nome} unidade=${row.unidade_id}`,
    construirLog: (row) => ({
      evento: 'auditoria_lead',
      acao: 'divergencia_detectada',
      aluno_nome: row.nome,
      lead_id: row.id,
    }),
  },
  // ... ~25-30 outras regras de lead/experimental/alunos
];

serve(async (req) => {
  const { trigger = 'cron', user_id = null } = req.method === 'POST' ? await req.json() : {};
  const t0 = Date.now();
  let totalDetectado = 0, totalNovo = 0;

  for (const regra of REGRAS) {
    try {
      const { data: rows } = await supabase.rpc('executar_query_segura', { sql: regra.query });
      for (const row of rows ?? []) {
        await gravarLog(supabase, {
          ...regra.construirLog(row),
          payload_bruto: row,  // snapshot do banco (não webhook bruto)
          idempotency_key: `audit:${regra.regra}:${row.id}`,
          invariantes: [{ regra: regra.regra, severidade: regra.severidade, mensagem: regra.construirMensagem(row) }],
          detalhes: { trigger, user_id, audit_run_at: new Date().toISOString() },
        });
        totalNovo++;
      }
      totalDetectado += (rows?.length ?? 0);
    } catch (e) {
      // falha numa regra não derruba as outras
      console.error(`Regra ${regra.regra} falhou:`, e);
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    duracao_ms: Date.now() - t0,
    total_detectado: totalDetectado,
    novos: totalNovo,
    trigger,
  }), { status: 200 });
});
```

Idempotência: `idempotency_key = 'audit:<regra>:<record_id>'`. Mesma regra detectada na mesma linha em rodadas seguintes vira no-op via `ON CONFLICT DO NOTHING`. Se a divergência for resolvida (ex: admin preencheu o telefone), próxima rodada não detecta mais, mas o log antigo permanece — útil pra histórico.

### pg_cron

```sql
SELECT cron.schedule(
  'auditor-divergencias-cron',
  '0 * * * *',  -- toda hora cheia
  $$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/auditor-divergencias-emusys',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT setting FROM auth_keys WHERE name = 'anon_key'),
        'Content-Type', 'application/json'
      ),
      body := '{"trigger": "cron"}'
    );
  $$
);
```

### Idempotência (matrícula em tempo real)

`idempotency_key` na edge de matrícula = hash estável de campos do payload (ex: SHA-256 de `emusys_matricula_id + tipo_evento + data_evento`). `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` → reentrega vira no-op + grava invariante `webhook_reentregue`.

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

### Botão "Rodar auditoria agora"

Acima das abas, botão proeminente "Rodar auditoria agora" (ícone `RefreshCw`). Disponível só para admins.

Comportamento:
1. Clica → botão desabilita, label muda para "Rodando..." com spinner
2. Chama `supabase.functions.invoke('auditor-divergencias-emusys', { body: { trigger: 'manual', user_id: auth.uid() } })`
3. Edge varre o banco (~5-15s para queries SQL idempotentes)
4. Retorno traz `{ total_detectado, novos, duracao_ms }`
5. Toast: `Auditoria concluída em Xs — Y novas divergências detectadas` (verde) ou `Sem novas divergências desde a última auditoria` (cinza)
6. Lista do painel auto-recarrega

Throttle: bloquear botão por 30s após click (evita spam clicks).

### Componentes a criar

- `AutomacoesPage.tsx` — container com tabs + botão "Rodar auditoria agora"
- `TabJornadas.tsx` — aba 1
- `TabFeedEventos.tsx` — aba 2
- `CardJornada.tsx` — card colapsado/expandido
- `LinhaEvento.tsx` — linha do feed e timeline
- `ModalPayloadBruto.tsx` — visualização JSON formatado
- `BotaoRodarAuditoria.tsx` — botão com loading state + invoke da edge auditor
- `useAutomacoesData.ts` — hook de fetch com filtros
- `useBadgeAutomacoes.ts` — hook do contador do menu

## Permissões

- Nova permissão granular: `admin_automacoes`
- Admin geral recebe por default; pode ser delegada individualmente
- Função utilitária em AuthContext: `hasPermission('admin_automacoes')`

## Estimativas

- Volume atual: ~250 webhooks/semana (matrícula) + ~1000 leads/mês + ~150 experimentais/mês
- Auditor adiciona ~24 execuções/dia × ~30 regras × 0-N divergências (idempotente, só insere as novas)
- Cada linha de `automacao_log` completa: ~5 KB → ~85 MB/ano combinado
- Invariantes: 0–3 linhas por log, ~0.5 KB cada → ~15 MB/ano
- **Total: ~100 MB/ano**, irrelevante para Supabase Pro (8 GB+)
- Latência adicional na edge de matrícula: ~2-5ms (checagem + 1-2 inserts via service_role)
- Edge auditor: ~5-15s por execução varrendo todas as regras
- Cron horário consome 24 invocações/dia = ~720/mês = 0.04% do limite Pro

## Volume real medido (2026-05-20)

- Leads: média 30-35/dia, pico 60/dia, pico instantâneo 8 leads em 1 minuto (raro)
- Experimentais: 3-5 registros/dia em `lead_experimentais`
- Matrículas (todos eventos): ~250/semana = ~36/dia em `automacao_log`

## Não inclui

- Reprocessamento de webhooks antigos
- Backfill de invariantes retroativas (mas o auditor capturará automaticamente divergências em dados pré-existentes na primeira execução)
- Alertas externos (WhatsApp/email) — só badge no menu
- Sync de presença, sync de professores, WhatsApp/UAZAPI — fora do escopo desta v1
- Migração dos workflows n8n de lead e experimental (lógica complexa: IA SDR Mila, waits, NocoDB) — auditor cobre via varredura
- Edges novas `processar-lead-emusys` / `processar-experimental-emusys`
- Botão "reprocessar" no UI — observação pura, sem ação
- Cron de limpeza — manter tudo

## Sucesso (critério de aceite)

1. Ao chegar webhook de matrícula sem professor: linha em `automacao_log` com `status='erro'` + linha em `automacao_invariantes` com `regra='matricula_sem_professor'`. Aluno é inserido normalmente.
2. Admin abre `/automacoes`, vê jornada de João Silva com timeline destacando o evento problemático em vermelho.
3. Badge no menu mostra "1" enquanto invariante crítica permanece com `visto_em IS NULL`.
4. Admin marca como visto, badge zera. Linha continua visível na lista.
5. Reentrega do mesmo webhook em 5min: gera invariante `webhook_reentregue` (aviso), não duplica aluno.

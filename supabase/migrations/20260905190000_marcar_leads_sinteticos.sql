-- MARCAR O LEAD SINTÉTICO — devolver sentido a `matriculas_sem_lead_vinculado`
--
-- 🔴 O PROBLEMA (medido em 05/09/2026): o gatilho `sync_aluno_to_leads` cria um
-- LEAD retroativamente quando a matrícula chega do Emusys e não há lead
-- correspondente. Ele nasce já convertido, sem canal, com `aluno_id` preenchido.
-- **Não são leads que viraram matrícula — são matrículas que viraram lead.**
--
-- Consequência medida: `get_kpis_comercial_canonicos_v2` decide
-- `tem_lead_vinculado` por `EXISTS (leads where aluno_id = a.id ...)`, e o lead
-- fabricado satisfaz isso. Resultado: **`matriculas_sem_lead_vinculado` = 0 nas
-- três unidades em agosto** — o campo existe justamente para medir quem fecha
-- sem passar pelo funil e está morto por construção. Só em agosto, 18 das 66
-- matrículas comerciais (27%) tiveram lead fabricado.
--
-- 🔴 O QUE ESTA MIGRATION **NÃO** FAZ, DE PROPÓSITO:
--   · não apaga lead sintético — ele dá ficha ao aluno e remover quebra vínculo;
--   · não desliga o gatilho — o comportamento dele é desejado;
--   · **não muda `leads_novos`** (o denominador do funil). Mexer no número que a
--     equipe compara com a meta todo dia é decisão do Luciano, não efeito
--     colateral de uma correção. O impacto está medido e exposto pela view
--     abaixo para ele decidir com dado.
--
-- ⚠️ Hoje o único discriminador é o TEXTO de `observacoes`, e ele tem duas
--    grafias ("organico" e "orgânico") — frágil por construção. Por isso a
--    coluna.

-- ── 1. a marca ──────────────────────────────────────────────────────────────
alter table public.leads
  add column if not exists origem_registro text not null default 'funil';

do $$ begin
  alter table public.leads add constraint leads_origem_registro_check
    check (origem_registro in ('funil', 'sync_aluno'));
exception when duplicate_object then null; end $$;

comment on column public.leads.origem_registro is
  'Como esta linha nasceu. funil = pessoa que chegou como lead. sync_aluno = criada pelo gatilho sync_aluno_to_leads a partir de uma matricula sem lead (nao e conversao de funil). Ver docs/handoffs/2026-09-05-pesquisa-atendimento-comercial-whatsapp.md.';

create index if not exists leads_origem_registro_idx
  on public.leads (origem_registro) where origem_registro <> 'funil';

-- ── 2. backfill pelo texto (a única evidência que existe do passado) ────────
-- ⚠️ `ilike 'Lead org%nico - nenhum lead encontrado%'` cobre as DUAS grafias de
--    propósito: com e sem acento, ambas em produção.
update public.leads
   set origem_registro = 'sync_aluno'
 where origem_registro = 'funil'
   and observacoes ilike 'Lead org%nico - nenhum lead encontrado%';

-- ── 3. o gatilho passa a marcar na origem ───────────────────────────────────
-- Patch por `pg_get_functiondef` + replace com GUARDA DE ÂNCORA declarando o
-- número esperado — transcrever à mão uma função de trigger em produção é como
-- se perde comportamento sem perceber.
do $$
declare v_def text; v_col text; v_val text; n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'sync_aluno_to_leads';

  if position('origem_registro' in v_def) > 0 then
    raise notice 'gatilho ja marca origem_registro — nada a fazer'; return;
  end if;

  v_col := 'tipo_aluno, observacoes, created_at, arquivado';
  v_val := '''Lead organico - nenhum lead encontrado para vincular com o aluno'',';

  n := (length(v_def) - length(replace(v_def, v_col, ''))) / length(v_col);
  if n <> 1 then raise exception 'ancora de colunas aparece % vezes, esperado 1', n; end if;
  n := (length(v_def) - length(replace(v_def, v_val, ''))) / length(v_val);
  if n <> 1 then raise exception 'ancora do texto aparece % vezes, esperado 1', n; end if;

  v_def := replace(v_def, v_col, 'tipo_aluno, observacoes, created_at, arquivado, origem_registro');
  v_def := replace(v_def, v_val, v_val || chr(10) ||
    '                -- 🔴 marca a origem: esta linha NAO e conversao de funil,' || chr(10) ||
    '                -- e uma matricula sem lead que ganhou ficha de lead.' || chr(10) ||
    '                ''sync_aluno'',');
  execute v_def;
  raise notice 'gatilho passa a marcar origem_registro = sync_aluno';
end $$;

-- ── 4. o indicador volta a medir o que promete ──────────────────────────────
-- ⚠️ MUDANÇA DE NÚMERO CONSCIENTE: `matriculas_sem_lead_vinculado` deixa de ser
--    0 e `conversoes_de_lead` cai na mesma medida. É a correção do indicador,
--    não uma regressão. Agosto passa de 0 para ~18 na rede.
do $$
declare v_def text; v_ancora text; n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'get_kpis_comercial_canonicos_v2';

  if position('origem_registro' in v_def) > 0 then
    raise notice 'KPI ja distingue lead sintetico — nada a fazer'; return;
  end if;

  v_ancora := '      WHERE l.aluno_id = a.id' || chr(10) || '         OR l.id = a.lead_origem_id';
  n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'ancora do tem_lead_vinculado aparece % vezes, esperado 1', n; end if;

  v_def := replace(v_def, v_ancora,
    '      -- 🔴 lead fabricado pelo gatilho `sync_aluno_to_leads` NAO conta como' || chr(10) ||
    '      -- lead vinculado: ele nasce DA matricula. Sem esta linha o indicador' || chr(10) ||
    '      -- `matriculas_sem_lead_vinculado` fica 0 por construcao nas 3 unidades.' || chr(10) ||
    '      WHERE coalesce(l.origem_registro, ''funil'') <> ''sync_aluno''' || chr(10) ||
    '        AND (l.aluno_id = a.id' || chr(10) ||
    '         OR l.id = a.lead_origem_id)');
  execute v_def;
  raise notice 'tem_lead_vinculado passa a ignorar lead sintetico';
end $$;

-- ── 5. visibilidade, para a decisão sobre o denominador ─────────────────────
-- O funil continua contando o lead sintetico em `leads_novos`. Esta view mede o
-- tamanho disso mes a mes, para a decisao ser tomada com numero e nao no escuro.
create or replace view public.vw_leads_sinteticos_por_mes as
select date_trunc('month', l.created_at)::date competencia,
       u.nome unidade,
       count(*)::int leads_no_mes,
       count(*) filter (where l.origem_registro = 'sync_aluno')::int sinteticos,
       round(100.0 * count(*) filter (where l.origem_registro = 'sync_aluno')
             / nullif(count(*), 0), 1) pct_sintetico,
       count(*) filter (where l.converteu)::int converteu,
       round(100.0 * count(*) filter (where l.converteu)
             / nullif(count(*), 0), 1) conv_com_sinteticos,
       round(100.0 * count(*) filter (where l.converteu and l.origem_registro = 'funil')
             / nullif(count(*) filter (where l.origem_registro = 'funil'), 0), 1) conv_so_funil
from public.leads l
join public.unidades u on u.id = l.unidade_id
group by 1, 2;

comment on view public.vw_leads_sinteticos_por_mes is
  'Tamanho do lead sintetico (criado pelo gatilho a partir da matricula) por mes e unidade, com a taxa de conversao COM e SEM ele. Insumo da decisao sobre o denominador do funil.';

revoke all on public.vw_leads_sinteticos_por_mes from public, anon, authenticated;
grant select on public.vw_leads_sinteticos_por_mes to service_role, mila_acesso_restrito;

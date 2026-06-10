-- P0.1U - Competencia efetiva para renovacoes antecipadas
--
-- Regra de negocio:
-- - data = dia em que a movimentacao foi registrada/processada.
-- - competencia_referencia = mes em que a renovacao deve contar.
-- - Para renovacao antecipada via Emusys, a competencia efetiva e o mes da
--   primeira aula do novo ciclo.
-- - Renovacao antecipada nao conta no relatorio/taxa/KPIs do mes de captura.

alter table public.movimentacoes_admin
  add column if not exists competencia_referencia date,
  add column if not exists renovacao_primeira_aula_novo_ciclo date,
  add column if not exists renovacao_antecipada boolean not null default false,
  add column if not exists renovacao_status text;

alter table public.movimentacoes_admin
  drop constraint if exists movimentacoes_admin_renovacao_status_check;

alter table public.movimentacoes_admin
  add constraint movimentacoes_admin_renovacao_status_check
  check (
    renovacao_status is null
    or renovacao_status in (
      'pendente_validacao',
      'confirmada',
      'antecipada_pendente',
      'antecipada_confirmada'
    )
  );

create index if not exists idx_movimentacoes_admin_competencia_referencia
  on public.movimentacoes_admin (competencia_referencia);

create index if not exists idx_movimentacoes_admin_renovacao_status
  on public.movimentacoes_admin (renovacao_status)
  where tipo = 'renovacao';

-- Backfill neutro: se nao houver competencia explicita, usa o mes da propria data.
update public.movimentacoes_admin
set competencia_referencia = date_trunc('month', data)::date
where competencia_referencia is null;

-- Classifica renovacoes existentes sem status explicito.
update public.movimentacoes_admin
set renovacao_status = case
  when nullif(trim(coalesce(agente_comercial, '')), '') is not null
    and (
      valor_parcela_anterior is not null
      or valor_parcela_novo is not null
      or forma_pagamento_id is not null
    )
  then 'confirmada'
  else 'pendente_validacao'
end
where tipo = 'renovacao'
  and renovacao_status is null;

-- Backfill especifico para renovacoes Emusys com primeira aula em competencia futura.
-- Match conservador: mesmo aluno/unidade, mesmo tipo, criados em janela de 5 minutos.
with eventos_renovacao as (
  select
    l.id as log_id,
    l.aluno_id,
    u.id as unidade_id,
    l.created_at as log_created_at,
    (l.payload_bruto #>> '{matricula,data_primeira_aula}')::date as data_primeira_aula
  from public.automacao_log l
  left join public.unidades u on u.nome = l.unidade_nome
  where l.evento = 'matricula_renovacao'
    and l.aluno_id is not null
    and (l.payload_bruto #>> '{matricula,data_primeira_aula}') is not null
),
matches as (
  select
    m.id as movimentacao_id,
    e.data_primeira_aula
  from public.movimentacoes_admin m
  join eventos_renovacao e
    on e.aluno_id = m.aluno_id
   and e.unidade_id = m.unidade_id
   and m.tipo = 'renovacao'
   and m.created_at between e.log_created_at - interval '5 minutes'
                       and e.log_created_at + interval '5 minutes'
)
update public.movimentacoes_admin m
set
  renovacao_primeira_aula_novo_ciclo = matches.data_primeira_aula,
  competencia_referencia = date_trunc('month', matches.data_primeira_aula)::date,
  renovacao_antecipada = date_trunc('month', matches.data_primeira_aula)::date > date_trunc('month', m.data)::date,
  renovacao_status = case
    when date_trunc('month', matches.data_primeira_aula)::date > date_trunc('month', m.data)::date then
      case
        when nullif(trim(coalesce(m.agente_comercial, '')), '') is not null
          and (
            m.valor_parcela_anterior is not null
            or m.valor_parcela_novo is not null
            or m.forma_pagamento_id is not null
          )
        then 'antecipada_confirmada'
        else 'antecipada_pendente'
      end
    else m.renovacao_status
  end
from matches
where m.id = matches.movimentacao_id;

-- A tabela legada renovacoes continua existindo por compatibilidade, mas a fonte
-- canonica para relatorio/KPIs de renovacao passa a ser movimentacoes_admin com
-- competencia_referencia + renovacao_status.

-- Fonte unica do criterio da "receita sem fatura" que o Super Folha importa pela RPC
-- receitas_sem_fatura_aplicar.
--
-- Por que uma view e nao a consulta dentro do script: `caixa_movimentacoes` aceita escrita
-- DIRETA. Medido em 08/09/2026 — `authenticated` tem INSERT/UPDATE/DELETE na tabela, com
-- RLS de 4 politicas exigindo auth.uid() casado em `usuarios` da unidade. Qualquer usuario
-- logado escreve pelo PostgREST sem passar por RPC nem pelo formulario (anon nao escreve:
-- o grant e largo mas a RLS fecha). Com varios escritores, criterio espalhado e criterio
-- que diverge; aqui ele mora num lugar so.
--
-- O criterio: entrada, categoria de venda de balcao, SEM fatura do Emusys.
--   fatura_id preenchido -> e baixa de fatura; a receita ja entrou no Super Folha pelo sync.
--                           Repetir inventaria faturamento (R$ 130.781,56 so em agosto).
--   fatura_id nulo       -> receita nova, que nao tinha porta ate hoje.
--
-- NOME no namespace maria_*: a cerca do MCP da Maria (ensureMariaSafeReadSql) so aceita
-- public.vw_maria_* / public.maria_*. Com outro nome o laudo nao consegue olhar o proprio
-- export.
--
-- A VIGENCIA NAO ESTA AQUI, de proposito. Ela e do lado do Super Folha
-- (receitas_sem_fatura_config.vigencia_inicio = 2026-09-09, dia seguinte ao merge do PR #389
-- as 09:28 BRT — 08/09 e dia misto e nao separavel por data). Quem empurra filtra; a view
-- mostra o criterio inteiro para que a conferencia enxergue tambem o que ficou de fora.
drop view if exists public.vw_export_receitas_sem_fatura;

create or replace view public.vw_maria_export_receitas_sem_fatura as
select
  m.id                                            as origem_id,
  m.unidade_id                                    as la_report_unidade_id,
  date_trunc('month', m.data_movimento)::date     as competencia,
  m.data_movimento,
  m.categoria,
  m.descricao,
  m.valor,
  m.fatura_id,                                    -- sempre nulo aqui; vai no payload para o
                                                  -- apply recusar se o filtro quebrar
  m.forma_pagamento,
  -- Origem normalizada. NUNCA o criado_por cru: o da Sol e 'sol-agente:grupo:<numero>' e
  -- carrega TELEFONE. Espelha origemDoLancamento() de src/lib/caixaIdentidade.ts — os dois
  -- pontos do prefixo importam, senao "Solange" viraria lancamento do agente.
  case
    when m.criado_por is null or btrim(m.criado_por) = '' then 'desconhecida'
    when m.criado_por like 'sol-agente:%'                 then 'sol'
    when m.criado_por like 'migracao:%'                   then 'migracao'
    else 'humano'
  end                                             as registrado_por_origem
from public.caixa_movimentacoes m
where m.tipo = 'entrada'
  and m.fatura_id is null
  and m.categoria in ('lojinha', 'outro');

comment on view public.vw_maria_export_receitas_sem_fatura is
  'Criterio unico da receita sem fatura do Emusys, exportada para o Super Folha (RPC receitas_sem_fatura_aplicar). Entrada de lojinha/outro sem fatura_id. A vigencia mora do lado do Super Folha (2026-09-09); quem empurra filtra. criado_por sai normalizado - telefone nao atravessa.';

revoke all on public.vw_maria_export_receitas_sem_fatura from public, anon, authenticated;
grant select on public.vw_maria_export_receitas_sem_fatura to service_role;

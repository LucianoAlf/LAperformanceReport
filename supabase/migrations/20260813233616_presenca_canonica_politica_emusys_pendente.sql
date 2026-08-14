begin;

-- A politica anterior dizia que ausencia do Emusys era falta. O contrato
-- canonico vigente em 13/08/2026 mudou essa decisao: ausencia sem resposta
-- humana e pendencia, nunca falta. Fecha-se a vigencia anterior e cria-se
-- uma versao nova sem alterar a leitura historica de junho/julho. Como a
-- linha antiga comeca em agosto, ela e desativada (nao encurtada para julho,
-- o que criaria um intervalo invalido).
with encerradas as (
  update public.presenca_politicas_confiabilidade
     set ativa = false
   where regra_versao = 'presenca-politica-unidades-20260719-v2'
     and data_inicio = date '2026-08-01'
     and data_fim = date '2099-12-31'
     and ativa = true
  returning unidade_id, exige_revisao_operacional
)
insert into public.presenca_politicas_confiabilidade (
  unidade_id, data_inicio, data_fim, ausencia_emusys_resultado,
  exige_revisao_operacional, decidido_em, decidido_por, evidencia,
  regra_versao, ativa
)
select
  e.unidade_id,
  date '2026-08-01',
  date '2099-12-31',
  'indeterminado',
  e.exige_revisao_operacional,
  date '2026-08-13',
  'Alf',
  'Contrato presenca canonica v1: ausencia do Emusys e pendencia; somente presente do Emusys e veredito automatico. Respostas humanas continuam valendo para presente e falta.',
  'presenca-politica-canonica-20260813-v1',
  true
from encerradas e;

commit;

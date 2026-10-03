-- Porta da Sol: o RELATÓRIO MENSAL ADMINISTRATIVO explicado (03/10/2026).
--
-- Por quê: em 03/10 a equipe de CG (Jhon) refez à mão o relatório de setembro
-- — 28 renovações contra 15 do sistema — porque não sabia por que cada aluno
-- ficou de fora. Eram três causas misturadas: regra da casa (bolsista e banda
-- fora do total), mês da renovação (conta no mês da 1ª aula do novo contrato) e
-- validação atrasada (pendente no dia do fechamento não entra). A Sol passa a
-- responder "por que o Fulano não está no relatório?" lendo a MESMA fonte do
-- relatório, sem recalcular nada.
--
-- Fonte única:
--   * fechado  -> get_relatorio_admin_mensal_rico_v1 (é o que a edge formata e
--                 envia ao grupo). Esta porta NÃO refaz conta de KPI.
--   * ao vivo  -> movimentacoes_admin_vigentes + movimentacao_conta_nos_kpis_v1
--                 (o predicado canônico de bolsista/banda, 27/08). Só lista e
--                 classifica; a taxa ao vivo é a mesma fórmula do relatório
--                 (realizadas / (realizadas + pendentes + não renovações)).
--
-- Público: a equipe da própria unidade, inclusive colaborador. O relatório já é
-- assinado e enviado ao grupo pela própria equipe — esconder dela o que ela
-- mesma publica seria o oposto do objetivo (educar sobre a regra).
--
-- Custo: 1 chamada do relatório rico (~centenas de ms) + 2 leituras indexadas
-- por unidade/competência. Sob demanda, nunca em cron: custo/dia desprezível.

create or replace function public.sol_porta_relatorio_mensal_v1(
  p_solicitante_telefone text,
  p_unidade text default null,
  p_ano integer default null,
  p_mes integer default null,
  p_aluno text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e jsonb;
  v_u uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ref date;
  v_ini date;
  v_fim date;
  v_rico jsonb;
  v_fechado jsonb := null;
  v_erro_fechado text := null;
  v_ids_fechado bigint[] := '{}';
  v_capturado timestamptz := null;
  v_renov jsonb;
  v_naorenov jsonb;
  v_aluno jsonb := null;
  v_realizadas int; v_pendentes int; v_nao int;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  if v_u is null then
    return jsonb_build_object('ok', false, 'motivo', 'escolha_a_unidade',
      'recado', 'O relatório mensal é por unidade: me diga se é Campo Grande, Barra ou Recreio.');
  end if;

  -- Padrão = mês anterior (o relatório fecha no último dia do mês).
  v_ref := case when p_ano is not null and p_mes is not null
                then make_date(p_ano, p_mes, 1)
                else (date_trunc('month', v_hoje) - interval '1 month')::date end;
  v_ini := v_ref;
  v_fim := (v_ref + interval '1 month')::date;

  -- ── O que o relatório FECHADO mostra (a mesma função que a edge envia) ──
  begin
    v_rico := public.get_relatorio_admin_mensal_rico_v1(v_u, extract(year from v_ref)::int, extract(month from v_ref)::int);
    v_capturado := nullif(v_rico#>>'{payload,capturado_em}','')::timestamptz;
    select coalesce(array_agg((r->>'id')::bigint), '{}') into v_ids_fechado
      from jsonb_array_elements(coalesce(v_rico#>'{payload,renovacoes}','[]'::jsonb)) r
     where r ? 'id';
    v_fechado := jsonb_build_object(
      'fechado_em', v_capturado,
      'retencao', v_rico#>'{payload,indicadores_retencao}',
      'financeiro', (v_rico#>'{payload,indicadores_financeiros}')
                     - 'fonte' - 'retificacao_id',
      'renovacoes_no_relatorio', (select coalesce(jsonb_agg(r->>'aluno_nome' order by r->>'aluno_nome'), '[]'::jsonb)
                                   from jsonb_array_elements(coalesce(v_rico#>'{payload,renovacoes}','[]'::jsonb)) r));
  exception when others then
    -- Mês sem fechamento (ou fechamento inconsistente) não pode virar "zero":
    -- devolve o motivo e segue com o retrato ao vivo.
    v_erro_fechado := sqlerrm;
  end;

  -- ── Ao vivo: cada renovação da competência, classificada pela regra ──
  -- Bolsista que faz banda é rotulado BANDA: mesma ordem de motivoForaDosKpis
  -- (src/lib/atividadesExtras.ts), senão a Sol e a tela dariam rótulos diferentes.
  with base as (
    select mv.id, mv.aluno_nome, c.nome curso, mv.renovacao_status st, mv.data,
           mv.renovacao_primeira_aula_novo_ciclo primeira_aula, mv.created_at,
           mv.valor_parcela_anterior ant, mv.valor_parcela_novo novo,
           movimentacao_conta_nos_kpis_v1(mv.curso_id, a.tipo_matricula_id) conta,
           a.tipo_matricula_id tm, coalesce(c.is_projeto_banda, false) or a.tipo_matricula_id = 5 eh_banda
      from movimentacoes_admin_vigentes mv
      left join alunos a on a.id = mv.aluno_id
      left join cursos c on c.id = mv.curso_id
     where mv.unidade_id = v_u and mv.tipo = 'renovacao'
       and coalesce(mv.competencia_referencia, date_trunc('month', mv.data)::date) >= v_ini
       and coalesce(mv.competencia_referencia, date_trunc('month', mv.data)::date) <  v_fim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'aluno', aluno_nome, 'curso', curso,
           'primeira_aula_novo_contrato', primeira_aula,
           'lancada_em', data, 'status', st,
           'parcela', jsonb_build_object('anterior', ant, 'nova', novo),
           'situacao', case
              when not conta and not eh_banda and tm in (3,4) then 'fora_do_total_bolsista'
              when not conta then 'fora_do_total_banda'
              when st in ('confirmada','antecipada_confirmada') then 'conta'
              else 'pendente_de_validacao' end,
           'no_relatorio_fechado', id = any(v_ids_fechado))
         order by aluno_nome), '[]'::jsonb),
         count(*) filter (where conta and st in ('confirmada','antecipada_confirmada')),
         count(*) filter (where conta and st not in ('confirmada','antecipada_confirmada'))
    into v_renov, v_realizadas, v_pendentes
    from base;

  with base as (
    select mv.aluno_nome, c.nome curso, mv.data, mv.motivo, mv.created_at,
           movimentacao_conta_nos_kpis_v1(mv.curso_id, a.tipo_matricula_id) conta,
           a.tipo_matricula_id tm, coalesce(c.is_projeto_banda, false) or a.tipo_matricula_id = 5 eh_banda
      from movimentacoes_admin_vigentes mv
      left join alunos a on a.id = mv.aluno_id
      left join cursos c on c.id = mv.curso_id
     where mv.unidade_id = v_u and mv.tipo = 'nao_renovacao'
       and coalesce(mv.competencia_referencia, date_trunc('month', mv.data)::date) >= v_ini
       and coalesce(mv.competencia_referencia, date_trunc('month', mv.data)::date) <  v_fim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'aluno', aluno_nome, 'curso', curso, 'data', data, 'motivo', motivo,
           'situacao', case when not conta and not eh_banda and tm in (3,4) then 'fora_do_total_bolsista'
                            when not conta then 'fora_do_total_banda' else 'conta' end,
           'lancada_depois_do_fechamento', v_capturado is not null and created_at > v_capturado)
         order by aluno_nome), '[]'::jsonb),
         count(*) filter (where conta)
    into v_naorenov, v_nao
    from base;

  -- ── Um aluno específico: em que mês cada renovação dele conta, e por quê ──
  if length(trim(coalesce(p_aluno,''))) >= 3 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'aluno', mv.aluno_nome, 'curso', c.nome, 'tipo', mv.tipo,
             'conta_no_mes', to_char(coalesce(mv.competencia_referencia, date_trunc('month', mv.data)::date), 'MM/YYYY'),
             'primeira_aula_novo_contrato', mv.renovacao_primeira_aula_novo_ciclo,
             'lancada_em', mv.data, 'status', mv.renovacao_status,
             'entra_no_total', movimentacao_conta_nos_kpis_v1(mv.curso_id, a.tipo_matricula_id),
             'bolsista', a.tipo_matricula_id in (3,4))
           order by mv.data desc), '[]'::jsonb)
      into v_aluno
      from (select * from movimentacoes_admin_vigentes mv
             where mv.unidade_id = v_u
               and mv.tipo in ('renovacao','nao_renovacao')
               and mv.data >= v_ref - interval '8 months'
               and unaccent(lower(mv.aluno_nome)) like '%' || unaccent(lower(trim(p_aluno))) || '%'
             order by mv.data desc limit 15) mv
      left join alunos a on a.id = mv.aluno_id
      left join cursos c on c.id = mv.curso_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'escopo', e,
    'competencia', to_char(v_ref, 'MM/YYYY'),
    'fechado', v_fechado,
    'fechado_indisponivel', v_erro_fechado,
    'ao_vivo', jsonb_build_object(
      'renovacoes_realizadas', v_realizadas,
      'renovacoes_pendentes', v_pendentes,
      'nao_renovacoes', v_nao,
      'renovacoes_previstas', v_realizadas + v_pendentes + v_nao,
      'taxa_renovacao', case when v_realizadas + v_pendentes + v_nao > 0
        then round(v_realizadas::numeric * 100 / (v_realizadas + v_pendentes + v_nao), 1) end,
      'renovacoes', v_renov,
      'nao_renovacoes_lista', v_naorenov),
    'aluno_pesquisado', v_aluno,
    'regras', jsonb_build_array(
      'Renovação conta no mês da 1ª AULA do novo contrato — não no mês em que foi lançada nem no mês em que o contrato antigo termina (Alf, 10/08/2026).',
      'Bolsista (integral ou parcial) e banda/coral não entram em nada de retenção: nem renovação, nem não renovação, nem churn, nem reajuste (Alf, 27/08/2026). Aparecem na tela com o selo "não entra na taxa".',
      'O relatório só conta renovação CONFIRMADA. Pendente de validação no dia do fechamento fica de fora até alguém validar e o mês ser gerado de novo.',
      'Taxa de renovação = realizadas ÷ (realizadas + pendentes + não renovações). Aviso prévio não entra.',
      'Financeiro conta só MENSALIDADE: passaporte, evento e lojinha ficam fora do MRR, do faturado e do recebido.',
      'Churn = saídas de pagantes ÷ alunos pagantes; quem sai de um curso e segue em outro não conta.'));
end;
$function$;

comment on function public.sol_porta_relatorio_mensal_v1(text, text, integer, integer, text) is
  'Porta da Sol: relatório mensal administrativo explicado. "fechado" = o que foi enviado (get_relatorio_admin_mensal_rico_v1); "ao_vivo" = cada renovação/não renovação da competência classificada pela regra (conta, pendente, fora do total por bolsista/banda). p_aluno explica em que mês cada renovação de um aluno conta. Só leitura.';

revoke all on function public.sol_porta_relatorio_mensal_v1(text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.sol_porta_relatorio_mensal_v1(text, text, integer, integer, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

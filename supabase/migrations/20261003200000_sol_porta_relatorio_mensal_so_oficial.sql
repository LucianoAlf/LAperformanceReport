-- Porta relatorio_mensal: o NÚMERO é só o do fechamento (03/10/2026, pedido do Hugo).
--
-- A v1 (20261003190000) devolvia, além do relatório enviado, uma taxa e totais
-- recalculados com os dados de HOJE (CG/set: 67,9% contra os 53,6% publicados).
-- Isso cria um segundo número de setembro que ninguém publicou — e a Sol podia
-- citá-lo como se fosse o relatório. O relatório é a foto do fechamento (último
-- dia do mês, 22h BRT); o que foi validado ou lançado depois não o altera.
--
-- Agora: números e lista oficiais vêm só do fechamento. O retrato de hoje fica
-- reduzido a NOMES com o MOTIVO de cada um não estar na foto — validado depois,
-- lançado depois, ainda pendente, bolsista, banda — que é o que responde
-- "por que o Fulano não entrou?". Nenhuma taxa ou total calculado ao vivo.
--
-- Mesma assinatura, mesmo GRANT: create or replace preserva a ACL.

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
  v_oficial jsonb := null;
  v_erro text := null;
  v_ids_foto bigint[] := '{}';
  v_capturado timestamptz := null;
  v_renov jsonb;
  v_naorenov jsonb;
  v_aluno jsonb := null;
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  if v_u is null then
    return jsonb_build_object('ok', false, 'motivo', 'escolha_a_unidade',
      'recado', 'O relatório mensal é por unidade: me diga se é Campo Grande, Barra ou Recreio.');
  end if;

  v_ref := case when p_ano is not null and p_mes is not null
                then make_date(p_ano, p_mes, 1)
                else (date_trunc('month', v_hoje) - interval '1 month')::date end;
  v_ini := v_ref;
  v_fim := (v_ref + interval '1 month')::date;

  -- ── O relatório OFICIAL: a foto do fechamento, a mesma que a edge envia ──
  begin
    v_rico := public.get_relatorio_admin_mensal_rico_v1(v_u, extract(year from v_ref)::int, extract(month from v_ref)::int);
    v_capturado := nullif(v_rico#>>'{payload,capturado_em}','')::timestamptz;
    select coalesce(array_agg((r->>'id')::bigint), '{}') into v_ids_foto
      from jsonb_array_elements(coalesce(v_rico#>'{payload,renovacoes}','[]'::jsonb)) r
     where r ? 'id';
    v_oficial := jsonb_build_object(
      'foto_tirada_em', to_char(v_capturado at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI'),
      'retencao', v_rico#>'{payload,indicadores_retencao}',
      'financeiro', (v_rico#>'{payload,indicadores_financeiros}') - 'fonte' - 'retificacao_id',
      'alunos', v_rico#>'{payload,resumo}',
      'renovacoes_no_relatorio', (select coalesce(jsonb_agg(r->>'aluno_nome' order by r->>'aluno_nome'), '[]'::jsonb)
                                   from jsonb_array_elements(coalesce(v_rico#>'{payload,renovacoes}','[]'::jsonb)) r),
      'nao_renovacoes_no_relatorio', (select coalesce(jsonb_agg(r->>'aluno_nome' order by r->>'aluno_nome'), '[]'::jsonb)
                                   from jsonb_array_elements(coalesce(v_rico#>'{payload,nao_renovacoes}','[]'::jsonb)) r));
  exception when others then
    -- Mês sem fechamento não vira "zero": a Sol diz que não há relatório fechado.
    v_erro := sqlerrm;
  end;

  -- ── Por que cada nome está (ou não está) na foto. Sem taxa nem total. ──
  -- Bolsista que faz banda é rotulado BANDA: mesma ordem de motivoForaDosKpis
  -- (src/lib/atividadesExtras.ts), senão a Sol e a tela dariam rótulos diferentes.
  with base as (
    select mv.id, mv.aluno_nome, c.nome curso, mv.renovacao_status st, mv.data,
           mv.renovacao_primeira_aula_novo_ciclo primeira_aula, mv.created_at,
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
           'primeira_aula_novo_contrato', primeira_aula, 'lancada_em', data,
           'situacao', case
              when id = any(v_ids_foto) then 'no_relatorio'
              when not conta and not eh_banda and tm in (3,4) then 'fora_do_total_bolsista'
              when not conta then 'fora_do_total_banda'
              when v_capturado is not null and created_at > v_capturado then 'lancada_depois_do_fechamento'
              when st in ('confirmada','antecipada_confirmada') then 'validada_depois_do_fechamento'
              else 'ainda_pendente_de_validacao' end)
         order by aluno_nome), '[]'::jsonb)
    into v_renov
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
           'situacao', case
              when not conta and not eh_banda and tm in (3,4) then 'fora_do_total_bolsista'
              when not conta then 'fora_do_total_banda'
              when v_capturado is not null and created_at > v_capturado then 'lancada_depois_do_fechamento'
              else 'no_relatorio' end)
         order by aluno_nome), '[]'::jsonb)
    into v_naorenov
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
    'oficial', v_oficial,
    'sem_relatorio_fechado', v_erro,
    'por_que_cada_nome', jsonb_build_object(
      'renovacoes', v_renov,
      'nao_renovacoes', v_naorenov),
    'aluno_pesquisado', v_aluno,
    'regras', jsonb_build_array(
      'O relatório é uma FOTO do fechamento (último dia do mês, 22h). O número oficial é o da foto; o que foi validado ou lançado depois não muda o relatório enviado — só entra se o mês for gerado de novo. Nunca apresente outro número como sendo o do mês.',
      'Esqueceu de validar, ajustar ou lançar algo antes do fechamento? Quem decide gerar o mês de novo é o HUGO: a pessoa deve pedir a ele, dizendo o que ficou de fora. A Sol não gera relatório nem promete que vai entrar.',
      'Renovação conta no mês da 1ª AULA do novo contrato — não no mês em que foi lançada nem no mês em que o contrato antigo termina (Alf, 10/08/2026).',
      'Bolsista (integral ou parcial) e banda/coral não entram em nada de retenção: nem renovação, nem não renovação, nem churn, nem reajuste — saem do numerador E do denominador (Alf, 27/08/2026). Aparecem na tela com o selo "não entra na taxa".',
      'O relatório só conta renovação CONFIRMADA. Pendente de validação no momento da foto fica de fora — validar antes do último dia do mês é o que faz ela entrar.',
      'Taxa de renovação = realizadas ÷ (realizadas + pendentes + não renovações). Aviso prévio não entra.',
      'Financeiro conta só MENSALIDADE: passaporte, evento e lojinha ficam fora do MRR, do faturado e do recebido.',
      'Churn = saídas de pagantes ÷ alunos pagantes; quem sai de um curso e segue em outro não conta.'));
end;
$function$;

comment on function public.sol_porta_relatorio_mensal_v1(text, text, integer, integer, text) is
  'Porta da Sol: relatório mensal administrativo explicado. "oficial" = a foto do fechamento (get_relatorio_admin_mensal_rico_v1) — é o ÚNICO número. "por_que_cada_nome" = cada renovação/não renovação da competência com o motivo de estar ou não na foto (validada/lançada depois do fechamento, pendente, bolsista, banda). Sem taxa nem total ao vivo, de propósito. p_aluno explica em que mês cada renovação de um aluno conta. Só leitura.';

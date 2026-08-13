-- Reconcilia a grade de UM aluno contra a foto viva do Emusys.
--
-- Consolida as 3 aplicacoes de 13/08/2026 (20260813194200 inicial, ...194329 fix do
-- array_agg, ...194520 troca de integer->bigint). As duas primeiras foram iteracoes
-- de desenvolvimento sem consumidor; este arquivo reproduz o estado final.
--
-- PROBLEMA QUE RESOLVE
-- Ao mudar a data da 1a aula em "Alterar matricula", o Emusys APAGA a ocorrencia do
-- dia antigo e regera o cronograma — `data_primeira_aula` e parametro do contrato,
-- nao uma aula. A aula apagada simplesmente para de vir no GET /aulas, sem marcacao
-- nenhuma, e upsert nao enxerga ausencia: a linha antiga fica viva e indistinguivel
-- de aula real ("fantasma"). Reagendamento NAO tem esse problema — preserva o
-- emusys_id e o upsert move a linha (medido: 357 reagendamentos, zero duplicata).
--
-- Quem chama: edge `reconciliar-grade-aluno`, disparada pelo webhook
-- `matricula_alterada`. Ela busca GET /aulas?pessoa_id=<id> e passa aqui os ids que
-- o Emusys ainda reconhece.
--
-- ESCOPO: so o futuro. Decisao do Hugo em 13/08/2026 — o passado fica como esta e o
-- backlog nao e limpo.
--
-- A UNIDADE DE DECISAO E O SLOT, NAO A LINHA. O Emusys entrega o mesmo horario em
-- duas linhas (tipo=turma + tipo=individual) e a get_agenda_dia as agrupa por
-- md5(unidade|professor|sala|data_hora|duracao|curso|turma|CANCELADA). Cancelar so
-- uma delas muda a chave e a tela passa a mostrar DOIS cards — um cancelado e um
-- "sem aluno vinculado". Por isso: ou o slot inteiro cai, ou nada nele e tocado.

-- p_aluno_emusys_id nasceu `integer` e virou `bigint` (o tipo de
-- aula_alunos_emusys.aluno_emusys_id). DROP explicito da assinatura antiga: com
-- p_dry_run tendo DEFAULT, manter as duas deixaria a chamada ambigua ("function is
-- not unique") — foi o que derrubou o webhook de leads do n8n por 21h em 11/08/2026.
drop function if exists public.reconciliar_grade_aluno_v1(integer, uuid, date, date, integer[], boolean);

create or replace function public.reconciliar_grade_aluno_v1(
  p_aluno_emusys_id bigint,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_ids_vivos integer[],
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_detalhe jsonb;
  v_ids integer[];
  v_aplicadas integer := 0;
begin
  -- Guarda 1: foto vazia nao e prova de que as aulas sumiram. Pode ser erro de token,
  -- paginacao interrompida ou aluno errado. Cancelar em cima disso destruiria a grade
  -- inteira do aluno.
  if p_ids_vivos is null or cardinality(p_ids_vivos) = 0 then
    return jsonb_build_object('status','abortado','motivo','API nao devolveu nenhuma aula viva para o aluno na janela','aplicadas',0);
  end if;

  -- Guarda 2: esta rotina nao mexe no passado. Ver ESCOPO no topo.
  if p_data_inicio < (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('status','abortado','motivo','p_data_inicio anterior a hoje — esta rotina so reconcilia o futuro','aplicadas',0);
  end if;

  with
  -- Slots em que o aluno tinha aula e o Emusys nao reconhece mais.
  slots_ausentes as (
    select distinct a.unidade_id, a.data_hora_inicio,
           coalesce(a.turma_nome,'') as turma_nome,
           coalesce(a.professor_nome,'') as professor_nome,
           coalesce(a.sala_nome,'') as sala_nome
    from aulas_emusys a
    join aula_alunos_emusys al on al.aula_emusys_id = a.id
    where a.unidade_id = p_unidade_id
      and a.categoria = 'normal'
      and a.cancelada = false
      and a.data_aula between p_data_inicio and p_data_fim
      and al.aluno_emusys_id = p_aluno_emusys_id
      and not (a.emusys_id = any(p_ids_vivos))
  ),
  -- Todas as linhas de cada slot (turma + individual), nao so a do aluno.
  linhas_do_slot as (
    select a.id, a.emusys_id, a.data_aula, a.tipo, a.curso_nome,
           a.professor_nome, a.sala_nome, a.professor_presenca_origem,
           to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') as hora,
           s.data_hora_inicio, s.unidade_id,
           s.turma_nome as slot_turma, s.professor_nome as slot_prof, s.sala_nome as slot_sala
    from slots_ausentes s
    join aulas_emusys a
      on a.unidade_id = s.unidade_id
     and a.data_hora_inicio = s.data_hora_inicio
     and coalesce(a.turma_nome,'') = s.turma_nome
     and coalesce(a.professor_nome,'') = s.professor_nome
     and coalesce(a.sala_nome,'') = s.sala_nome
    where a.categoria = 'normal'
      and a.cancelada = false
      and a.data_aula between p_data_inicio and p_data_fim
  ),
  -- Veredito POR SLOT (ver cabecalho: a decisao nunca e por linha).
  veredito as (
    select l.unidade_id, l.data_hora_inicio, l.slot_turma, l.slot_prof, l.slot_sala,
           -- Guarda 3: alguma linha do slot ainda viva no Emusys? Entao o horario
           -- continua existindo e nao e fantasma.
           bool_or(l.emusys_id = any(p_ids_vivos)) as slot_parcialmente_vivo,
           -- Guarda 4: o slot ainda serve OUTRO aluno. Numa turma so um aluno pode ter
           -- tido a matricula alterada; derrubar o slot tiraria a aula dos colegas.
           bool_or(exists (
             select 1 from aula_alunos_emusys x
             where x.aula_emusys_id = l.id
               and x.aluno_emusys_id is distinct from p_aluno_emusys_id
           )) as tem_outro_aluno,
           -- Guarda 5: decisao humana vence a reconciliacao (decisao do Hugo,
           -- 13/08/2026). Cancelar esconderia a marcacao das metricas de frequencia,
           -- porque as RPCs de presenca pulam aula cancelada.
           bool_or(
             l.professor_presenca_origem is not null
             or exists (
               select 1 from aluno_presenca ap
               where ap.aula_emusys_id = l.id
                 and ap.respondido_por::text in ('agenda_secretaria','professor_la_teacher','fabio_audio','manual')
             )
           ) as tem_marcacao_humana,
           array_agg(l.id) as ids,
           min(l.data_aula) as data_aula,
           min(l.hora) as hora,
           string_agg(distinct l.tipo,'+') as tipos,
           min(l.curso_nome) as curso_nome,
           min(l.professor_nome) as professor_nome,
           min(l.sala_nome) as sala_nome,
           count(*)::int as linhas
    from linhas_do_slot l
    group by 1,2,3,4,5
  ),
  julgado as (
    select v.*, case
             when v.slot_parcialmente_vivo then 'mantido_slot_vivo'
             when v.tem_outro_aluno        then 'mantido_outro_aluno'
             when v.tem_marcacao_humana    then 'mantido_marcacao_humana'
             else 'cancelar'
           end as acao
    from veredito v
  )
  select
    -- Detalhe de TODOS os slots avaliados, inclusive os preservados: sem isso a
    -- decisao de NAO mexer fica invisivel no log, que e justamente o caso comum.
    (select coalesce(jsonb_agg(jsonb_build_object(
        'data_aula', j.data_aula, 'hora', j.hora, 'turma', nullif(j.slot_turma,''),
        'curso', j.curso_nome, 'professor', j.professor_nome, 'sala', j.sala_nome,
        'linhas', j.linhas, 'tipos', j.tipos, 'aula_ids', to_jsonb(j.ids),
        'acao', j.acao
      ) order by j.data_aula, j.hora), '[]'::jsonb) from julgado j),
    -- ids PLANOS. array_agg(j.ids) devolveria int[][] e quebra de duas formas: com
    -- CASE sem match vem NULL ("cannot accumulate null arrays") e com slots de
    -- tamanhos diferentes (2 vs 3 linhas) as dimensoes nao batem. O unnest achata
    -- antes de reagregar.
    (select array_agg(x) from julgado j, unnest(j.ids) as t(x) where j.acao = 'cancelar')
  into v_detalhe, v_ids;

  if not p_dry_run and v_ids is not null and cardinality(v_ids) > 0 then
    update aulas_emusys
       set cancelada = true,
           -- Sem isto o soft-cancel fica indistinguivel de um cancelamento real vindo
           -- do Emusys (os dois deixam cancelada_origem NULL), e nao ha como medir se
           -- a reconciliacao esta funcionando.
           cancelada_origem = 'sync_ausente_emusys',
           cancelada_motivo = 'Aula removida no Emusys (cronograma regerado)',
           cancelada_em = now()
     where id = any(v_ids);
    get diagnostics v_aplicadas = row_count;
  end if;

  return jsonb_build_object(
    'status','ok','dry_run',p_dry_run,'aluno_emusys_id',p_aluno_emusys_id,
    'janela', jsonb_build_object('inicio',p_data_inicio,'fim',p_data_fim),
    'ids_vivos', cardinality(p_ids_vivos),
    'slots_avaliados', jsonb_array_length(v_detalhe),
    'a_cancelar', coalesce(cardinality(v_ids),0),
    'aplicadas', v_aplicadas, 'detalhe', v_detalhe);
end;
$function$;

-- O schema public tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE a `anon`, entao
-- `revoke from public` nao basta: precisa ser nominal. Ja mordeu get_agenda_dia
-- (02/08), get_kpis_alunos_canonicos_base_v131 (04/08) e a retificacao gerencial
-- (10/08). Só a edge (service_role) chama isto.
revoke all on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean)
  from public, anon, authenticated;
grant execute on function public.reconciliar_grade_aluno_v1(bigint, uuid, date, date, integer[], boolean)
  to service_role;

comment on function public.reconciliar_grade_aluno_v1 is
  'Cancela aulas futuras de um aluno que sumiram do Emusys (cronograma regerado apos mudanca da data da 1a aula). Decide por SLOT, preservando slot vivo, slot com outro aluno e decisao humana. Chamada pela edge reconciliar-grade-aluno.';

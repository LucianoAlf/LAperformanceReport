-- reconciliar_grade_aluno_v2 — REMOVE O VINCULO do aluno, nao cancela a aula.
--
-- ============================================================================
-- POR QUE A v1 ESTAVA ERRADA (medido em 15/08/2026, com o Emusys aberto na tela)
-- ============================================================================
-- A v1 partia de "a aula sumiu do Emusys, entao cancela". O insumo dela e
-- `p_ids_vivos`, vindo de `GET /aulas?pessoa_id=X`, que responde **as aulas DO
-- ALUNO** — nao "as aulas que existem". Quando o aluno troca de turma, a aula
-- antiga **continua existindo**; ela so deixa de vir na consulta dele. A v1 lia
-- essa ausencia como aula apagada e mandava cancelar aula viva.
--
-- Caso real (Daniel sterblitch, Recreio, aluno_emusys 1452, alterado 15/08 11:40
-- de B_Seg_17 para B_Qui_17). As 4 aulas que a v1 cancelaria, conferidas uma a
-- uma na API por janela de DATA (nao por pessoa_id):
--     emusys_id 735900 (17/08), 735901 (24/08), 735902 (31/08), 735904 (14/09)
--     -> todas `cancelada=false`, `alunos=0`  ... ou seja, EXISTEM e estao vazias.
-- Conferido tambem na tela do Emusys: o slot das 17h na sala Barone esta la.
--
-- ⚠️ E aula vazia e comportamento NORMAL do Emusys, nao lixo: no Recreio em
-- 17/08, 3 das 126 aulas do dia (2,4%) tem zero alunos. Ele nao apaga o slot
-- quando o ultimo aluno sai.
--
-- Sao DOIS problemas distintos, e a v1 tratava os dois como um:
--   (a) aluno trocou de turma  -> a aula continua viva -> REMOVER O VINCULO
--   (b) data da 1a aula mudou  -> o Emusys apaga a ocorrencia -> cancelar a aula
-- Em 4 dias de webhooks reais houve 20 alteracoes de matricula, **quase todas do
-- tipo (a)**; o tipo (b) nao foi observado nenhuma vez. Esta versao resolve (a)
-- com certeza e deixa (b) para o soft-cancel diario do `sync-grade-futura`.
--
-- ============================================================================
-- O QUE MUDA NA PRATICA
-- ============================================================================
--   v1:  update aulas_emusys set cancelada = true      -> afeta a aula (de todos)
--   v2:  delete from aula_alunos_emusys                -> afeta so a linha do aluno
--
-- Consequencia direta: a **guarda "tem outro aluno" da v1 deixa de ser
-- necessaria** e foi removida. Ela existia porque cancelar a aula tiraria a aula
-- dos colegas — foi ela que preservou 31 das 34 aulas do aluno 2164, deixando o
-- problema dele sem tratamento. Removendo so o vinculo do aluno alterado,
-- ninguem mais e tocado e esses casos passam a ser corrigidos.
--
-- ⚠️ A Agenda JA sabe exibir aula sem aluno (estado "sem aluno", borda tracejada
-- em AgendaCard.tsx). Entao remover o vinculo faz a nossa grade **espelhar** o
-- Emusys, em vez de inventar um estado.
--
-- ============================================================================
-- GUARDAS
-- ============================================================================
-- 1. Foto vazia aborta — `p_ids_vivos` vazio pode ser erro de token ou paginacao
--    interrompida, nao prova de que o aluno perdeu as aulas.
-- 2. Janela limitada a ONTEM em diante. ⚠️ NAO e `< hoje`: a edge manda
--    `dataInicio = somarDias(hoje, -1)` (absorve webhook que chega depois do
--    relatorio diario), entao `< hoje` abortaria 100% das chamadas reais. A v1 no
--    BANCO ja tinha sido corrigida para `- 1` por outra sessao, e o arquivo da
--    migration 20260813194520 ficou desatualizado — copiar dele reintroduziria o
--    bug. Conferido em producao com `pg_get_functiondef`, nao no repo.
-- 3. Slot parcialmente vivo preserva — o Emusys entrega o mesmo horario em 2
--    linhas (`turma` + `individual`) e `p_ids_vivos` pode trazer so uma. Se
--    QUALQUER linha do slot esta viva, o aluno ainda tem aula naquele horario e
--    nada e removido ali.
-- 4. Presenca lancada por humano preserva — remover o vinculo deixaria a
--    marcacao da secretaria/professor orfa. ⚠️ Diferente da v1, a checagem e
--    pela presenca DO ALUNO (`aluno_presenca.aluno_id`), nao pelo
--    `professor_presenca_origem`: quem decide agora e o vinculo, nao a aula.
create or replace function public.reconciliar_grade_aluno_v2(
  p_aluno_emusys_id bigint,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_ids_vivos integer[],
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_detalhe jsonb;
  v_ids integer[];
  v_aplicadas integer := 0;
begin
  -- Guarda 1
  if p_ids_vivos is null or cardinality(p_ids_vivos) = 0 then
    return jsonb_build_object('status','abortado',
      'motivo','API nao devolveu nenhuma aula viva para o aluno na janela','aplicadas',0);
  end if;

  -- Guarda 2 — ver cabecalho: e `- 1`, nao `< hoje`.
  if p_data_inicio < ((now() at time zone 'America/Sao_Paulo')::date - 1) then
    return jsonb_build_object('status','abortado',
      'motivo','p_data_inicio anterior a ontem - janela limitada de proposito','aplicadas',0);
  end if;

  with
  -- Aulas em que o aluno esta vinculado e que o Emusys nao devolve mais para ele.
  candidatas as (
    select a.id, a.emusys_id, a.data_aula, a.tipo, a.curso_nome, a.turma_nome,
           a.professor_nome, a.sala_nome, a.data_hora_inicio, a.unidade_id,
           al.aluno_id as aluno_id_local,
           to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') as hora
    from aulas_emusys a
    join aula_alunos_emusys al on al.aula_emusys_id = a.id
    where a.unidade_id = p_unidade_id
      and a.categoria = 'normal'
      and a.cancelada = false
      and a.data_aula between p_data_inicio and p_data_fim
      and al.aluno_emusys_id = p_aluno_emusys_id
      and not (a.emusys_id = any(p_ids_vivos))
  ),
  -- Guarda 3: o slot inteiro (todas as linhas daquele horario/sala/turma) ainda
  -- tem alguma aula viva no Emusys para este aluno?
  com_slot as (
    select c.*,
           exists (
             select 1
             from aulas_emusys s
             join aula_alunos_emusys sal on sal.aula_emusys_id = s.id
             where s.unidade_id = c.unidade_id
               and s.data_hora_inicio = c.data_hora_inicio
               and coalesce(s.turma_nome,'') = coalesce(c.turma_nome,'')
               and coalesce(s.sala_nome,'') = coalesce(c.sala_nome,'')
               and sal.aluno_emusys_id = p_aluno_emusys_id
               and s.emusys_id = any(p_ids_vivos)
           ) as slot_parcialmente_vivo,
           -- Guarda 4
           exists (
             select 1 from aluno_presenca ap
             where ap.aula_emusys_id = c.id
               and ap.aluno_id = c.aluno_id_local
               and ap.respondido_por::text in
                   ('agenda_secretaria','professor_la_teacher','fabio_audio','manual')
           ) as tem_marcacao_humana
    from candidatas c
  ),
  julgado as (
    select cs.*, case
             when cs.slot_parcialmente_vivo then 'mantido_slot_vivo'
             when cs.tem_marcacao_humana    then 'mantido_marcacao_humana'
             else 'remover_vinculo'
           end as acao
    from com_slot cs
  )
  select
    -- Detalhe de TUDO que foi avaliado, inclusive o preservado: sem isso a decisao
    -- de NAO mexer fica invisivel no log, que e o caso mais comum.
    (select coalesce(jsonb_agg(jsonb_build_object(
        'data_aula', j.data_aula, 'hora', j.hora, 'turma', j.turma_nome,
        'curso', j.curso_nome, 'professor', j.professor_nome, 'sala', j.sala_nome,
        'tipo', j.tipo, 'aula_id', j.id, 'emusys_id', j.emusys_id,
        'acao', j.acao
      ) order by j.data_aula, j.hora), '[]'::jsonb) from julgado j),
    (select array_agg(j.id) from julgado j where j.acao = 'remover_vinculo')
  into v_detalhe, v_ids;

  if not p_dry_run and v_ids is not null and cardinality(v_ids) > 0 then
    -- ⚠️ So a linha DESTE aluno. A aula e as demais linhas ficam intactas.
    delete from aula_alunos_emusys
     where aula_emusys_id = any(v_ids)
       and aluno_emusys_id = p_aluno_emusys_id;
    get diagnostics v_aplicadas = row_count;
  end if;

  return jsonb_build_object(
    'status','ok','dry_run',p_dry_run,'aluno_emusys_id',p_aluno_emusys_id,
    'janela', jsonb_build_object('inicio',p_data_inicio,'fim',p_data_fim),
    'ids_vivos', cardinality(p_ids_vivos),
    'aulas_avaliadas', jsonb_array_length(v_detalhe),
    'a_remover', coalesce(cardinality(v_ids),0),
    'aplicadas', v_aplicadas, 'detalhe', v_detalhe);
end;
$function$;

-- ⚠️ `ALTER DEFAULT PRIVILEGES` no schema public concede EXECUTE a `anon` em toda
-- funcao nova — `revoke ... from public` NAO basta, precisa do revoke nominal.
-- Ja pegou get_agenda_dia (02/08), get_kpis_alunos_canonicos_base_v131 (04/08) e
-- aplicar_retificacao_..._v1 (10/08). ACL correta: {postgres=X,authenticated=X,service_role=X}.
revoke all on function public.reconciliar_grade_aluno_v2(bigint,uuid,date,date,integer[],boolean) from public, anon;
grant execute on function public.reconciliar_grade_aluno_v2(bigint,uuid,date,date,integer[],boolean) to authenticated, service_role;

comment on function public.reconciliar_grade_aluno_v2(bigint,uuid,date,date,integer[],boolean) is
  'Remove o vinculo do aluno com aulas que o Emusys nao devolve mais para ele (troca de turma/curso). NAO cancela a aula: ela continua existindo, vazia, como no Emusys. Guardas: foto vazia aborta, so futuro, slot parcialmente vivo preserva, presenca humana preserva.';

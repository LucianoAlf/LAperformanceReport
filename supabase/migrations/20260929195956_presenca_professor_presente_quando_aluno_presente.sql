-- Aluno presente marca o PROFESSOR presente — e isso chega ao Emusys (29/09/2026).
--
-- Pedido do Arthur (Barra): "se eu der a presenca para o aluno, logo o professor
-- veio tambem". Caso real: Jairo Pinheiro Filho marcado presente pela Agenda as
-- 16:17 na aula das 16:00 do Erick Cosme da Silva; no Emusys o Erick ficou com X.
--
-- A regra JA EXISTIA, mas so dentro do Report e sem se sustentar:
--  * trg_professor_presente_quando_aluno_presente (em aluno_presenca) poe
--    professor_presenca='presente' com origem NULL;
--  * origem NULL nao e protegida por fn_proteger_decisao_humana_aula, entao o
--    sync de metadados (15 min) traz o 'ausente' do Emusys de volta;
--  * nenhum evento e gravado, entao o presenca-emusys-escritor nunca manda nada.
--
-- Agora, ao aplicar um comando de presenca (Agenda, LA Teacher, Fabio), cada aula
-- com aluno presente faz o professor dela — e as aulas gemeas do mesmo horario
-- (o Emusys duplica o slot em turma + individual) — virarem presente com origem
-- 'aluno_presente', e grava um item_aplicado de professor no MESMO request_id.
-- O escritor ja processa esse evento (caminho por-aula de processarEventosProfessor).
--
-- Guardas:
--  * so onde professor_presenca_origem IS NULL: decisao humana (secretaria marcou
--    presente OU ausente) nunca e tocada;
--  * aula cancelada fica fora;
--  * a origem 'aluno_presente' NAO e 'agenda_secretaria', entao no escritor ela so
--    PREENCHE o Emusys quando o professor esta sem resposta la — falta marcada por
--    humano no Emusys vira conflito_marca_humana, nunca sobrescrita;
--  * falha aqui nao derruba a chamada do aluno: vai para automacao_log
--    (evento='presenca_professor_por_aluno', status='erro') com o request_id.
--
-- Nao muda: syncs do Emusys (nao passam por comando), o gatilho antigo (segue
-- existindo para presenca vinda do Emusys) e os botoes de professor da Agenda,
-- que carimbam agenda_secretaria e prevalecem.
--
-- Custo: 17 a 80 aulas/dia (medido 22-29/09), cada uma 1 GET + no maximo 1 PATCH
-- no escritor, no ritmo de 1,1 s. Consulta desta funcao: indice por request_id.

create or replace function public.fn_presenca_professor_por_aluno_presente_v1(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_cmd public.presenca_comandos%rowtype;
  v_seq integer;
  v_aula record;
  v_n integer := 0;
begin
  select * into v_cmd from public.presenca_comandos where request_id = p_request_id;
  if not found then
    return 0;
  end if;

  begin
    select coalesce(max(sequencia), 0) into v_seq
      from public.presenca_acao_eventos where request_id = p_request_id;

    for v_aula in
      with alvo as (
        select distinct ae.unidade_id, ae.professor_id, ae.data_hora_inicio
          from public.presenca_acao_eventos e
          join public.aulas_emusys ae on ae.id = e.aula_id
         where e.request_id = p_request_id
           and e.tipo = 'item_aplicado'
           and e.aluno_id is not null
           and e.status_novo = 'presente'
           and ae.professor_id is not null
           and coalesce(ae.cancelada, false) = false
      )
      select ae.id, ae.unidade_id, ae.professor_id
        from alvo a
        join public.aulas_emusys ae
          on ae.unidade_id = a.unidade_id
         and ae.professor_id = a.professor_id
         and ae.data_hora_inicio = a.data_hora_inicio
       where coalesce(ae.cancelada, false) = false
         and ae.professor_presenca_origem is null
         -- ja tem evento de professor neste comando (reexecucao): nao duplica
         and not exists (
           select 1 from public.presenca_acao_eventos x
            where x.request_id = p_request_id
              and x.aluno_id is null
              and x.professor_id = ae.professor_id
              and x.aula_id = ae.id
         )
       order by ae.id
       for update of ae
    loop
      -- origem nula passa pelo fn_proteger_decisao_humana_aula sem flag.
      update public.aulas_emusys
         set professor_presenca = 'presente',
             professor_presenca_origem = 'aluno_presente'
       where id = v_aula.id;

      v_seq := v_seq + 1;
      insert into public.presenca_acao_eventos(
        request_id, sequencia, tipo, fonte, auth_user_id, usuario_id,
        unidade_id, aula_id, aluno_id, professor_id, status_novo
      ) values (
        p_request_id, v_seq, 'item_aplicado', v_cmd.fonte, v_cmd.auth_user_id, v_cmd.usuario_id,
        v_aula.unidade_id, v_aula.id, null, v_aula.professor_id, 'presente'
      );
      v_n := v_n + 1;
    end loop;
  exception when others then
    insert into public.automacao_log(aluno_nome, evento, acao, status, detalhes)
    values (
      '(comando ' || p_request_id || ')',
      'presenca_professor_por_aluno',
      'falhou',
      'erro',
      jsonb_build_object('request_id', p_request_id, 'sqlstate', sqlstate, 'erro', sqlerrm)
    );
    return 0;
  end;

  return v_n;
end
$function$;

revoke all on function public.fn_presenca_professor_por_aluno_presente_v1(uuid) from public, anon, authenticated;
grant execute on function public.fn_presenca_professor_por_aluno_presente_v1(uuid) to service_role;

comment on function public.fn_presenca_professor_por_aluno_presente_v1(uuid) is
  'Aluno presente num comando de presenca => professor da aula (e gemeas do horario) presente com origem aluno_presente + item_aplicado de professor para o escritor do Emusys. So onde nao ha decisao humana (origem nula). Chamada por app_aplicar_comando_presenca_v1. Falha vai para automacao_log evento=presenca_professor_por_aluno.';

-- Liga a funcao no fim de app_aplicar_comando_presenca_v1, antes de fechar o
-- comando. Substituicao sobre a definicao VIVA, com guarda de contagem.
do $migracao$
declare
  v_def text := pg_get_functiondef('public.app_aplicar_comando_presenca_v1(uuid)'::regprocedure);
  v_ancora text := E'  update public.presenca_comandos set\n    status = case when v_rejeitados=0';
  v_novo text := E'  perform public.fn_presenca_professor_por_aluno_presente_v1(p_request_id);\n'
    || E'  select coalesce(max(sequencia), v_evento_seq) into v_evento_seq\n'
    || E'    from public.presenca_acao_eventos where request_id = p_request_id;\n\n'
    || v_ancora;
  v_ocorrencias integer;
begin
  if position('fn_presenca_professor_por_aluno_presente_v1' in v_def) > 0 then
    raise notice 'app_aplicar_comando_presenca_v1 ja chama a funcao; nada a fazer';
    return;
  end if;
  v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_ocorrencias <> 1 then
    raise exception 'ancora esperava 1 ocorrencia, achou %', v_ocorrencias;
  end if;
  execute replace(v_def, v_ancora, v_novo);
end
$migracao$;

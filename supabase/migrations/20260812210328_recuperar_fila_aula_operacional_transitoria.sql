-- A primeira migration canônica recuperava apenas mensagens que ainda
-- continham "aula ... roster". O retry concorrente pode resumir o mesmo erro
-- para `normalizacao_invalida`. A condição segura é estrutural: erro
-- transitório, âncora operacional diferente e destino com roster.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  v_item record;
begin
  for v_item in
    select fila.id as fila_id,
           fila.aula_id as aula_id_anterior,
           public.fn_aula_operacional_id(fila.aula_id) as aula_id_nova,
           fila.status as status_anterior,
           fila.erro as erro_anterior,
           fila.tentativas as tentativas_anteriores
      from public.fabio_fila_audios fila
     where fila.status = 'erro'
       and fila.erro_tipo = 'transitorio'
       and public.fn_aula_operacional_id(fila.aula_id) is distinct from fila.aula_id
       and exists (
         select 1
           from public.aula_alunos_emusys roster
          where roster.aula_emusys_id = public.fn_aula_operacional_id(fila.aula_id)
       )
     for update of fila
  loop
    insert into public.audit_log(
      tabela, registro_id, registro_id_text, acao,
      dados_antigos, dados_novos, usuario, origem, created_at
    ) values (
      'fabio_fila_audios', v_item.fila_id, v_item.fila_id::text,
      'relink_aula_roster',
      jsonb_build_object(
        'aula_id', v_item.aula_id_anterior,
        'status', v_item.status_anterior,
        'erro', v_item.erro_anterior,
        'tentativas', v_item.tentativas_anteriores
      ),
      jsonb_build_object(
        'aula_id', v_item.aula_id_nova,
        'status', 'pendente',
        'motivo', 'erro_transitorio_em_evento_vazio_com_destino_canonico'
      ),
      'migration', 'recuperar_fila_aula_operacional_transitoria', now()
    );

    update public.fabio_fila_audios
       set aula_id = v_item.aula_id_nova,
           status = 'pendente',
           erro = null,
           tentativas = 0,
           atualizado_em = now()
     where id = v_item.fila_id;
  end loop;
end
$migration$;

commit;

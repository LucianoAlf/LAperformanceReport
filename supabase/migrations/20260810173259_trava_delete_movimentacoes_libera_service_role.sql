-- Correcao da trava criada em 20260810172140.
--
-- O teste inicial passou porque simulou "sem claims" para o caminho interno. Mas
-- o PostgREST entrega `request.jwt.claims` TAMBEM para service_role (com
-- {"role":"service_role"}), e a trava so liberava quando os claims estavam
-- VAZIOS. Ou seja: a edge processar-matricula-emusys seria bloqueada ao apagar a
-- linha de aviso previo no evento matricula_aviso_previo_removido -- e falharia
-- em SILENCIO, porque aquele DELETE nao tem tratamento de erro.
--
-- Pego rodando o cenario real (role service_role COM claims) antes de encerrar,
-- em vez de confiar no teste que eu mesmo tinha desenhado.
--
-- ⚠️ LICAO DE TESTE: a primeira tentativa de validar isso pelo MCP tambem
-- enganou, e por outro motivo -- o MCP executa como `postgres`, que a propria
-- trava libera, entao o DELETE do "usuario" passava e parecia que a trava estava
-- quebrada. Testar trava de permissao exige `set local role` com o papel REAL
-- (`authenticated` / `service_role`) e o `request.jwt.claims` correspondente;
-- sem isso o resultado nao diz nada.
--
-- Agora o criterio e explicito: libera quem E service_role (pelos claims ou pelo
-- papel efetivo do banco), e nao quem "nao tem claims".
--
-- Validado em producao com os papeis reais:
--   1. set role service_role  + claims service_role  -> DELETE passa
--   2. set role authenticated + claims de usuario    -> DELETE_BLOQUEADO
--   3. arquivar_movimentacao_admin como authenticated -> move e grava
--      arquivado_por = fefe@lamusic.com.br

create or replace function public.fn_bloqueia_delete_movimentacao_admin()
returns trigger
language plpgsql
as $function$
declare
  v_role text;
begin
  -- Arquivamento em curso: a RPC arquivar_movimentacao_admin ja gravou a copia.
  if coalesce(current_setting('app.arquivamento_em_curso', true), 'off') = 'on' then
    return old;
  end if;

  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    ''
  );

  -- Automacao de backend: edges e jobs. A edge precisa apagar aviso previo que
  -- deixou de existir na fonte (matricula_aviso_previo_removido).
  if v_role = 'service_role' then
    return old;
  end if;

  -- Sem claims = migration, psql, cron interno.
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return old;
  end if;

  -- Papel efetivo do banco, para o caso de conexao direta como service_role sem
  -- passar pelo PostgREST.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return old;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'DELETE_BLOQUEADO_EM_MOVIMENTACOES_ADMIN',
    detail  = format('Movimentacao %s (%s, %s) nao pode ser apagada.', old.id, old.tipo, old.aluno_nome),
    hint    = 'Use arquivar_movimentacao_admin(id, motivo) para mover para a lixeira, ou marque anulado=true se for duplicata de renovacao.';
end;
$function$;

-- `arquivar_movimentacao_admin` copiava a linha para a lixeira por POSIÇÃO
-- (`select v_linha.*`), então bastava as duas tabelas divergirem em uma coluna para tudo
-- deslocar. Foi o que aconteceu em 05/09/2026: a migration
-- `20260905180228_saida_emusys_canonica_por_matricula` acrescentou `origem_registro` a
-- `movimentacoes_admin` e não espelhou em `movimentacoes_admin_arquivadas` — 39 colunas na
-- origem contra 38 espelhadas no destino, e o insert passou a mandar 42 valores para 41
-- lugares (`INSERT has more expressions than target columns`).
--
-- ⚠️ NÃO era defeito só meu: a RPC é chamada por TRÊS telas — aba de movimentações
-- (`AdministrativoPage`), avisos vencidos (`TabelaAvisosVencidos`) e a planilha de retenção
-- (`PlanilhaRetencao`) — e 29 arquivamentos foram feitos por pessoas (Vitória 16, Fefe 6,
-- Gabi 6, Arthur 1) entre 12/08 e 04/09. Com o DELETE direto bloqueado por trigger desde
-- agosto, a equipe ficou de 05/09 a 08/09 sem conseguir NEM arquivar NEM excluir — o mesmo
-- beco que a lixeira foi criada para fechar depois do caso da Catarina Petrolongo.
--
-- Correção em três camadas:
--   1. `origem_registro` passa a existir na lixeira, senão arquivar perderia o campo;
--   2. a cópia passa a ser por NOME, montada do catálogo — ordem deixa de importar e
--      coluna nova no fim não desloca mais nada;
--   3. coluna na origem sem espelho no destino vira RECUSA explícita
--      (`COLUNA_SEM_ESPELHO`), nunca cópia pela metade: arquivar perdendo campo é a falha
--      que ninguém descobre até precisar do dado.
--
-- A quarta camada é o teste `tests/arquivarMovimentacaoEspelhoColunas.test.mjs`, que compara
-- as duas tabelas — é ele que impede a terceira repetição, porque a guarda acima só avisa
-- depois que já está em produção.

alter table public.movimentacoes_admin_arquivadas
  add column if not exists origem_registro text;

-- Sem default nem backfill de propósito: as 30 linhas arquivadas antes de 05/09 foram
-- gravadas quando a coluna nem existia na origem. NULL diz "não sei"; 'manual' inventaria.
comment on column public.movimentacoes_admin_arquivadas.origem_registro is
  'Espelho de movimentacoes_admin.origem_registro. NULL nas linhas arquivadas antes de '
  '2026-09-05, quando a coluna ainda não existia na origem.';

create or replace function public.arquivar_movimentacao_admin(p_id integer, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_linha public.movimentacoes_admin%rowtype;
  v_ator text;
  v_colunas text;
  v_sem_espelho text;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'ARQUIVAMENTO_MOTIVO_OBRIGATORIO';
  end if;

  select * into v_linha from public.movimentacoes_admin where id = p_id for update;
  if v_linha.id is null then
    raise exception 'MOVIMENTACAO_NAO_ENCONTRADA: %', p_id;
  end if;

  v_ator := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email',
    session_user
  );

  -- Recusar antes de escrever: melhor a tela dizer o que falta do que a lixeira guardar
  -- uma cópia incompleta que ninguém confere.
  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into v_sem_espelho
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'movimentacoes_admin'
    and not exists (
      select 1 from information_schema.columns d
      where d.table_schema = 'public'
        and d.table_name = 'movimentacoes_admin_arquivadas'
        and d.column_name = c.column_name
    );

  if v_sem_espelho is not null then
    raise exception using
      errcode = 'P0001',
      message = format('COLUNA_SEM_ESPELHO: %s', v_sem_espelho),
      detail  = 'movimentacoes_admin tem coluna que movimentacoes_admin_arquivadas nao tem; '
                || 'arquivar agora perderia esse campo.',
      hint    = 'Acrescente a(s) coluna(s) em movimentacoes_admin_arquivadas e repita.';
  end if;

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_colunas
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'movimentacoes_admin'
    and exists (
      select 1 from information_schema.columns d
      where d.table_schema = 'public'
        and d.table_name = 'movimentacoes_admin_arquivadas'
        and d.column_name = c.column_name
    );

  -- Cópia por NOME. Os identificadores vêm do catálogo e passam por quote_ident.
  execute format(
    'insert into public.movimentacoes_admin_arquivadas (%s, arquivado_em, arquivado_por, arquivado_motivo)
     select %s, now(), $1, $2 from public.movimentacoes_admin where id = $3',
    v_colunas, v_colunas
  ) using v_ator, btrim(p_motivo), p_id;

  -- Libera o trigger apenas para este DELETE, dentro desta transacao.
  perform set_config('app.arquivamento_em_curso', 'on', true);
  delete from public.movimentacoes_admin where id = p_id;
  perform set_config('app.arquivamento_em_curso', 'off', true);

  return jsonb_build_object(
    'id', p_id,
    'tipo', v_linha.tipo,
    'aluno_nome', v_linha.aluno_nome,
    'arquivado_por', v_ator,
    'motivo', btrim(p_motivo)
  );
end;
$function$;

-- `CREATE OR REPLACE` de função reabre EXECUTE para `anon` neste projeto (há
-- ALTER DEFAULT PRIVILEGES no schema public), e esta é SECURITY DEFINER que APAGA linha.
revoke execute on function public.arquivar_movimentacao_admin(integer, text) from public, anon;
grant execute on function public.arquivar_movimentacao_admin(integer, text) to authenticated, service_role;

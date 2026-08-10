-- DELETE em movimentacoes_admin apaga historico sem deixar alternativa a quem
-- so queria tirar uma linha errada da frente.
--
-- CASO REAL (audit_log, registro 3178): em 03/08/2026 a ADM do Recreio deletou a
-- renovacao da Catarina Petrolongo. Ela via DUAS linhas da mesma aluna e a tela
-- so oferecia excluir. Apagou justamente a que veio do webhook -- a unica que
-- tinha a data da 1a aula do novo ciclo -- e sobrou o lancamento manual com a
-- competencia errada. O snapshot de julho, tirado antes, seguiu listando a
-- aluna, entao o relatorio mostrava uma renovacao que o banco nao tinha mais.
-- Nao foi descuido: a ferramenta nao dava outra saida.
--
-- POR QUE LIXEIRA E NAO SOFT DELETE: a coluna `anulado` ja existe e e respeitada
-- por movimentacoes_admin_vigentes, mas 25 funcoes VIVAS ainda leem a tabela
-- crua. Marcar `anulado` nelas nao surtiria efeito, e migrar as 25 e risco
-- desproporcional. Mover a linha para outra tabela a remove das 25 de uma vez,
-- sem tocar em nenhuma -- mesmo padrao de `alunos_arquivados`, ja canonico aqui.
--
-- Os dois mecanismos tem significados distintos e ambos ficam:
--   anulado   = "existe, mas nao conta" -- duplicata de renovacao, rastro visivel
--   arquivado = "nao deveria existir"   -- lancamento errado, sai da frente

create table if not exists public.movimentacoes_admin_arquivadas (
  like public.movimentacoes_admin including defaults,
  arquivado_em timestamptz not null default now(),
  arquivado_por text,
  arquivado_motivo text not null,
  constraint movimentacoes_admin_arquivadas_pkey primary key (id)
);

comment on table public.movimentacoes_admin_arquivadas is
  'Lixeira de movimentacoes_admin. Linha movida por arquivar_movimentacao_admin(). DELETE direto na tabela viva e bloqueado por trg_bloqueia_delete_movimentacao_admin.';

alter table public.movimentacoes_admin_arquivadas enable row level security;

revoke all on table public.movimentacoes_admin_arquivadas from public, anon, authenticated;
grant select on table public.movimentacoes_admin_arquivadas to authenticated;

drop policy if exists movimentacoes_admin_arquivadas_leitura on public.movimentacoes_admin_arquivadas;
create policy movimentacoes_admin_arquivadas_leitura
  on public.movimentacoes_admin_arquivadas for select to authenticated
  using (true);

-- Move a linha. SECURITY DEFINER porque precisa deletar da tabela viva, o que o
-- trigger abaixo so libera com o sinal de sessao setado aqui dentro.
create or replace function public.arquivar_movimentacao_admin(
  p_id integer,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_linha public.movimentacoes_admin%rowtype;
  v_ator text;
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

  insert into public.movimentacoes_admin_arquivadas
  select v_linha.*, now(), v_ator, btrim(p_motivo);

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

revoke all on function public.arquivar_movimentacao_admin(integer, text) from public, anon;
grant execute on function public.arquivar_movimentacao_admin(integer, text) to authenticated, service_role;

-- A trava. Bloqueia DELETE vindo de usuario logado; o caminho passa a ser a RPC.
-- service_role continua livre: a edge processar-matricula-emusys precisa apagar a
-- linha de aviso previo quando o Emusys informa que o aviso deixou de existir
-- (evento matricula_aviso_previo_removido), casando por emusys_aviso_previo_id.
create or replace function public.fn_bloqueia_delete_movimentacao_admin()
returns trigger
language plpgsql
as $function$
begin
  if coalesce(current_setting('app.arquivamento_em_curso', true), 'off') = 'on' then
    return old;
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return old;  -- service_role / job interno / migration
  end if;
  raise exception using
    errcode = 'P0001',
    message = 'DELETE_BLOQUEADO_EM_MOVIMENTACOES_ADMIN',
    detail  = format('Movimentacao %s (%s, %s) nao pode ser apagada.', old.id, old.tipo, old.aluno_nome),
    hint    = 'Use arquivar_movimentacao_admin(id, motivo) para mover para a lixeira, ou marque anulado=true se for duplicata de renovacao.';
end;
$function$;

drop trigger if exists trg_bloqueia_delete_movimentacao_admin on public.movimentacoes_admin;
create trigger trg_bloqueia_delete_movimentacao_admin
  before delete on public.movimentacoes_admin
  for each row execute function public.fn_bloqueia_delete_movimentacao_admin();

-- Validado em producao nos 3 cenarios:
--   1. DELETE direto com JWT de usuario -> DELETE_BLOQUEADO_EM_MOVIMENTACOES_ADMIN
--   2. arquivar_movimentacao_admin()    -> 0 linhas na viva, 1 na lixeira
--   3. motivo com menos de 5 chars      -> ARQUIVAMENTO_MOTIVO_OBRIGATORIO

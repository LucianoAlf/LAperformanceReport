-- Conciliação Emusys: aviso de status que a equipe JÁ corrigiu no cadastro.
--
-- Caso (07/10/2026, Arthur/Barra): Tom de Aquino Barbieri, Maria Eduarda Candido e
-- Gabriela de Lima Sodré estavam `trancado` aqui e `ativa` no Emusys. O Arthur
-- corrigiu o status direto na ficha (audit_log, 16:27–16:52 UTC), mas o aviso
-- "Status divergente → sugestão: Ativo" continuou na fila — só o sync da noite
-- (`sync-matriculas-emusys`, limpeza por rodada de `status_divergente`) o fecha.
-- Quem corrige não tem como saber que já fez a parte dele.
--
-- A função passa a devolver, por item, `aguardando_sync` (o cadastro já está com
-- o status que a divergência sugere) + quem/quando alterou o cadastro pela última
-- vez, e ordena esses itens por último. Nada é resolvido aqui: fechar continua
-- sendo papel do sync, que é quem confere contra o Emusys. A fila só para de
-- pedir uma ação que já foi feita.
--
-- Custo: duas comparações por linha da fila (~centenas), sem leitura nova.
-- Escrita via pg_get_functiondef + replace com guarda de contagem; CREATE OR
-- REPLACE preserva dono e grants.

do $$
declare
  v_def text;
  v_novo text;
  v_ancora_cols constant text := 'a.curso_id, c.nome as curso_nome';
  v_ancora_order constant text := 'order by t.severidade, t.detectado_em';
begin
  v_def := pg_get_functiondef('public.get_conciliacao_matriculas(uuid)'::regprocedure);

  if v_def like '%aguardando_sync%' then
    raise notice 'get_conciliacao_matriculas ja tem aguardando_sync; nada a fazer';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_ancora_cols, ''))) / length(v_ancora_cols) <> 1 then
    raise exception 'ancora de colunas esperava 1 ocorrencia';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora_order, ''))) / length(v_ancora_order) <> 1 then
    raise exception 'ancora de ordenacao esperava 1 ocorrencia';
  end if;

  v_novo := replace(v_def, v_ancora_cols,
    v_ancora_cols || $q$,
           coalesce(d.tipo_divergencia = 'status_divergente'
             and jsonb_typeof(d.sugestao) = 'string'
             and a.status = d.sugestao #>> '{}', false) as aguardando_sync,
           a.updated_at as cadastro_alterado_em,
           a.updated_by as cadastro_alterado_por$q$);

  v_novo := replace(v_novo, v_ancora_order,
    'order by t.aguardando_sync, t.severidade, t.detectado_em');

  execute v_novo;
end $$;

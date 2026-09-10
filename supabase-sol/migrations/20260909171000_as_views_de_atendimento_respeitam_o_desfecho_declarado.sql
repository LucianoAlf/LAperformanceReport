-- As duas views de atendimento filtravam `conversa_status IS DISTINCT FROM
-- 'resolved'` lendo o status de DENTRO do payload da ultima mensagem — que
-- congela ali. Agora elas consultam tambem `sol_chatwoot_conversas`, alimentada
-- pelo evento `conversation_status_changed` (ligado no webhook 10 em 09/09).
--
-- ⚠️ A leitura e `COALESCE(vivo.status, congelado)`, nunca so a tabela nova:
--    ela e FORWARD-ONLY e ausencia significa "nao sei", jamais "esta aberta".
--    Sem o coalesce, toda conversa anterior ao evento sairia da pauta de uma vez.
-- ⚠️ O predicado continua `IS DISTINCT FROM 'resolved'` — so `resolved` exclui.
--    `pending` e `snoozed` seguem vivas de proposito: quem adiou nao resolveu.
do $$
declare
  v_cand text; v_calor text;
  v_alvo_cand text := 'WHERE u.ultimo_autor = ''contact''::text AND u.conversa_status IS DISTINCT FROM ''resolved''::text';
  v_novo_cand text := 'WHERE u.ultimo_autor = ''contact''::text AND COALESCE(cv.status, u.conversa_status) IS DISTINCT FROM ''resolved''::text';
  v_alvo_calor text := 'WHERE f.conversa_status IS DISTINCT FROM ''resolved''::text';
  v_novo_calor text := 'WHERE COALESCE(cv.status, f.conversa_status) IS DISTINCT FROM ''resolved''::text';
  v_join_cand text := 'JOIN sol_chatwoot_inboxes i USING (inbox_id)';
  v_join_calor text := 'JOIN sol_chatwoot_inboxes i USING (inbox_id)';
  v_n int;
begin
  ---------------------------------------------------------------- candidatos
  v_cand := pg_get_viewdef('public.vw_atendimento_candidatos_sinal'::regclass, true);
  v_n := (length(v_cand) - length(replace(v_cand, v_alvo_cand, ''))) / length(v_alvo_cand);
  if v_n <> 1 then raise exception 'candidatos: ancora WHERE %x, esperava 1', v_n; end if;
  v_n := (length(v_cand) - length(replace(v_cand, v_join_cand, ''))) / length(v_join_cand);
  if v_n <> 1 then raise exception 'candidatos: ancora JOIN %x, esperava 1', v_n; end if;

  v_cand := replace(v_cand, v_join_cand,
    v_join_cand || E'\n     LEFT JOIN sol_chatwoot_conversas cv ON cv.conversa_id = u.conversa_id');
  v_cand := replace(v_cand, v_alvo_cand, v_novo_cand);
  execute 'create or replace view public.vw_atendimento_candidatos_sinal as ' || v_cand;

  --------------------------------------------------------------------- calor
  v_calor := pg_get_viewdef('public.vw_atendimento_calor_conversa'::regclass, true);
  v_n := (length(v_calor) - length(replace(v_calor, v_alvo_calor, ''))) / length(v_alvo_calor);
  if v_n <> 1 then raise exception 'calor: ancora WHERE %x, esperava 1', v_n; end if;
  v_n := (length(v_calor) - length(replace(v_calor, v_join_calor, ''))) / length(v_join_calor);
  if v_n <> 1 then raise exception 'calor: ancora JOIN %x, esperava 1', v_n; end if;

  v_calor := replace(v_calor, v_join_calor,
    v_join_calor || E'\n     LEFT JOIN sol_chatwoot_conversas cv ON cv.conversa_id = f.conversa_id');
  v_calor := replace(v_calor, v_alvo_calor, v_novo_calor);
  execute 'create or replace view public.vw_atendimento_calor_conversa as ' || v_calor;
end $$;

-- ⚠️ ALTER DEFAULT PRIVILEGES pega VIEW tambem: relacl correto e so leitura.
revoke all on public.vw_atendimento_candidatos_sinal from public, anon;
revoke all on public.vw_atendimento_calor_conversa  from public, anon;
grant select on public.vw_atendimento_candidatos_sinal to service_role;
grant select on public.vw_atendimento_calor_conversa  to service_role;

comment on view public.vw_atendimento_candidatos_sinal is
  'Conversas em que o cliente falou por ultimo e a equipe ainda nao respondeu. '
  '⚠️ "falou por ultimo" e o FUNIL BARATO que leva o caso ao modelo, NAO a '
  'definicao de pendencia — quem decide se "❤️" precisa de resposta e o modelo, '
  'no extrator. Exclui conversa resolvida usando o status VIVO '
  '(sol_chatwoot_conversas) com fallback no congelado do payload.';

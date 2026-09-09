-- 🔴 A MESMA PESSOA TEM LEAD EM DUAS UNIDADES, E O RESOLVER ESCOLHIA "O MAIS
--    NOVO" — sem olhar unidade nenhuma.
--
-- Medido em 09/09/2026: a Kellen (conv 6796) e a Suelen (conv 15052) escreveram
-- para o inbox `Mila_CG` — a Kellen literalmente pedindo "informações das aulas
-- na LA Music Kids Campo Grande" — e o sinal das duas foi para o grupo do
-- RECREIO. Cada uma tem DOIS leads com o mesmo telefone:
--     Kellen  → 2021 Campo Grande (02/03)  e  13997 Recreio (06/09)
--     Suelen  → 8922 Campo Grande (10/05)  e   9826 Recreio (06/06)
-- e o `order by created_at desc limit 1` premiava o mais recente. Nao e sorteio
-- por acaso; e sorteio por DATA, que e igualmente alheio a pergunta. Mesma
-- familia do `limit 1` que a `sol_nome_mesma_pessoa_v1` teve de matar em 29/08.
--
-- A evidencia certa estava a mao e nao chegava aqui: a PORTA em que a pessoa
-- bateu. Para LEAD, a porta e a unidade de interesse — quem escreve ao numero
-- de Campo Grande quer Campo Grande.
--
-- ⚠️ SO VALE PARA LEAD. Para ALUNO a regra continua invertida e correta: aluno
--    de CG que escreve ao inbox do Recreio E de CG. Por isso os ramos `um`,
--    `fam` e `ex` NAO recebem a dica — matricula manda sobre porta.
-- ⚠️ Sem dica (`p_unidade_id` nulo) o comportamento e IDENTICO ao de antes: o
--    `case` vira constante 1 para todas as linhas e a ordenacao nao muda.
-- ⚠️ A dica e DESEMPATE, nao filtro: porta sem lead correspondente devolve o
--    lead que existe, nunca "nao achei" (validado com o Pietro).
-- ⚠️ A assinatura antiga e DROPADA no mesmo commit: com DEFAULT, manter as duas
--    faz a chamada POSICIONAL de `radar_detectar_calor_atendimento_v1` e da view
--    `vw_instagram_sessoes_resolvidas` virar "function is not unique" — foi
--    assim que o `upsert_lead` derrubou o webhook de leads por 21h em 11/08.
-- ⚠️ Varrer `pg_proc` NAO acha todos os consumidores: quem pegou a view foi o
--    proprio DROP. Dependencia de funcao mora tambem em view, trigger e default.
do $$
declare
  v_def text;
  v_view text;
  v_alvo text := 'order by l.created_at desc nulls last, l.id desc';
  v_novo text := 'order by case when p_unidade_id is not null'
                 || ' and l.unidade_id = p_unidade_id then 0 else 1 end,'
                 || ' l.created_at desc nulls last, l.id desc';
  v_n int;
begin
  v_def  := pg_get_functiondef('public.radar_resolver_entidade_por_telefone(text)'::regprocedure);
  v_view := pg_get_viewdef('public.vw_instagram_sessoes_resolvidas'::regclass, true);

  -- guarda de ancora: sao DOIS ramos de lead (lead_novo e lead_qualquer).
  -- Declarar o numero esperado, nunca supor 1.
  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 2 then
    raise exception 'ancora do lead apareceu % vezes, esperava 2 — abortado', v_n;
  end if;

  v_def := replace(v_def, v_alvo, v_novo);
  v_def := replace(v_def,
    'FUNCTION public.radar_resolver_entidade_por_telefone(p_telefone text)',
    'FUNCTION public.radar_resolver_entidade_por_telefone(p_telefone text, p_unidade_id uuid DEFAULT NULL)');
  if v_def not like '%p_unidade_id uuid DEFAULT NULL%' then
    raise exception 'assinatura nao foi reescrita — abortado';
  end if;
  execute v_def;

  -- a view cai junto no CASCADE e volta IDENTICA (a chamada posicional de 1
  -- argumento passa a resolver para a nova assinatura, com a dica nula =
  -- comportamento inalterado na fronteira do Instagram)
  execute 'drop function public.radar_resolver_entidade_por_telefone(text) cascade';
  execute 'create view public.vw_instagram_sessoes_resolvidas as ' || v_view;
end $$;

-- ACL da view, restaurada nominalmente (DROP levou junto)
revoke all on public.vw_instagram_sessoes_resolvidas from public, anon;
grant select on public.vw_instagram_sessoes_resolvidas
  to authenticated, service_role, sol_acesso_restrito, mila_acesso_restrito,
     fabio_agent, lia_acesso_restrito;

-- ⚠️ recriar funcao reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES)
revoke execute on function public.radar_resolver_entidade_por_telefone(text, uuid)
  from public, anon;
grant execute on function public.radar_resolver_entidade_por_telefone(text, uuid)
  to authenticated, service_role, mila_acesso_restrito, sol_acesso_restrito;

comment on function public.radar_resolver_entidade_por_telefone(text, uuid) is
  'Resolve telefone -> aluno/familia/ex-aluno/lead. `p_unidade_id` e a unidade '
  'da PORTA (o inbox da conversa) e desempata SO entre leads: a mesma pessoa '
  'costuma ter lead em 2 unidades e escolher "o mais novo" mandava o sinal para '
  'o grupo errado. Aluno NAO usa a dica — matricula manda sobre porta.';

-- "Fora da comunidade" AFIRMA que a pessoa nao esta no grupo. Para quem nao tem UM
-- telefone cadastrado isso e falso: nao ha numero para procurar, logo nao se sabe.
-- Medido em 22/09/2026: 53 alunos (10 ativos) marcados como fora sem nenhum telefone --
-- nem proprio, nem whatsapp, nem do responsavel, nem em aluno_contatos, considerando
-- todas as matriculas da mesma pessoa.
--
-- Mesma regua que o modulo ja aplica a sem_captura / captura_desatualizada /
-- sem_grupo_configurado: ausencia de informacao vira "nao sei", nunca "esta fora".
-- Para esses alunos a pendencia deixa de ser "entrar no grupo" e passa a ser
-- "cadastrar o telefone", que e acionavel.
--
-- A deteccao NAO reimplementa a regra de telefone: um aluno so aparece em fones_agg se
-- algum numero dele (ou de outra matricula da mesma pessoa) normalizou. Ausencia ali e
-- a propria definicao de "sem telefone", pela mesma fonte que o resto da view usa --
-- reescrever o predicado aqui seria a segunda resposta para a mesma pergunta.
--
-- Validado: 0 falso positivo (ninguem com telefone virou sem_telefone_cadastrado) e
-- 0 falso negativo (ninguem sem telefone sobrou como fora_da_comunidade).
-- `na_comunidade` fica INTACTO em 725: evidencia positiva nao e afetada.
--
-- ⚠️ O FILTRO da Lista ("Fora") continua incluindo os "nao sei" de proposito -- ele e de
--    acao, serve para achar quem precisa ser olhado. Quem nao pode afirmar "Fora" e a
--    COLUNA/FICHA, e quem faz essa distincao e explicarEstadoComunidade() no front.
--
-- Aplicado como replace textual sobre a definicao viva (nao ha transcricao manual do
-- corpo), com guarda em cada ancora.
-- ROLLBACK: recriar a definicao de 20260922230500.
do $$
declare v_def text; v_novo text;
begin
  select pg_get_viewdef('public.vw_aluno_comunidade_wa_v1'::regclass, true) into v_def;

  -- 1) CTE nova, logo antes de outros_grupos
  if position('), outros_grupos AS (' in v_def) = 0 then
    raise exception 'ancora outros_grupos nao encontrada';
  end if;
  v_novo := replace(v_def, '), outros_grupos AS (',
    '), tem_telefone AS (
         SELECT DISTINCT fones_agg.aluno_id FROM fones_agg
        ), outros_grupos AS (');

  -- 2) ramo novo no CASE, imediatamente antes do ELSE que afirmava "fora"
  if position('ELSE ''fora_da_comunidade''::text' in v_novo) = 0 then
    raise exception 'ancora do ELSE fora_da_comunidade nao encontrada';
  end if;
  v_novo := replace(v_novo, 'ELSE ''fora_da_comunidade''::text',
    'WHEN tt.aluno_id IS NULL THEN ''sem_telefone_cadastrado''::text
            ELSE ''fora_da_comunidade''::text');

  -- 3) join da CTE nova
  if position('LEFT JOIN contatos_do_grupo cdg ON cdg.aluno_id = a.id' in v_novo) = 0 then
    raise exception 'ancora do join final nao encontrada';
  end if;
  v_novo := replace(v_novo, 'LEFT JOIN contatos_do_grupo cdg ON cdg.aluno_id = a.id',
    'LEFT JOIN contatos_do_grupo cdg ON cdg.aluno_id = a.id
     LEFT JOIN tem_telefone tt ON tt.aluno_id = a.id');

  execute 'create or replace view public.vw_aluno_comunidade_wa_v1 as ' || v_novo;
end $$;

revoke all on public.vw_aluno_comunidade_wa_v1 from public, anon;
grant select on public.vw_aluno_comunidade_wa_v1 to authenticated, service_role;

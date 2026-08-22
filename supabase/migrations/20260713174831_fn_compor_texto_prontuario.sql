-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ACHADO DO ALF (13/07, 1a aula real): o prontuario recebeu um PAREDAO de texto —
-- cabecalho redundante ("AULA — 13/07 · C_Seg_11"), a palavra "Aluno" solta, conteudo repetido
-- entre tronco e fatia, e um campo VAZIO virando texto ("Proximo passo: — (a completar...)").
-- O professor confere um card limpo e estruturado e o prontuario recebe outra coisa.
--
-- RAIZ: o texto final vinha do texto_consolidado, montado pelo LLM. Formatacao do ativo mais
-- importante da escola nao pode depender do agente lembrar do template — mesma licao do escopo,
-- do modo e do aula_id. O BANCO monta, a partir dos campos estruturados (que ja vem corretos).
create or replace function public.fn_compor_texto_prontuario(
  p_tronco jsonb,
  p_fatia  jsonb
)
returns text
language sql
immutable
as $function$
  with campo(ordem, rotulo, valor) as (
    values
      (1, 'Objetivo',      nullif(btrim(coalesce(p_fatia->>'objetivo',      p_tronco->>'objetivo')),      '')),
      (2, 'Conteúdo',      nullif(btrim(coalesce(p_fatia->>'atividades',    p_tronco->>'atividades')),    '')),
      (3, 'Progresso',     nullif(btrim(p_fatia->>'progresso'),  '')),
      (4, 'Próximo passo', nullif(btrim(p_fatia->>'proximo_passo'), '')),
      (5, 'Observação',    nullif(btrim(coalesce(p_fatia->>'observacao',    p_tronco->>'obs_gerais')),    '')),
      (6, 'Repertório',    nullif(btrim(coalesce(p_fatia->>'repertorio',    p_tronco->>'repertorio')),    '')),
      (7, 'Materiais',     nullif(btrim(p_tronco->>'materiais'), '')),
      (8, 'Dever de casa', nullif(btrim(coalesce(p_fatia->>'dever_casa',    p_tronco->>'dever_casa')),    ''))
  )
  -- campo vazio NAO vira linha. Nunca "— (a completar)". Sem cabecalho, sem a palavra "Aluno".
  select nullif(string_agg(rotulo || ': ' || valor, E'\n' order by ordem), '')
  from campo where valor is not null;
$function$;

comment on function public.fn_compor_texto_prontuario(jsonb,jsonb) is
  'Monta o texto do prontuario a partir dos campos estruturados. Campo vazio nao vira linha. Sem cabecalho (o card ja mostra data/curso) e sem a palavra "Aluno". O banco formata — nao o LLM.';

revoke all on function public.fn_compor_texto_prontuario(jsonb,jsonb) from public, anon;
grant execute on function public.fn_compor_texto_prontuario(jsonb,jsonb) to authenticated, service_role;

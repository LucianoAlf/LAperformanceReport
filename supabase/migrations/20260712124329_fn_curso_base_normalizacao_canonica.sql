-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RAIZ: o Emusys grava o mesmo curso com nomes diferentes.
--   sufixo tecnico:  "Canto T" (turma) / "Piano IND" (individual)
--   grafia:          "Ukulêle" vs "Ukulelê" | "Garage Band" vs "GarageBand" | "Pra" vs "Para"
--   caixa/acento:    "Musicalização para bebês" vs "Musicalização Para Bebês"
-- Comparar curso por igualdade exata é bug latente em QUALQUER lugar do sistema.
-- Nao adianta normalizar o DADO: o sync reescreve curso_nome toda rodada (ignoreDuplicates:false).
-- Solucao: funcao canonica IMMUTABLE, usada em toda comparacao de curso.
create or replace function public.fn_curso_base(p_curso text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(
    replace(
      replace(
        lower(translate(
          regexp_replace(btrim(coalesce(p_curso,'')), '\s+(T|IND)$', '', 'i'),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
        )),
        'garage band', 'garageband'
      ),
      'banda pra sempre', 'banda para sempre'
    ), '')
$$;

comment on function public.fn_curso_base(text) is
  'Nome canonico do curso. Use SEMPRE que comparar curso entre aulas_emusys, jornada, presenca ou Emusys. Igualdade exata de curso_nome e bug.';

revoke all on function public.fn_curso_base(text) from public, anon;
grant execute on function public.fn_curso_base(text) to authenticated, service_role;

-- indice de expressao pro filtro do historico nao virar seq scan
create index if not exists idx_aulas_emusys_curso_base
  on public.aulas_emusys (public.fn_curso_base(curso_nome));

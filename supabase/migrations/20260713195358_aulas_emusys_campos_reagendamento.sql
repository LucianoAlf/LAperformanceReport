-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Campos novos do GET /aulas do Emusys (payload real inspecionado pelo Codex em 13/07).
-- Desenhados a partir do JSON de verdade, nao do que a gente imaginava que vinha.
--
-- ACHADOS ALEM DO PEDIDO:
--   justificada           -> distingue falta JUSTIFICADA de falta pura (governanca de presenca)
--   professores[].presenca-> se o PROFESSOR compareceu. Hoje o banco nao sabe se ele faltou.
--   horario_presenca      -> MORTO: e sempre igual ao inicio da aula. Nao e timestamp real.
alter table public.aulas_emusys
  add column if not exists reagendada boolean not null default false,
  add column if not exists data_hora_inicio_original timestamptz,
  add column if not exists justificada boolean not null default false,
  add column if not exists professor_presenca text;   -- 'presente' | 'ausente' | null

comment on column public.aulas_emusys.reagendada is
  'Emusys: true quando a MESMA aula foi movida de data. NAO existe reposicao/duplicacao na LA (confirmado pelo Mateus/Emusys). Por isso nao ha aula_origem_id: e a mesma aula.';
comment on column public.aulas_emusys.data_hora_inicio_original is
  'Emusys: data/hora ANTES do reagendamento. Vem como string local (America/Sao_Paulo), sem timezone.';
comment on column public.aulas_emusys.justificada is
  'Emusys: falta justificada. Campo novo, nao pedido — distingue "faltou e avisou" de "faltou".';
comment on column public.aulas_emusys.professor_presenca is
  'Emusys: professores[].presenca. Se o PROFESSOR compareceu. Nunca foi sincronizado antes.';

-- indice: o Fabio vai perguntar "o que foi reagendado hoje?"
create index if not exists idx_aulas_emusys_reagendada
  on public.aulas_emusys (data_aula) where reagendada;

-- Quantos dias a aula foi adiada/antecipada (0 = mesmo dia, positivo = adiada)
create or replace function public.fn_dias_de_reagendamento(p_aula_id integer)
returns integer language sql stable
set search_path = public
as $$
  select case when ae.reagendada and ae.data_hora_inicio_original is not null
              then (ae.data_hora_inicio::date - ae.data_hora_inicio_original::date)
         end
  from public.aulas_emusys ae where ae.id = p_aula_id;
$$;
revoke all on function public.fn_dias_de_reagendamento(integer) from public, anon;
grant execute on function public.fn_dias_de_reagendamento(integer) to authenticated, service_role;

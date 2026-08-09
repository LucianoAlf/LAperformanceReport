-- Identidade ESTÁVEL de um período de professor, para que a curadoria (revisões)
-- sobreviva a uma reconstrução.
--
-- O problema: `professor_matricula_disciplina_periodos_v1.id` é um uuid default,
-- gerado do zero a cada reconstrução. `professor_periodos_revisoes_v1` aponta para
-- esse id, e a view efetiva casa por `'baseline:' || periodo_id`. Logo, reconstruir
-- ORFANIZA toda a curadoria — foi por isso que o pipeline nunca ganhou cron.
--
-- A âncora é `evidencias->'aulas'->>0`: o `emusys_aula_id` da PRIMEIRA aula do período.
-- É um id do próprio Emusys, não um valor derivado por nós. Medido em 09/08/2026 sobre
-- as 236 revisões da reconstrução vigente:
--   - primeira aula (este critério) ....... 232 casam (98,3%)
--   - menor id de aula do período ......... 227 casam (e é SUBCONJUNTO: so_menor = 0)
--   - com `data_inicio` no lugar da âncora . a data é recalculada pelo algoritmo, instável
--   - sem `emusys_matricula_disciplina_id` . 189 colisões, inutilizável
-- Unicidade: 8.269/8.269 na reconstrução vigente e 8.338/8.338 na nova, zero colisões.
--
-- `md:-` é fallback consciente: `matricula_disciplina_id` vem null em aula de turma
-- (limitação da API do Emusys). Sem o fallback a cobertura cairia de 8.269 para 8.116.
-- Retorna NULL quando falta componente essencial — NULL nunca casa, então período sem
-- âncora simplesmente não herda curadoria, em vez de casar com o vizinho errado.
create or replace function public.fn_chave_natural_periodo_professor_v1(
  p_unidade_id uuid,
  p_pessoa_chave text,
  p_emusys_matricula_disciplina_id bigint,
  p_emusys_professor_id bigint,
  p_evidencias jsonb
) returns text
language sql
immutable
parallel safe
as $fn$
  select case
    when p_unidade_id is null
      or p_pessoa_chave is null
      or p_emusys_professor_id is null
      or (p_evidencias -> 'aulas' ->> 0) is null
    then null
    else p_unidade_id::text
      || '|' || p_pessoa_chave
      || '|md:' || coalesce(p_emusys_matricula_disciplina_id::text, '-')
      || '|prof:' || p_emusys_professor_id::text
      || '|aula:' || (p_evidencias -> 'aulas' ->> 0)
  end
$fn$;

comment on function public.fn_chave_natural_periodo_professor_v1(uuid, text, bigint, bigint, jsonb) is
  'Chave natural estável de um período professor-aluno, ancorada no emusys_aula_id da primeira aula. Permite que as revisões sobrevivam à reconstrução. Ver docs/handoffs/2026-08-09-frente-professores-checkpoint-vivo.md';

-- ⚠️ O projeto tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE a `anon` em função nova
-- no schema public: `revoke from public` NÃO basta, precisa ser nominal.
revoke all on function public.fn_chave_natural_periodo_professor_v1(uuid, text, bigint, bigint, jsonb) from public, anon;
grant execute on function public.fn_chave_natural_periodo_professor_v1(uuid, text, bigint, bigint, jsonb) to authenticated, service_role;

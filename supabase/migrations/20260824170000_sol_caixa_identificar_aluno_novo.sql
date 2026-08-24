-- Identificação de aluno NOVO (passaporte/matrícula) pelo fluxo comercial.
-- Decisão do Alf, 2026-08-24.
--
-- O CASO: comprovante de "Passaporte promocional da aluna Giovanna Oliveira da Cunha
-- R$ 400". A Sol respondeu "⚠️ Não tenho certeza de qual aluno é — confere o nome",
-- porque TODAS as buscas de aluno do caixa olham só `alunos`. Só que o aluno de
-- passaporte é, por definição, quem AINDA NÃO matriculou: ele existe no funil como
-- lead e/ou experimental. A Giovanna estava em `lead_experimentais` (id 1349, nome
-- completo exato, desde 04/08) — o sistema sabia quem era, a Sol é que não olhava lá.
--
-- ⚠️ Passaporte NUNCA dependeu de aluno cadastrado para lançar (medido: 7 dos 12
-- passaportes dos últimos 30 dias têm nome que não existe em `alunos`, todos lançados
-- normalmente). Esta função NÃO cria trava nova: ela só devolve a identificação que
-- faltava, para o card parar de duvidar de aluno que o sistema conhece.
--
-- ORDEM DE BUSCA (a que espelha o fluxo real do aluno):
--   1. `alunos`            → já matriculado (2º curso, renovação)
--   2. `lead_experimentais`→ fez/agendou experimental (caminho típico do passaporte)
--   3. `leads`             → entrou no funil, ainda sem experimental
-- Devolve a origem para o preview ser honesto sobre o que sabe.

create or replace function public.sol_caixa_identificar_aluno_novo_v1(
  p_unidade_id uuid,
  p_nome text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_in text := unaccent(lower(btrim(coalesce(p_nome, ''))));
  v_r record;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif length(v_in) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'nome_curto');
  end if;

  -- 1) aluno já matriculado
  select a.id, a.nome, a.responsavel_nome,
         word_similarity(v_in, unaccent(lower(a.nome_normalizado)))::numeric as sim
    into v_r
  from public.alunos a
  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike 'ativo%' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc
  limit 1;
  if v_r.id is not null and coalesce(v_r.sim, 0) >= 0.62 then
    return jsonb_build_object('ok', true, 'origem', 'aluno_matriculado',
      'aluno_id', v_r.id, 'nome', v_r.nome,
      'responsavel_nome', nullif(btrim(coalesce(v_r.responsavel_nome, '')), ''),
      'confianca', round(v_r.sim, 2),
      'rotulo', 'aluno matriculado');
  end if;

  -- 2) experimental (caminho tipico de quem compra passaporte)
  select le.id, le.nome_aluno as nome, le.status, le.data_experimental,
         word_similarity(v_in, unaccent(lower(le.nome_aluno)))::numeric as sim
    into v_r
  from public.lead_experimentais le
  where le.unidade_id = p_unidade_id
    and le.nome_aluno is not null
  order by word_similarity(v_in, unaccent(lower(le.nome_aluno))) desc
  limit 1;
  if v_r.id is not null and coalesce(v_r.sim, 0) >= 0.62 then
    return jsonb_build_object('ok', true, 'origem', 'experimental',
      'lead_experimental_id', v_r.id, 'nome', v_r.nome,
      'status_experimental', v_r.status, 'data_experimental', v_r.data_experimental,
      'confianca', round(v_r.sim, 2),
      'rotulo', 'aluno novo (fez experimental)');
  end if;

  -- 3) lead no funil
  select l.id, l.nome, l.status,
         word_similarity(v_in, unaccent(lower(l.nome)))::numeric as sim
    into v_r
  from public.leads l
  where l.unidade_id = p_unidade_id
    and l.nome is not null
  order by word_similarity(v_in, unaccent(lower(l.nome))) desc
  limit 1;
  if v_r.id is not null and coalesce(v_r.sim, 0) >= 0.72 then
    return jsonb_build_object('ok', true, 'origem', 'lead',
      'lead_id', v_r.id, 'nome', v_r.nome, 'status_lead', v_r.status,
      'confianca', round(v_r.sim, 2),
      'rotulo', 'aluno novo (lead do funil)');
  end if;

  return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado_em_nenhuma_fonte');
end;
$function$;

revoke all on function public.sol_caixa_identificar_aluno_novo_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.sol_caixa_identificar_aluno_novo_v1(uuid, text) to service_role, sol_acesso_restrito;

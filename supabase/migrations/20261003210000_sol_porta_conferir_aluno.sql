-- Porta da Sol: o LADO DO LA REPORT de um aluno, para comparar com o Emusys (03/10/2026).
--
-- Por quê: todo mês a equipe fica confusa sobre quem entrou ou não no relatório
-- (03/10: o Jhon refez setembro à mão). O Emusys é a fonte da verdade; a Sol
-- passa a conferir, aluno a aluno, o que o Emusys diz contra o que o LA Report
-- tem — e, se divergir, avisar e mandar falar com o Hugo.
--
-- Divisão de trabalho (não reimplementar em outro lugar):
--   * ESTA função devolve só o lado do LA Report: matrículas do aluno na unidade
--     (com o id do Emusys que as liga) e as movimentações vigentes de 12 meses.
--   * O conector `sol-portas-mcp.mjs` chama o Emusys (GET /matriculas?aluno_id=)
--     com o token da unidade, que nunca sai do servidor.
--   * A COMPARAÇÃO é código, em `sol-conferir-emusys.mjs` (travado por teste) —
--     nunca o modelo fazendo conta.
--
-- Escopo: o mesmo de todas as portas (sol_resolver_escopo_v1). Só a unidade de
-- quem pergunta; a diretoria escolhe a unidade.
-- Custo: sob demanda, uma busca por nome numa unidade (~1.200 linhas) + as
-- movimentações desses alunos. Desprezível.

create or replace function public.sol_porta_conferir_aluno_v1(
  p_solicitante_telefone text,
  p_aluno text,
  p_unidade text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e jsonb;
  v_u uuid;
  v_codigo text;
  v_busca text := unaccent(lower(trim(coalesce(p_aluno, ''))));
  v_alunos jsonb;
  v_pessoas int;
  v_ids int[];
begin
  e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not (e->>'ok')::bool then return e; end if;
  v_u := nullif(e->>'unidade_id','')::uuid;
  if v_u is null then
    return jsonb_build_object('ok', false, 'motivo', 'escolha_a_unidade',
      'recado', 'Me diga a unidade do aluno: Campo Grande, Barra ou Recreio.');
  end if;
  if length(v_busca) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'nome_curto',
      'recado', 'Me diga o nome do aluno (pelo menos 3 letras).');
  end if;
  select codigo into v_codigo from unidades where id = v_u;

  -- Pessoa = (unidade, emusys_student_id). Dois cursos = duas linhas da mesma pessoa.
  select count(distinct coalesce(a.emusys_student_id::text, 'local:' || a.id)),
         array_agg(a.id)
    into v_pessoas, v_ids
    from alunos a
   where a.unidade_id = v_u
     and unaccent(lower(a.nome)) like '%' || v_busca || '%';

  if coalesce(v_pessoas, 0) = 0 then
    return jsonb_build_object('ok', true, 'escopo', e, 'unidade_codigo', v_codigo,
      'encontrado', false, 'recado', 'Não achei esse aluno no LA Report desta unidade.');
  end if;
  if v_pessoas > 3 then
    return jsonb_build_object('ok', true, 'escopo', e, 'unidade_codigo', v_codigo,
      'encontrado', false, 'ambiguo', true,
      'candidatos', (select jsonb_agg(x.nome) from (select distinct a.nome from alunos a
                       where a.id = any(v_ids) order by a.nome limit 8) x),
      'recado', 'Achei mais de uma pessoa com esse nome. Peça o nome completo.');
  end if;

  select jsonb_agg(jsonb_build_object(
           'aluno_id', a.id, 'nome', a.nome, 'curso', c.nome, 'status', a.status,
           'tipo_matricula_id', a.tipo_matricula_id,
           'bolsista', a.tipo_matricula_id in (3,4),
           'banda', coalesce(c.is_projeto_banda, false) or a.tipo_matricula_id = 5,
           'emusys_aluno_id', a.emusys_student_id,
           'emusys_matricula_id', a.emusys_matricula_id,
           'data_matricula', a.data_matricula, 'data_saida', a.data_saida,
           'valor_parcela', a.valor_parcela,
           'movimentacoes', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', mv.id, 'tipo', mv.tipo, 'data', mv.data,
                      'curso', (select cc.nome from cursos cc where cc.id = mv.curso_id),
                      'conta_no_mes', to_char(coalesce(mv.competencia_referencia, date_trunc('month', mv.data)::date), 'YYYY-MM'),
                      'primeira_aula_novo_contrato', mv.renovacao_primeira_aula_novo_ciclo,
                      'status', mv.renovacao_status,
                      'entra_no_total', movimentacao_conta_nos_kpis_v1(mv.curso_id, a.tipo_matricula_id))
                    order by mv.data desc), '[]'::jsonb)
               from movimentacoes_admin_vigentes mv
              where mv.aluno_id = a.id
                and mv.tipo in ('renovacao','nao_renovacao','evasao','trancamento','aviso_previo')
                and mv.data >= (now() at time zone 'America/Sao_Paulo')::date - 365))
         order by a.nome, c.nome)
    into v_alunos
    from alunos a
    left join cursos c on c.id = a.curso_id
   where a.id = any(v_ids);

  return jsonb_build_object('ok', true, 'escopo', e, 'unidade_codigo', v_codigo,
    'encontrado', true, 'pessoas', v_pessoas, 'matriculas', v_alunos);
end;
$function$;

comment on function public.sol_porta_conferir_aluno_v1(text, text, text) is
  'Porta da Sol: o lado do LA Report de um aluno (matrículas com o id do Emusys + movimentações vigentes de 12 meses) para o conector comparar com o Emusys em tempo real. A comparação é código (sol-conferir-emusys.mjs), não o modelo. Só leitura.';

revoke all on function public.sol_porta_conferir_aluno_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.sol_porta_conferir_aluno_v1(text, text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

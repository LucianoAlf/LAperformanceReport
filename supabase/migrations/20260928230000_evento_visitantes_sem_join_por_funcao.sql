-- evento_visitantes_v1 estourava o teto de 8s na aba Alunos do recital (HTTP 500, 28/09/2026).
--
-- Medido: 5,7 s com ZERO visitantes, contra ~1 ms das mesmas consultas soltas. Dentro da
-- funcao o plano e generico (a unidade e parametro), e o casamento com a view de elegiveis era
-- por `el.pessoa_chave = fn_pessoa_chave_aluno(a.id)` — uma chamada de funcao por par
-- (participacao x pessoa da rede). A tela chama a RPC em 3-4 lugares ao mesmo tempo (Alunos,
-- Grade, Revisao, seletor), e a concorrencia passava do teto.
--
-- Agora: primeiro o conjunto PEQUENO (visitantes do evento, com a chave pela view
-- `vw_aluno_pessoa_chave`, sem funcao), saida imediata quando esta vazio — o caso de quase
-- todo evento —, e so entao a view de elegiveis, filtrada pelas unidades de origem.
-- Mesmo retorno, mesmo contrato.

create or replace function public.evento_visitantes_v1(p_evento_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_unidade    uuid;
  v_pessoas    jsonb;
  v_nomes      jsonb;
  v_vis        jsonb;
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;
  select e.unidade_id into v_unidade from public.evento e where e.id = p_evento_id;

  -- Nome de TODA matricula de outra unidade que o evento referencia (participacao e grade):
  -- a grade e o check-in leem o nome pelo embed `alunos(nome)`, que a RLS esconde.
  select coalesce(jsonb_object_agg(a.id::text, jsonb_build_object(
           'nome', a.nome, 'data_nascimento', a.data_nascimento, 'unidade_nome', u.nome)), '{}'::jsonb)
    into v_nomes
    from public.alunos a
    join public.unidades u on u.id = a.unidade_id
   where a.unidade_id <> v_unidade
     and a.id in (
       select ep.aluno_id from public.evento_participacao ep where ep.evento_id = p_evento_id
       union
       select ap.aluno_id from public.evento_apresentacao ap where ap.evento_id = p_evento_id
     );

  if v_nomes = '{}'::jsonb then
    return jsonb_build_object('pessoas', '[]'::jsonb, 'nomes', '{}'::jsonb);
  end if;

  -- Os visitantes: chave do EVENTO (a que casa com participacao e grade) + unidade e chave
  -- de origem (as que casam com a view de elegiveis).
  select jsonb_agg(jsonb_build_object(
           'chave_evento', ep.pessoa_chave,
           'unidade_id', a.unidade_id,
           'pessoa_chave', pc.pessoa_chave,
           'unidade_nome', u.nome))
    into v_vis
    from public.evento_participacao ep
    join public.alunos a on a.id = ep.aluno_id
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
    join public.unidades u on u.id = a.unidade_id
   where ep.evento_id = p_evento_id
     and a.unidade_id <> v_unidade;

  select coalesce(jsonb_agg(
           to_jsonb(el) || jsonb_build_object(
             'pessoa_chave', vis->>'chave_evento',
             'unidade_origem_nome', vis->>'unidade_nome')
           order by el.nome), '[]'::jsonb)
    into v_pessoas
    from jsonb_array_elements(coalesce(v_vis, '[]'::jsonb)) vis
    join public.vw_evento_aluno_elegivel_v1 el
      on el.unidade_id = (vis->>'unidade_id')::uuid
     and el.pessoa_chave = vis->>'pessoa_chave';

  return jsonb_build_object('pessoas', v_pessoas, 'nomes', v_nomes);
end;
$function$;

-- identidade_por_telefone_v1 — "quem e este telefone?": colaborador, aluno, ex-aluno ou desconhecido.
--
-- POR QUE FUNCAO NOVA E NAO UMA COLUNA NO governanca.quem_eh: 35 funcoes chamam quem_eh e tratam
-- "veio uma linha" como "e da equipe". Se ele passasse a devolver aluno, todo aluno viraria
-- autorizado nelas; e acrescentar coluna muda o RETURNS TABLE (DROP+CREATE reabre EXECUTE a anon).
-- Esta funcao usa o quem_eh como 1o passo e NAO altera nada dele. "colaborador" aqui tem a mesma
-- regua da autorizacao (texto exato com 55+DDD+numero, so completando o 55 quando faltar).
--
-- POR QUE NAO CHAMA public.resolver_aluno_caixa_por_telefone_v1: ele normaliza o telefone linha a
-- linha em tempo de leitura e custa ~715 ms por chamada (medido, numero sem match). Aqui a busca
-- le as colunas geradas *_key (alunos.telefone_key/whatsapp_key/responsavel_telefone_key e
-- aluno_contatos.telefone_key) com as MESMAS regras do resolver: matricula viva manda sobre
-- encerrada, pessoa = (unidade_id, pessoa_chave), 2+ pessoas = ambiguo (recusa, nunca chuta).
-- Diferenca deliberada: tambem le aluno_contatos (20 numeros de alunos vivos existem so la).
--
-- Colaborador vence aluno: 7 dos 23 colaboradores tambem sao contato de algum aluno.
-- Devolve so identidade (sem parcela/presenca). STABLE e sem escrita: o PostgREST roda funcao
-- STABLE em transacao somente leitura, entao log fica por conta de quem chama.
--
-- CUSTO: sem cron e sem gatilho — so roda quando um consumidor chama. ~2 ms por chamada (medido:
-- 1,91 ms sem match, 1,97 ms com match; 20 chamadas cada). Ainda sem consumidor.
-- ROLLBACK: drop function public.identidade_por_telefone_v1(text, uuid);

create or replace function public.identidade_por_telefone_v1(p_telefone text, p_unidade_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, governanca, pg_temp
as $fn$
declare
  v_dig text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_key text;
  v_cracha record;
  v_qtd int;
  v_id bigint;
  v_nome text;
  v_unidade uuid;
  v_vivo boolean;
  v_via int;
begin
  if length(v_dig) < 8 then
    return jsonb_build_object('tipo', 'desconhecido', 'motivo', 'telefone_invalido');
  end if;
  if length(v_dig) in (10, 11) then
    v_dig := '55' || v_dig;
  end if;

  select q.nome, q.departamento, q.nivel, q.unidade_id into v_cracha
    from governanca.quem_eh(v_dig) q;
  if found then
    return jsonb_build_object('tipo', 'colaborador', 'nome', v_cracha.nome,
      'departamento', v_cracha.departamento, 'nivel', v_cracha.nivel,
      'unidade_id', v_cracha.unidade_id);
  end if;

  v_key := public.fn_normalizar_telefone_br_key(v_dig);
  if v_key is null then
    return jsonb_build_object('tipo', 'desconhecido', 'motivo', 'telefone_invalido');
  end if;

  with cand as (
    select a.id, a.nome, a.unidade_id, pc.pessoa_chave,
           coalesce(a.is_segundo_curso, false) as seg,
           (a.status in ('ativo', 'aviso_previo', 'trancado')) as vivo,
           case when a.telefone_key = v_key or a.whatsapp_key = v_key then 1
                when a.responsavel_telefone_key = v_key then 2
                else 3 end as via
    from public.alunos a
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
    where a.telefone_key = v_key or a.whatsapp_key = v_key or a.responsavel_telefone_key = v_key
    union all
    select a.id, a.nome, a.unidade_id, pc.pessoa_chave,
           coalesce(a.is_segundo_curso, false),
           (a.status in ('ativo', 'aviso_previo', 'trancado')),
           3
    from public.aluno_contatos ac
    join public.alunos a on a.id = ac.aluno_id
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
    where ac.telefone_key = v_key
  ),
  vivos as (
    select * from cand where vivo or not exists (select 1 from cand where vivo)
  ),
  escopo as (
    select * from vivos v
    where p_unidade_id is null
       or v.unidade_id = p_unidade_id
       or not exists (select 1 from vivos v2 where v2.unidade_id = p_unidade_id)
  ),
  eleito as (select * from escopo order by seg, id limit 1)
  select (select count(distinct unidade_id::text || '|' || pessoa_chave) from escopo),
         e.id, e.nome, e.unidade_id, e.vivo,
         (select min(via) from escopo)
    into v_qtd, v_id, v_nome, v_unidade, v_vivo, v_via
  from (select 1) x
  left join eleito e on true;

  if coalesce(v_qtd, 0) = 0 then
    return jsonb_build_object('tipo', 'desconhecido');
  end if;
  if v_qtd > 1 then
    return jsonb_build_object('tipo', case when v_vivo then 'aluno' else 'ex_aluno' end,
      'ambiguo', true, 'qtd_pessoas', v_qtd);
  end if;
  return jsonb_build_object('tipo', case when v_vivo then 'aluno' else 'ex_aluno' end,
    'ambiguo', false, 'aluno_id', v_id, 'nome', v_nome, 'unidade_id', v_unidade,
    'via', case v_via when 1 then 'proprio' when 2 then 'responsavel' else 'contato' end);
end;
$fn$;

comment on function public.identidade_por_telefone_v1(text, uuid) is
  'Quem e este telefone? Devolve jsonb {tipo: colaborador|aluno|ex_aluno|desconhecido, ...}. Colaborador = governanca.quem_eh (colaborador vence aluno). Aluno = telefone/whatsapp/responsavel/aluno_contatos normalizados; matricula viva manda sobre encerrada; 2+ pessoas = ambiguo=true sem escolher. Desconhecido inclui lead. So identidade, sem dado do aluno. Camada de IDENTIDADE, nao de autorizacao.';

revoke all on function public.identidade_por_telefone_v1(text, uuid) from public, anon, authenticated;
grant execute on function public.identidade_por_telefone_v1(text, uuid) to service_role;

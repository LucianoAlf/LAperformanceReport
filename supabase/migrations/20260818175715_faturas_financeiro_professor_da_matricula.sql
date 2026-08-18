-- Filtro de professor na pagina de Faturas. Aprovado pelo Alf em 2026-08-18.
--
-- Adiciona 'professor_id'/'professor_nome' ao objeto `aluno` dos items da leitura
-- canonica de faturas (get_faturas_alunos_financeiro_v1_canonica_20260817).
--
-- POR QUE NA RPC e nao no front: o contrato de testes da pagina
-- (tests/faturasAlunosFinanceirasFrontend.test.mjs) proibe a pagina de consultar
-- `alunos` direto — a visao financeira le SOMENTE a RPC canonica. O professor entra
-- pelo MESMO join que ja resolve o aluno (local_por_matricula), entao a relacao e a
-- da LINHA DE MATRICULA: aluno com 2 cursos tem 2 linhas com professores proprios e
-- cada fatura recebe o professor do SEU curso (validado com Carlos Eduardo Garcia:
-- matricula 1205 -> prof 23 Marquinhos, matricula 1316 -> prof 3 Daiana; e no payload
-- real com Amanda Aiko: fatura de Bateria -> Vicente, fatura de Canto -> Lohana).
-- Trancado mantem professor_atual_id e segue listado sob o professor dele.
-- Fatura sem matricula (ingresso/evento/rateio) fica professor NULL — validado em
-- ago/2026 consolidado: 49 sem professor, TODAS com aluno nulo (44 ingressos,
-- 6 avulsas, 1 lojinha, 2 passaportes orfaos); nenhuma mensalidade orfa.
--
-- Mudanca ADITIVA (chaves novas no jsonb) — nenhum consumidor existente quebra.
-- CREATE OR REPLACE com mesma assinatura: ACL preservada, sem overload orfao.
-- Tecnica: pg_get_functiondef + replace() com guardas (padrao do projeto para nao
-- transcrever funcao de 25k chars a mao).

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_canonica_20260817';

  -- idempotencia: ja aplicado?
  if position('''professor_id'', i.professor_id' in v_def) > 0 then
    raise notice 'professor ja presente na funcao — nada a fazer';
    return;
  end if;

  -- guardas: cada ancora precisa existir exatamente como esperado
  if position('min(a.nome) as aluno_nome,' in v_def) = 0 then
    raise exception 'ancora local_por_matricula (aluno_nome) nao encontrada';
  end if;
  if position('left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id' in v_def) = 0 then
    raise exception 'ancora do join formas_pagamento nao encontrada';
  end if;
  if position('min(aluno_nome) filter (where aluno_nome is not null) as aluno_nome,' in v_def) = 0 then
    raise exception 'ancora local_por_aluno nao encontrada';
  end if;
  if position('end as curso_nome,' in v_def) = 0 then
    raise exception 'ancora linhas_snapshot (curso_nome) nao encontrada';
  end if;
  if (length(v_def) - length(replace(v_def, '''vinculo_local_fonte'', i.vinculo_local_fonte' || E'\n          ),', '')))
     / length('''vinculo_local_fonte'', i.vinculo_local_fonte' || E'\n          ),') <> 2 then
    raise exception 'esperava exatamente 2 builds do objeto aluno';
  end if;

  -- 1) local_por_matricula: professor da MESMA linha do min(aluno_id)
  --    (array_agg ordenado por e.aluno_id — min() independente poderia parear id de
  --    um professor com nome de outro quando o grupo tiver 2 linhas)
  v_new := replace(v_def,
    'min(a.nome) as aluno_nome,',
    'min(a.nome) as aluno_nome,' || E'\n'
    || '      (array_agg(a.professor_atual_id order by e.aluno_id nulls last))[1] as professor_id,' || E'\n'
    || '      (array_agg(prof.nome order by e.aluno_id nulls last))[1] as professor_nome,');

  -- 2) join com professores
  v_new := replace(v_new,
    'left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id',
    'left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id' || E'\n'
    || '    left join public.professores prof on prof.id = a.professor_atual_id');

  -- 3) local_por_aluno (fallback aluno_unico_canonico, so usado quando aluno_count = 1)
  v_new := replace(v_new,
    'min(aluno_nome) filter (where aluno_nome is not null) as aluno_nome,',
    'min(aluno_nome) filter (where aluno_nome is not null) as aluno_nome,' || E'\n'
    || '      (array_agg(professor_id order by aluno_id nulls last))[1] as professor_id,' || E'\n'
    || '      (array_agg(professor_nome order by aluno_id nulls last))[1] as professor_nome,');

  -- 4) linhas_snapshot: mesmo case-when dos campos irmaos (curso_nome etc.)
  v_new := replace(v_new,
    'end as curso_nome,',
    'end as curso_nome,' || E'\n'
    || '      case' || E'\n'
    || '        when lp.aluno_id is not null then lp.professor_id' || E'\n'
    || '        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.professor_id' || E'\n'
    || '        else null' || E'\n'
    || '      end as professor_id,' || E'\n'
    || '      case' || E'\n'
    || '        when lp.aluno_id is not null then lp.professor_nome' || E'\n'
    || '        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.professor_nome' || E'\n'
    || '        else null' || E'\n'
    || '      end as professor_nome,');

  -- 5) os DOIS builds do objeto aluno (items e reconciliation.items)
  v_new := replace(v_new,
    '''vinculo_local_fonte'', i.vinculo_local_fonte' || E'\n          ),',
    '''vinculo_local_fonte'', i.vinculo_local_fonte,' || E'\n'
    || '            ''professor_id'', i.professor_id,' || E'\n'
    || '            ''professor_nome'', i.professor_nome' || E'\n          ),');

  if v_new = v_def then
    raise exception 'replace nao alterou nada — abortando';
  end if;

  execute v_new;
end $mig$;

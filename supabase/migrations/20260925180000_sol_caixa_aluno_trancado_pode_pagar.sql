-- A Sol trocou o aluno de um comprovante porque o aluno certo estava TRANCADO (25/09/2026)
--
-- FINANCEIRO do Recreio, 09:02: comprovante Pix de R$ 442,75 com a legenda
-- "Parcela do mês de Setembro do aluno Bernardo Neumann da Cunha". A Sol montou o
-- card para BERNARDO DA SILVA MENEZES (Bateria, responsável Pâmela), com a
-- Parcela 10/2026 de R$ 453,75 — e sustentou o erro por 15 minutos, mesmo depois
-- de a Fefê repetir o nome completo duas vezes e reenviar o comprovante.
--
-- 🔴 RAIZ (reproduzida chamando a RPC com o nome exato):
-- `sol_caixa_casar_parcela('...','Bernardo Neumann da Cunha', 442.75, '09/2026')`
-- devolvia Bernardo da Silva Menezes com confianca_nome 0,46. O nome exato NÃO
-- perdia na similaridade: ele nem entrava na disputa. O conjunto de candidatos era
--     and (a.status ilike 'ativo%' or a.status is null)
-- e o Bernardo Neumann está `trancado` desde 22/09 (webhook do Emusys, cirurgia do
-- responsável). Sobrava o outro Bernardo, que passa em `sol_nome_mesma_pessoa_v1`
-- (mesmo primeiro nome) com 0,46 — só 0,01 acima do corte de 0,45.
--
-- TRANCAR NÃO É PARAR DE PAGAR. Medido em 25/09, por status do cadastro:
--   trancado      19 alunos · 16 com fatura aberta até +40d · 14 pagaram em 60 dias
--   evadido      368 alunos · 86 com fatura aberta          · 57 pagaram em 60 dias
--   inativo      172 alunos · 19 com fatura aberta          · 21 pagaram em 60 dias
--   aviso_previo   1 aluno  ·  1                           ·  1
-- O Bernardo é o caso exato: a Parcela 09/2026 dele consta PAGA hoje, R$ 442,75,
-- pagador Bruno Aires da Cunha — o responsável e o nome no comprovante.
--
-- 🔴 A MESMA REGRA ESTAVA COPIADA EM 9 FUNÇÕES (12 filtros + 2 ordenações):
-- casar_parcela, responsavel_aluno, aluno_por_responsavel, identificar_por_pagador,
-- identificar_aluno_novo_v1, parcela_canonica_env_v1, resolver_multi_aluno_v1,
-- derivar_valores_multi_aluno_v1 e validar_multi_aluno_snapshot_v1. Consertar só a
-- que errou hoje deixaria o card mostrando uma pessoa e o lançamento/validação
-- recusando ou escolhendo outra — mesma família das duplicatas de renovação.
-- Hoje a pergunta "este aluno pode ser o dono de um pagamento?" tem UMA resposta:
--
--   sol_caixa_aluno_matriculado_v1(status)  — ativo/trancado/aviso_previo/nulo
--   sol_caixa_aluno_pode_pagar_v1(status, unidade, student_id)
--       matriculado  OU  (evadido/inativo COM cobrança viva: fatura aberta, ou
--       fatura paga nos últimos 90 dias)
--
-- ⚠️ Evadido/inativo entra por EVIDÊNCIA DE COBRANÇA, não por status: os 57
-- evadidos que pagaram em 60 dias eram invisíveis pelo mesmo motivo, mas abrir a
-- base inteira de ex-alunos (540) aumentaria homônimo sem nada a pagar.
-- ⚠️ A ORDENAÇÃO continua preferindo quem está matriculado (depois da
-- similaridade, nunca antes): nome exato sempre vence; em empate, matrícula viva.
-- ⚠️ `sol_nome_mesma_pessoa_v1` e o corte de ambiguidade NÃO mudam — ampliar o
-- conjunto pode, no máximo, transformar um acerto em "ambíguo" (a Sol pergunta),
-- nunca em escolha de outra pessoa.

create or replace function public.sol_caixa_aluno_matriculado_v1(p_status text)
returns boolean
language sql immutable parallel safe
as $$
  select p_status is null
      or p_status ilike 'ativo%'
      or lower(p_status) in ('trancado', 'aviso_previo');
$$;

comment on function public.sol_caixa_aluno_matriculado_v1(text) is
  'Fonte unica do caixa da Sol: o aluno ainda tem matricula (ativo, trancado, aviso previo). '
  'Trancado CONTINUA pagando — ver migration 20260925180000 (caso Bernardo Neumann).';

create or replace function public.sol_caixa_aluno_pode_pagar_v1(
  p_status text, p_unidade_id uuid, p_emusys_student_id text
) returns boolean
language sql stable
-- ⚠️ SEM `set search_path`, de propósito, nas DUAS funções: o SET impede o
-- planner de embutir (inline) uma função SQL e cobra uma troca de contexto POR
-- LINHA. Medido no ensaio sobre os 1.182 alunos ativos: 17 ms por chamada antes,
-- 64 ms com SET, 39 ms com SET + COST alto. Seguro porque não são SECURITY DEFINER
-- e todo objeto do corpo é qualificado (public.*, e now() é pg_catalog).
as $$
  select case
    when public.sol_caixa_aluno_matriculado_v1(p_status) then true
    when p_emusys_student_id is null or p_emusys_student_id !~ '^\d+$' then false
    else exists (
      select 1 from public.emusys_faturas f
       where f.unidade_id = p_unidade_id
         and f.emusys_student_id = p_emusys_student_id::bigint
         and (f.status = 'aberta'
              or (f.status = 'paga' and f.data_pagamento
                    >= (now() at time zone 'America/Sao_Paulo')::date - 90))
    )
  end;
$$;

comment on function public.sol_caixa_aluno_pode_pagar_v1(text, uuid, text) is
  'Fonte unica do caixa da Sol: este aluno pode ser o dono de um pagamento? Matriculado, '
  'ou ex-aluno com cobranca viva (fatura aberta ou paga nos ultimos 90 dias). '
  'Substitui o filtro status=ativo que estava copiado em 9 funcoes (20260925180000).';

revoke all on function public.sol_caixa_aluno_matriculado_v1(text) from public, anon, authenticated;
revoke all on function public.sol_caixa_aluno_pode_pagar_v1(text, uuid, text) from public, anon, authenticated;
grant execute on function public.sol_caixa_aluno_matriculado_v1(text) to service_role, sol_acesso_restrito;
grant execute on function public.sol_caixa_aluno_pode_pagar_v1(text, uuid, text) to service_role, sol_acesso_restrito;

do $mig$
declare
  v_filtro text := $f$(a.status ilike 'ativo%' or a.status is null)$f$;
  v_filtro_novo text := $f$public.sol_caixa_aluno_pode_pagar_v1(a.status, a.unidade_id, a.emusys_student_id)$f$;
  v_ordem text := $o$(a.status ilike 'ativo%') desc$o$;
  v_ordem_nova text := $o$public.sol_caixa_aluno_matriculado_v1(a.status) desc$o$;
  -- quantas ocorrencias CADA funcao tem hoje; guarda de contagem, nunca "pelo menos 1"
  v_esperado jsonb := jsonb_build_object(
    'sol_caixa_aluno_por_responsavel',            jsonb_build_array(1, 0),
    'sol_caixa_casar_parcela',                    jsonb_build_array(2, 1),
    'sol_caixa_derivar_valores_multi_aluno_v1',   jsonb_build_array(1, 0),
    'sol_caixa_identificar_aluno_novo_v1',        jsonb_build_array(2, 0),
    'sol_caixa_identificar_por_pagador',          jsonb_build_array(2, 0),
    'sol_caixa_parcela_canonica_env_v1',          jsonb_build_array(1, 0),
    'sol_caixa_resolver_multi_aluno_v1',          jsonb_build_array(1, 0),
    'sol_caixa_responsavel_aluno',                jsonb_build_array(2, 1),
    'sol_caixa_validar_multi_aluno_snapshot_v1',  jsonb_build_array(1, 0));
  r record;
  v_src text; v_novo text; v_nf int; v_no int; v_total int := 0;
begin
  for r in select p.oid, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in (select jsonb_object_keys(v_esperado))
  loop
    v_src := pg_get_functiondef(r.oid);
    v_nf := (length(v_src) - length(replace(v_src, v_filtro, ''))) / length(v_filtro);
    v_no := (length(v_src) - length(replace(v_src, v_ordem, ''))) / length(v_ordem);
    if v_nf <> (v_esperado->r.proname->>0)::int or v_no <> (v_esperado->r.proname->>1)::int then
      raise exception 'ANCORA % : filtro % (esperado %), ordem % (esperado %)',
        r.proname, v_nf, v_esperado->r.proname->>0, v_no, v_esperado->r.proname->>1;
    end if;
    v_novo := replace(replace(v_src, v_filtro, v_filtro_novo), v_ordem, v_ordem_nova);
    execute v_novo;
    v_total := v_total + 1;
  end loop;
  if v_total <> 9 then raise exception 'ESPERAVA 9 FUNCOES, ACHOU %', v_total; end if;
end $mig$;

-- ---------------------------------------------------------------------------
-- AMBIGUIDADE É ENTRE PESSOAS, NÃO ENTRE LINHAS (achado no ensaio, 25/09).
--
-- Com o conjunto ampliado, o ensaio sobre os 1.182 alunos ativos deu 0 troca de
-- dono, mas 25 passaram a vir `ambiguo: true` — e o "rival" era, nos três
-- conferidos, A PRÓPRIA PESSOA numa matrícula antiga (mesmo emusys_student_id,
-- status evadido/inativo). `sol_caixa_casar_parcela` calcula o 2º colocado com
-- `a.id <> v_alu.id`, mas `alunos` é MATRÍCULA: quem faz 2 cursos já era marcado
-- ambíguo contra si mesmo antes desta migration. `sol_caixa_responsavel_aluno`
-- não tem o defeito (exclui pelo nome). Pessoa aqui = (unidade, emusys_student_id)
-- — a unidade já está no WHERE; o id colide entre unidades, nunca dentro de uma.
do $mig$
declare
  v_de text := $de$and a.nome_normalizado is not null and a.id <> v_alu.id$de$;
  v_para text := $para$and a.nome_normalizado is not null and a.emusys_student_id is distinct from v_alu.emusys_student_id$para$;
  v_src text;
begin
  v_src := pg_get_functiondef('public.sol_caixa_casar_parcela(uuid,text,numeric,text)'::regprocedure);
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_AMBIGUIDADE_CASAR_PARCELA: esperava 1 ocorrencia';
  end if;
  execute replace(v_src, v_de, v_para);
end $mig$;

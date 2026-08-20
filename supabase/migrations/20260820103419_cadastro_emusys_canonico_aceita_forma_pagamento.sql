-- `forma_pagamento_id` entra na lista branca do cadastro canonico do Emusys.
-- Decisao do Alf, 2026-08-20: "todos os alunos tem forma de pagamento".
--
-- POR QUE A FORMA NUNCA CHEGAVA NO CADASTRO — tres bugs empilhados:
--
--   1. `extrairFormaPagamentoEmusys` usava `??` entre `contrato_atual.forma_pagamento` e
--      `cobranca_automatica.forma_pagamento`. `??` so pula null/undefined — NAO pula string
--      vazia. E o campo do contrato vem "" em 484 de 484 contratos ativos de CG, entao a
--      expressao parava no vazio e nunca alcancava onde o Emusys guarda o dado.
--
--   2. ESTA funcao: a lista branca aceitava so telefone, email, responsavel_nome,
--      responsavel_telefone, foto_url e instagram. Qualquer chave fora disso faz a funcao
--      levantar PATCH_CADASTRO_EMUSYS_COM_CAMPO_NAO_PERMITIDO e rejeitar o patch INTEIRO —
--      nao so o campo novo. Como a chamada esta dentro de try/catch no sync, a excecao era
--      engolida e o run terminava com `erros: 0`, sem nenhum sinal.
--
--   3. `normalizarFormaPagamentoValor` nao tinha regra para credito: o Emusys manda a
--      BANDEIRA junto ("Cartao de Credito Mastercard", "Cartao de Credito Visa") e a
--      string nao casava com "Cartao de Credito" do nosso cadastro.
--
-- Efeito medido antes: 249 de 485 alunos ativos de Campo Grande (51%) sem forma de
-- pagamento, 119 no Recreio, 8 na Barra — realimentando a fila de reconciliacao financeira
-- todo mes, porque a fatura em aberto usa a "forma prevista" do cadastro.
-- Depois: Barra e Recreio com 100% dos pagantes cobertos; CG com 6 pagantes sem forma.
-- Fila financeira de Campo Grande: 40 -> 4.
--
-- ⚠️ `forma_pagamento_id` e INTEIRO, ao contrario dos 6 campos de texto ja suportados. Por
-- isso NAO entra no filtro `nullif(btrim(...), '') is not null` (que pressupoe texto) nem
-- no mesmo `case ... else a.campo end` de string. Recebe validacao propria: inteiro
-- positivo e existente em `formas_pagamento`.
--
-- ⚠️ `v_campos_aplicados || 'forma_pagamento_id'` SEM cast estoura com `malformed array
-- literal` — o parser le a string como ARRAY, nao como elemento. O `::text` abaixo e
-- obrigatorio (o erro so aparece em runtime e era engolido pelo try/catch do sync;
-- corrigido em 20260820103718, e aqui ja vai correto).
--
-- Guarda preservada: `matriculas_campos_fixados` continua vencendo — quem fixou a forma a
-- mao nao e sobrescrito pelo Emusys.

create or replace function public.aplicar_cadastro_emusys_canonico(
  p_unidade_id uuid,
  p_aluno_id integer,
  p_emusys_matricula_id text,
  p_patch jsonb
)
returns table(aluno_id integer, campos_aplicados text[])
language plpgsql
set search_path to 'public'
as $function$
declare
  v_aluno_id integer;
  v_campos_aplicados text[] := array[]::text[];
  v_forma_id integer;
begin
  if nullif(btrim(coalesce(p_emusys_matricula_id, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'MATRICULA_EMUSYS_OBRIGATORIA_PARA_PATCH_CADASTRO';
  end if;

  if coalesce(jsonb_typeof(p_patch), '') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_INVALIDO';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as chave(campo)
    where chave.campo not in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone',
      'foto_url',
      'instagram',
      'forma_pagamento_id'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_COM_CAMPO_NAO_PERMITIDO';
  end if;

  select a.id
    into v_aluno_id
  from public.alunos a
  where a.id = p_aluno_id
    and a.unidade_id = p_unidade_id
    and a.emusys_matricula_id = p_emusys_matricula_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'IDENTIDADE_MATRICULA_EMUSYS_DIVERGENTE';
  end if;

  -- campos de TEXTO (regra original, intocada)
  select coalesce(array_agg(chave.campo order by chave.campo), array[]::text[])
    into v_campos_aplicados
  from jsonb_object_keys(p_patch) as chave(campo)
  where chave.campo in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone',
      'foto_url',
      'instagram'
    )
    and nullif(btrim(p_patch ->> chave.campo), '') is not null
    and not exists (
      select 1
      from public.matriculas_campos_fixados f
      where f.aluno_id = v_aluno_id
        and f.campo = chave.campo
    );

  -- forma_pagamento_id: inteiro, exige existir em formas_pagamento
  if p_patch ? 'forma_pagamento_id'
     and not exists (
       select 1 from public.matriculas_campos_fixados f
       where f.aluno_id = v_aluno_id and f.campo = 'forma_pagamento_id'
     ) then
    begin
      v_forma_id := nullif(btrim(p_patch ->> 'forma_pagamento_id'), '')::integer;
    exception when others then
      v_forma_id := null;
    end;

    if v_forma_id is not null and v_forma_id > 0
       and exists (select 1 from public.formas_pagamento fp where fp.id = v_forma_id) then
      v_campos_aplicados := v_campos_aplicados || 'forma_pagamento_id'::text;
    else
      v_forma_id := null;
    end if;
  end if;

  if cardinality(v_campos_aplicados) = 0 then
    return query select v_aluno_id, v_campos_aplicados;
    return;
  end if;

  update public.alunos a
  set telefone = case when 'telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'telefone'), '') else a.telefone end,
      email = case when 'email' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'email'), '') else a.email end,
      responsavel_nome = case when 'responsavel_nome' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_nome'), '') else a.responsavel_nome end,
      responsavel_telefone = case when 'responsavel_telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_telefone'), '') else a.responsavel_telefone end,
      foto_url = case when 'foto_url' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'foto_url'), '') else a.foto_url end,
      instagram = case when 'instagram' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'instagram'), '') else a.instagram end,
      forma_pagamento_id = case when 'forma_pagamento_id' = any(v_campos_aplicados) then v_forma_id else a.forma_pagamento_id end,
      updated_at = now(),
      updated_by = 'sync-matriculas-emusys'
  where a.id = v_aluno_id;

  return query select v_aluno_id, v_campos_aplicados;
end;
$function$;

revoke all on function public.aplicar_cadastro_emusys_canonico(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.aplicar_cadastro_emusys_canonico(uuid, integer, text, jsonb) to authenticated, service_role;

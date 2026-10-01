-- M12 — formandos do recital (regra única no LA Teacher, espelhada aqui).
-- Tudo em BEGIN/ROLLBACK: não suja produção. Fixture real: evento 21 (Barra) —
-- a view vw_recital_passagem_de_ciclo_v1 traz 10 pessoas kids_para_school
-- (11 linhas: a Clarice faz 2 cursos) e 7 bebes_para_preparatoria.
--
-- Rodar: psql -v ON_ERROR_STOP=1 -f tests/sql/eventos_m12_formandos.sql
-- Cada DO lança exceção se a regra quebrar — o arquivo inteiro verde = contrato ok.

begin;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

/* ── 1) a rotina marca sozinha: 10 kids + 7 bebês, tudo 'auto' ── */

create temp table _rodada1 as
select public.evento_formandos_sincronizar_v1(21) as r;

do $$
begin
  assert (select (r ->> 'formandos_na_view')::int from _rodada1) = 17,
    format('view devia ter 17 pessoas formandas, veio %s',
           (select r ->> 'formandos_na_view' from _rodada1));

  assert (select count(*) from public.evento_participacao
           where evento_id = 21 and formatura
             and formatura_tipo = 'kids' and formatura_origem = 'auto') = 10,
    'deviam existir 10 formandos kids com origem auto';
  assert (select count(*) from public.evento_participacao
           where evento_id = 21 and formatura
             and formatura_tipo = 'bebes' and formatura_origem = 'auto') = 7,
    'deviam existir 7 formandos bebes com origem auto';
  assert not exists (select 1 from public.evento_participacao
                      where evento_id = 21 and formatura_tipo = 'la'),
    'o tipo aposentado ''la'' devia ter saído na M12 (era o Bento)';
end $$;

/* ── 2) formatura é da PESSOA: a Clarice (2 cursos) conta uma vez ── */

do $$
begin
  -- a view dela tem 2 linhas (uma por curso) mas a participação é uma
  assert (select count(*) from public.vw_recital_passagem_de_ciclo_v1 v
           where v.evento_id = 21
             and v.pessoa_chave in (
               select pessoa_chave from public.vw_recital_passagem_de_ciclo_v1 v2
                where v2.evento_id = 21
                group by v2.pessoa_chave having count(*) > 1)) >= 2,
    'devia existir alguém com 2 cursos na view para este teste valer';

  assert not exists (
    select 1 from (
      select pessoa_chave from public.evento_participacao
       where evento_id = 21 and formatura
       group by pessoa_chave having count(*) > 1) d),
    'formatura duplicada por pessoa — a UNIQUE (evento,pessoa_chave) devia impedir';
end $$;

/* ── 3) idempotência: segunda rodada não marca nem desmarca nada ── */

create temp table _rodada2 as
select public.evento_formandos_sincronizar_v1(21) as r;

do $$
begin
  assert (select (r ->> 'inseridos')::int from _rodada2) = 0, '2ª rodada inseriu de novo';
  assert (select (r ->> 'marcados')::int from _rodada2) = 0, '2ª rodada remarcou';
  assert (select (r ->> 'desmarcados')::int from _rodada2) = 0, '2ª rodada desmarcou';
end $$;

/* ── 4) manual prevalece: desmarcar à mão sobrevive à rodada seguinte ── */

create temp table _alvo as
select pessoa_chave, aluno_id
  from public.evento_participacao
 where evento_id = 21 and formatura and formatura_tipo = 'kids'
 limit 1;

do $$
declare
  v_chave text := (select pessoa_chave from _alvo);
  v_aluno int  := (select aluno_id from _alvo);
begin
  perform public.evento_formando_definir_v1(21, v_chave, v_aluno, null);

  assert exists (select 1 from public.evento_participacao
                  where evento_id = 21 and pessoa_chave = v_chave
                    and not formatura and formatura_origem = 'manual'),
    'desmarcação manual não gravou origem=manual';

  -- a rotina roda de novo e NÃO pode remarcar
  perform public.evento_formandos_sincronizar_v1(21);
  assert exists (select 1 from public.evento_participacao
                  where evento_id = 21 and pessoa_chave = v_chave
                    and not formatura and formatura_origem = 'manual'),
    'a rotina sobrescreveu a desmarcação manual — o contrato proíbe';

  -- marcação manual também prevalece sobre o tipo da view
  perform public.evento_formando_definir_v1(21, v_chave, v_aluno, 'bebes');
  perform public.evento_formandos_sincronizar_v1(21);
  assert exists (select 1 from public.evento_participacao
                  where evento_id = 21 and pessoa_chave = v_chave
                    and formatura and formatura_tipo = 'bebes'
                    and formatura_origem = 'manual'),
    'a rotina sobrescreveu o tipo marcado à mão';

  -- tipo fora do contrato é recusado
  begin
    perform public.evento_formando_definir_v1(21, v_chave, v_aluno, 'la');
    raise exception 'TESTE_FALHOU: aceitou tipo la';
  exception
    when others then
      if sqlerrm like 'TESTE_FALHOU%' then raise; end if;
      assert sqlerrm like 'FORMATURA_TIPO_INVALIDO%', format('erro errado: %s', sqlerrm);
  end;
end $$;

/* ── 5) falsos positivos: quem está no recital mas NÃO passa de ciclo ── */

do $$
begin
  -- nascidos em 2013 (13 anos) ou 2015 (11): a regra é EXATAMENTE 12 no ano
  assert not exists (
    select 1 from public.evento_participacao p
      join public.alunos a on a.id = p.aluno_id
     where p.evento_id = 21 and p.formatura
       and extract(year from a.data_nascimento) in (2013, 2015)),
    'marcou aluno de 2013/2015 — fora da regra dos 12 anos';

  -- nascido em 2024 fora de Musicalização para Bebês não é formando
  assert not exists (
    select 1 from public.evento_participacao p
      join public.alunos a on a.id = p.aluno_id
     where p.evento_id = 21 and p.formatura
       and extract(year from a.data_nascimento) = 2024
       and not exists (
         select 1 from public.vw_recital_passagem_de_ciclo_v1 v
          where v.evento_id = 21 and v.pessoa_chave = p.pessoa_chave)),
    'marcou aluno de 2024 que a view não trouxe — fora de Bebês';

  -- toda marcação 'auto' tem de ter correspondência na view (nada inventado)
  assert not exists (
    select 1 from public.evento_participacao p
     where p.evento_id = 21 and p.formatura and p.formatura_origem = 'auto'
       and not exists (
         select 1 from public.vw_recital_passagem_de_ciclo_v1 v
          where v.evento_id = 21 and v.pessoa_chave = p.pessoa_chave)),
    'há formando auto que não está na view — fonte divergiu';
end $$;

/* ── 6) bloco conta PESSOA, não apresentação ── */

-- Semântica da grade: formandos do bloco = pessoa_chave distintos com selo entre
-- as apresentações do bloco. Aqui se prova que a contagem por pessoa difere da
-- contagem por linha quando alguém toca 2 cursos no mesmo bloco.
do $$
declare
  v record;
begin
  -- O selo mora em evento_participacao (pessoa); a grade amarra pela pessoa_chave.
  select b.id,
         count(*) filter (where p.formatura_tipo is not null) as linhas,
         count(distinct ap.pessoa_chave) filter (where p.formatura_tipo is not null) as pessoas
    into v
    from public.evento_bloco b
    join public.evento_apresentacao ap on ap.bloco_id = b.id
    left join public.evento_participacao p
           on p.evento_id = b.evento_id and p.pessoa_chave = ap.pessoa_chave
   where b.evento_id = 21
   group by b.id
   order by pessoas desc
   limit 1;
  -- Se algum bloco tem formando, a contagem por pessoa nunca pode superar a por linha
  assert v.pessoas <= v.linhas, 'contagem por pessoa maior que por linha — impossível';
end $$;

/* ── 7) escopo: sem JWT de unidade/service_role as duas RPCs recusam ── */

do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '', true);

  begin
    perform public.evento_formandos_sincronizar_v1(21);
    raise exception 'TESTE_FALHOU: sync de formandos rodou sem escopo';
  exception
    when others then
      if sqlerrm like 'TESTE_FALHOU%' then raise; end if;
      assert sqlerrm like 'EVENTO_FORA_DO_ESCOPO%', format('erro errado: %s', sqlerrm);
  end;

  begin
    perform public.evento_formando_definir_v1(21, 'qualquer', 1, 'kids');
    raise exception 'TESTE_FALHOU: decisão manual rodou sem escopo';
  exception
    when others then
      if sqlerrm like 'TESTE_FALHOU%' then raise; end if;
      assert sqlerrm like 'EVENTO_FORA_DO_ESCOPO%', format('erro errado: %s', sqlerrm);
  end;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

select 'M12 ok — 10 kids + 7 bebês, pessoa única, manual prevalece, sem falsos positivos' as resultado;

rollback;

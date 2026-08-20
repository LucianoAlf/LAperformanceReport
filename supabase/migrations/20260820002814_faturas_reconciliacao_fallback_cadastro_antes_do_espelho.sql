-- Matrícula criada DEPOIS do sync diário não pode virar pendência de reconciliação.
-- Decisão do Alf, 2026-08-19.
--
-- O CASO: Maria Fernanda Fontenelle Gavazzi (Recreio) matriculou 19/08 às 21:26 e pagou a
-- taxa de R$ 400 no mesmo dia. O sync de FATURAS roda de 15 em 15 min e trouxe a fatura
-- às 23:48; o sync de MATRÍCULAS roda 1x/dia (02:20) e ainda não tinha materializado a
-- matrícula 1553 em `emusys_matriculas_estado_atual`. Como `local_por_matricula` lia só o
-- espelho canônico, a fatura ficou "sem vínculo exato" e caiu na fila — mesmo com a aluna
-- cadastrada, ativa, com emusys_matricula_id e emusys_student_id EXATAMENTE iguais aos da
-- fatura.
--
-- Não era divergência: era defasagem entre dois syncs de frequências diferentes. E não é
-- eventual — TODA matrícula feita depois das 02h com taxa paga no mesmo dia caía nisso.
--
-- A CORREÇÃO: a fonte de `local_por_matricula` passa a ser o espelho canônico UNIÃO o
-- cadastro `alunos`, este último SÓ para o par (unidade, matrícula, aluno) que ainda não
-- existe no espelho. O critério de identidade não afrouxa: continua exigindo
-- unidade_id + emusys_matricula_id + emusys_student_id exatos, os três. Nome e telefone
-- seguem sem participar. O que muda é apenas DE ONDE a linha exata pode vir.
--
-- ⚠️ O `emusys_student_id` se repete entre unidades (é id por unidade — Maria Fernanda no
-- Recreio e Guilherme Castro Figueiredo em CG são ambos 2263). Por isso a unidade faz
-- parte da chave nos dois ramos; sem ela o fallback casaria pessoas diferentes.
--
-- ⚠️ Os dois ramos do UNION precisam de ::text em emusys_matricula_id/emusys_aluno_id: na
-- view são bigint e em `alunos` são text. A 1ª versão desta migration não tinha o cast no
-- ramo do espelho, o UNION foi recusado e a leitura de faturas inteira falhou (página fora
-- do ar). Corrigido em 20260820002838; o texto abaixo já é a versão com o cast.
--
-- Validado: Recreio ago/2026 — pendências 1 -> 0, e os totais permanecem idênticos aos da
-- tela antes da mudança (362 faturas, R$ 150.450,32 / pagas R$ 146.268,13 / em aberto
-- R$ 4.182,19 / em atraso R$ 983,68). Barra segue 0 pendências. Campo Grande mantém as
-- suas 40, todas de outro tipo (38 forma_pagamento_ausente, 2 source_missing), sem relação
-- com vínculo de identidade.

do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_canonica_20260817';

  if position('fallback_cadastro_pre_espelho' in v_def) > 0 then
    raise notice 'fallback ja aplicado — nada a fazer';
    return;
  end if;

  v_antigo := '    from public.vw_aluno_estado_operacional_canonico e' || E'\n'
           || '    join unidades_autorizadas ua on ua.id = e.unidade_id';

  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora do from de local_por_matricula nao encontrada';
  end if;

  v_novo :=
       '    from (' || E'\n'
    || '      -- espelho canonico (fonte primaria)' || E'\n'
    || '      select v.unidade_id, v.emusys_matricula_id::text, v.emusys_aluno_id::text, v.aluno_id, v.status_emusys' || E'\n'
    || '      from public.vw_aluno_estado_operacional_canonico v' || E'\n'
    || '      union all' || E'\n'
    || '      -- fallback_cadastro_pre_espelho: matricula que ja existe no cadastro e ainda' || E'\n'
    || '      -- nao foi materializada pelo sync diario. Exige os TRES identificadores' || E'\n'
    || '      -- exatos, igual ao ramo de cima; so a origem da linha e diferente.' || E'\n'
    || '      select al.unidade_id,' || E'\n'
    || '             al.emusys_matricula_id::text,' || E'\n'
    || '             al.emusys_student_id::text,' || E'\n'
    || '             al.id,' || E'\n'
    || '             case al.status when ''ativo'' then ''ativa'' when ''trancado'' then ''trancada'' end' || E'\n'
    || '      from public.alunos al' || E'\n'
    || '      where al.arquivado_em is null' || E'\n'
    || '        and al.status in (''ativo'', ''trancado'')' || E'\n'
    || '        and nullif(btrim(al.emusys_matricula_id), '''') is not null' || E'\n'
    || '        and nullif(btrim(al.emusys_student_id), '''') is not null' || E'\n'
    || '        and not exists (' || E'\n'
    || '          select 1 from public.vw_aluno_estado_operacional_canonico v2' || E'\n'
    || '          where v2.unidade_id = al.unidade_id' || E'\n'
    || '            and btrim(v2.emusys_matricula_id::text) = btrim(al.emusys_matricula_id)' || E'\n'
    || '            and btrim(v2.emusys_aluno_id::text) = btrim(al.emusys_student_id)' || E'\n'
    || '        )' || E'\n'
    || '    ) e (unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id, status_emusys)' || E'\n'
    || '    join unidades_autorizadas ua on ua.id = e.unidade_id';

  v_new := replace(v_def, v_antigo, v_novo);

  if v_new = v_def then
    raise exception 'replace nao alterou nada — abortando';
  end if;

  execute v_new;
end $mig$;

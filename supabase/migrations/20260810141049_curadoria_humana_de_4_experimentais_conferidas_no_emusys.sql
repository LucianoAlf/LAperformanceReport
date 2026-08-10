-- Curadoria conferida pelo Alf no Emusys em 10/08/2026, com print de cada caso.
-- Sao os casos que o dado do nosso banco NAO conseguia arbitrar: a presenca nao tinha sido
-- sincronizada, entao havia duas linhas com status contraditorio e nenhuma evidencia.
-- A fonte aqui e o historico de estagio do lead no CRM do Emusys.
--
--   Julia Leite (16/07, REC, Canto) — duas linhas ambas `experimental_realizada`, com
--     Leticia Palmeira e Lohana Leopoldo. O historico do lead 7829 mostra
--     "Anotacao de Aula Experimental por Leticia Palmeira — Experimental efetivada com
--     avaliacao das habilidades" (02/08). => a experimental e da LETICIA (fica a 1132).
--
--   Daniela Andrade (04/08, lead 8028) — "Do estagio Aula experimental marcada para
--     Experimental NAO REALIZADA". => faltou. Fica a linha 1350.
--
--   Ketlen Caune (24/06, lead abandonado) — "Do estagio Aula experimental marcada para
--     Experimental NAO REALIZADA". => faltou. Fica a linha 930.
--
--   Rayane Braga (28/07, lead 7063) — aula reagendada de 14:00 para 17:00 e "de prof. Erick
--     Silva para prof. Gabriel Araujo"; depois "Experimental NAO REALIZADA". => professor
--     correto e o GABRIEL (pos-reagendamento) e o desfecho e faltou. Fica a linha 1286.
--
-- ⚠️ Em todos, a linha descartada e a do AGENDAMENTO. A que fica aponta para a aula real.
-- Vao para `lead_experimentais_arquivadas`, nunca apagadas direto.
--
-- ⚠️ A tabela de arquivo foi criada com `LIKE lead_experimentais` ANTES de a coluna
-- `emusys_agendamento_id` existir, entao ficou desalinhada e o INSERT ... SELECT le.*
-- falhou (42601). Alinhada aqui — `LIKE` copia a estrutura do momento, nao acompanha
-- alteracoes posteriores da origem. Por isso o INSERT passou a listar as colunas.
do $mig$
declare v_n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_name='lead_experimentais_arquivadas'
                    and column_name='emusys_agendamento_id') then
    alter table public.lead_experimentais_arquivadas add column emusys_agendamento_id bigint;
  end if;

  foreach v_n in array array[1216, 1282, 922, 1275] loop
    if not exists (select 1 from lead_experimentais where id = v_n) then
      raise exception 'ABORTADO: linha % nao existe mais', v_n;
    end if;
  end loop;

  update lead_experimentais set status = 'experimental_faltou'
   where id in (1350, 930, 1286) and status <> 'experimental_faltou';
  get diagnostics v_n = row_count;
  raise notice 'status corrigido para faltou em % linhas', v_n;

  insert into lead_experimentais_arquivadas (
    id, lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
    professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id, aluno_id,
    emusys_lead_id, observacoes, created_at, updated_at, emusys_aula_id, contexto_ia,
    contexto_ia_em, emusys_agendamento_id,
    arquivado_em, arquivado_por, motivo, consolidado_no_id
  )
  select le.id, le.lead_id, le.nome_aluno, le.unidade_id, le.data_experimental,
         le.horario_experimental, le.professor_experimental_id, le.curso_interesse_id,
         le.status, le.etapa_pipeline_id, le.aluno_id, le.emusys_lead_id, le.observacoes,
         le.created_at, le.updated_at, le.emusys_aula_id, le.contexto_ia, le.contexto_ia_em,
         le.emusys_agendamento_id,
         now(), 'Alf/Emusys 10-08-2026',
         case le.id
           when 1216 then 'Julia Leite 16/07: a experimental foi da Leticia Palmeira (anotacao no lead 7829); esta linha era da Lohana'
           when 1282 then 'Daniela Andrade 04/08: historico do lead 8028 diz Experimental NAO REALIZADA; fica a linha 1350'
           when 922  then 'Ketlen Caune 24/06: historico do lead diz Experimental NAO REALIZADA; fica a linha 930'
           when 1275 then 'Rayane Braga 28/07: aula reagendada de Erick para Gabriel e NAO REALIZADA; fica a linha 1286 (Gabriel)'
         end,
         case le.id when 1216 then 1132 when 1282 then 1350 when 922 then 930 when 1275 then 1286 end
    from lead_experimentais le
   where le.id in (1216, 1282, 922, 1275);
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'ABORTADO: arquivei % linhas, esperava 4', v_n;
  end if;

  delete from lead_experimental_aulas where lead_experimental_id in (1216, 1282, 922, 1275);

  delete from lead_experimentais where id in (1216, 1282, 922, 1275);
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'ABORTADO: apaguei % linhas, esperava 4', v_n;
  end if;

  if exists (select 1 from lead_experimental_aulas lea
              where not exists (select 1 from lead_experimentais le where le.id = lea.lead_experimental_id)) then
    raise exception 'ABORTADO: sobrou filha orfa';
  end if;

  raise notice '4 experimentais resolvidas por curadoria humana';
end
$mig$;

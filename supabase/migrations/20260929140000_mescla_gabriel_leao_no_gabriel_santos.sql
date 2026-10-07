-- "Gabriel Leão" (professor 676) e "Gabriel Santos Teixeira da Silva" (professor 8) são a
-- MESMA pessoa (Alf, 29/09/2026). No Emusys do Recreio ele se chama "Gabriel Leão" (id 2278);
-- em CG e Barra, pelo nome completo. O sync de 26/09 não achou nome parecido e CRIOU o 676.
--
-- O que muda:
--   * o vínculo do Recreio (id Emusys 2278) passa a ser do professor 8: o sync acha o
--     professor por (unidade, id do Emusys), então daqui pra frente tudo cai no 8;
--   * aulas, aluno, jornada, transição, passagem de bastão e avisos que estavam no 676
--     passam para o 8;
--   * o 676 fica marcado como duplicata (`mesclado_em_professor_id = 8`, inativo) e some da
--     lista de Equipe, do score e da busca de nomes.
-- Fica no 676 (histórico, sem leitor de pessoa): log do sync, divergência já resolvida,
-- snapshots do score (duplicata nunca pontua) e as atribuições curso×modalidade — a chave
-- delas é imutável e a rotina diária recria as do 8 a partir do vínculo.
--
-- Trocar o professor da aula e da jornada dispara o aviso de "troca de professor". Não houve
-- troca: por isso o professor sai (676 -> null) e entra (null -> 8) com a mesma flag que o
-- vínculo automático usa (`app.vinculo_professor_resolvido`), e o aviso que a SAÍDA gera —
-- endereçado só ao 676, que ninguém lê — é apagado aqui mesmo.

do $$
declare
  v_n integer;
  v_rec uuid;
begin
  select id into v_rec from public.unidades where codigo = 'REC';

  -- Guardas: só roda sobre o estado que foi medido.
  if not exists (select 1 from public.professores where id = 676 and nome = 'Gabriel Leão'
                   and mesclado_em_professor_id is null) then
    raise exception 'ABORTADO: professor 676 não é mais o Gabriel Leão sem mescla';
  end if;
  if not exists (select 1 from public.professores where id = 8 and ativo
                   and nome = 'Gabriel Santos Teixeira da Silva') then
    raise exception 'ABORTADO: professor 8 não é o Gabriel Santos ativo';
  end if;
  if exists (select 1 from public.professores_unidades where professor_id = 8 and unidade_id = v_rec) then
    raise exception 'ABORTADO: o professor 8 já tem vínculo no Recreio';
  end if;
  if (select count(*) from public.professores_unidades where professor_id = 676) <> 1
     or not exists (select 1 from public.professores_unidades
                     where professor_id = 676 and unidade_id = v_rec and emusys_id = 2278) then
    raise exception 'ABORTADO: o 676 não tem exatamente o vínculo REC/2278';
  end if;

  -- 1. O vínculo do Recreio vai para o 8.
  update public.professores_unidades
     set professor_id = 8,
         validacao_status = 'validado_humano',
         validado_em = now(),
         validado_por = 'alf: mesmo professor (29/09/2026)'
   where professor_id = 676 and unidade_id = v_rec and emusys_id = 2278;

  -- 2. Aulas e jornada: sai sem aviso de troca, entra como vínculo resolvido.
  perform set_config('app.vinculo_professor_resolvido', 'on', true);

  create temp table _mescla_aud_antes on commit drop as
    select evento_id from public.eventos_operacionais_audiencia where professor_id = 676;
  create temp table _mescla_aulas on commit drop as
    select id from public.aulas_emusys where professor_id = 676;
  update public.aulas_emusys set professor_id = null where id in (select id from _mescla_aulas);
  update public.aulas_emusys set professor_id = 8 where id in (select id from _mescla_aulas);

  update public.aluno_jornada_matricula_disciplina set professor_id = 8 where professor_id = 676;

  perform set_config('app.vinculo_professor_resolvido', 'off', true);

  -- Os avisos que a saída (676 -> null) acabou de gerar: só o 676 é audiência, e ele não é
  -- ninguém. Apaga a audiência criada nesta transação e o aviso que ficou sem ninguém.
  create temp table _mescla_aud_nova on commit drop as
    select evento_id from public.eventos_operacionais_audiencia
     where professor_id = 676 and evento_id not in (select evento_id from _mescla_aud_antes);
  delete from public.eventos_operacionais_audiencia
   where professor_id = 676 and evento_id in (select evento_id from _mescla_aud_nova);
  delete from public.eventos_operacionais e
   where e.evento_id in (select evento_id from _mescla_aud_nova)
     and not exists (select 1 from public.eventos_operacionais_audiencia a where a.evento_id = e.evento_id);

  -- 3. O resto que apontava para o 676.
  update public.alunos set professor_atual_id = 8 where professor_atual_id = 676;
  update public.aluno_professor_transicoes set professor_novo_id = 8 where professor_novo_id = 676;
  update public.professor_passagem_bastao set professor_destino_id = 8 where professor_destino_id = 676;
  update public.eventos_operacionais_audiencia set professor_id = 8 where professor_id = 676;

  -- 4. O 676 vira duplicata.
  update public.professores
     set mesclado_em_professor_id = 8,
         ativo = false,
         observacoes = coalesce(observacoes || E'\n', '')
           || 'Duplicata do professor 8 (Gabriel Santos Teixeira da Silva): "Gabriel Leão" é o nome dele no Emusys do Recreio. Mesclado em 29/09/2026.'
   where id = 676;

  insert into public.professores_sync_log (evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes)
  values ('professor_mesclado_manual', v_rec, 8, 2278, 'Gabriel Leão',
          jsonb_build_object('duplicata', 676, 'autor', 'alf', 'motivo', 'mesmo professor, nome diferente no Emusys do Recreio'));
end $$;

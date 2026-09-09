-- Anamnese: efeito derivado nunca mais derruba a entrevista.
--
-- Em 02/09/2026 producao ficou 21h sem salvar anamnese. A migration
-- 20260902093000 revogou EXECUTE de fn_sincronizar_anamnese_preenchida_pessoa
-- para authenticated; os gatilhos que a chamavam eram SECURITY INVOKER, entao
-- fechar a funcao fechou o proprio gatilho -- e o gatilho, ao estourar,
-- derrubava o INSERT inteiro. A familia respondia a entrevista, a recepcao via
-- erro, e nada era gravado.
--
-- Tamanho medido do estrago: a sequencia avanca mesmo quando o INSERT aborta,
-- entao id queimado e tentativa perdida. anamneses tem 308 linhas com
-- max(id)=392 -- 84 ids queimados, em dois blocos colados a datas de fix:
--   41-82   (42) ate 07/08 17:03 -- overflow de duracao_segundos
--   272-304 (33) entre 01/09 17:48 e 02/09 16:42 -- o incidente acima
-- Depois do fix de 02/09: ids 305-392 contiguos, 88 anamneses, zero falha.
--
-- O fix de 02/09 corrigiu a CAUSA daquele dia (gatilhos viraram definer).
-- Esta migration ataca a CLASSE: o dado insubstituivel e a entrevista com a
-- familia; espelho em alunos e pessoa_chave sao efeitos derivaveis. Derivado
-- que falha agora e engolido -- mas registrado em automacao_log com o id da
-- anamnese, para "nao derrubou" e "nao aconteceu" seguirem distinguiveis.
--
-- Checagem (esperado: zero linhas):
--   select * from automacao_log
--    where evento='anamnese' and acao in ('espelho_anamnese_falhou',
--                                         'pessoa_chave_anamnese_falhou')
--    order by created_at desc;

-- ---------------------------------------------------------------- BEFORE
-- Resolve a pessoa_chave. Vira DEFINER: hoje ele e INVOKER e so funciona
-- porque fn_pessoa_chave_aluno tem EXECUTE para authenticated -- exatamente a
-- ACL que foi revogada em 02/09 na funcao irma. Definer com search_path fixo
-- tira essa dependencia. Falhando, a anamnese grava com chave nula: fica
-- invisivel na ficha (get_anamnese_aluno le SO por pessoa_chave) mas
-- RECUPERAVEL por update, enquanto perder a entrevista e definitivo.
create or replace function public.fn_anamnese_define_pessoa_chave()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    new.pessoa_chave := case
      when new.aluno_id is null then null
      else public.fn_pessoa_chave_aluno(new.aluno_id)
    end;
  exception when others then
    new.pessoa_chave := null;
    begin
      insert into public.automacao_log (aluno_nome, aluno_id, evento, acao, status, detalhes)
      values (
        coalesce(new.nome_aluno, '(sem nome)'), new.aluno_id, 'anamnese',
        'pessoa_chave_anamnese_falhou', 'erro',
        jsonb_build_object(
          'anamnese_id', new.id,
          'unidade_id', new.unidade_id,
          'sqlstate', sqlstate,
          'erro', sqlerrm,
          'reparo', 'update anamneses set pessoa_chave = pessoa_chave where id = <id>'
        )
      );
    exception when others then
      -- Ultimo recurso: o log do Postgres. Nao pode derrubar a gravacao.
      raise warning 'anamnese % gravada sem pessoa_chave; o log tambem falhou: %', new.id, sqlerrm;
    end;
  end;
  return new;
end;
$function$;

-- ----------------------------------------------------------------- AFTER
-- Espelha anamnese_preenchida nas matriculas da pessoa. E o gatilho que
-- estourou em 02/09.
create or replace function public.fn_atualizar_aluno_anamnese()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.aluno_id is not null and new.status = 'completa' then
    begin
      perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, new.pessoa_chave);
    exception when others then
      begin
        insert into public.automacao_log (aluno_nome, aluno_id, evento, acao, status, detalhes)
        values (
          coalesce(new.nome_aluno, '(sem nome)'), new.aluno_id, 'anamnese',
          'espelho_anamnese_falhou', 'erro',
          jsonb_build_object(
            'anamnese_id', new.id,
            'unidade_id', new.unidade_id,
            'pessoa_chave', new.pessoa_chave,
            'sqlstate', sqlstate,
            'erro', sqlerrm,
            'reparo', 'select fn_sincronizar_anamnese_preenchida_pessoa(<unidade_id>, <pessoa_chave>)'
          )
        );
      exception when others then
        raise warning 'anamnese % gravada, espelho falhou e o log tambem: %', new.id, sqlerrm;
      end;
    end;
  end if;
  return new;
end;
$function$;

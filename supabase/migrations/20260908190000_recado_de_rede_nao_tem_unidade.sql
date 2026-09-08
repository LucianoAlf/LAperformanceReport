-- Recado entre pessoas de REDE não tem unidade (08/09/2026).
--
-- 🔴 O CASO: o Luciano pediu à Mila para mandar um recado à Anne Krissya e ela
--    respondeu *"deu erro técnico no destino da Krissya (telefone não resolveu
--    direito). Me passa o número dela que eu refaço"*.
--
--    Reproduzi a chamada. **O telefone resolveu perfeitamente** — a linha que
--    tentou entrar já vinha com `destino_nome: Anne Krissya` e
--    `destino_telefone: 5521966875271`. O erro real era outro:
--
--      null value in column "unidade_id" of relation "mila_recados"
--      violates not-null constraint
--
--    O Luciano é diretoria (sem unidade) e a Krissya é líder comercial de rede
--    (sem unidade). Nenhum dos dois tem unidade — e a tabela exigia uma.
--
-- ⚠️ A PRÓPRIA FUNÇÃO JÁ DIZIA QUE ISSO É LEGÍTIMO. Comentário dela, palavra por
--    palavra: *"NULL aqui NÃO é erro: é 'procure nas três'. Quem lidera não tem
--    unidade."* A lógica estava certa e o ESQUEMA a contradizia — a função sabia
--    de uma regra que a tabela proibia.
--
-- ⚠️ CONFERI OS 9 CONSUMIDORES ANTES, porque afrouxar NOT NULL costuma trocar
--    falha barulhenta por sumiço silencioso: 7 filtram por unidade. Mas o filtro
--    deles já antecipa este caso —
--
--      or (q.unidade_id is not null and r.unidade_id is distinct from q.unidade_id)
--
--    · quem é de REDE (unidade nula): a condição é falsa → vê o recado ✅
--    · quem é de UNIDADE, recado de rede: rejeita ✅ (não é dela mesmo)
--    · quem é de unidade, recado da unidade: passa ✅
--
--    Ou seja, ninguém fica invisível: o recado de rede aparece exatamente para
--    quem tem escopo de rede. Nenhuma das 9 precisou mudar.
--
-- ⚠️ As 26 linhas existentes têm unidade e continuam iguais — mudança aditiva.
--
-- 🔴 FICA UMA LIÇÃO SOBRE A CONVERSA, que esta migration NÃO conserta: a Mila
--    recebeu um erro de constraint e **inventou uma explicação plausível**
--    ("telefone não resolveu") para algo que não entendeu — e ainda pediu ao
--    Luciano um número que ela já tinha. É a mesma família do "descartei… nada
--    foi gravado" da Sol hoje: relatar errado o que aconteceu. Com o NOT NULL
--    fora, este erro some; a tendência de narrar por cima do desconhecido, não.

alter table mila_recados alter column unidade_id drop not null;

comment on column mila_recados.unidade_id is
  'Unidade do recado. NULL = RECADO DE REDE, e e legitimo: diretoria e liderancas (comercial, Sucesso do Aluno) nao tem unidade. O NOT NULL antigo bloqueava exatamente a conversa entre elas — caso Luciano→Anne Krissya, 08/09. Os filtros dos consumidores ja tratam: quem e de rede ve, quem e de unidade nao.';

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v jsonb; t_dir text; t_uni text; v_id uuid; v_vis int;
begin
  select telefone into t_dir from governanca.agente_usuarios
   where nome = 'Luciano Alf' limit 1;

  -- 🔴 o caso que falhava: diretoria (sem unidade) → lider de rede (sem unidade)
  v := mila_propor_recado_v1(t_dir, 'colaborador', 'Krissya',
                             'PROVA DA MIGRATION — descartar', 'prova');
  if not coalesce((v->>'ok')::bool, false) then
    raise exception 'o recado de rede continua falhando: %', v;
  end if;
  v_id := (v->>'recado_id')::uuid;

  -- e ele tem de existir COM unidade nula
  if not exists (select 1 from mila_recados where id = v_id and unidade_id is null) then
    raise exception 'o recado nao ficou com unidade nula como esperado';
  end if;

  -- ⚠️ E O PONTO QUE MAIS IMPORTA: nao pode virar recado invisivel. Quem e de
  --    rede tem de conseguir ve-lo — senao eu troquei erro por sumico.
  select count(*) into v_vis from mila_recados r
   where r.id = v_id
     and not (
       -- o mesmo predicado dos 7 consumidores, com o solicitante de rede
       (select g.unidade_id from governanca.agente_usuarios g where g.telefone = t_dir limit 1) is not null
       and r.unidade_id is distinct from
           (select g.unidade_id from governanca.agente_usuarios g where g.telefone = t_dir limit 1));
  if v_vis <> 1 then
    raise exception 'o recado de rede ficaria INVISIVEL para quem e de rede — sumico silencioso';
  end if;

  -- limpa a prova
  delete from mila_recados where id = v_id;

  raise notice 'prova: diretoria->lider de rede passa, grava com unidade nula, e SEGUE VISIVEL para escopo de rede';
end $prova$;

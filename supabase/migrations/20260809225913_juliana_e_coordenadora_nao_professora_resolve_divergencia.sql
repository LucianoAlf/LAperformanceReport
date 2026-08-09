-- Juliana Azevedo Teixeira Baltazar (nosso professor_id 44, Emusys CG 769) e
-- COORDENADORA, nao professora — decisao do Alf em 09/08/2026.
--
-- Ela consta na lista /professores do Emusys CG, o que fez o sync abrir a divergencia
-- 25 (`conflito_unidade`, severidade alta) todo dia desde 02/08. Mas o cadastro dela no
-- Emusys existe por funcao administrativa, nao por lecionar.
--
-- Pegada total dela em aulas: 6 na vida inteira — 4 normais + 2 experimentais (1 delas
-- cancelada). Zero aulas futuras. Ultima aula 01/08/2026.
--
-- Por isso: NAO reativar (`professores.ativo` fica false) e marcar a divergencia como
-- decidida, para o sync parar de reabri-la. A sugestao da propria fila ja era
-- "revisar_vinculo_sem_reativacao_automatica" — o sistema se recusou a reativar sozinho,
-- corretamente.
--
-- ⚠️ NAO mexemos em `professores_unidades` (linha 448): ela guarda o historico verdadeiro
-- de que aquele cadastro Emusys existe. Apagar perderia rastro.
--
-- ⚠️ ACHADO NAO CORRIGIDO AQUI (fica registrado): a experimental dela de 01/08 com o
-- Fabio Bastos Soares esta como `experimental_faltou` em `lead_experimentais` (id 1300),
-- mas o Fabio MATRICULOU no mesmo dia (aluno 1894, Canto, ativo; lead 10671 convertido).
-- Causa: `lead_experimentais.emusys_aula_id` = 69566 e `aulas_emusys.emusys_id` = 735627
-- para a MESMA aula — a reconciliacao casa por esse campo e nunca fecha. Isso nao afeta a
-- taxa de conversao dela hoje (as 3 experimentais dela sao cancelada/cancelada/faltou, e o
-- denominador so conta 'experimental_realizada' e 'convertido'), mas o padrao pode atingir
-- professor que pontua.
do $mig$
declare v_afetadas int;
begin
  if not exists (select 1 from professores where id = 44 and not ativo) then
    raise exception 'ABORTADO: professor 44 deveria estar inativo; estado mudou desde a analise';
  end if;

  update professores_emusys_divergencias
     set resolvido = true,
         decisao = 'ignorado_coordenadora_nao_leciona',
         decidido_por = 'Alf/Claude',
         decidido_em = now(),
         sugestao = coalesce(sugestao, '{}'::jsonb) || jsonb_build_object(
           'resolucao_final',
           'Alf 09/08/2026: e coordenadora, nao professora. Nao reativar. 6 aulas na vida, 0 futuras.'
         )
   where id = 25 and not resolvido;
  get diagnostics v_afetadas = row_count;

  if v_afetadas <> 1 then
    raise exception 'ABORTADO: esperava resolver 1 divergencia, resolvi %', v_afetadas;
  end if;
end
$mig$;

-- M11 — rider com quantidades + catálogo + extras + toca junto. Tudo em BEGIN/ROLLBACK:
-- não suja produção. Fixture real: evento 21, relatório 389 ↔ apresentação 106
-- (aluno 743, teclado), apresentações 30 (aluno 842) e 34 (aluno 710) no mesmo bloco.
--
-- Rodar: psql -v ON_ERROR_STOP=1 -f tests/sql/eventos_m11_rider_toca_junto.sql
-- Cada DO lança exceção se a regra quebrar — o arquivo inteiro verde = contrato ok.

begin;
-- Os dois formatos: fn_evento_pode_ver lê auth.role(); a RPC de decisão do LA Teacher
-- lê o JSON inteiro em request.jwt.claims. As duas precisam do service_role.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

/* ── 1) rider_quantidades + catálogo + extras + sem_mapa + editado_apos_envio ── */

update public.relatorio_anual
   set rider = jsonb_build_object(
         'itens',       jsonb_build_array('teclado', 'fantasma_nao_catalogado'),
         'quantidades', jsonb_build_object('teclado', 2),
         'extras',      jsonb_build_array(
                          jsonb_build_object('gaveta', 'geral', 'texto', 'Banqueta alta', 'qtd', 2)),
         -- A view serializa os extras em texto dentro de 'outros'; se o sync lesse os
         -- dois, "Banqueta alta" nasceria em duplicata — é exatamente o que se testa.
         'outros',      'Banqueta alta ×2')
 where id = 389;

insert into public.relatorio_anual_historico
  (relatorio_id, quando, ator, acao)
values (389, now(), 'professor', 'editou_apos_envio');

create temp table _sync as
select public.evento_recital_sincronizar_v1(21) as r;

do $$
declare v record;
begin
  -- teclado x2: quantidade vem de rider_quantidades, nome/tipo do catálogo
  select * into v from public.evento_apresentacao_item
   where apresentacao_id = 106 and codigo = 'teclado';
  assert v.quantidade = 2, format('teclado devia ter quantidade 2, veio %s', v.quantidade);
  assert v.tipo = 'instrumento', format('teclado devia ser instrumento, veio %s', v.tipo);
  assert v.nome = 'Teclado', format('nome devia vir do catalogo ("Teclado"), veio %s', v.nome);

  -- id fora do catálogo: entra com código cru como nome E aparece em codigos_sem_mapa
  assert exists (select 1 from public.evento_apresentacao_item
                  where apresentacao_id = 106 and codigo = 'fantasma_nao_catalogado'),
    'id desconhecido devia entrar como item mesmo sem mapa';
  assert (select (r -> 'codigos_sem_mapa') ? 'fantasma_nao_catalogado' from _sync),
    'fantasma_nao_catalogado devia aparecer em codigos_sem_mapa';

  -- extra vira item próprio com a quantidade dele
  select * into v from public.evento_apresentacao_item
   where apresentacao_id = 106 and codigo = 'extra';
  assert v.nome = 'Banqueta alta', format('extra devia usar o texto, veio %s', v.nome);
  assert v.quantidade = 2, format('extra devia ter quantidade 2, veio %s', v.quantidade);

  -- rider_outros NÃO pode repetir o extra que já entrou pela lista estruturada
  assert not exists (
    select 1 from public.evento_apresentacao_item
     where apresentacao_id = 106 and codigo = 'outro'),
    'rider_outros duplicou o extra — o sync leu os dois canais';

  -- selo "editou após envio" espelhado na apresentação
  assert exists (
    select 1 from public.evento_apresentacao
     where id = 106 and editado_apos_envio_em is not null),
    'editado_apos_envio_em não foi espelhado para a apresentação';
end $$;

/* ── 2) toca junto: aprovar junta na grade e confirma ── */

insert into public.relatorio_anual_toca_junto
  (evento_id, aluno_id, curso_chave, com_aluno_id, com_curso_chave,
   pedido_por_professor_id, pedido_em, status)
values (21, 743, 'teclado', 842, 'musicalizacao para bebes', 8, now(), 'pedido');

create temp table _pedido as
select id from public.relatorio_anual_toca_junto where evento_id = 21 and status = 'pedido';

do $$
declare
  v_id bigint := (select id from _pedido);
  v_grupo uuid;
begin
  -- a lista escopada enxerga o pedido
  assert exists (select 1 from public.evento_toca_junto_lista_v1(21) where id = v_id),
    'pedido não apareceu na lista da coordenação';

  -- aprovar: juntar primeiro, decidir depois — um passo atômico
  perform public.evento_toca_junto_decidir_v1(v_id, true);

  select grupo_id into v_grupo from public.evento_apresentacao where id = 106;
  assert v_grupo is not null, 'aprovar não juntou — apresentação continuou sem grupo';
  assert (select grupo_id from public.evento_apresentacao where id = 30) = v_grupo,
    'os dois lados do pedido não ficaram no mesmo número';
  assert (select status from public.relatorio_anual_toca_junto where id = v_id) = 'confirmado',
    'pedido não foi marcado como confirmado';
end $$;

/* ── 3) juntar falhando NÃO pode marcar o pedido confirmado ── */

-- Parceiro sem apresentação na grade (aluno 1711 tem relatório mas não está em bloco
-- nenhum): não há o que juntar. A RPC deve recusar ANTES de chamar a decisão, e o
-- pedido tem de continuar 'pedido' — confirmado órfão era exatamente o que o
-- contrato queria evitar. A unique de par aberto impede repetir o mesmo par, então
-- aqui é outro parceiro.
insert into public.relatorio_anual_toca_junto
  (evento_id, aluno_id, curso_chave, com_aluno_id, com_curso_chave,
   pedido_por_professor_id, pedido_em, status)
values (21, 743, 'teclado', 1711, 'teclado', 8, now(), 'pedido');

do $$
declare
  v_id bigint;
begin
  select id into v_id from public.relatorio_anual_toca_junto
   where evento_id = 21 and status = 'pedido' and com_aluno_id = 1711;
  assert v_id is not null, 'pedido sem apresentação do parceiro não foi criado';
  begin
    perform public.evento_toca_junto_decidir_v1(v_id, true);
    -- ⚠️ Não usar "when raise_exception": o errcode P0001 das regras do banco cai
    -- nessa condição e o teste engoliria o erro errado como se fosse o certo.
    raise exception 'TESTE_FALHOU: aprovou pedido sem apresentação do parceiro';
  exception
    when others then
      if sqlerrm like 'TESTE_FALHOU%' then raise; end if;
      assert sqlerrm like 'TOCA_JUNTO_SEM_APRESENTACAO%',
        format('erro errado: %s', sqlerrm);
  end;
  assert (select status from public.relatorio_anual_toca_junto where id = v_id) = 'pedido',
    'sem apresentação para juntar, o pedido foi decidido mesmo assim — órfão';
end $$;

/* ── 4) recusar exige motivo; recusado com motivo funciona ── */

do $$
declare
  v_id bigint := (select id from public.relatorio_anual_toca_junto
                   where evento_id = 21 and status = 'pedido');
begin
  begin
    perform public.evento_toca_junto_decidir_v1(v_id, false);
    raise exception 'TESTE_FALHOU: recusou pedido sem motivo';
  exception
    when others then
      if sqlerrm like 'TESTE_FALHOU%' then raise; end if;
      assert sqlerrm like 'TOCA_JUNTO_MOTIVO_OBRIGATORIO%',
        format('erro errado na recusa sem motivo: %s', sqlerrm);
  end;

  perform public.evento_toca_junto_decidir_v1(v_id, false, 'Só um aluno por vez no 1º bloco');
  assert (select status from public.relatorio_anual_toca_junto where id = v_id) = 'recusado',
    'recusa com motivo não marcou o pedido';
  assert (select motivo from public.relatorio_anual_toca_junto where id = v_id)
         = 'Só um aluno por vez no 1º bloco',
    'motivo não foi gravado no pedido';
end $$;

select 'M11 ok — quantidades, catálogo, extras, selo e toca junto verificados' as resultado;

rollback;

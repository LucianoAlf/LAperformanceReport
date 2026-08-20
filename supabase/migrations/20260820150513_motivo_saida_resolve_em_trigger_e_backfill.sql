-- PROBLEMA
-- A resolucao de `motivo_saida_id` a partir do texto do motivo morava SO dentro da edge
-- `processar-matricula-emusys` e rodava UMA vez, no INSERT da movimentacao. Se o motivo que o
-- Emusys mandou ainda nao existisse em `motivos_saida` naquele instante, gravava NULL — e ninguem
-- voltava ali depois. Cadastrar o motivo mais tarde nao retroagia.
--
-- Efeito medido em 20/08/2026: 34 evasoes com a Pesquisa de Evasao travada em
-- 'motivo_nao_catalogado'. Em 11 delas o id JA EXISTIA no catalogo antes de hoje — 'Concluido e
-- nao vai renovar' foi cadastrado em 05/08 e as 5 evasoes dele sao de 01/08, quatro dias antes.
-- Nao faltava catalogo: faltava alguem gravar.
--
-- SOLUCAO
-- (1) A regra sai da edge e vira trigger na tabela: vale para TODO caminho de escrita (webhook,
--     sync, formulario) e roda tambem no UPDATE, entao linha antiga com motivo vazio se corrige
--     sozinha no proximo toque.
-- (2) Backfill unico para o passado que ninguem mais vai tocar.
--
-- Escopo: so 'evasao', 'nao_renovacao' e 'aviso_previo'. Renovacao nunca usa a coluna (0 de 566
-- linhas) e trancamento tem `motivo_trancamento_id` proprio — resolver motivo de saida ali seria
-- inventar dado.
--
-- O match usa `nome_normalizado` (coluna gerada, upper(trim(nome))), com trim dos dois lados:
-- e o mesmo criterio do ilike da edge, e ainda alcanca texto com espaco sobrando, que o Emusys
-- manda com frequencia ("Financeiro ", "Viagem ").
--
-- Motivo que NAO casa nao quebra nada: fica NULL, como hoje, e vira uma linha em `automacao_log`
-- com acao 'motivo_saida_desconhecido'. Hoje um motivo novo do Emusys morre em silencio e so
-- aparece semanas depois como pesquisa travada na tela do Sucesso do Aluno.
--
-- ATENCAO: esta versao grava status 'aviso' no log, que viola o CHECK de `automacao_log.status`
-- ('ok'|'warn'|'erro'). Corrigido na migration seguinte (20260820150628).

create or replace function public.fn_resolver_motivo_saida_movimentacao_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_motivo_id integer;
  v_texto text;
begin
  if new.tipo not in ('evasao', 'nao_renovacao', 'aviso_previo') then
    return new;
  end if;

  -- decisao ja tomada (webhook, formulario ou humano) nao e sobrescrita
  if new.motivo_saida_id is not null then
    return new;
  end if;

  v_texto := nullif(btrim(coalesce(new.motivo, '')), '');

  if v_texto is null then
    return new;
  end if;

  select ms.id
    into v_motivo_id
  from public.motivos_saida ms
  where ms.nome_normalizado = upper(v_texto)
    and ms.ativo = true
  limit 1;

  if v_motivo_id is not null then
    new.motivo_saida_id := v_motivo_id;
    return new;
  end if;

  begin
    insert into public.automacao_log (aluno_nome, aluno_id, evento, acao, status, detalhes)
    values (
      new.aluno_nome,
      new.aluno_id,
      'movimentacao_admin',
      'motivo_saida_desconhecido',
      'aviso',
      jsonb_build_object(
        'motivo_texto', v_texto,
        'tipo', new.tipo,
        'movimentacao_id', new.id,
        'unidade_id', new.unidade_id,
        'origem', tg_op,
        'efeito', 'pesquisa de evasao fica bloqueada em motivo_nao_catalogado ate cadastrar o motivo'
      )
    );
  exception when others then
    raise warning 'fn_resolver_motivo_saida_movimentacao_admin: falha ao logar motivo desconhecido (%): %', v_texto, sqlerrm;
  end;

  return new;
end;
$function$;

drop trigger if exists trg_resolver_motivo_saida_movimentacao_admin on public.movimentacoes_admin;

create trigger trg_resolver_motivo_saida_movimentacao_admin
before insert or update of motivo, motivo_saida_id, tipo
on public.movimentacoes_admin
for each row
execute function public.fn_resolver_motivo_saida_movimentacao_admin();

-- BACKFILL: so as linhas com a Pesquisa de Evasao ainda por enviar, que sao as que estao presas
-- na tela hoje. Nao mexe em quem ja teve pesquisa enviada/respondida.
-- Nao altera score de professor: os motivos cadastrados hoje entraram com
-- conta_score_professor = false, e motivo NULL sem match ja nao contava.
-- `trg_sync_evasao_dados_mensais` dispara no UPDATE e recalcula a MESMA contagem (o numero de
-- evasoes do mes nao depende do motivo); nas 7 linhas de competencia fechada ele apenas registra
-- o bloqueio no log e nao toca no snapshot, que e o comportamento correto.

update public.movimentacoes_admin m
set motivo_saida_id = ms.id
from public.motivos_saida ms
where ms.nome_normalizado = upper(btrim(m.motivo))
  and ms.ativo = true
  and m.tipo in ('evasao', 'nao_renovacao')
  and m.motivo_saida_id is null
  and m.motivo is not null
  and public.is_movimentacao_admin_retencao_valida(m.id)
  and coalesce(
    (
      select pe.status
      from public.pesquisa_evasao pe
      where pe.evasao_id = m.id
        and pe.modo_teste = false
      order by pe.created_at desc, pe.id desc
      limit 1
    ),
    'pendente'
  ) in ('pendente', 'falha_envio', 'sem_whatsapp');

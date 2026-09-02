-- Aviso previo: veredito apurado ao vivo (02/09/2026)
-- Contexto completo: fiscal-mila/daily-notes/2026-09-02.md e a secao
-- "Sol - Lembrete de aviso previo" do CLAUDE.md daquele repo.

-- A tela precisa dizer, por aviso vencido, QUAL a acao: concluir no Emusys,
-- remover o registro aqui, ou corrigir o LA Report. Isso exige perguntar ao
-- Emusys se o aluno tem aula marcada e se compareceu -- e a tela NAO pode
-- fazer isso: nao tem o token, e sao 120 req/min por IP compartilhados com
-- os outros jobs da VPS.
--
-- ⚠️ POR QUE NAO DA PARA CALCULAR DOS ESPELHOS LOCAIS. Medido em 02/09 nos
-- 5 casos reais: `aula_alunos_emusys` enxerga 0 aulas futuras para quem tem
-- 15 na API (Arthur e Luiz Eduardo nao tem NENHUMA aula no espelho). Uma
-- view sobre ele marcaria "aguardando conclusao" quem esta em aula --
-- exatamente o bug que esta tabela existe para evitar.
--
-- ⚠️ POR QUE NAO SAO COLUNAS EM `movimentacoes_admin`. A RPC
-- `arquivar_movimentacao_admin` faz `insert into ..._arquivadas select
-- v_linha.*, now(), v_ator, motivo` -- POSICIONAL, sem lista de colunas.
-- Coluna nova em uma das tabelas e nao na outra quebra o arquivamento; nas
-- duas em ordem diferente TROCA valores em silencio (`situacao` e
-- `arquivado_motivo` sao ambos text). Tabela separada nao tem esse
-- acoplamento, e o `on delete cascade` ainda limpa o veredito quando o
-- aviso e arquivado -- que e o certo: veredito de registro morto nao serve.
--
-- Escritor UNICO: `send-aviso-previo-sol.py` (cron da Sol, 8/9/10h BRT).

create table if not exists public.aviso_previo_veredito (
  movimentacao_id  integer primary key
                   references public.movimentacoes_admin(id) on delete cascade,
  situacao         text not null,
  aulas_agendadas  integer,
  ultima_agendada  date,
  ultima_presenca  date,
  matricula_status text,
  verificado_em    timestamptz not null default now(),
  constraint aviso_previo_veredito_situacao_valida
    check (situacao in ('cobrar', 'resolvido', 'divergente', 'cancelado'))
);

comment on table public.aviso_previo_veredito is
  'Veredito por aviso previo vigente, apurado ao vivo no Emusys pelo cron da Sol. Escritor unico: send-aviso-previo-sol.py. A tela LE daqui e mostra `verificado_em` -- dado parado precisa se denunciar, nao mentir com cara de fresco.';

comment on column public.aviso_previo_veredito.situacao is
  'cobrar = saiu e ninguem finalizou no Emusys (a pendencia). cancelado = aluno voltou atras, tem aula marcada E presenca recente. divergente = Emusys ja finalizou mas o LA Report diz ativo. resolvido = saiu certinho.';

comment on column public.aviso_previo_veredito.ultima_presenca is
  'Trava contra agenda fantasma: matricula que ninguem finalizou continua gerando aulas para quem foi embora. Sem este campo, `cancelado` deixaria de cobrar justamente o caso que o lembrete protege.';

-- Sem indice de proposito: ~110 linhas cabem em 1 pagina, seq scan ganha
-- de qualquer indice e nao ha o que manter.

alter table public.aviso_previo_veredito enable row level security;

create policy aviso_previo_veredito_leitura
  on public.aviso_previo_veredito
  for select to authenticated
  using (true);

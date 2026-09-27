# Handoff — Módulo Eventos: MVP do Recital 2026 completo

**Data:** 2026-09-27 · **Continua de:** `docs/handoffs/2026-09-21-modulo-eventos-recital.md` e `docs/auditorias/2026-09-27-auditoria-modulo-eventos-recital.md`

O que era "ferramenta do ADM" virou a sala de eventos integrada. Tudo que a equipe faz
na planilha do recital agora tem lugar aqui — premissa do Alf: "não pode deixar passar
nada, senão a equipe não larga a planilha".

## O que entrou (todas as fases do roadmap da auditoria)

- **Fase 0 — governança:** `ModalEditarEvento` (título, período, horário, local,
  status, duração padrão, intervalo, observações, excluir). Cards mostram a faixa de
  datas. `AvisoEmDesenvolvimento` atualizado — só falta o Drive.
- **Eventos reais criados:** Barra `id=21` (28/11, já em uso), Recreio `id=22`
  (13–15/11), Campo Grande `id=23` (01–12/12). Evento "teste" removido.
- **Período de vários dias:** `evento.data_fim` + `evento_bloco.data`. Um recital de
  N dias é UM evento; o dia mora no bloco. `calcularHorariosDaGrade` reinicia o
  relógio em `horario_inicio` a cada dia novo; conflito só vale dentro do mesmo dia;
  `inicio_manual` continua mandando.
- **Convidados + filtros:** `evento_participacao.convidados` editável na aba Alunos
  (commit no blur), KPI de convidados, filtros por professor/curso/status/sem
  alocação. Card da lista conta só `status='participa'`.
- **Canal professor (LA Teacher → cá):** `evento_recital_sincronizar_v1` lê
  `public.vw_relatorio_anual_recital_v1` (view fechada deles) e casa por
  `evento_id` + pessoa + `fn_curso_base(curso)`. Roda na abertura do detalhe e por
  botão na Grade. Campos sincronizados carregam `*_origem='professor'`; escrita do
  ADM vira `'adm'` — divergência entre os dois aparece na apresentação
  (`divergenciasProfessor` em `src/lib/eventos.ts`). Nada é escrito de volta no lado
  deles.
- **Mídia:** `musica_link` (YouTube/Spotify) e `musica_playback_path` na
  apresentação. O bucket `recital-playback` é deles e privado — a edge
  **`recital-midia-url`** assina URL de 1h só depois de `fn_evento_pode_ver` com o
  JWT do chamador (o path `<relatorio_id>/<arquivo>` resolve o evento via
  `relatorio_anual.evento_id`). Sem JWT → 401 no gateway; anon key → 401 no código;
  path fora do padrão → 400.
- **Relatórios na sala:** `evento_relatorios_v1` alimenta o painel na aba Revisão
  (esperados/aprovados/enviados/devolvidos/sem apresentação correspondente).
- **Certificado por curso** (decisão do LA Teacher, confirmada): uma apresentação =
  um certificado; `certificado_status`/`certificado_em` persistidos em
  `evento_apresentacao`; "marcar emitidos" na aba Check-in. Quem confirmou sem
  apresentação recebe certificado genérico.
- **Impressão:** programa, folha de palco e CSV levam data do bloco, artista, link
  da música, path do playback e rider. CSV mantém `;` + BOM UTF-8 e duração vazia
  quando `null`.
- **RBAC:** `podeVerEventos` consulta `hasPermission('eventos.ver')` nos três
  consumidores (router, sidebar, mobile). Migration concede `eventos.ver` a
  Gerente/Farmer/Sucesso do Aluno/Visualizador e `eventos.editar` aos operacionais.

## Migrations aplicadas em produção

- `20260927140000_evento_convidados_canal_professor.sql` — convidados, origem,
  `fn_evento_pode_ver`, `evento_recital_sincronizar_v1`, `evento_relatorios_v1`,
  `evento_apresentacao_adicionar_v1`.
- `20260927150000_evento_periodo_bloco_data.sql` — `data_fim`, `evento_bloco.data`,
  grants `eventos.ver`/`eventos.editar`.

## Verificação

- `node --test tests/eventos*.test.mjs` — **158/158**.
- `tsc -p tsconfig.ci.json` — 0 erros da classe que o CI gateia (TS2304/18004/2552);
  os TS2339 restantes em `eventos.ts`/`useEventos.ts` são pré-existentes (a
  interseção `A[] & B[]` resolve `.map` pela primeira sobrecarga; `as never` do
  `aplicarUnidade` já estava em HEAD).
- `npm run build` — verde.
- Edge deployada (v1, `verify_jwt=true`) e smoke-testada em produção.

## Pendente — Drive

A organização automática dos playbacks no Drive **não foi implementada**: depende de
credencial do Alf. Desenho preparado: os arquivos já chegam com path estável
`<relatorio_id>/<arquivo>.mp3` no bucket `recital-playback`; a cópia para o Drive
(pasta por unidade × professor) será uma edge/cron nova que lê os mesmos paths —
nenhum dado adicional precisa ser coletado para isso.

## Não desfazer

- Um recital de vários dias = **um** `evento` — o LA Teacher resolve o evento por
  `evento_id`; um evento por dia deixaria o relatório deles órfão de contexto.
- `musica_link`/`playback_path` sincronizados levam `origem='professor'` — sobrescrever
  sem registrar origem apaga a trilha de divergência que a Revisão usa.
- O bucket `recital-playback` é do LA Teacher: o LA Report **lê** via edge com
  `fn_evento_pode_ver`, nunca escreve, nunca expõe URL pública.
- Certificado é por **apresentação** (pessoa × curso), não por pessoa.

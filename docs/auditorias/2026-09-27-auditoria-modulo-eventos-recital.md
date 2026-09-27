# Auditoria — Módulo de Eventos / Recital 2026

**Data:** 27/09/2026 · **Autor:** Devin (agente LA Report) · **Método:** leitura integral do
código (migrations, hooks, lib, telas), do handoff do módulo (`docs/handoffs/2026-09-21-
modulo-eventos-recital.md`), do lado LA Teacher (`D:\la-teacher`) e **medição no banco de
produção** (SELECT-only). Nenhuma linha foi alterada.

**Por que esta auditoria existe:** o Alf quer apresentar o módulo à equipe na semana que
vem e decidir o caminho para o recital 2026 (3 unidades, 1.000+ alunos), onde o professor
digita música/rider/links no **LA Teacher** e tudo aterrissa na **sala de eventos** do LA
Report — com upload de playback, relatórios pedagógicos, certificados e organização
automática no Drive. Este documento separa o que **existe de verdade** do que ainda é
visão, para a equipe não descobrir no dia da reunião que a planilha continua necessária.

---

## 1. Sumário executivo

O módulo é uma **base logística sólida e bem construída** — talvez a parte mais bem
arquitetada do repositório: modelo de dados com grão correto `(pessoa, curso)`, RLS por
unidade provada contra JWT real, RPCs transacionais, 151 testes com prova por mutação,
documentos de impressão com armadilhas de CSV/A4 já resolvidas. **Mas hoje ele é uma
ferramenta do ADM, não a sala de eventos integrada** que o Alf descreveu.

A distância entre o que existe e a visão não é de campos — são **quatro sistemas inteiros
ausentes**:

1. **Canal professor → evento.** Música, duração, rider e playback são digitados pelo ADM
   na aba Grade. Nada vem do LA Teacher — e no LA Teacher **também não existe** a tela onde
   o professor lançaria isso (a frente deles hoje é o relatório pedagógico, outra coisa).
2. **Mídia.** Não há coluna de link (YouTube/Spotify/música), não há upload de áudio, não
   há bucket, não há sincronização com Drive. `tem_playback` é só um booleano.
3. **Documentos da família dentro do evento.** Certificado existe mas é genérico e não
   persiste status (decisão de grão em aberto, §5 do handoff). Os relatórios pedagógicos
   moram **fechados** nas tabelas do LA Teacher — o módulo Eventos não enxerga nem o status
   deles. Nada "cai" na sala de eventos.
4. **Governança do evento.** `status` nunca sai de `rascunho` (não há UI de transição),
   não dá para editar/excluir evento nem renomear bloco pela tela, e não existe campo de
   **convidados** — item presente nas planilhas que a equipe usa hoje.

---

## 2. O que existe — inventário com estado real

### 2.1 Banco (migrations `20260918*`–`20260919*`, 7 arquivos)

| Peça | Existe | Estado |
|---|---|---|
| `evento` (um por unidade, `tipo='recital'`, status rascunho→concluído) | ✅ | Pronto; UI de transição ausente |
| `evento_bloco` (ordem, `inicio_manual`, `horario_inicial`) | ✅ | Pronto |
| `evento_apresentacao` UNIQUE `(evento, pessoa_chave, curso_id)` + musica, duracao, `tem_playback`, `observacao_mapa`, ordem | ✅ | Pronto — grão resolvido pela chave, não por `if` |
| `evento_item` (instrumento/equipamento, qtd, observação, por apresentação) | ✅ | Pronto |
| `evento_participacao` UNIQUE `(evento, pessoa_chave)` + status tri-state + `checkin_em` + `certificado_status` | ✅ | Pronto — `certificado_status` **nunca escrita** (decisão pendente) |
| RLS por unidade nas 5 tabelas (admin vê tudo) | ✅ | **Provado** com JWT real nos 3 perfis |
| `vw_evento_alunos_elegiveis` (pessoa × cursos de recital, sem banda, `motivo_sem_curso`, `faz_banda`) | ✅ | Pronto |
| `evento_apresentacao_adicionar_v1` (resolve matrícula DO curso, não a mais nova) | ✅ | Pronto |
| `evento_grade_reordenar_v1` / `evento_bloco_reordenar_v1` (aborta se qualquer linha pedida não gravou) | ✅ | Pronto |
| `intervalo_entre_blocos_segundos` configurável por evento | ✅ | Pronto; **sem UI de edição** |
| Permissões `eventos.ver` / `eventos.editar` | ✅ | Criadas e ativas; **nunca consultadas** |

### 2.2 Telas (`src/components/App/Eventos/`)

| Tela | Existe | Estado |
|---|---|---|
| `EventosPage` — lista + criar evento | ✅ | Funcional; **sem editar/excluir** (`excluirEvento` existe no hook, nenhuma tela chama) |
| `AlunosTab` — tri-state participação, KPIs, busca, marcar em lote | ✅ | Funcional. Filtros: **status** (todos/participa/indefinido/não) + "só sem alocar" + **busca livre** (que cobre nome/curso/professor). Não há dropdown dedicado de professor/curso |
| `GradeTab` — blocos, drag-and-drop (dnd-kit, bloco E apresentação), horário calculado, palco por bloco consolidado | ✅ | Funcional e denso — inclui detecção de conflito de horário |
| `SeletorApresentacao` — adicionar à grade agrupado por pessoa, quem disse "não" não aparece | ✅ | Funcional |
| `PalcoApresentacao` — itens + observação/mapa + flag playback | ✅ | Funcional; playback é **só a flag** |
| `PalcoTab` — folha de montagem consolidada (pico, não soma) | ✅ | Funcional |
| `RevisaoTab` — pendências + 3 documentos | ✅ | Funcional |
| `CheckinTab` — lista do dia por bloco, marca chegada | ✅ | Funcional; check-in é da **pessoa**, correto |
| `ModalNovoEvento` | ✅ | Funcional |
| `AvisoEmDesenvolvimento` | ✅ | **Desatualizado** — diz que revisão/impressão/check-in/certificado não existem; existem desde 21/09 |

### 2.3 Documentos (`src/lib/eventosImpressao.ts`, HTML→Blob→PDF / CSV)

Programação do público · folha de palco interna · folha por bloco · CSV da grade
(separador `;`, BOM UTF-8) · **certificado genérico** (A4 deitado, sem carga horária —
provisório por decisão do Hugo). Tudo escapado com `escapeHtml`, data por extenso sem
`new Date` (armadilha UTC resolvida), sem `print()` automático.

**Não gera:** PDF por aluno para gráfica em lote, pacote zipado, nada persistido servidor-
side — é gerado no navegador a cada clique (correto para o escopo atual).

### 2.4 Testes — 151 no módulo

`eventosAcesso` (8), `eventosElegibilidade` (12), `eventosHorario` (13), `eventosPalco`
(30), `eventosRevisao` (20), `eventosImpressao` (42), `eventosCheckin` (26) — **provados
por mutação**, não só escritos.

---

## 3. Estado medido em produção (27/09)

| Fato | Valor |
|---|---|
| Eventos criados | **2, ambos Barra** — `Recital 2026` (21, 28/11, Auditório Centro Metropolitano) e `teste` (11, 25/09 — **resíduo de desenvolvimento em produção**) |
| Campo Grande e Recreio | **Nenhum evento criado** |
| Participações (evento 21) | 263, **todas `participa`** (marcadas em lote) |
| Grade (evento 21) | 2 blocos, **2 apresentações** apenas — a grade é um esboço, o elenco real ainda não foi montado |
| Música/duração preenchidas | 2/2 · playback: 1 flag |
| Check-ins | 0 |
| Certificados | 0 (coluna nunca escrita, por decisão) |
| Buckets de Storage | 11 existem; **nenhum para recital/mídia** |

---

## 4. A integração LA Teacher que já existe (pouca gente sabe)

O LA Teacher (mesmo projeto Supabase) **já lê as nossas tabelas diretamente**, dentro de
funções `security definer` fechadas:

- `relatorio_anual` (tabela deles) tem `evento_id` apontando para `evento.id` (sem FK,
  deliberado — não travar merge/exclusão do nosso lado) e **`musica_recital` que espelha
  `evento_apresentacao.musica`** — a régua de cobrança deles exige a música lançada.
- `20260927180000/200000/220000/240000_*` leem `evento`, `evento_participacao` e
  `evento_apresentacao` para montar a carteira de relatórios por evento.
- `vw_emusys_historico_aula_aluno_v1` (entregue 27/09) é a base do dossiê de aulas.

Ou seja: **o canal de leitura LA Teacher → LA Report já existe e já é usado**. O que o
Alf descreveu é o canal inverso: o professor **escrevendo** no LA Teacher coisas que
hoje só o ADM escreve na Grade (música, duração, rider, playback) **mais** coisas que
não existem em lado nenhum (links, áudio).

⚠️ Atenção ao grão no desenho do canal inverso: `relatorio_anual` é por `(evento,
aluno_id)` = matrícula; a apresentação é por `(evento, pessoa_chave, curso_id)` = pessoa
× curso. O mesmo aluno com 2 cursos tem 2 apresentações e 1 relatório — o sync precisa
carregar `pessoa_chave` + `curso_id`, não `aluno_id`.

---

## 5. Gap contra a visão — pedido × realidade

| O que o Alf pediu | Existe hoje | O que falta |
|---|---|---|
| Professor digita **música** no LA Teacher | Campo `musica` existe — quem digita é o ADM | Tela no LA Teacher + RPC de escrita no nosso lado (ou espelho) |
| Professor digita **rider** (teclado, equipamentos) | `evento_item` existe — quem digita é o ADM | Origem do item (`origem='professor'`) + canal de escrita |
| Professor informa **duração** da música | `duracao_segundos` existe | Mesmo canal de escrita |
| **Link da música / YouTube / Spotify** | ❌ nada | Coluna(s) + validação de URL + exibição na grade/folha |
| **Upload de playback** (MP3/WAV) | ❌ nada | Bucket privado + tabela `evento_midia` (path, tipo, tamanho, quem subiu) + signed URL + player na aba Palco |
| **Play na folha de palco** / conferência do áudio | Lista "usa playback" existe | O arquivo real + quem aperta play |
| **Relatórios caindo na sala de eventos** | ❌ nada — `relatorio_anual` é fechada e invisível aqui | Contrato de leitura (RPC/view nossa consumida por eles, ou espelho de status) + aba/card na Revisão |
| **Certificado pré-definido por aluno** | Doc genérico existe | Definir template final; decidir grão (pessoa×curso — §5 do handoff); persistir `certificado_status`; lote de PDFs para gráfica |
| **Download dos PDFs** (certificados + relatórios) | Certificado: HTML→PDF no navegador, um doc com todos | Relatórios: depende do lado deles + pacote em lote (zip?) |
| **Número de convidados** (planilha atual) | ❌ nada — nem coluna | `convidados` em `evento_participacao` + total na folha |
| Filtros por **professor/instrumento/participa** | Status ✅; professor/curso só via busca livre | Selects dedicados (1.000+ alunos: busca pura escala mal) |
| Organização em **blocos por minutagem** | ✅ completo — duração por apresentação, soma por bloco, intervalo configurável, conflito de horário | Falta só a UI do "quanto tempo este bloco dura / quantos cabem" já existe (chip de duração no cartão) |
| **Sync automático LA Teacher → evento** | ❌ | O canal de escrita (§6) |
| **Drive automático** por professor | ❌ | Edge/n8n pós-upload; pasta por professor/evento |
| Recital das **3 unidades** | Modelo por unidade ✅ | **Criar os eventos de CG e Recreio** (só Barra existe) |

---

## 6. Achados além do gap (para a reunião)

1. 🔴 **Card "participantes" conta TODOS os status** — `evento_participacao(count)` sem
   filtro: um evento com 40 "não participa" mostra "40 participantes" a mais. Hoje o
   Recital 2026 não sofre (todos `participa`), mas o card mente no primeiro "não".
2. 🔴 **`status` do evento nunca transiciona** — `rascunho` para sempre; sem UI nem regra.
   "Publicado" não significa nada ainda — bom momento para definir o que muda (trava edição?
   libera impressão final?).
3. 🟠 **`AvisoEmDesenvolvimento` desatualizado** — lista como ausentes recursos que já
   estão no ar; a equipe vai ler e achar que a tela é mais crua do que é.
4. 🟠 **Sem editar/excluir evento nem renomear bloco** — o evento "teste" (id 11) está
   preso em produção sem caminho de remoção pela UI.
5. 🟠 **Duração padrão e intervalo entre blocos** são configuráveis no banco, editáveis só
   por SQL — a coordenação vai pedir isso na primeira semana.
6. 🟡 `intervalo_entre_apresentacoes_segundos` existe só como constante (300s) — se algum
   evento precisar de troca mais rápida/lenta, vira coluna.
7. 🟡 **Check-in funciona no celular** (mesmo app responsivo), mas é tela pensada para
   desktop — testar na porta com celular de verdade antes do dia.
8. 🟡 **`escapeHtml` duplicado** entre `ModalFichaAluno` e `eventosImpressao` — dívida
   **deliberada e documentada**, não resolver sem ler §6 do handoff.
9. 🟡 O isolamento do módulo (nada vaza para KPI/presença) é **consequência medida, não
   trava** — qualquer view futura que junte recital+frequência quebra isso em silêncio.
10. 🟡 `certificado_status`: coluna parada esperando a decisão "quantos certificados para
    quem faz 2 cursos" — decidir antes do sync de mídia, porque o mesmo dilema (grão
    pessoa vs curso) aparece nos links/playbacks.

---

## 7. Arquitetura proposta para a visão (para validar antes de escrever código)

Mesmo projeto Supabase → **não precisa de API entre os dois apps**. O canal é SQL com
dono declarado:

- **Contrato de escrita (LA Teacher → LA Report):** RPC fechada nossa, ex.
  `evento_apresentacao_detalhes_v1(evento_id, pessoa_chave, curso_id, musica,
  duracao_segundos, links, origem='professor')`, executada como `service_role` pelas
  funções deles — espelhando como eles já nos leem. Dono do campo vira explícito
  (`musica_origem`: professor vs ADM), senão o ADM e o professor se sobrescrevem sem
  saber.
- **Rider do professor:** mesmos `evento_item` + coluna `origem` ('curso'/'adm'/
  'professor') — hoje "do curso" é derivado, não persistido; para o professor precisa
  persistir quem pediu.
- **Mídia:** tabela `evento_midia` (apresentacao_id, tipo='audio'|'youtube'|'spotify'|
  'musica_link', url ou storage_path, enviado_por) + bucket privado `evento-midia` +
  signed URLs. Drive é **downstream**: edge function (ou n8n) que copia
  `storage_path` → `Drive/<Evento>/<Professor>/<Aluno>.mp3` após o upload — nunca o
  Drive como verdade (o banco é).
- **Relatórios na sala:** RPC deles `relatorio_anual_resumo_evento(evento_id)` devolvendo
  (aluno, status, aprovado_em) — a Revisão ganha um painel "relatórios: 87/263 aprovados"
  sem importar os textos; o download do PDF fica uma segunda etapa (gerar lá ou cá,
  decidir com eles).
- **Certificado:** fechar a decisão de grão primeiro; depois template final + gerar lote
  (HTML multi-página já resolve p/ gráfica; se quiserem 1 PDF por aluno, aí sim entra
  geração server-side).
- **Convidados:** `convidados int` em `evento_participacao` (é da pessoa, como check-in)
  + soma na folha/check-in + pendência "convidados não informados".

### O que o agente do LA Teacher precisa responder (rascunho do prompt para o Alf)

1. Onde o professor lança música/duração/rider/links hoje ou onde vai lançar — existe tela
   planejada? Em qual fluxo (o relatório anual? uma ficha de recital separada)?
2. Eles escrevem via service_role direto ou preferem chamar uma RPC nossa? (Eles já nos
   leem como security definer.)
3. Upload de áudio: eles já sobem `voz_audio_path` no Storage — mesmo bucket? qual policy?
4. `relatorio_anual` é por aluno/matrícula: como resolvem pessoa × curso na hora de
   devolver a música para 2 apresentações do mesmo aluno?
5. O que já existe de geração de PDF no lado deles (o relatório impresso) — reaproveitável
   para o "download na sala de eventos"?

---

## 8. Roadmap sugerido (ordem de ataque para o recital 2026)

| Fase | Conteúdo | Desbloqueia |
|---|---|---|
| 0 — limpeza (dias) | Criar eventos CG e Recreio; remover "teste"; corrigir contagem do card; atualizar `AvisoEmDesenvolvimento`; UI de editar evento (data, local, duração padrão, intervalo, renomear bloco, transição de status) | A equipe pode abandonar a planilha para o que já existe |
| 1 — convidados + filtros | `convidados`, selects professor/curso, consolidação 3 unidades | Reunião com a equipe |
| 2 — canal professor | Prompt pro LA Teacher; RPC de escrita; `origem` nos campos/itens; campos de link | Professor deixa de ditar rider por WhatsApp |
| 3 — mídia | Bucket, `evento_midia`, upload, player na folha de palco | Playback real |
| 4 — relatórios na sala | RPC deles + painel na Revisão + download | Coordenação acompanha aprovação sem abrir o LA Teacher |
| 5 — certificado | Decisão de grão + template + status + lote | Gráfica |
| 6 — Drive | Edge/n8n pós-upload | Organização automática (pode vir antes se for prioridade) |
| 7 — virada RBAC | `podeVerEventos` → `hasPermission('eventos.ver')` (já preparado) | Produção de verdade |

Fases 0–2 são o que decide "a equipe larga a planilha ou não" na reunião da semana que vem.

---

## 9. Decisões que precisam do Alf/Hugo (não de código)

1. **Quem digita música/rider quando professor e ADM divergem?** (sugiro: última escrita
   vence com `origem` visível, e a Revisão acusa divergência recente)
2. **Certificado: um por pessoa (com os cursos no repertório) ou um por curso?**
3. **Convidados** entram no MVP? (existe na planilha deles; hoje zero suporte)
4. **Drive**: pasta por professor × por unidade × por bloco? E Drive é espelho ou
   destino final do arquivo?
5. **"Publicado"** no status do evento significa o quê — trava edição? libera impressão?
6. Recital 2026 da Barra está **28/11** — confere com as datas do calendário?

---

## 10. Não tocar (invariantes que este módulo já resolveu e custaram medição)

- `pessoa_chave` derivada por trigger — nunca escrita à mão.
- UNIQUE `(evento_id, pessoa_chave, curso_id)` — é ela que implementa "2 cursos = 2
  apresentações".
- Horário **calculado**, nunca persistido — duas verdades na grade não se recalculam.
- RLS filtra, não recusa — **toda escrita nova** nessas tabelas precisa `.select('id')`
  e conferir linhas afetadas (caso contrário, cross-unit vira sucesso mudo).
- `marcarChegada` lê `evento_participacao` direto (não a view de elegíveis) — aluno que
  saiu da escola continua fazendo check-in.
- Palco por bloco é **pico**, não soma — apresentações são sequenciais.
- `instrumentoDoCurso` fora do mapa devolve `null`, nunca inventa item.
- CSV: `;` + BOM UTF-8; data por extenso sem `new Date`; docs abrem para ver, sem
  `print()` automático; impressão por Blob URL.

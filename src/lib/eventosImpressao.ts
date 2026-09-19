/**
 * Programacao impressa do recital — LAPE-39, fase 6.
 *
 * Sao DUAS pecas com publicos diferentes, e por isso dois documentos:
 *
 *   • **Programacao** — vai para a mao do publico. Aluno, curso, musica e professor, na
 *     ordem em que sobem ao palco.
 *   • **Folha de palco** — fica com a producao. O que montar, playback, mapa. Nomes de
 *     alunos aparecem como referencia, nao como destaque.
 *
 * Juntar as duas num documento so obrigaria a producao a caçar a informacao dela no meio da
 * programacao, e entregaria ao publico um papel cheio de "2x estante".
 *
 * ⚠️ Geracao PURA: devolve string, nao abre janela. E o que permite testar o conteudo sem
 * navegador — `abrirParaImpressao` (em `lib/html.ts`) faz o resto.
 */

import {
  calcularHorariosDaGrade,
  consolidarItensDoPalco,
  type ApresentacaoParaPalco,
  type EventoParaCalculo,
  type ItemDePalco,
} from './eventos';

/**
 * Escapa texto para interpolar em HTML.
 *
 * ⚠️ Existe uma funcao equivalente, PRIVADA, dentro de `ModalFichaAluno.tsx`, que imprime o
 * relatorio pedagogico. Duplicar foi decisao consciente (19/09/2026): tornar aquela publica
 * mudaria o contrato de um arquivo de outro modulo, com impressao que vai para pais e
 * professores, para economizar sete linhas. O momento de unificar e quando esta aqui estiver
 * estavel — e ai o movimento se decide com quem cuida daquela tela.
 *
 * ⚠️ Esta versao escapa tambem o APOSTROFO, que a de la nao escapa: sem ele um nome como
 * `D'Angelo` quebra atributo delimitado por aspas simples. Escapar a mais nunca muda o que o
 * navegador renderiza; escapar de menos abre injecao — e o nome vem do banco.
 */
function escapeHtml(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Abre o documento numa aba nova, para a pessoa VER.
 *
 * ⚠️ Nao imprime nada: quem decide isso e o botao dentro do proprio documento. Abrir e
 * conferir e o caso comum — imprimir e o eventual.
 *
 * ⚠️ Via **Blob URL**, nunca `window.open('', ...)` + `document.write`: numa janela
 * `about:blank` o `load` ja disparou antes de o documento existir, e os scripts e estilos se
 * comportam de forma imprevisivel. Com o Blob o navegador carrega um documento normal. E o
 * padrao das outras impressoes do sistema.
 *
 * ⚠️ O `revokeObjectURL` vai num timeout longo: revogar antes de a janela carregar mata o
 * proprio documento que se quer mostrar.
 *
 * Devolve `false` quando o navegador bloqueou o pop-up — cabe ao chamador avisar, porque a
 * mensagem certa depende do que estava sendo aberto.
 */
export function abrirDocumento(html: string): boolean {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, '_blank');
  if (!janela) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export interface ApresentacaoParaImprimir {
  id: number;
  ordem: number;
  duracao_segundos: number | null;
  aluno_nome: string;
  curso_nome: string | null;
  professor_nome: string | null;
  musica: string | null;
  tem_playback: boolean;
  observacao_mapa: string | null;
  itens: ItemDePalco[];
}

export interface BlocoParaImprimir {
  id: number;
  nome: string;
  ordem: number;
  horario_inicial: string | null;
  inicio_manual: boolean;
  apresentacoes: ApresentacaoParaImprimir[];
}

export interface DadosDaImpressao {
  evento: EventoParaCalculo & {
    titulo: string;
    data_evento: string;
    local: string | null;
    unidade_nome: string | null;
  };
  blocos: BlocoParaImprimir[];
  /**
   * Origem do app (`window.location.origin`), para montar a URL da logo.
   *
   * ⚠️ Vem de FORA de proposito: ler `window` aqui dentro tornaria a geracao impossivel de
   * testar em Node, e e justamente o conteudo do papel que precisa de teste. Ausente, o
   * documento sai sem logo — e degrada, nao quebra.
   */
  origem?: string;
}

/** 'AAAA-MM-DD' -> '21 de setembro de 2026'. */
function dataPorExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(iso);
  if (!m) return iso;
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  // ⚠️ Sem `new Date(iso)`: a string 'AAAA-MM-DD' e interpretada como UTC, e num fuso
  // negativo o dia volta um. O recital de 21/09 sairia impresso como 20/09 — e ninguem
  // confere a data do papel que ja foi para a grafica.
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1] ?? '?'} de ${m[1]}`;
}

const ESTILO = `
  :root { --marca: #b45309; --marca-escura: #7c2d12; --tinta: #1f2937; --suave: #6b7280; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: var(--tinta); margin: 0; background: #f1f5f9; font-size: 12px; line-height: 1.55; }

  /* A folha: um retangulo branco centrado na tela, do tamanho de uma pagina. Na impressao
     ela perde sombra e margem e vira a propria pagina. */
  .folha { background: #fff; max-width: 820px; margin: 22px auto 40px; padding: 34px 40px;
           box-shadow: 0 1px 3px rgba(15,23,42,.1), 0 12px 32px rgba(15,23,42,.08);
           border-radius: 4px; }

  /* ── barra de acoes: existe so na tela ── */
  .acoes { position: sticky; top: 0; z-index: 10; background: #0f172a; color: #e2e8f0;
           padding: 10px 0; }
  /* Container interno com a MESMA largura da folha: sem ele os botoes encostam na borda da
     janela e a barra parece de outro documento. */
  .acoes .dentro { max-width: 820px; margin: 0 auto; padding: 0 16px;
                   display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .acoes .qual { font-size: 12.5px; font-weight: 600; margin-right: auto; }
  .acoes .qual span { display: block; font-weight: 400; font-size: 11px; color: #94a3b8; }
  .acoes button { font: inherit; font-size: 12.5px; border-radius: 6px; padding: 7px 14px;
                  cursor: pointer; border: 1px solid transparent; }
  .acoes .pdf { background: #b45309; color: #fff; font-weight: 600; }
  .acoes .pdf:hover { background: #92400e; }
  .acoes .imprimir { background: transparent; color: #e2e8f0; border-color: #334155; }
  .acoes .imprimir:hover { background: #1e293b; }
  .dica { width: 100%; font-size: 11px; color: #94a3b8; margin: -2px 0 0; }

  /* ── cabecalho ── */
  .topo { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;
          padding-bottom: 14px; border-bottom: 3px solid var(--marca); }
  .topo img { height: 44px; width: auto; object-fit: contain; }
  .topo .doc { text-align: right; font-size: 10.5px; color: var(--suave);
               text-transform: uppercase; letter-spacing: .07em; }
  h1 { font-size: 24px; color: var(--marca-escura); text-align: center; margin: 24px 0 5px;
       letter-spacing: -.01em; }
  .meta { text-align: center; color: var(--suave); font-size: 12px; margin-bottom: 26px; }
  .meta strong { color: #374151; }

  /* ── conteudo ── */
  h2 { font-size: 13.5px; color: var(--marca-escura); margin: 24px 0 8px; padding-bottom: 6px;
       border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between;
       align-items: baseline; gap: 12px; }
  h2 .hora { font-weight: 500; font-size: 12px; color: var(--marca);
             font-variant-numeric: tabular-nums; }
  .bloco { page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  tr { page-break-inside: avoid; }
  td { padding: 7px 6px; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
  td.n { width: 30px; color: #cbd5e1; text-align: right; font-variant-numeric: tabular-nums;
         font-size: 11px; padding-top: 8px; }
  td.hora { width: 52px; color: var(--marca); font-variant-numeric: tabular-nums;
            font-size: 11px; padding-top: 8px; }
  .aluno { font-weight: 600; font-size: 12.5px; }
  .curso { color: var(--marca); font-size: 11px; }
  .musica { color: #374151; font-style: italic; }
  .prof { color: var(--suave); font-size: 10.5px; }
  .vazio { color: #9ca3af; font-style: italic; padding: 10px 6px; }
  .intervalo { text-align: center; color: #9ca3af; font-size: 9.5px; letter-spacing: .12em;
               text-transform: uppercase; margin: 14px 0; position: relative; }
  .intervalo::before, .intervalo::after { content: ''; position: absolute; top: 50%;
    width: calc(50% - 46px); height: 1px; background: #e5e7eb; }
  .intervalo::before { left: 0; } .intervalo::after { right: 0; }
  .chips span { display: inline-block; background: #fffbeb; border: 1px solid #fde68a;
                border-radius: 4px; padding: 3px 8px; margin: 0 5px 5px 0; font-size: 11px;
                color: #78350f; }
  .chips span.derivado { background: #fff; border-style: dashed; border-color: #e5e7eb;
                         color: var(--suave); }
  .obs { border-left: 3px solid #fde68a; padding: 3px 0 3px 10px; margin: 6px 0 10px; }
  .obs .quem { font-size: 11.5px; }
  .obs p { margin: 2px 0 0; color: #4b5563; font-size: 11px; }
  .rodape { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb;
            color: #9ca3af; font-size: 10px; display: flex; justify-content: space-between;
            gap: 10px; }

  @media print {
    body { background: #fff; }
    .acoes { display: none !important; }
    .folha { max-width: none; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
    @page { margin: 14mm 12mm; }
  }
`;

/**
 * Esqueleto comum dos dois documentos.
 *
 * ⚠️ **Nao dispara a impressao sozinho.** A versao anterior chamava `window.print()` no
 * `onload` e a pessoa que so queria CONFERIR a programacao caia num dialogo de impressao que
 * nao pediu. Abrir e ver e o caso comum; imprimir e o eventual.
 *
 * A barra de acoes vive dentro do proprio documento e some no `@media print` — assim ela nao
 * aparece no papel e nao exige uma tela intermediaria no app.
 */
function moldura(titulo: string, dados: DadosDaImpressao, corpo: string, rodapeExtra = ''): string {
  const { evento } = dados;
  const linhaMeta = [
    evento.unidade_nome ? `<strong>${escapeHtml(evento.unidade_nome)}</strong>` : null,
    dataPorExtenso(evento.data_evento),
    evento.horario_inicio ? `às ${escapeHtml(evento.horario_inicio.slice(0, 5))}` : null,
    evento.local ? escapeHtml(evento.local) : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  // Versao "light" da marca: as logos usadas nas telas do app tem texto branco e sumiriam
  // num documento de fundo branco.
  const logo = dados.origem
    ? `<img src="${escapeHtml(dados.origem)}/logo-la-music-light-completa.svg" alt="LA Music"
            onerror="this.style.display='none'" />`
    : '<div></div>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(evento.titulo)} — ${escapeHtml(titulo)}</title>
  <style>${ESTILO}</style>
</head>
<body>
  <div class="acoes">
    <div class="dentro">
      <div class="qual">
        ${escapeHtml(titulo)}
        <span>${escapeHtml(evento.titulo)}</span>
      </div>
      <button type="button" class="pdf" onclick="window.print()">Salvar em PDF</button>
      <button type="button" class="imprimir" onclick="window.print()">Imprimir</button>
      <p class="dica">
        Os dois abrem a mesma janela: para gerar o arquivo, escolha
        <strong>Salvar como PDF</strong> no campo &ldquo;Destino&rdquo;.
      </p>
    </div>
  </div>

  <div class="folha">
    <div class="topo">
      ${logo}
      <div class="doc">${escapeHtml(titulo)}</div>
    </div>

    <h1>${escapeHtml(evento.titulo)}</h1>
    <div class="meta">${linhaMeta}</div>

    ${corpo}

    <div class="rodape">
      <span>LA Music Report</span>
      <span>${rodapeExtra ? escapeHtml(rodapeExtra) : ''}</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * A programacao que vai para o publico.
 *
 * ⚠️ Bloco VAZIO nao sai: um titulo sem nada embaixo no papel do publico parece que alguem
 * foi cortado da apresentacao. Na tela ele aparece como pendencia, que e onde a informacao
 * serve — o papel nao e lugar de expor trabalho pela metade.
 */
export function gerarProgramaHtml(dados: DadosDaImpressao): string {
  const horarios = calcularHorariosDaGrade(dados.evento, dados.blocos);
  const comApresentacao = dados.blocos.filter((b) => b.apresentacoes.length > 0);

  if (comApresentacao.length === 0) {
    return moldura(
      'Programação',
      dados,
      '<p class="vazio">A grade ainda não tem apresentações.</p>',
    );
  }

  const corpo = comApresentacao
    .map((bloco, i) => {
      const h = horarios.find((x) => x.blocoId === bloco.id);
      const intervalo =
        i > 0 && h && h.intervaloAntesSegundos !== null && h.intervaloAntesSegundos > 0
          ? `<div class="intervalo">intervalo</div>`
          : '';

      const linhas = [...bloco.apresentacoes]
        .sort((a, b) => a.ordem - b.ordem || a.id - b.id)
        .map((ap, idx) => {
          const hora = h?.apresentacoes.find((x) => x.id === ap.id)?.inicio ?? '';
          return `<tr>
            <td class="n">${idx + 1}</td>
            <td class="hora">${escapeHtml(hora)}</td>
            <td>
              <div><span class="aluno">${escapeHtml(ap.aluno_nome)}</span>
                ${ap.curso_nome ? ` &middot; <span class="curso">${escapeHtml(ap.curso_nome)}</span>` : ''}</div>
              ${ap.musica ? `<div class="musica">${escapeHtml(ap.musica)}</div>` : ''}
              ${ap.professor_nome ? `<div class="prof">Prof. ${escapeHtml(ap.professor_nome)}</div>` : ''}
            </td>
          </tr>`;
        })
        .join('');

      return `${intervalo}
        <div class="bloco">
          <h2>${escapeHtml(bloco.nome)}${h ? `<span class="hora">${h.inicio} – ${h.fim}</span>` : ''}</h2>
          <table>${linhas}</table>
        </div>`;
    })
    .join('');

  const total = comApresentacao.reduce((s, b) => s + b.apresentacoes.length, 0);
  return moldura(
    'Programação',
    dados,
    corpo,
    `${total} ${total === 1 ? 'apresentação' : 'apresentações'}`,
  );
}

/**
 * A folha que fica com a producao.
 *
 * ⚠️ Aqui o bloco vazio SAI, ao contrario da programacao: quem monta precisa saber que o
 * bloco existe e nao pede nada, senao vai procurar a folha que falta.
 */
export function gerarFolhaDePalcoHtml(dados: DadosDaImpressao): string {
  const horarios = calcularHorariosDaGrade(dados.evento, dados.blocos);

  const paraPalco = (bs: BlocoParaImprimir[]): ApresentacaoParaPalco[] =>
    bs.flatMap((b) => b.apresentacoes.map((a) => ({ cursoNome: a.curso_nome, itens: a.itens })));

  const chips = (itens: ReturnType<typeof consolidarItensDoPalco>) =>
    itens.length === 0
      ? '<p class="vazio">nada registrado</p>'
      : `<div class="chips">${itens
          .map(
            (i) =>
              `<span class="${i.doCurso ? 'derivado' : ''}">${i.quantidade}&times; ${escapeHtml(
                i.nome,
              )}</span>`,
          )
          .join('')}</div>`;

  const geral = consolidarItensDoPalco(paraPalco(dados.blocos));

  const corpoBlocos = dados.blocos
    .map((bloco) => {
      const h = horarios.find((x) => x.blocoId === bloco.id);
      const itens = consolidarItensDoPalco(paraPalco([bloco]));

      const playback = bloco.apresentacoes.filter((a) => a.tem_playback);
      const mapas = bloco.apresentacoes.filter((a) => (a.observacao_mapa ?? '').trim() !== '');

      return `<div class="bloco">
        <h2>${escapeHtml(bloco.nome)}${h ? `<span class="hora">${h.inicio} – ${h.fim}</span>` : ''}</h2>
        ${chips(itens)}
        ${
          playback.length > 0
            ? `<p class="prof"><strong>Playback:</strong> ${playback
                .map((a) => escapeHtml(a.aluno_nome))
                .join(', ')}</p>`
            : ''
        }
        ${mapas
          .map(
            (a) => `<div class="obs">
              <div class="quem"><span class="aluno">${escapeHtml(a.aluno_nome)}</span>
                ${a.curso_nome ? ` &middot; <span class="curso">${escapeHtml(a.curso_nome)}</span>` : ''}</div>
              <p>${escapeHtml(a.observacao_mapa)}</p>
            </div>`,
          )
          .join('')}
      </div>`;
    })
    .join('');

  const corpo = `
    <div class="bloco">
      <h2>O recital inteiro precisa de</h2>
      ${chips(geral)}
      <p class="prof">O número é quanto precisa existir ao mesmo tempo — as apresentações são
      uma depois da outra, então o mesmo instrumento serve a várias. Item tracejado vem do
      curso do aluno.</p>
    </div>
    ${corpoBlocos}`;

  return moldura('Folha de palco', dados, corpo, 'uso interno da produção');
}


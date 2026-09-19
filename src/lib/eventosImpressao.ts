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
 * Abre o HTML numa aba nova e dispara a impressao.
 *
 * ⚠️ Via **Blob URL**, nunca `window.open('', ...)` + `document.write`: numa janela
 * `about:blank` o evento `load` JA DISPAROU antes de o `<script>` registrar o `onload`,
 * entao a impressao nunca acontece e a pagina pode ficar em branco. Com o Blob o navegador
 * carrega um documento normal. E o padrao das outras impressoes do sistema.
 *
 * ⚠️ O `revokeObjectURL` vai num timeout longo: revogar antes de a janela carregar mata o
 * proprio documento que se quer imprimir.
 *
 * Devolve `false` quando o navegador bloqueou o pop-up — cabe ao chamador avisar, porque a
 * mensagem certa depende do que estava sendo impresso.
 */
export function abrirParaImpressao(html: string): boolean {
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
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: #1f2937; margin: 0; padding: 28px 32px; font-size: 12px; line-height: 1.5; }
  .topo { border-bottom: 3px solid #b45309; padding-bottom: 12px; margin-bottom: 20px; }
  .topo h1 { font-size: 22px; color: #7c2d12; margin: 0 0 4px; }
  .topo .meta { color: #6b7280; font-size: 11.5px; }
  .topo .meta strong { color: #374151; }
  h2 { font-size: 14px; color: #7c2d12; margin: 22px 0 8px; padding-bottom: 5px;
       border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
  h2 .hora { font-weight: 400; font-size: 12px; color: #b45309; }
  .bloco { page-break-inside: avoid; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 6px; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
  td.n { width: 28px; color: #9ca3af; text-align: right; font-variant-numeric: tabular-nums; }
  td.hora { width: 48px; color: #b45309; font-variant-numeric: tabular-nums; font-size: 11px; }
  .aluno { font-weight: 600; }
  .curso { color: #b45309; font-size: 11px; }
  .musica { color: #374151; }
  .prof { color: #6b7280; font-size: 10.5px; }
  .vazio { color: #9ca3af; font-style: italic; padding: 8px 6px; }
  .intervalo { text-align: center; color: #9ca3af; font-size: 10px; letter-spacing: 0.08em;
               text-transform: uppercase; margin: 10px 0; }
  .chips span { display: inline-block; border: 1px solid #e5e7eb; border-radius: 4px;
                padding: 2px 7px; margin: 0 4px 4px 0; font-size: 11px; }
  .chips span.derivado { border-style: dashed; color: #6b7280; }
  .obs { border-left: 3px solid #e5e7eb; padding: 2px 0 2px 9px; margin: 4px 0 8px; }
  .obs .quem { font-size: 11px; }
  .obs p { margin: 2px 0 0; color: #4b5563; font-size: 11px; }
  .rodape { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb;
            color: #9ca3af; font-size: 10px; text-align: center; }
  @media print { body { padding: 14px 18px; } }
`;

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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(evento.titulo)} — ${escapeHtml(titulo)}</title>
  <style>${ESTILO}</style>
</head>
<body>
  <div class="topo">
    <h1>${escapeHtml(evento.titulo)}</h1>
    <div class="meta">${linhaMeta}</div>
    <div class="meta">${escapeHtml(titulo)}</div>
  </div>
  ${corpo}
  <div class="rodape">
    LA Music Report${rodapeExtra ? ` &middot; ${rodapeExtra}` : ''}
  </div>
  <script>
    // Espera o documento carregar antes do dialogo de impressao.
    window.onload = function () { setTimeout(function () { window.print(); }, 250); };
  </script>
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


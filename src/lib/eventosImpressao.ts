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
 * Os dois aceitam `apenasBlocoId` e imprimem um bloco isolado, mantendo o horario real dele
 * dentro do recital — e o "PDF por bloco" que o plano previa e o Arthur descreveu como
 * "impressao de fichas de palco para os roadies, sonoplastia e equipe de montagem".
 *
 * ⚠️ Geracao PURA: devolve string, nao abre janela. E o que permite testar o conteudo sem
 * navegador — `abrirDocumento`, logo abaixo, faz o resto.
 */

import {
  agruparEmNumeros,
  calcularHorariosDaGrade,
  consolidarItensDoPalco,
  palcoDosNumeros,
  rotuloIdade,
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

/**
 * Baixa um arquivo gerado no proprio navegador.
 *
 * Mesma tecnica do documento (Blob), com `download` no link em vez de abrir aba.
 */
export function baixarArquivo(nomeDoArquivo: string, conteudo: string, tipo: string): void {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export interface ApresentacaoParaImprimir {
  id: number;
  ordem: number;
  duracao_segundos: number | null;
  aluno_nome: string;
  curso_nome: string | null;
  professor_nome: string | null;
  /**
   * Outro professor que sobe ao palco com o aluno (substituto ou acompanhante). Não troca o
   * professor do aluno: a programação mostra os dois, a folha de palco diz quem sobe.
   */
  professor_palco_nome?: string | null;
  musica: string | null;
  musica_artista?: string | null;
  /** Link externo da musica (YouTube/Spotify) — sai na folha de palco e na planilha. */
  musica_link?: string | null;
  /** Objeto no bucket `recital-playback` — sai na folha de palco e na planilha. */
  playback_path?: string | null;
  tem_playback: boolean;
  observacao_mapa: string | null;
  itens: ItemDePalco[];
  /** Mesmo `grupo_id` = sobem juntos no mesmo numero: uma linha so na programacao. */
  grupo_id?: string | null;
  /** Idade de hoje (a mesma da aba Alunos). `null`/ausente = sem data de nascimento. */
  idade?: number | null;
  /** Kids (LAMK) ou School — decide o logo do papel. Ausente = não sabemos (não conta). */
  marca?: MarcaDoAluno | null;
}

/**
 * Marca do aluno para o papel do recital. LAMK (`alunos.classificacao`) = LA Music Kids;
 * qualquer outra coisa sai como School.
 *
 * ⚠️ `null`/vazio devolve `null`, não School: aluno de outra unidade chega sem a
 * classificação (a RLS esconde o cadastro), e chutar School pintaria o logo errado num
 * documento de bebês. Quem não sabe não vota no logo.
 */
export type MarcaDoAluno = 'kids' | 'school';
export function marcaDaClassificacao(classificacao: string | null | undefined): MarcaDoAluno | null {
  const c = (classificacao ?? '').trim().toUpperCase();
  if (c === '') return null;
  return c === 'LAMK' ? 'kids' : 'school';
}

const LOGO_DA_MARCA: Record<MarcaDoAluno, { arquivo: string; alt: string }> = {
  // Versões "light" (texto escuro): as logos das telas do app têm texto branco e sumiriam
  // num documento de fundo branco.
  school: { arquivo: 'logo-la-music-light-completa.svg', alt: 'LA Music' },
  kids: { arquivo: 'logo-la-music-kids-light-completa.svg', alt: 'LA Music Kids' },
};

function imgDaMarca(origem: string, marca: MarcaDoAluno): string {
  const { arquivo, alt } = LOGO_DA_MARCA[marca];
  return `<img src="${escapeHtml(origem)}/${arquivo}" alt="${alt}"
            onerror="this.style.display='none'" />`;
}

/**
 * Logos do cabeçalho conforme QUEM está no recorte impresso: só Kids → Kids; só School (ou
 * ninguém com marca conhecida) → School; os dois → as duas lado a lado. Antes saía sempre o
 * da School, inclusive na folha de um bloco só de musicalização de bebês.
 */
export function marcasDoRecorte(blocos: BlocoParaImprimir[]): MarcaDoAluno[] {
  const presentes = new Set<MarcaDoAluno>();
  for (const b of blocos) for (const a of b.apresentacoes) if (a.marca) presentes.add(a.marca);
  if (presentes.size === 0) return ['school'];
  return (['school', 'kids'] as const).filter((m) => presentes.has(m));
}

export interface BlocoParaImprimir {
  id: number;
  nome: string;
  ordem: number;
  /** Dia do bloco quando o recital ocupa mais de uma data; null = data do evento. */
  data?: string | null;
  horario_inicial: string | null;
  inicio_manual: boolean;
  apresentacoes: ApresentacaoParaImprimir[];
}

export interface DadosDaImpressao {
  evento: EventoParaCalculo & {
    titulo: string;
    data_evento: string;
    /** Ultimo dia do recital quando ele ocupa mais de uma data. */
    data_fim?: string | null;
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

/** 'AAAA-MM-DD' -> '14/11', a forma curta que aparece ao lado do nome do bloco. */
function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(iso);
  return m ? `${Number(m[3])}/${Number(m[2])}` : iso;
}

/**
 * '2026-11-13' + '2026-11-15' -> '13 a 15 de novembro de 2026'. Sem data_fim, e a data
 * sozinha como sempre foi. Meses distintos escrevem os dois por extenso.
 */
function periodoPorExtenso(inicio: string, fim: string | null | undefined): string {
  if (!fim || fim === inicio) return dataPorExtenso(inicio);
  const a = /^(\d{4})-(\d{2})-(\d{2})/u.exec(inicio);
  const b = /^(\d{4})-(\d{2})-(\d{2})/u.exec(fim);
  if (!a || !b) return `${dataPorExtenso(inicio)} a ${dataPorExtenso(fim)}`;
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const mesA = meses[Number(a[2]) - 1] ?? '?';
  const mesB = meses[Number(b[2]) - 1] ?? '?';
  if (a[1] === b[1] && a[2] === b[2]) {
    return `${Number(a[3])} a ${Number(b[3])} de ${mesA} de ${a[1]}`;
  }
  return `${Number(a[3])} de ${mesA} a ${Number(b[3])} de ${mesB} de ${b[1]}`;
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
  .topo .logos { display: flex; align-items: center; gap: 16px; }
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
function moldura(
  titulo: string,
  dados: DadosDaImpressao,
  corpo: string,
  rodapeExtra = '',
  marcas: MarcaDoAluno[] = ['school'],
): string {
  const { evento } = dados;
  const linhaMeta = [
    evento.unidade_nome ? `<strong>${escapeHtml(evento.unidade_nome)}</strong>` : null,
    periodoPorExtenso(evento.data_evento, evento.data_fim),
    evento.horario_inicio ? `às ${escapeHtml(evento.horario_inicio.slice(0, 5))}` : null,
    evento.local ? escapeHtml(evento.local) : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  const origem = dados.origem;
  const logo = origem
    ? `<div class="logos">${marcas.map((m) => imgDaMarca(origem, m)).join('')}</div>`
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
 * Recorta UM bloco mantendo o horario dos demais.
 *
 * ⚠️ Filtrar os blocos ANTES do calculo faria o bloco 3 comecar as 09:00, porque o
 * encadeamento e `inicio(N+1) = fim(N) + intervalo`. O recorte e de EXIBICAO, e por isso
 * acontece depois: a folha do bloco 3 tem de dizer 11:30, o horario real dele no recital.
 */
function soEsteBloco(dados: DadosDaImpressao, blocoId: number): DadosDaImpressao {
  return { ...dados, blocos: dados.blocos.filter((b) => b.id === blocoId) };
}

/**
 * A programacao que vai para o publico.
 *
 * ⚠️ Bloco VAZIO nao sai: um titulo sem nada embaixo no papel do publico parece que alguem
 * foi cortado da apresentacao. Na tela ele aparece como pendencia, que e onde a informacao
 * serve — o papel nao e lugar de expor trabalho pela metade.
 *
 * `apenasBlocoId` imprime um bloco so, com o horario REAL dele dentro do recital.
 */
export function gerarProgramaHtml(dados: DadosDaImpressao, apenasBlocoId?: number): string {
  const { evento } = dados;
  // O calculo usa SEMPRE a grade inteira; o recorte vem depois.
  const horarios = calcularHorariosDaGrade(dados.evento, dados.blocos);
  const visiveis =
    apenasBlocoId === undefined ? dados.blocos : soEsteBloco(dados, apenasBlocoId).blocos;
  const comApresentacao = visiveis.filter((b) => b.apresentacoes.length > 0);

  if (comApresentacao.length === 0) {
    return moldura(
      'Programação',
      dados,
      '<p class="vazio">A grade ainda não tem apresentações.</p>',
      '',
      marcasDoRecorte(visiveis),
    );
  }

  const corpo = comApresentacao
    .map((bloco, i) => {
      const h = horarios.find((x) => x.blocoId === bloco.id);
      const intervalo =
        i > 0 && h && h.intervaloAntesSegundos !== null && h.intervaloAntesSegundos > 0
          ? `<div class="intervalo">intervalo</div>`
          : '';

      // Uma linha por NUMERO: quem toca junto aparece junto, com um horario e uma musica.
      const linhas = agruparEmNumeros(bloco.apresentacoes)
        .map((numero, idx) => {
          const hora = h?.apresentacoes.find((x) => x.id === numero[0].id)?.inicio ?? '';
          const musica = numero.find((ap) => (ap.musica ?? '').trim() !== '')?.musica ?? null;
          // Professor sem repetir: dois alunos da mesma turma nao imprimem o nome duas vezes.
          const professores = [...new Set(numero.map((ap) => ap.professor_nome).filter(Boolean))];
          const noPalco = [...new Set(numero.map((ap) => ap.professor_palco_nome).filter(Boolean))];
          const integrantes = numero
            .map((ap) => {
              const idade = rotuloIdade(ap.idade);
              return `<div><span class="aluno">${escapeHtml(ap.aluno_nome)}</span>${
                idade ? ` <span class="prof">${escapeHtml(idade)}</span>` : ''
              }${ap.curso_nome ? ` &middot; <span class="curso">${escapeHtml(ap.curso_nome)}</span>` : ''}</div>`;
            })
            .join('');
          return `<tr>
            <td class="n">${idx + 1}</td>
            <td class="hora">${escapeHtml(hora)}</td>
            <td>
              ${integrantes}
              ${musica ? `<div class="musica">${escapeHtml(musica)}</div>` : ''}
              ${professores.length > 0 ? `<div class="prof">Prof. ${professores.map((p) => escapeHtml(p)).join(', ')}</div>` : ''}
              ${noPalco.length > 0 ? `<div class="prof">No palco: Prof. ${noPalco.map((p) => escapeHtml(p)).join(', ')}</div>` : ''}
            </td>
          </tr>`;
        })
        .join('');

      // A data so vai no titulo quando ela DIFERE da do evento: num recital de um dia
      // repeti-la em todo bloco e ruido, e num de varios dias e o que distingue as sessoes.
      const dataDoBloco =
        bloco.data && bloco.data !== evento.data_evento ? `${dataCurta(bloco.data)} — ` : '';
      return `${intervalo}
        <div class="bloco">
          <h2>${dataDoBloco}${escapeHtml(bloco.nome)}${h ? `<span class="hora">${h.inicio} – ${h.fim}</span>` : ''}</h2>
          <table>${linhas}</table>
        </div>`;
    })
    .join('');

  const total = comApresentacao.reduce((s, b) => s + b.apresentacoes.length, 0);
  // O titulo diz que e recorte: uma folha com 6 de 40 apresentacoes, sem avisar, parece a
  // programacao inteira — e quem recebe conclui que o recital tem 6 numeros.
  const titulo =
    apenasBlocoId === undefined
      ? 'Programação'
      : `Programação — ${comApresentacao[0]?.nome ?? 'bloco'}`;
  return moldura(
    titulo,
    dados,
    corpo,
    `${total} ${total === 1 ? 'apresentação' : 'apresentações'}`,
    marcasDoRecorte(comApresentacao),
  );
}

/**
 * A folha que fica com a producao.
 *
 * ⚠️ Aqui o bloco vazio SAI, ao contrario da programacao: quem monta precisa saber que o
 * bloco existe e nao pede nada, senao vai procurar a folha que falta.
 */
export function gerarFolhaDePalcoHtml(dados: DadosDaImpressao, apenasBlocoId?: number): string {
  const { evento } = dados;
  // Horario calculado sobre a grade INTEIRA; o recorte e so de exibicao (ver `soEsteBloco`).
  const horarios = calcularHorariosDaGrade(dados.evento, dados.blocos);
  const visiveis =
    apenasBlocoId === undefined ? dados.blocos : soEsteBloco(dados, apenasBlocoId).blocos;

  // Um numero e uma entrada: quem toca junto soma o que pede, ao contrario de quem se reveza.
  const paraPalco = (bs: BlocoParaImprimir[]): ApresentacaoParaPalco[] =>
    bs.flatMap((b) => palcoDosNumeros(b.apresentacoes));

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

  const geral = consolidarItensDoPalco(paraPalco(visiveis));

  const corpoBlocos = visiveis
    .map((bloco) => {
      const h = horarios.find((x) => x.blocoId === bloco.id);
      const itens = consolidarItensDoPalco(paraPalco([bloco]));

      const playback = bloco.apresentacoes.filter((a) => a.tem_playback);
      // Quem cuida da entrada no palco precisa saber que é OUTRO professor que sobe.
      const comProfessorNoPalco = bloco.apresentacoes.filter((a) => (a.professor_palco_nome ?? '').trim() !== '');
      const mapas = bloco.apresentacoes.filter((a) => (a.observacao_mapa ?? '').trim() !== '');

      const dataDoBloco =
        bloco.data && bloco.data !== evento.data_evento ? `${dataCurta(bloco.data)} — ` : '';
      return `<div class="bloco">
        <h2>${dataDoBloco}${escapeHtml(bloco.nome)}${h ? `<span class="hora">${h.inicio} – ${h.fim}</span>` : ''}</h2>
        ${chips(itens)}
        ${
          playback.length > 0
            ? `<p class="prof"><strong>Playback:</strong> ${playback
                .map((a) => {
                  // O operador de som precisa da FONTE, nao de uma bandeira: com link ele
                  // abre, com arquivo ele procura na pasta — os dois saem no papel.
                  const fonte = a.musica_link ?? a.playback_path ?? null;
                  return escapeHtml(a.aluno_nome) + (fonte ? ` — ${escapeHtml(fonte)}` : '');
                })
                .join('<br/>')}</p>`
            : ''
        }
        ${
          comProfessorNoPalco.length > 0
            ? `<p class="prof"><strong>Professor no palco:</strong> ${comProfessorNoPalco
                .map(
                  (a) =>
                    `${escapeHtml(a.professor_palco_nome)} com ${escapeHtml(a.aluno_nome)}` +
                    (a.professor_nome ? ` (prof. do aluno: ${escapeHtml(a.professor_nome)})` : ''),
                )
                .join('<br/>')}</p>`
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

  // Com um bloco so, "o recital inteiro" seria mentira: o consolidado ali cobre apenas
  // aquele bloco, e quem levasse a folha montaria o palco achando que tem tudo.
  const tituloGeral =
    apenasBlocoId === undefined ? 'O recital inteiro precisa de' : 'Este bloco precisa de';

  const corpo = `
    <div class="bloco">
      <h2>${tituloGeral}</h2>
      ${chips(geral)}
      <p class="prof">O número é quanto precisa existir ao mesmo tempo — as apresentações são
      uma depois da outra, então o mesmo instrumento serve a várias. Item tracejado vem do
      curso do aluno.</p>
    </div>
    ${corpoBlocos}`;

  const titulo =
    apenasBlocoId === undefined
      ? 'Folha de palco'
      : `Folha de palco — ${visiveis[0]?.nome ?? 'bloco'}`;
  return moldura(titulo, dados, corpo, 'uso interno da produção', marcasDoRecorte(visiveis));
}


/* ─────────────────────────── planilha ─────────────────────────── */

/**
 * Uma celula de CSV, pronta para o Excel brasileiro.
 *
 * ⚠️ Escapa aspas DUPLICANDO (`"` -> `""`), que e a regra do formato, e envolve em aspas
 * qualquer texto com separador, aspas ou quebra de linha. Um nome de musica com ponto e
 * virgula — "Aquarela; ao vivo" — partiria a linha em duas colunas sem isso.
 */
function celulaCsv(valor: string | number | null | undefined): string {
  const t = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n\r]/u.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * A grade como planilha, uma linha por apresentacao.
 *
 * ⚠️ **CSV, nao .xlsx**, e e decisao consciente. O prototipo do Arthur embute o SheetJS
 * inteiro (por isso o arquivo dele tem 498 KB) e pede ".xlsx" nos comentarios de extensao;
 * trazer a mesma biblioteca para ca somaria ~800 KB ao bundle do app INTEIRO, carregado por
 * todo mundo que abre o LA Report, para um botao que roda algumas vezes por semestre. O CSV
 * abre no Excel com dois cliques e custa zero.
 *
 * ⚠️ Separador `;` e **BOM UTF-8**: sem o BOM o Excel em portugues le o arquivo como ANSI e
 * "Violão" vira "ViolÃ£o"; com virgula em vez de ponto e virgula, ele joga tudo numa coluna
 * so. As duas coisas fazem a planilha parecer quebrada sem nenhum erro aparecer.
 */
export function gerarPlanilhaCsv(dados: DadosDaImpressao, apenasBlocoId?: number): string {
  const horarios = calcularHorariosDaGrade(dados.evento, dados.blocos);
  const visiveis =
    apenasBlocoId === undefined ? dados.blocos : dados.blocos.filter((b) => b.id === apenasBlocoId);

  const cabecalho = [
    'Bloco', 'Data', 'Ordem', 'Horário', 'Aluno', 'Curso', 'Professor', 'Música', 'Artista',
    'Duração (min)', 'Playback', 'Link da música', 'Arquivo de playback',
    'Itens de palco', 'Observação de palco',
    // No FIM de proposito: quem ja montou planilha em cima das colunas antigas nao ve nada
    // mudar de lugar.
    'Idade', 'Sobe junto com', 'Professor no palco',
  ];

  const linhas = visiveis.flatMap((bloco) => {
    const h = horarios.find((x) => x.blocoId === bloco.id);
    // A ordem e a do NUMERO: quem sobe junto divide a mesma posicao, como na programacao.
    return agruparEmNumeros(bloco.apresentacoes).flatMap((numero, idx) =>
      numero.map((ap) => {
        const juntos = numero
          .filter((outro) => outro.id !== ap.id)
          .map((outro) => outro.aluno_nome)
          .join(', ');
        const itens = ap.itens
          .map((i) => (i.quantidade > 1 ? `${i.quantidade}x ${i.nome}` : i.nome))
          .join(', ');
        return [
          bloco.nome,
          // A data do bloco, sempre preenchida: a planilha que vai para a producao nao pode
          // depender de saber que "vazio = dia do evento".
          bloco.data ?? dados.evento.data_evento,
          idx + 1,
          h?.apresentacoes.find((x) => x.id === ap.id)?.inicio ?? '',
          ap.aluno_nome,
          ap.curso_nome ?? '',
          ap.professor_nome ?? '',
          ap.musica ?? '',
          ap.musica_artista ?? '',
          // Vazio, nao zero: zero seria lido como "dura nada" numa soma da planilha, quando
          // o que existe e "ainda usa a duracao padrao do evento".
          ap.duracao_segundos ? Math.round(ap.duracao_segundos / 60) : '',
          ap.tem_playback ? 'sim' : '',
          ap.musica_link ?? '',
          ap.playback_path ?? '',
          itens,
          ap.observacao_mapa ?? '',
          ap.idade ?? '',
          juntos,
          ap.professor_palco_nome ?? '',
        ].map(celulaCsv).join(';');
      }),
    );
  });

  // \r\n é o fim de linha que o Excel espera.
  return `\uFEFF${[cabecalho.join(';'), ...linhas].join('\r\n')}\r\n`;
}

/* ─────────────────────────── certificado ─────────────────────────── */

/**
 * Uma pessoa que recebe certificado — e as apresentacoes dela.
 *
 * ⚠️ O grao e a APRESENTACAO (pessoa x curso): decisao fechada pelo Alf em 27/09 — "se ele
 * faz teclado e violao, se apresenta duas vezes" — e o `certificado_status` mora em
 * `evento_apresentacao`. Quem confirmou presenca mas nao subiu ao palco (sem apresentacao)
 * recebe um papel so, sem linha de repertorio.
 */
export interface CertificadoParaGerar {
  nome: string;
  /** Vazio = certificado generico (quem confirmou e nao subiu ao palco). */
  apresentacoes: {
    /** Id da apresentacao — quem emite grava `certificado_status='emitido'` por CURSO. */
    apresentacaoId?: number;
    cursoNome: string | null;
    musica: string | null;
  }[];
  /** Kids ou School — o logo do certificado é o da marca da PESSOA. Ausente = School. */
  marca?: MarcaDoAluno | null;
  /** Selo de formando da pessoa (`evento_participacao.formatura_tipo`). Usado no de formatura. */
  formatura?: TipoDeFormatura | null;
}

export type TipoDeFormatura = 'kids' | 'bebes' | 'la';

/**
 * O que o certificado de formatura afirma, por tipo. O tipo diz PARA ONDE a pessoa passa
 * (mesmo sentido do selo na aba Alunos).
 *
 * ⚠️ Só o que o sistema sabe: etapa concluída e próxima etapa. Nada de carga horária, nota ou
 * nome de diretor — seria dado inventado num papel que vai para a família.
 */
export const ETAPA_DA_FORMATURA: Record<
  TipoDeFormatura,
  { concluiu: string; segue: string | null; marca: MarcaDoAluno }
> = {
  kids: { concluiu: 'a etapa LA Music Kids', segue: 'LA Music School', marca: 'kids' },
  bebes: {
    concluiu: 'a Musicalização para Bebês',
    segue: 'Musicalização Preparatória',
    marca: 'kids',
  },
  la: { concluiu: 'sua formação na LA Music', segue: null, marca: 'school' },
};

export type TipoDeCertificado = 'participacao' | 'formatura';

const ESTILO_CERTIFICADO = `
  :root { --marca: #b45309; --marca-escura: #7c2d12; --tinta: #1f2937; --suave: #6b7280; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: var(--tinta); margin: 0; background: #f1f5f9; }

  .acoes { position: sticky; top: 0; z-index: 10; background: #0f172a; color: #e2e8f0;
           padding: 10px 0; font-size: 12.5px; }
  .acoes .dentro { max-width: 1040px; margin: 0 auto; padding: 0 16px;
                   display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .acoes .qual { font-weight: 600; margin-right: auto; }
  .acoes .qual span { display: block; font-weight: 400; font-size: 11px; color: #94a3b8; }
  .acoes button { font: inherit; font-size: 12.5px; border-radius: 6px; padding: 7px 14px;
                  cursor: pointer; border: 1px solid transparent; }
  .acoes .pdf { background: #b45309; color: #fff; font-weight: 600; }
  .acoes .pdf:hover { background: #92400e; }
  .acoes .imprimir { background: transparent; color: #e2e8f0; border-color: #334155; }
  .dica { width: 100%; font-size: 11px; color: #94a3b8; margin: -2px 0 0; }

  /* Uma folha A4 DEITADA por pessoa. 297x210mm e a medida real da pagina: na tela vira um
     retangulo com a mesma proporcao do que vai sair na impressora, entao o que se confere e
     o que se imprime. */
  .cert { background: #fff; width: 297mm; height: 210mm; margin: 22px auto; padding: 14mm;
          box-shadow: 0 1px 3px rgba(15,23,42,.1), 0 12px 32px rgba(15,23,42,.08);
          display: flex; }
  .moldura { border: 2px solid var(--marca); border-radius: 3px; flex: 1; padding: 12mm 16mm;
             display: flex; flex-direction: column; align-items: center; text-align: center;
             position: relative; }
  /* Fio interno: dobra a borda sem pesar a impressao com fundo colorido. */
  .moldura::before { content: ''; position: absolute; inset: 3mm; border: 1px solid #fde68a;
                     border-radius: 2px; pointer-events: none; }

  .cert img { height: 15mm; width: auto; object-fit: contain; }
  .titulo { font-size: 26px; letter-spacing: .18em; text-transform: uppercase;
            color: var(--marca-escura); margin: 8mm 0 0; font-weight: 700; }
  .subtitulo { font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
               color: var(--suave); margin-top: 2mm; }
  .corpo { margin-top: 9mm; font-size: 14px; line-height: 1.9; max-width: 190mm; }
  .nome { display: block; font-size: 30px; font-weight: 600; color: var(--marca-escura);
          margin: 4mm 0; line-height: 1.25; }
  .repertorio { margin-top: 6mm; font-size: 12.5px; color: #374151; }
  .repertorio .item { display: block; }
  .repertorio .curso { color: var(--marca); font-weight: 600; }
  .repertorio .musica { font-style: italic; }

  /* Empurra a assinatura para o rodape do papel, qualquer que seja o tamanho do texto. */
  .assinatura { margin-top: auto; padding-top: 6mm; }
  .assinatura .linha { width: 78mm; border-top: 1px solid #9ca3af; margin: 0 auto 2mm; }
  .assinatura .quem { font-size: 12px; font-weight: 600; }
  .assinatura .onde { font-size: 10.5px; color: var(--suave); }

  @media print {
    body { background: #fff; }
    .acoes { display: none !important; }
    /* Sem sombra, sem margem e SEM quebra depois do ultimo: uma pagina em branco no fim de um
       lote de 200 certificados e uma folha desperdicada por lote. */
    .cert { margin: 0; box-shadow: none; page-break-after: always; }
    .cert:last-child { page-break-after: auto; }
    @page { size: A4 landscape; margin: 0; }
  }
`;

/**
 * Certificados de participacao, um por pagina, num documento so.
 *
 * ⚠️ **Generico de proposito** (pedido do Hugo em 19/09/2026: "crie um generico mesmo,
 * provavelmente vamos alterar depois"). Por isso NAO ha carga horaria, numero de registro,
 * QR de validacao nem nome de diretor: cada um desses seria um dado inventado impresso num
 * documento que vai para a familia do aluno. O que sai no papel e so o que o sistema sabe.
 *
 * ⚠️ Nao dispara a impressao sozinho, como os outros documentos — abrir para CONFERIR e o caso
 * comum, imprimir e o eventual.
 */
export function gerarCertificadosHtml(
  dados: DadosDaImpressao,
  pessoas: CertificadoParaGerar[],
  tipo: TipoDeCertificado = 'participacao',
): string {
  if (tipo === 'formatura') return gerarCertificadosDeFormaturaHtml(dados, pessoas);
  const { evento } = dados;
  const origem = dados.origem;
  // Logo por PESSOA: um lote mistura Kids e School, e o certificado de um bebê com o logo
  // da School era o defeito apontado na reunião de 08/10.
  const logoDe = (marca: MarcaDoAluno | null | undefined) =>
    origem ? imgDaMarca(origem, marca ?? 'school') : '';

  // Certificado sem nome e papel inutil — ninguem consegue entregar. Sai da lista, e a
  // contagem no cabecalho da barra reflete o que de fato foi gerado.
  const validas = pessoas.filter((p) => p.nome.trim() !== '');

  const ondeQuando = [
    periodoPorExtenso(evento.data_evento, evento.data_fim),
    evento.local ? escapeHtml(evento.local) : null,
  ]
    .filter(Boolean)
    .join(', ');

  // Um certificado por CURSO: a pessoa com duas apresentacoes recebe dois papeis, cada um
  // nomeando o curso daquela vez que ela subiu. Sem apresentacao, um papel so — quem veio
  // prestigiar tambem participou.
  const paginas = validas.flatMap((pessoa) =>
    pessoa.apresentacoes.length > 0
      ? pessoa.apresentacoes.map((a) => ({ nome: pessoa.nome, marca: pessoa.marca, apresentacao: a }))
      : [{ nome: pessoa.nome, marca: pessoa.marca, apresentacao: null }],
  );

  const folhas = paginas
    .map(({ nome, marca, apresentacao }) => {
      const curso = apresentacao?.cursoNome
        ? `<span class="curso">${escapeHtml(apresentacao.cursoNome)}</span>`
        : '';
      const musica = apresentacao?.musica?.trim()
        ? `<span class="musica">${escapeHtml(apresentacao.musica.trim())}</span>`
        : '';
      const repertorio =
        curso || musica
          ? `<div class="repertorio"><span class="item">${[curso, musica].filter(Boolean).join(' &middot; ')}</span></div>`
          : '';

      return `  <div class="cert">
    <div class="moldura">
      ${logoDe(marca)}
      <h1 class="titulo">Certificado</h1>
      <p class="subtitulo">de participação</p>

      <div class="corpo">
        Certificamos que
        <strong class="nome">${escapeHtml(nome)}</strong>
        participou do <strong>${escapeHtml(evento.titulo)}</strong>${
          ondeQuando ? `, realizado em ${ondeQuando}` : ''
        }.
        ${repertorio}
      </div>

      <div class="assinatura">
        <div class="linha"></div>
        <p class="quem">LA Music Escola de Música</p>
        ${evento.unidade_nome ? `<p class="onde">${escapeHtml(evento.unidade_nome)}</p>` : ''}
      </div>
    </div>
  </div>`;
    })
    .join('\n');

  const corpo =
    paginas.length > 0
      ? folhas
      : `  <div class="cert"><div class="moldura">
      <div class="corpo">Nenhuma pessoa selecionada para receber certificado.</div>
    </div></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(evento.titulo)} — Certificados</title>
  <style>${ESTILO_CERTIFICADO}</style>
</head>
<body>
  <div class="acoes">
    <div class="dentro">
      <div class="qual">
        ${paginas.length} ${paginas.length === 1 ? 'certificado' : 'certificados'}
        <span>${escapeHtml(evento.titulo)} — um por curso</span>
      </div>
      <button type="button" class="pdf" onclick="window.print()">Salvar em PDF</button>
      <button type="button" class="imprimir" onclick="window.print()">Imprimir</button>
      <p class="dica">
        Um certificado por página, em A4 deitado. Confira a orientação
        <strong>Paisagem</strong> antes de imprimir.
      </p>
    </div>
  </div>

${corpo}
</body>
</html>`;
}

/**
 * Certificados de FORMATURA — reunião de 08/10/2026.
 *
 * Um por PESSOA (a formatura é da pessoa, não do curso) e só para quem tem selo de formando.
 * Mesmo papel e mesma moldura do de participação, para os dois saírem iguais da gráfica;
 * muda o título, o texto e o logo, que segue a etapa (Kids e Bebês saem com o logo da Kids).
 */
function gerarCertificadosDeFormaturaHtml(
  dados: DadosDaImpressao,
  pessoas: CertificadoParaGerar[],
): string {
  const { evento } = dados;
  const origem = dados.origem;
  const validas = pessoas.filter((p) => p.nome.trim() !== '' && p.formatura);

  const ondeQuando = [
    periodoPorExtenso(evento.data_evento, evento.data_fim),
    evento.local ? escapeHtml(evento.local) : null,
  ]
    .filter(Boolean)
    .join(', ');

  const folhas = validas
    .map((pessoa) => {
      const etapa = ETAPA_DA_FORMATURA[pessoa.formatura as TipoDeFormatura];
      const logo = origem ? imgDaMarca(origem, etapa.marca) : '';
      return `  <div class="cert">
    <div class="moldura">
      ${logo}
      <h1 class="titulo">Certificado</h1>
      <p class="subtitulo">de formatura</p>

      <div class="corpo">
        Certificamos que
        <strong class="nome">${escapeHtml(pessoa.nome)}</strong>
        concluiu ${escapeHtml(etapa.concluiu)} e celebrou sua formatura no
        <strong>${escapeHtml(evento.titulo)}</strong>${ondeQuando ? `, realizado em ${ondeQuando}` : ''}.
        ${
          etapa.segue
            ? `<div class="repertorio"><span class="item">Próxima etapa: <span class="curso">${escapeHtml(
                etapa.segue,
              )}</span></span></div>`
            : ''
        }
      </div>

      <div class="assinatura">
        <div class="linha"></div>
        <p class="quem">LA Music Escola de Música</p>
        ${evento.unidade_nome ? `<p class="onde">${escapeHtml(evento.unidade_nome)}</p>` : ''}
      </div>
    </div>
  </div>`;
    })
    .join('\n');

  const corpo =
    validas.length > 0
      ? folhas
      : `  <div class="cert"><div class="moldura">
      <div class="corpo">Nenhum formando selecionado.</div>
    </div></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(evento.titulo)} — Certificados de formatura</title>
  <style>${ESTILO_CERTIFICADO}</style>
</head>
<body>
  <div class="acoes">
    <div class="dentro">
      <div class="qual">
        ${validas.length} ${validas.length === 1 ? 'certificado de formatura' : 'certificados de formatura'}
        <span>${escapeHtml(evento.titulo)} — um por formando</span>
      </div>
      <button type="button" class="pdf" onclick="window.print()">Salvar em PDF</button>
      <button type="button" class="imprimir" onclick="window.print()">Imprimir</button>
      <p class="dica">
        Um certificado por página, em A4 deitado. Confira a orientação
        <strong>Paisagem</strong> antes de imprimir.
      </p>
    </div>
  </div>

${corpo}
</body>
</html>`;
}

/** Nome de arquivo seguro, derivado do evento. */
export function nomeDoArquivo(dados: DadosDaImpressao, sufixo: string): string {
  const base = `${dados.evento.data_evento}-${dados.evento.titulo}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base}-${sufixo}`;
}

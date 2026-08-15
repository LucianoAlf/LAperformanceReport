export const ORDEM_B = Object.freeze([
  'PALAVRAS',
  'TEMPO',
  'APOIO',
  'SIMBOLO',
  'CELEBRACAO',
]);

export const ORDEM_D = Object.freeze([
  'CORAGEM',
  'EMPATIA',
  'EXCELENCIA',
  'PAIXAO',
]);

function falha(mensagem) {
  throw new Error(mensagem);
}

export function validarCargo(cargo, fixos, desempates) {
  if (
    typeof cargo !== 'string' ||
    !cargo ||
    !Array.isArray(fixos) ||
    !Array.isArray(desempates) ||
    fixos.length === 0
  ) {
    falha(`cargo sem banco de cenários: ${cargo || '(vazio)'}`);
  }
}

function validarPerguntas(identificadores, quantidade, bloco, formato, opcoesValidas) {
  if (!Array.isArray(identificadores) || identificadores.length !== quantidade) {
    falha(`${bloco} incompleto: esperado ${quantidade} respostas`);
  }

  const perguntas = new Set();
  return identificadores.map((identificador) => {
    if (typeof identificador !== 'string') {
      falha(`${bloco}: opção inválida`);
    }

    const partes = identificador.match(formato);
    if (!partes) falha(`${bloco}: opção inválida`);

    const pergunta = Number(partes[1]);
    const opcao = partes[2];
    if (pergunta < 1 || pergunta > quantidade) {
      falha(`${bloco}: pergunta ${pergunta} fora do intervalo`);
    }
    if (perguntas.has(pergunta)) {
      falha(`${bloco}: pergunta ${pergunta} repetida`);
    }
    if (!opcoesValidas.includes(opcao)) {
      falha(`${bloco}: opção inválida`);
    }
    perguntas.add(pergunta);
    return identificador;
  });
}

export function validarEscolhas({
  fixosCount,
  desempatesCount,
  blocoBCount,
  blocoDCount,
  escolhasA,
  escolhasB,
  escolhasD,
}) {
  if (![fixosCount, desempatesCount, blocoBCount, blocoDCount].every(Number.isInteger)) {
    falha('configuração de perguntas inválida');
  }

  const totalA = fixosCount + desempatesCount;
  return {
    escolhasA: validarPerguntas(escolhasA, totalA, 'bloco A', /^(\d+)\.([0-3])$/, ['0', '1', '2', '3']),
    escolhasB: validarPerguntas(escolhasB, blocoBCount, 'bloco B', /^(\d+)\.([ab])$/, ['a', 'b']),
    escolhasD: validarPerguntas(escolhasD, blocoDCount, 'bloco D', /^(\d+)\.([ab])$/, ['a', 'b']),
  };
}

export function rankingDeterministico(contagem, ordem) {
  const posicoes = new Map(ordem.map((chave, indice) => [chave, indice]));
  return Object.entries(contagem).sort((x, y) => {
    const porValor = y[1] - x[1];
    if (porValor !== 0) return porValor;
    const posX = posicoes.has(x[0]) ? posicoes.get(x[0]) : Number.MAX_SAFE_INTEGER;
    const posY = posicoes.has(y[0]) ? posicoes.get(y[0]) : Number.MAX_SAFE_INTEGER;
    return posX - posY || x[0].localeCompare(y[0]);
  });
}

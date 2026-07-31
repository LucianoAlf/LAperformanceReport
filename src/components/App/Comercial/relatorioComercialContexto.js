function texto(valor) {
  return valor == null ? '' : String(valor);
}

export function criarOrigemRelatorio({
  tipo,
  unidade,
  periodo,
  dataInicio,
  dataFim,
  competencia,
}) {
  const origem = {
    tipo: texto(tipo),
    unidade: texto(unidade) || 'todos',
    periodo: texto(periodo),
    dataInicio: texto(dataInicio),
    dataFim: texto(dataFim),
    competencia: texto(competencia),
  };

  return Object.freeze({
    ...origem,
    chave: [
      origem.tipo,
      origem.unidade,
      origem.periodo,
      origem.dataInicio,
      origem.dataFim,
      origem.competencia,
    ].map(encodeURIComponent).join('|'),
  });
}

export function mesmaOrigemRelatorio(origemA, origemB) {
  return Boolean(
    origemA?.chave &&
      origemB?.chave &&
      origemA.chave === origemB.chave,
  );
}

export function podeUsarRelatorio(textoRelatorio, origemGerada, origemAtual) {
  return Boolean(
    typeof textoRelatorio === 'string' &&
      textoRelatorio.trim() &&
      mesmaOrigemRelatorio(origemGerada, origemAtual),
  );
}

export function respostaEnvioAindaValida({
  respostaId,
  envioAtualId,
  origemEnvio,
  origemAtual,
}) {
  return respostaId === envioAtualId &&
    mesmaOrigemRelatorio(origemEnvio, origemAtual);
}

export function invalidarEnvioRelatorio({ envioAtualId }) {
  return {
    envioAtualId: envioAtualId + 1,
    enviando: false,
    enviado: false,
    erro: null,
  };
}

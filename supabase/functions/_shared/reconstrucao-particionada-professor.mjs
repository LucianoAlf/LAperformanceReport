const MIN_PARTICOES = 2;
const MAX_PARTICOES = 128;

function inteiro(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function validarParticionamento(totalValue, indiceValue) {
  const total = inteiro(totalValue);
  if (total === null || total < MIN_PARTICOES || total > MAX_PARTICOES) {
    throw new Error('PARTICAO_TOTAL_INVALIDO');
  }

  const indice = inteiro(indiceValue);
  if (indice === null || indice < 0 || indice >= total) {
    throw new Error('PARTICAO_INDICE_INVALIDO');
  }

  return { total, indice };
}

export function indicesParticoes(totalValue, inicioValue = 0) {
  const total = inteiro(totalValue);
  if (total === null || total < MIN_PARTICOES || total > MAX_PARTICOES) {
    throw new Error('PARTICAO_TOTAL_INVALIDO');
  }
  const inicio = inteiro(inicioValue);
  if (inicio === null || inicio < 0 || inicio >= total) {
    throw new Error('PARTICAO_INICIO_INVALIDO');
  }
  return Array.from({ length: total - inicio }, (_, offset) => inicio + offset);
}

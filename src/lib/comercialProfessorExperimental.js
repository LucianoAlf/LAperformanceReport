const STATUS_REALIZADO = new Set(['experimental_realizada', 'realizada', 'presente']);

const normalizarStatus = (status) => String(status || '').trim().toLowerCase();

const dataValor = (valor) => {
  if (!valor) return 0;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
};

export function escolherExperimentalCanonica(experimentais = [], dataMatricula = null) {
  const limite = dataValor(dataMatricula);
  const candidatas = experimentais
    .filter((item) => STATUS_REALIZADO.has(normalizarStatus(item.status)))
    .filter((item) => item.professorExperimentalNome || item.professor_experimental_nome)
    .sort((a, b) => {
      const dataA = dataValor(a.dataExperimental || a.data_experimental);
      const dataB = dataValor(b.dataExperimental || b.data_experimental);
      const aAntesMatricula = limite > 0 && dataA > 0 && dataA <= limite;
      const bAntesMatricula = limite > 0 && dataB > 0 && dataB <= limite;
      if (aAntesMatricula !== bAntesMatricula) return aAntesMatricula ? -1 : 1;
      return dataB - dataA;
    });

  return candidatas[0] || null;
}

export function resolverProfessorExperimentalCanonico({ experimentais = [], dataMatricula = null } = {}) {
  const experimental = escolherExperimentalCanonica(experimentais, dataMatricula);
  return experimental?.professorExperimentalNome || experimental?.professor_experimental_nome || null;
}

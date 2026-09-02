export function nomeBase(nome) {
  return nome.replace(/_v\d+$/, '');
}

function versao(nome) {
  const encontrado = nome.match(/_v(\d+)$/);
  return encontrado ? Number(encontrado[1]) : 0;
}

export function classificarEstado(funcao, consumidores, todasAsFuncoes) {
  const { nome, anon } = funcao;
  const base = nomeBase(nome);
  const minhaVersao = versao(nome);

  const maior = todasAsFuncoes
    .filter((outro) => outro !== nome && nomeBase(outro) === base && versao(outro) > minhaVersao)
    .sort((a, b) => versao(b) - versao(a))[0];

  const motivo = maior ? `existe versao maior: ${maior}` : '';

  if (consumidores.length === 0) {
    // LEGADO e mais informativo que ORFA: diz por que ninguem chama.
    return { estado: maior ? 'LEGADO' : 'ORFA', anon, motivo };
  }
  // Quem so e chamada por outra funcao nao e ponto de entrada do sistema — a
  // distincao importa porque so o ponto de entrada precisa de ACL revisada.
  const soFuncao = consumidores.every((consumidor) => consumidor.fonte === 'funcao');
  return { estado: soFuncao ? 'SO-INTERNA' : 'ATIVA', anon, motivo };
}

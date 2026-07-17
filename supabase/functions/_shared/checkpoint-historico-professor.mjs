function dataIso(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

export function devePausarAposCheckpoint(execucao, pausarAposData) {
  const corte = dataIso(pausarAposData);
  const proximaJanela = dataIso(execucao?.janela_inicio_atual);
  return Boolean(
    corte &&
    proximaJanela &&
    execucao?.status === 'executando' &&
    execucao?.cursor_atual === null &&
    proximaJanela > corte
  );
}

export function execucaoCobreRecorte(execucao, recorte) {
  const inicioExecucao = dataIso(execucao?.data_inicio);
  const fimExecucao = dataIso(execucao?.data_fim);
  const inicioRecorte = dataIso(recorte?.data_inicio);
  const fimRecorte = dataIso(recorte?.data_fim);

  if (
    !inicioExecucao || !fimExecucao || !inicioRecorte || !fimRecorte ||
    execucao?.unidade_id !== recorte?.unidade_id ||
    inicioExecucao > inicioRecorte ||
    fimExecucao < fimRecorte
  ) {
    return false;
  }

  if (execucao?.status === 'concluido') return true;

  const proximaJanela = dataIso(execucao?.janela_inicio_atual);
  return Boolean(
    execucao?.status === 'pausado' &&
    execucao?.cursor_atual === null &&
    proximaJanela &&
    proximaJanela > fimRecorte
  );
}

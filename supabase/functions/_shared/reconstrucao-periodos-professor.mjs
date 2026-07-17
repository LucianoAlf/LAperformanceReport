const MESES_DIVISOR_DIAS = 30.44;

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asTime(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value) {
  const parsed = asTime(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function matriculaDisciplinaId(evento) {
  const id = asNumber(evento.emusys_matricula_disciplina_id);
  return id !== null && id > 0 ? id : null;
}

function professorEmusysId(evento) {
  return asNumber(evento.emusys_professor_id);
}

export function coletarIdsEmusysProfessores(aulas = [], contexto = {}) {
  const ids = new Set();
  const adicionar = (value) => {
    const id = asNumber(value);
    if (id !== null && id !== 0) ids.add(id);
  };

  for (const aula of Array.isArray(aulas) ? aulas : []) {
    adicionar(aula.emusys_professor_id);
  }
  for (const jornada of Array.isArray(contexto.jornadas) ? contexto.jornadas : []) {
    adicionar(jornada.emusys_professor_id);
  }
  for (const transicao of Array.isArray(contexto.transicoes) ? contexto.transicoes : []) {
    adicionar(transicao.emusys_professor_anterior_id);
    adicionar(transicao.emusys_professor_novo_id);
  }

  return [...ids].sort((left, right) => left - right);
}

function professorLocalResolvido(emusysId, professorIdAtual, professoresPorEmusysId) {
  const idEmusys = asNumber(emusysId);
  const atual = asNumber(professorIdAtual);
  if (idEmusys === null) return atual;
  const resolucao = professoresPorEmusysId.get(idEmusys);
  if (resolucao && resolucao.ambiguo !== true && asNumber(resolucao.professor_id) !== null) {
    return asNumber(resolucao.professor_id);
  }
  return atual;
}

export function resolverProfessoresNoContexto(contexto = {}, professoresPorEmusysId = new Map()) {
  return {
    jornadas: (Array.isArray(contexto.jornadas) ? contexto.jornadas : []).map((jornada) => ({
      ...jornada,
      professor_id: professorLocalResolvido(
        jornada.emusys_professor_id,
        jornada.professor_id,
        professoresPorEmusysId,
      ),
    })),
    transicoes: (Array.isArray(contexto.transicoes) ? contexto.transicoes : []).map((transicao) => ({
      ...transicao,
      professor_anterior_id_resolvido: professorLocalResolvido(
        transicao.emusys_professor_anterior_id,
        transicao.professor_anterior_id,
        professoresPorEmusysId,
      ),
      professor_novo_id_resolvido: professorLocalResolvido(
        transicao.emusys_professor_novo_id,
        transicao.professor_novo_id,
        professoresPorEmusysId,
      ),
    })),
  };
}

function pessoaChave(evento) {
  if (typeof evento.pessoa_chave === 'string' && evento.pessoa_chave.trim()) {
    return evento.pessoa_chave.trim();
  }
  const alunoEmusys = asNumber(evento.emusys_aluno_id);
  if (alunoEmusys !== null) return `emusys:${alunoEmusys}`;
  const alunoLocal = asNumber(evento.aluno_id);
  return alunoLocal === null ? null : `local:${alunoLocal}`;
}

function chaveParticao(evento) {
  const pessoa = pessoaChave(evento);
  if (!pessoa) return null;
  const matriculaDisciplina = matriculaDisciplinaId(evento);
  if (matriculaDisciplina !== null) return `${pessoa}|md:${matriculaDisciplina}`;
  const alunoEmusys = asNumber(evento.emusys_aluno_id);
  const disciplina = asNumber(evento.emusys_disciplina_id);
  if (alunoEmusys !== null && disciplina !== null) {
    return `${pessoa}|fallback:${alunoEmusys}:${disciplina}`;
  }
  return null;
}

function chaveEscopoMatriculaDisciplina(evento) {
  const pessoa = pessoaChave(evento);
  const disciplina = asNumber(evento.emusys_disciplina_id);
  return pessoa && disciplina !== null ? `${pessoa}|d:${disciplina}` : null;
}

function chaveEventoSemantico(evento) {
  const escopo = chaveEscopoMatriculaDisciplina(evento);
  const inicio = iso(evento.data_hora_inicio);
  const professor = professorEmusysId(evento);
  return escopo && inicio && professor !== null
    ? `${escopo}|p:${professor}|t:${inicio}`
    : null;
}

function pushDiagnostico(diagnosticos, tipo, evento, detalhes = {}) {
  diagnosticos.push({
    tipo,
    unidade_id: evento?.unidade_id ?? null,
    pessoa_chave: evento ? pessoaChave(evento) : null,
    emusys_aula_id: asNumber(evento?.emusys_aula_id),
    emusys_matricula_disciplina_id: matriculaDisciplinaId(evento ?? {}),
    emusys_professor_id: professorEmusysId(evento ?? {}),
    ...detalhes,
  });
}

function normalizarDuplicatasEmusys(eventos, contexto, diagnosticos) {
  const gruposSemanticos = new Map();
  const suporte = new Map();
  const grafos = new Map();
  const segmentosPorEscopoProfessor = new Map();
  const idsJornada = new Set(
    (Array.isArray(contexto.jornadas_atuais) ? contexto.jornadas_atuais : [])
      .map((item) => matriculaDisciplinaId(item))
      .filter((item) => item !== null),
  );

  for (const evento of eventos) {
    const chaveEvento = chaveEventoSemantico(evento);
    if (chaveEvento) {
      const grupo = gruposSemanticos.get(chaveEvento) ?? [];
      grupo.push(evento);
      gruposSemanticos.set(chaveEvento, grupo);
    }

    const escopo = chaveEscopoMatriculaDisciplina(evento);
    const matriculaDisciplina = matriculaDisciplinaId(evento);
    if (!escopo || matriculaDisciplina === null) continue;
    const chaveSuporte = `${escopo}|md:${matriculaDisciplina}`;
    const atual = suporte.get(chaveSuporte) ?? { total: 0, ultima: -Infinity };
    atual.total += 1;
    atual.ultima = Math.max(atual.ultima, asTime(evento.data_hora_inicio) ?? -Infinity);
    suporte.set(chaveSuporte, atual);

    const professor = professorEmusysId(evento);
    if (professor !== null) {
      const chaveSegmento = `${escopo}|p:${professor}`;
      const porMatricula = segmentosPorEscopoProfessor.get(chaveSegmento) ?? new Map();
      const instante = asTime(evento.data_hora_inicio) ?? -Infinity;
      const segmento = porMatricula.get(matriculaDisciplina) ?? {
        escopo,
        matriculaDisciplina,
        primeira: instante,
        ultima: instante,
      };
      segmento.primeira = Math.min(segmento.primeira, instante);
      segmento.ultima = Math.max(segmento.ultima, instante);
      porMatricula.set(matriculaDisciplina, segmento);
      segmentosPorEscopoProfessor.set(chaveSegmento, porMatricula);
    }
  }

  for (const grupo of gruposSemanticos.values()) {
    const escopo = chaveEscopoMatriculaDisciplina(grupo[0]);
    const ids = [...new Set(grupo.map(matriculaDisciplinaId).filter((item) => item !== null))];
    if (!escopo || ids.length < 2) continue;
    const grafo = grafos.get(escopo) ?? new Map();
    for (const id of ids) {
      const vizinhos = grafo.get(id) ?? new Set();
      for (const outro of ids) if (outro !== id) vizinhos.add(outro);
      grafo.set(id, vizinhos);
    }
    grafos.set(escopo, grafo);
  }

  const LIMITE_CONTINUIDADE_MS = 45 * 24 * 60 * 60 * 1000;
  for (const porMatricula of segmentosPorEscopoProfessor.values()) {
    const segmentos = [...porMatricula.values()].sort((left, right) =>
      left.primeira - right.primeira || left.matriculaDisciplina - right.matriculaDisciplina
    );
    for (let index = 1; index < segmentos.length; index += 1) {
      const anterior = segmentos[index - 1];
      const atual = segmentos[index];
      const intervalo = atual.primeira - anterior.ultima;
      if (intervalo <= 0 || intervalo > LIMITE_CONTINUIDADE_MS) continue;
      const grafo = grafos.get(atual.escopo) ?? new Map();
      const anteriores = grafo.get(anterior.matriculaDisciplina) ?? new Set();
      const atuais = grafo.get(atual.matriculaDisciplina) ?? new Set();
      anteriores.add(atual.matriculaDisciplina);
      atuais.add(anterior.matriculaDisciplina);
      grafo.set(anterior.matriculaDisciplina, anteriores);
      grafo.set(atual.matriculaDisciplina, atuais);
      grafos.set(atual.escopo, grafo);
    }
  }

  const aliases = new Map();
  const tamanhoComponente = new Map();
  for (const [escopo, grafo] of grafos) {
    const visitados = new Set();
    for (const inicio of grafo.keys()) {
      if (visitados.has(inicio)) continue;
      const pilha = [inicio];
      const componente = [];
      while (pilha.length) {
        const id = pilha.pop();
        if (visitados.has(id)) continue;
        visitados.add(id);
        componente.push(id);
        for (const vizinho of grafo.get(id) ?? []) pilha.push(vizinho);
      }
      const ordenados = [...componente].sort((left, right) => {
        const leftJornada = idsJornada.has(left) ? 1 : 0;
        const rightJornada = idsJornada.has(right) ? 1 : 0;
        if (leftJornada !== rightJornada) return rightJornada - leftJornada;
        const leftSuporte = suporte.get(`${escopo}|md:${left}`) ?? { total: 0, ultima: -Infinity };
        const rightSuporte = suporte.get(`${escopo}|md:${right}`) ?? { total: 0, ultima: -Infinity };
        return rightSuporte.ultima - leftSuporte.ultima ||
          rightSuporte.total - leftSuporte.total || right - left;
      });
      const canonica = ordenados[0];
      for (const id of componente) {
        aliases.set(`${escopo}|md:${id}`, canonica);
        tamanhoComponente.set(`${escopo}|md:${id}`, componente.length);
      }
      const eventoBase = eventos.find((item) =>
        chaveEscopoMatriculaDisciplina(item) === escopo &&
        componente.includes(matriculaDisciplinaId(item))
      );
      pushDiagnostico(diagnosticos, 'continuidade_matricula_disciplina_inferida', eventoBase, {
        matriculas_disciplinas_origem: [...componente].sort((a, b) => a - b),
        emusys_matricula_disciplina_id_canonica: canonica,
        criterio: idsJornada.has(canonica)
          ? 'jornada_atual_e_continuidade_semantica_temporal'
          : 'continuidade_semantica_temporal_e_ultima_evidencia',
      });
    }
  }

  const candidatasPorEscopo = new Map();
  for (const evento of eventos) {
    const escopo = chaveEscopoMatriculaDisciplina(evento);
    const original = matriculaDisciplinaId(evento);
    if (!escopo || original === null) continue;
    const canonica = aliases.get(`${escopo}|md:${original}`) ?? original;
    const candidatas = candidatasPorEscopo.get(escopo) ?? new Set();
    candidatas.add(canonica);
    candidatasPorEscopo.set(escopo, candidatas);
  }

  const resultado = [];
  for (const grupo of gruposSemanticos.values()) {
    const escopo = chaveEscopoMatriculaDisciplina(grupo[0]);
    const idsExatos = [...new Set(grupo.map(matriculaDisciplinaId).filter((item) => item !== null))];
    const idsCanonicos = [...new Set(idsExatos.map((id) =>
      aliases.get(`${escopo}|md:${id}`) ?? id
    ))];
    const candidatasEscopo = [...(candidatasPorEscopo.get(escopo) ?? [])];
    const associadaPorEscopo = idsCanonicos.length === 0 && candidatasEscopo.length === 1;
    const canonicaDoEvento = idsCanonicos.length === 1
      ? idsCanonicos[0]
      : associadaPorEscopo
      ? candidatasEscopo[0]
      : null;
    const normalizados = grupo.map((evento) => {
      const original = matriculaDisciplinaId(evento);
      const canonica = original !== null
        ? aliases.get(`${escopo}|md:${original}`) ?? original
        : canonicaDoEvento;
      const componente = original === null
        ? 1
        : tamanhoComponente.get(`${escopo}|md:${original}`) ?? 1;
      return {
        ...evento,
        emusys_matricula_disciplina_id: canonica,
        emusys_matricula_disciplina_id_origem: original,
        continuidade_matricula_disciplina_inferida: componente > 1,
        fallback_matricula_disciplina_associado: original === null && associadaPorEscopo,
      };
    });
    normalizados.sort((left, right) => {
      const leftOriginal = matriculaDisciplinaId({
        emusys_matricula_disciplina_id: left.emusys_matricula_disciplina_id_origem,
      });
      const rightOriginal = matriculaDisciplinaId({
        emusys_matricula_disciplina_id: right.emusys_matricula_disciplina_id_origem,
      });
      const leftPreferida = leftOriginal !== null &&
        leftOriginal === matriculaDisciplinaId(left) ? 1 : 0;
      const rightPreferida = rightOriginal !== null &&
        rightOriginal === matriculaDisciplinaId(right) ? 1 : 0;
      return rightPreferida - leftPreferida ||
        Number(rightOriginal !== null) - Number(leftOriginal !== null) ||
        (asNumber(left.emusys_aula_id) ?? 0) - (asNumber(right.emusys_aula_id) ?? 0);
    });
    const mantido = normalizados[0];
    resultado.push(mantido);
    if (grupo.length > 1) {
      pushDiagnostico(diagnosticos, 'evento_semantico_duplicado_suprimido', mantido, {
        emusys_aula_id_mantida: asNumber(mantido.emusys_aula_id),
        emusys_aulas_ids_suprimidas: normalizados.slice(1)
          .map((item) => asNumber(item.emusys_aula_id)).filter((item) => item !== null),
        matriculas_disciplinas_origem: [...new Set(normalizados
          .map((item) => asNumber(item.emusys_matricula_disciplina_id_origem))
          .filter((item) => item !== null))].sort((a, b) => a - b),
        emusys_matricula_disciplina_id_canonica: matriculaDisciplinaId(mantido),
      });
    }
    if (associadaPorEscopo) {
      pushDiagnostico(diagnosticos, 'fallback_matricula_disciplina_associado', mantido, {
        emusys_matricula_disciplina_id_canonica: canonicaDoEvento,
        criterio: 'unica_matricula_disciplina_no_escopo_pessoa_disciplina',
      });
    }
  }

  const chavesAgrupadas = new Set(gruposSemanticos.keys());
  for (const evento of eventos) {
    const chave = chaveEventoSemantico(evento);
    if (!chave || !chavesAgrupadas.has(chave)) resultado.push(evento);
  }
  return resultado;
}

function deduplicarEventos(eventos) {
  const unicos = new Map();
  for (const evento of eventos) {
    const aulaId = asNumber(evento.emusys_aula_id);
    const key = aulaId === null
      ? `${evento.data_hora_inicio}|${professorEmusysId(evento)}`
      : String(aulaId);
    const atual = unicos.get(key);
    if (!atual || JSON.stringify(evento).localeCompare(JSON.stringify(atual)) < 0) {
      unicos.set(key, evento);
    }
  }
  return [...unicos.values()].sort((a, b) =>
    (asTime(a.data_hora_inicio) ?? 0) - (asTime(b.data_hora_inicio) ?? 0) ||
    (asNumber(a.emusys_aula_id) ?? 0) - (asNumber(b.emusys_aula_id) ?? 0)
  );
}

function construirRuns(eventos) {
  const runs = [];
  for (const evento of eventos) {
    const professor = professorEmusysId(evento);
    const ultimo = runs.at(-1);
    if (ultimo && ultimo.emusys_professor_id === professor) {
      ultimo.eventos.push(evento);
    } else {
      runs.push({ emusys_professor_id: professor, eventos: [evento] });
    }
  }
  return runs;
}

function normalizarSubstituicoes(runs, diagnosticos) {
  const resultado = runs.map((run) => ({ ...run, eventos: [...run.eventos] }));
  const substituicoes = [];

  for (let index = 1; index < resultado.length - 1;) {
    const anterior = resultado[index - 1];
    const atual = resultado[index];
    const posterior = resultado[index + 1];
    if (
      atual.eventos.length <= 2 &&
      anterior.emusys_professor_id === posterior.emusys_professor_id &&
      atual.emusys_professor_id !== anterior.emusys_professor_id
    ) {
      const detalhe = {
        professor_titular_emusys_id: anterior.emusys_professor_id,
        professor_substituto_emusys_id: atual.emusys_professor_id,
        aulas_substituicao: atual.eventos.map((item) => asNumber(item.emusys_aula_id)),
      };
      pushDiagnostico(diagnosticos, 'substituicao_candidata', atual.eventos[0], detalhe);
      substituicoes.push(detalhe);
      anterior.eventos = [...anterior.eventos, ...posterior.eventos].sort((a, b) =>
        (asTime(a.data_hora_inicio) ?? 0) - (asTime(b.data_hora_inicio) ?? 0)
      );
      resultado.splice(index, 2);
      continue;
    }
    index += 1;
  }

  return { runs: resultado, substituicoes };
}

function contextoDaParticao(contexto, primeiroEvento) {
  const matriculaDisciplina = matriculaDisciplinaId(primeiroEvento);
  const jornadas = Array.isArray(contexto.jornadas_atuais)
    ? contexto.jornadas_atuais
    : contexto.jornada_atual
    ? [contexto.jornada_atual]
    : [];
  const jornada = jornadas.find((item) =>
    asNumber(item.emusys_matricula_disciplina_id) === matriculaDisciplina
  ) ?? null;
  const transicoes = (Array.isArray(contexto.transicoes) ? contexto.transicoes : [])
    .filter((item) =>
      asNumber(item.emusys_matricula_disciplina_id) === matriculaDisciplina
    );
  return { jornada, transicoes };
}

function adicionarTransicoesEstruturadas(eventos, particao, contexto, diagnosticos) {
  const resultado = [...eventos];
  const fimRecorte = asTime(`${contexto.data_fim_recorte ?? '9999-12-31'}T23:59:59Z`);
  const transicoes = [...particao.transicoes].sort((a, b) =>
    (asTime(a.data_transicao) ?? 0) - (asTime(b.data_transicao) ?? 0)
  );

  for (const transicao of transicoes) {
    const dataTransicao = asTime(transicao.data_transicao);
    const professorNovo = asNumber(transicao.emusys_professor_novo_id);
    if (dataTransicao === null || professorNovo === null || professorNovo === 0) continue;
    if (fimRecorte !== null && dataTransicao > fimRecorte) continue;
    const jaRepresentada = resultado.some((evento) =>
      professorEmusysId(evento) === professorNovo &&
      asTime(evento.data_hora_inicio) !== null &&
      asTime(evento.data_hora_inicio) >= dataTransicao
    );
    if (jaRepresentada) continue;
    const base = resultado.at(-1);
    if (!base || dataTransicao < (asTime(base.data_hora_inicio) ?? 0)) continue;

    const professorLocal = asNumber(
      transicao.professor_novo_id_resolvido ?? transicao.professor_novo_id,
    );
    resultado.push({
      ...base,
      emusys_aula_id: null,
      data_hora_inicio: new Date(dataTransicao).toISOString(),
      professor_id: professorLocal,
      emusys_professor_id: professorNovo,
      professor_resolvido_por_id: professorLocal !== null,
      evento_sintetico: 'transicao_webhook',
    });
    pushDiagnostico(diagnosticos, 'transicao_estruturada_sem_aula_nova', base, {
      data_transicao: new Date(dataTransicao).toISOString(),
      emusys_professor_novo_id: professorNovo,
    });
  }

  return resultado.sort((a, b) =>
    (asTime(a.data_hora_inicio) ?? 0) - (asTime(b.data_hora_inicio) ?? 0)
  );
}

function confirmacaoDoRun(run, index, runs, particao) {
  if (index === 0) return { confirmada: true, fonte: 'primeiro_evento_observado' };
  if (run.eventos.length >= 3) return { confirmada: true, fonte: 'sequencia_sustentada' };

  const inicio = asTime(run.eventos[0].data_hora_inicio);
  const transicao = particao.transicoes.find((item) => {
    const professorNovo = asNumber(item.emusys_professor_novo_id);
    const data = asTime(item.data_transicao);
    if (professorNovo !== run.emusys_professor_id || data === null || inicio === null) return false;
    return Math.abs(data - inicio) <= 45 * 24 * 60 * 60 * 1000;
  });
  if (transicao) {
    return {
      confirmada: true,
      fonte: 'transicao_webhook',
      data_transicao: iso(transicao.data_transicao),
    };
  }

  const ehUltimo = index === runs.length - 1;
  if (
    ehUltimo &&
    particao.jornada &&
    asNumber(particao.jornada.emusys_professor_id) === run.emusys_professor_id
  ) {
    return { confirmada: true, fonte: 'jornada_atual' };
  }
  return { confirmada: false, fonte: 'troca_nao_sustentada' };
}

function confiancaPeriodo({
  eventos,
  matriculaDisciplina,
  inicioIncompleto,
  substituicao,
  conflito,
}) {
  if (
    conflito ||
    matriculaDisciplina === null ||
    eventos.some((item) => professorEmusysId(item) === null || item.professor_resolvido_por_id === false)
  ) return 'revisar';
  if (
    inicioIncompleto || substituicao ||
    eventos.some((item) =>
      item.continuidade_matricula_disciplina_inferida === true ||
      item.fallback_matricula_disciplina_associado === true
    )
  ) return 'media';
  return 'alta';
}

function montarPeriodo({
  run,
  primeiroEvento,
  dataFim,
  tipoFim,
  status,
  contexto,
  substituicoes,
  conflito,
  inicioIncompleto,
}) {
  const eventos = run.eventos;
  const inicio = iso(eventos[0].data_hora_inicio);
  const matriculaDisciplina = matriculaDisciplinaId(primeiroEvento);
  const substituicao = substituicoes.length > 0;
  const conflitos = conflito ? [conflito] : [];
  const confianca = confiancaPeriodo({
    eventos,
    matriculaDisciplina,
    inicioIncompleto,
    substituicao,
    conflito,
  });
  const professorResolvido = eventos.find((item) => item.professor_id !== null && item.professor_id !== undefined);

  return {
    pessoa_chave: pessoaChave(primeiroEvento),
    aluno_id: asNumber(primeiroEvento.aluno_id),
    emusys_aluno_id: asNumber(primeiroEvento.emusys_aluno_id),
    emusys_matricula_id: asNumber(primeiroEvento.emusys_matricula_id),
    emusys_matricula_disciplina_id: matriculaDisciplina,
    emusys_disciplina_id: asNumber(primeiroEvento.emusys_disciplina_id),
    curso_id: asNumber(primeiroEvento.curso_id),
    professor_id: asNumber(professorResolvido?.professor_id),
    emusys_professor_id: run.emusys_professor_id,
    data_inicio: inicio,
    data_fim: dataFim,
    status_periodo: status,
    tipo_inicio: contexto.tipo_inicio ?? 'primeira_aula_observada',
    tipo_fim: tipoFim,
    motivo_saida_id: null,
    conta_retencao_professor: null,
    confianca,
    inicio_incompleto: inicioIncompleto,
    substituicao_candidata: substituicao,
    conflitos,
    publicavel_sugerido: confianca === 'alta' || confianca === 'revisado_aprovado',
    entrada_hash: contexto.entrada_hash ?? null,
    evidencias: {
      regra_versao: contexto.versao_reconstrucao,
      aulas: eventos.map((item) => asNumber(item.emusys_aula_id)).filter((item) => item !== null),
      total_aulas: eventos.length,
      primeira_aula: inicio,
      ultima_aula: iso(eventos.at(-1).data_hora_inicio),
      substituicoes_candidatas: substituicoes,
      inicio_incompleto: inicioIncompleto,
      resolucao_professor: professorResolvido ? 'emusys_id_unidade' : 'nao_resolvido',
      resolucao_matricula_disciplina: matriculaDisciplina === null
        ? 'fallback_aluno_disciplina'
        : 'emusys_matricula_disciplina_id',
      matriculas_disciplinas_origem: [...new Set(eventos
        .flatMap((item) => [
          asNumber(item.emusys_matricula_disciplina_id_origem),
          matriculaDisciplinaId(item),
        ])
        .filter((item) => item !== null))].sort((a, b) => a - b),
    },
  };
}

function reconstruirParticao(eventos, contexto, diagnosticos) {
  const deduplicados = deduplicarEventos(eventos);
  const primeiroEvento = deduplicados[0];
  const particao = contextoDaParticao(contexto, primeiroEvento);
  const ordenados = adicionarTransicoesEstruturadas(
    deduplicados,
    particao,
    contexto,
    diagnosticos,
  );
  const { runs, substituicoes } = normalizarSubstituicoes(construirRuns(ordenados), diagnosticos);
  const continuidadeInferida = deduplicados.some((item) =>
    item.continuidade_matricula_disciplina_inferida === true
  );
  const inicioConfirmado = contexto.inicio_completo === true || (!continuidadeInferida &&
    particao.jornada &&
    asTime(particao.jornada.data_primeira_aula) !== null &&
    asTime(particao.jornada.data_primeira_aula) >= asTime(contexto.data_inicio_recorte)
  );
  const periodos = [];

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const proximo = runs[index + 1] ?? null;
    const confirmacaoProxima = proximo
      ? confirmacaoDoRun(proximo, index + 1, runs, particao)
      : null;
    const conflito = confirmacaoProxima && !confirmacaoProxima.confirmada
      ? 'troca_nao_sustentada'
      : null;
    if (conflito) {
      pushDiagnostico(diagnosticos, conflito, proximo.eventos[0], {
        professor_anterior_emusys_id: run.emusys_professor_id,
        total_eventos_novo_professor: proximo.eventos.length,
      });
    }

    const primeiraEvidenciaNovoProfessor = proximo
      ? iso(proximo.eventos[0].data_hora_inicio)
      : null;
    const dataTransicaoEstruturada = confirmacaoProxima?.data_transicao ?? null;
    const dataFim = proximo && primeiraEvidenciaNovoProfessor
      ? dataTransicaoEstruturada &&
          (asTime(dataTransicaoEstruturada) ?? Infinity) <
            (asTime(primeiraEvidenciaNovoProfessor) ?? Infinity)
        ? dataTransicaoEstruturada
        : primeiraEvidenciaNovoProfessor
      : null;
    const tipoFim = proximo
      ? confirmacaoProxima?.confirmada
        ? confirmacaoProxima.fonte === 'transicao_webhook'
          ? 'troca_confirmada_transicao'
          : confirmacaoProxima.fonte === 'jornada_atual'
          ? 'troca_confirmada_jornada'
          : 'troca_sustentada'
        : 'troca_nao_sustentada'
      : null;

    const substituicoesDoRun = substituicoes.filter((item) =>
      item.professor_titular_emusys_id === run.emusys_professor_id
    );
    const periodo = montarPeriodo({
      run,
      primeiroEvento,
      dataFim,
      tipoFim,
      status: proximo ? 'encerrado' : 'ativo',
      contexto,
      substituicoes: substituicoesDoRun,
      conflito,
      inicioIncompleto: index === 0 && !inicioConfirmado,
    });
    periodos.push(periodo);

    if (conflito && proximo) {
      // A parte seguinte tambem precisa permanecer em revisao.
      proximo.eventos = proximo.eventos.map((item) => ({
        ...item,
        professor_resolvido_por_id: false,
      }));
    }
  }

  const ultimo = periodos.at(-1);
  if (ultimo && particao.jornada) {
    const statusJornada = String(particao.jornada.status_matricula ?? '').toLowerCase();
    const professorAtual = asNumber(particao.jornada.emusys_professor_id);
    if (statusJornada !== 'ativa') {
      const fim = iso(particao.jornada.data_ultima_aula) ??
        iso(ordenados.at(-1).data_hora_inicio);
      if (fim && asTime(fim) >= asTime(ultimo.data_inicio)) {
        ultimo.data_fim = fim;
        ultimo.status_periodo = 'encerrado';
        ultimo.tipo_fim = 'fim_jornada';
      }
    } else if (professorAtual !== null && professorAtual !== ultimo.emusys_professor_id) {
      ultimo.confianca = 'revisar';
      ultimo.publicavel_sugerido = false;
      ultimo.conflitos = [...ultimo.conflitos, 'jornada_atual_divergente'];
      pushDiagnostico(diagnosticos, 'jornada_atual_divergente', ordenados.at(-1), {
        professor_jornada_emusys_id: professorAtual,
      });
    }
  }

  return periodos;
}

export function calcularDuracaoMeses(dataInicio, dataFim) {
  const inicio = asTime(dataInicio);
  const fim = asTime(dataFim);
  if (inicio === null || fim === null || fim < inicio) return null;
  return (fim - inicio) / 86_400_000 / MESES_DIVISOR_DIAS;
}

export function ehElegivelPermanencia(dataInicio, dataFim) {
  const meses = calcularDuracaoMeses(dataInicio, dataFim);
  return meses !== null && meses >= 4;
}

export function reconstruirPeriodos(eventosOriginais, contexto = {}) {
  const diagnosticos = [];
  const particoes = new Map();
  const eventosElegiveis = [];

  for (const evento of Array.isArray(eventosOriginais) ? eventosOriginais : []) {
    if (String(evento.categoria ?? '').trim().toLowerCase() === 'experimental') {
      pushDiagnostico(diagnosticos, 'aula_experimental_ignorada', evento);
      continue;
    }
    if (evento.cancelada === true) {
      pushDiagnostico(diagnosticos, 'aula_cancelada_ignorada', evento);
      continue;
    }
    const professor = professorEmusysId(evento);
    if (evento.sem_acompanhamento === true || professor === 0) {
      pushDiagnostico(diagnosticos, 'sem_acompanhamento', evento);
      continue;
    }
    if (professor === null) {
      pushDiagnostico(diagnosticos, 'professor_emusys_ausente', evento);
      continue;
    }
    eventosElegiveis.push(evento);
  }

  const eventosNormalizados = normalizarDuplicatasEmusys(
    eventosElegiveis,
    contexto,
    diagnosticos,
  );
  for (const evento of eventosNormalizados) {
    const chave = chaveParticao(evento);
    if (!chave) {
      pushDiagnostico(diagnosticos, 'identidade_particao_insuficiente', evento);
      continue;
    }
    const atuais = particoes.get(chave) ?? [];
    atuais.push(evento);
    particoes.set(chave, atuais);
  }

  const periodos = [];
  for (const eventos of particoes.values()) {
    periodos.push(...reconstruirParticao(eventos, contexto, diagnosticos));
  }

  return {
    periodos: periodos.sort((a, b) =>
      a.pessoa_chave.localeCompare(b.pessoa_chave) ||
      (asTime(a.data_inicio) ?? 0) - (asTime(b.data_inicio) ?? 0)
    ),
    diagnosticos,
    total_eventos: Array.isArray(eventosOriginais) ? eventosOriginais.length : 0,
    total_particoes: particoes.size,
  };
}

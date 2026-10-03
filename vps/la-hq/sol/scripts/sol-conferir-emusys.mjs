// CONFERIR UM ALUNO: Emusys (a verdade) × LA Report (03/10/2026).
//
// Por quê: todo mês a equipe se confunde com quem entrou ou não no relatório
// (03/10: o Jhon/CG refez setembro à mão). A Sol passa a conferir aluno a aluno
// e, se o Emusys disser uma coisa e o LA Report outra, avisa e manda falar com
// o Hugo. A COMPARAÇÃO mora aqui, em código testado (tests/solConferirEmusys) —
// o modelo só lê o resultado. Conta feita "de cabeça" pelo modelo tornaria a
// comparação inútil: não daria para saber se a diferença é do dado ou da conta.
//
// Só leitura: este módulo faz GET em /matriculas e nada mais.

const BASE = 'https://api.emusys.com.br/v1';

// ⚠️ O código da unidade no banco é `REC`, mas o token se chama RECREIO.
const TOKEN_POR_CODIGO = { CG: 'EMUSYS_TOKEN_CG', BARRA: 'EMUSYS_TOKEN_BARRA', REC: 'EMUSYS_TOKEN_RECREIO' };

export function nomeDoToken(codigoUnidade) {
  return TOKEN_POR_CODIGO[String(codigoUnidade || '').toUpperCase()] || null;
}

// Paginação é SÓ por cursor; `limite>50` devolve lista vazia sem erro (medido).
export async function buscarMatriculasEmusys(alunoId, token, fetchFn = fetch) {
  const itens = [];
  let cursor = null;
  for (let pagina = 0; pagina < 4; pagina += 1) {
    const qs = new URLSearchParams({ aluno_id: String(alunoId), limite: '50' });
    if (cursor) qs.set('cursor', cursor);
    const r = await fetchFn(`${BASE}/matriculas?${qs}`, {
      headers: { token }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`emusys_http_${r.status}`);
    const d = await r.json();
    itens.push(...(d.items || []));
    if (!d.paginacao || !d.paginacao.tem_mais || !d.paginacao.proximo_cursor) break;
    cursor = d.paginacao.proximo_cursor;
  }
  // `aluno_id` é filtro real (o `matricula_id` não é). Mesmo assim, conferir:
  // a API ignora parâmetro desconhecido em silêncio e devolveria a escola toda.
  return itens.filter((m) => String(m.aluno && m.aluno.id) === String(alunoId));
}

const mes = (d) => (d ? String(d).slice(0, 7) : null);
const br = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '?');
const mesBr = (m) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '?');
function distanciaMeses(a, b) {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (ya - yb) * 12 + (ma - mb);
}
function mesesAtras(hoje, n) {
  const [y, m] = hoje.slice(0, 7).split('-').map(Number);
  const t = y * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// "Canto T" (Emusys) e "Canto" (LA Report) são o mesmo curso.
export function normalizarCurso(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+t$/, '').replace(/\s+/g, ' ');
}

export function resumirMatriculaEmusys(m) {
  const c = m.contrato_atual || {};
  const discs = (c.disciplinas || []).map((x) => x.nome).filter(Boolean);
  const valor = Number(c.valor_mensalidade || 0);
  const liquida = valor - Number(c.desconto_fixo || 0) - Number(c.desconto_condicional || 0);
  return {
    matricula_id: m.id,
    curso: discs.join(' + ').trim() || null,
    status: m.status || null,
    motivo_inativa: m.motivo_inativa || null,
    data_matricula: m.data_matricula || null,
    inicio_contrato_atual: c.data_original_primeira_aula || null,
    fim_contrato_atual: c.data_original_ultima_aula || null,
    mensalidade: valor,
    mensalidade_liquida: Math.round(liquida * 100) / 100,
    bolsa: c.bolsa === true,
    trancamento: m.trancamento_ativo || null,
  };
}

const STATUS_ESPERADO = { ativa: ['ativo'], trancada: ['trancado'] };
const CONFIRMADA = ['confirmada', 'antecipada_confirmada'];
const JANELA_MESES = 6;

// lareport = saída de sol_porta_conferir_aluno_v1; emusys = matrículas cruas da API.
export function compararAluno(lareport, emusys, hoje = new Date().toISOString().slice(0, 10)) {
  const confere = [];
  const divergencias = [];
  const nossas = lareport.matriculas || [];
  const porMatricula = new Map(nossas.filter((n) => n.emusys_matricula_id)
    .map((n) => [String(n.emusys_matricula_id), n]));
  const usadas = new Set();
  const desde = mesesAtras(hoje, JANELA_MESES);
  const resumos = emusys.map(resumirMatriculaEmusys);

  // ── 1. Situação e bolsa, matrícula a matrícula ──
  for (const e of resumos) {
    const n = porMatricula.get(String(e.matricula_id));
    const curso = e.curso || n?.curso || 'curso';
    if (!n) {
      if (e.status !== 'inativa') {
        divergencias.push({ tipo: 'matricula_sem_cadastro', curso,
          explicacao: `No Emusys existe a matrícula de ${curso} (${e.status}), mas ela não está ligada a nenhum cadastro no LA Report.` });
      }
      continue;
    }
    usadas.add(n.aluno_id);
    const esperado = STATUS_ESPERADO[e.status];
    const statusDiverge = esperado ? !esperado.includes(n.status)
      : (e.status === 'inativa' && ['ativo', 'trancado'].includes(n.status));
    if (statusDiverge) {
      const motivo = e.motivo_inativa === 'concluida' ? ' (contrato concluído)'
        : e.motivo_inativa === 'interrompida' ? ' (interrompida)' : '';
      divergencias.push({ tipo: 'status_diverge', curso,
        explicacao: `No Emusys a matrícula de ${curso} está ${e.status}${motivo}; no LA Report está ${n.status}.` });
    }
    // ⚠️ Mensalidade líquida NEGATIVA não é bolsa: é inconsistência conhecida da
    //    API (às vezes embute o desconto fixo no valor). Bolsa = flag do Emusys,
    //    ou parcela zero no LA Report com o aluno cadastrado como regular.
    if (e.status !== 'inativa' && !n.bolsista && !n.banda
        && (e.bolsa || Number(n.valor_parcela) === 0)) {
      divergencias.push({ tipo: 'bolsista_diverge', curso,
        explicacao: e.bolsa
          ? `No Emusys a matrícula de ${curso} é BOLSA; no LA Report não está como bolsista — e por isso entra no total do relatório.`
          : `No LA Report ${curso} está como aluno regular com parcela R$ 0 (no Emusys a mensalidade líquida é R$ ${e.mensalidade_liquida}). Se for bolsista, o cadastro precisa dizer; senão entra no total do relatório.` });
    }
  }

  // ── 2. Renovações da PESSOA × contratos novos do Emusys (últimos 6 meses) ──
  // Ligação, do sinal mais forte ao mais fraco: (a) a data da 1ª aula bate
  // exata; (b) mesmo curso e mesmo mês; (c) mesmo curso, mês diferente. A linha
  // do cadastro NÃO serve de ligação: já houve renovação de Teclado lançada
  // como Canto (Gabriel Mello, 09/06/2026) — a data da 1ª aula é o que prova.
  const rens = nossas.flatMap((n) => (n.movimentacoes || [])
    .filter((m) => m.tipo === 'renovacao' && m.conta_no_mes >= desde)
    .map((m) => ({ ...m, curso: m.curso || n.curso })));
  // Contrato novo = o contrato atual começou depois do mês da matrícula.
  // (`qtd_contratos` não serve: vem 0, 1 ou 2 para casos equivalentes.)
  const contratos = resumos
    .filter((e) => e.inicio_contrato_atual && mes(e.inicio_contrato_atual) >= desde
      && (!e.data_matricula || mes(e.data_matricula) < mes(e.inicio_contrato_atual)))
    .map((e) => ({ ...e, S: mes(e.inicio_contrato_atual), cursoN: normalizarCurso(e.curso) }));
  const livresR = new Set(rens.map((r) => r.id));
  const livresC = new Set(contratos.map((c) => c.matricula_id));

  const casar = (c, r, tipo) => {
    livresR.delete(r.id); livresC.delete(c.matricula_id);
    if (tipo === 'mes') {
      divergencias.push({ tipo: 'mes_diverge', curso: c.curso,
        explicacao: `No Emusys o contrato novo de ${c.curso} começou em ${br(c.inicio_contrato_atual)} (conta em ${mesBr(c.S)}); no LA Report a renovação está contando em ${mesBr(r.conta_no_mes)}.`
          + (r.entra_no_total === false ? ' (Bolsista/banda: não entra no total do relatório.)' : '') });
      return;
    }
    const extra = (CONFIRMADA.includes(r.status) ? '' : ' Ela ainda está PENDENTE de validação no LA Report.')
      + (r.entra_no_total === false ? ' (Bolsista/banda: não entra no total do relatório.)' : '');
    confere.push({ tipo: 'renovacao_confere', curso: c.curso,
      explicacao: `No Emusys o contrato novo de ${c.curso} começa em ${br(c.inicio_contrato_atual)}; no LA Report a renovação conta em ${mesBr(r.conta_no_mes)}. Bate.${extra}` });
    if (normalizarCurso(r.curso) !== c.cursoN) {
      divergencias.push({ tipo: 'curso_diverge', curso: c.curso,
        explicacao: `A renovação que conta em ${mesBr(r.conta_no_mes)} está lançada no LA Report como ${r.curso}, mas pela data da 1ª aula (${br(c.inicio_contrato_atual)}) ela é do contrato de ${c.curso} no Emusys.` });
    }
  };

  for (const c of contratos) {
    const r = rens.find((x) => livresR.has(x.id) && x.primeira_aula_novo_contrato === c.inicio_contrato_atual);
    if (r) casar(c, r, 'exato');
  }
  for (const c of contratos.filter((x) => livresC.has(x.matricula_id))) {
    const r = rens.find((x) => livresR.has(x.id) && normalizarCurso(x.curso) === c.cursoN && x.conta_no_mes === c.S);
    if (r) casar(c, r, 'exato');
  }
  for (const c of contratos.filter((x) => livresC.has(x.matricula_id))) {
    const r = rens.find((x) => livresR.has(x.id) && normalizarCurso(x.curso) === c.cursoN
      && Math.abs(distanciaMeses(x.conta_no_mes, c.S)) <= 3);
    if (r) casar(c, r, 'mes');
  }
  for (const c of contratos.filter((x) => livresC.has(x.matricula_id))) {
    if (c.status === 'inativa') continue;
    divergencias.push({ tipo: 'renovacao_ausente', curso: c.curso,
      explicacao: `No Emusys há contrato novo de ${c.curso} começando em ${br(c.inicio_contrato_atual)}, mas o LA Report não tem renovação dele em ${mesBr(c.S)}.` });
  }
  for (const r of rens.filter((x) => livresR.has(x.id))) {
    const atual = resumos.find((e) => normalizarCurso(e.curso) === normalizarCurso(r.curso) && e.status !== 'inativa');
    divergencias.push({ tipo: 'renovacao_sem_contrato', curso: r.curso,
      explicacao: `No LA Report há uma renovação de ${r.curso} contando em ${mesBr(r.conta_no_mes)}, mas no Emusys não existe contrato novo correspondente`
        + (atual && atual.inicio_contrato_atual ? ` (o contrato atual de ${atual.curso} começou em ${br(atual.inicio_contrato_atual)}).` : '.')
        + (r.entra_no_total === false ? ' (Bolsista/banda: não entra no total do relatório.)' : '') });
  }

  // ── 3. Cadastro ativo que o Emusys não confirma ──
  for (const n of nossas) {
    if (usadas.has(n.aluno_id) || !['ativo', 'trancado'].includes(n.status)) continue;
    divergencias.push({ tipo: n.emusys_matricula_id ? 'matricula_nao_achada_no_emusys' : 'cadastro_sem_vinculo', curso: n.curso,
      explicacao: n.emusys_matricula_id
        ? `No LA Report ${n.curso} está ${n.status}, mas a matrícula ligada a ele não apareceu no Emusys.`
        : `No LA Report ${n.curso} está ${n.status}, mas o cadastro não está ligado a nenhuma matrícula do Emusys.` });
  }

  return { confere, divergencias, emusys: resumos };
}

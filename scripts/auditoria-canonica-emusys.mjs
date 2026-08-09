// Auditoria canônica: baixa GET /matriculas das 3 unidades e grava um extrato plano.
// Somente LEITURA. Não escreve nada no Emusys nem no Supabase.
//
// Uso: node scripts/auditoria-canonica-emusys.mjs [saida.json]
//
// Respeita o rate limit da API (60 req/min por IP) com pausa entre páginas.
import fs from 'node:fs';
import path from 'node:path';

const raizRepo = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(raizRepo, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((linha) => linha.includes('=') && !linha.trim().startsWith('#'))
    .map((linha) => {
      const corte = linha.indexOf('=');
      return [linha.slice(0, corte).trim(), linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const BASE = env.EMUSYS_API_BASE_URL || 'https://api.emusys.com.br/v1';
const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: env.EMUSYS_TOKEN_CAMPO_GRANDE },
  { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: env.EMUSYS_TOKEN_BARRA },
  { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: env.EMUSYS_TOKEN_RECREIO },
];

// O teto e 60 req/min POR IP e a producao (crons de 15 min, syncs) divide o mesmo IP.
// 1,6 s da ~37/min, deixando folga para o resto da casa.
const PAUSA_MS = 1600;
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buscarPagina(token, cursor) {
  const url = new URL(`${BASE}/matriculas`);
  url.searchParams.set('status', 'todas');
  url.searchParams.set('limite', '50');
  if (cursor) url.searchParams.set('cursor', cursor);

  for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
    const resposta = await fetch(url, { headers: { token } });
    if (resposta.status === 429) {
      // O 429 ja derrubou sync nesta base antes: recuo longo em vez de desistir.
      const recuo = Math.min(60000, 5000 * 2 ** (tentativa - 1));
      process.stderr.write(`\n  429 — recuando ${recuo / 1000}s (tentativa ${tentativa})\n`);
      await espera(recuo);
      continue;
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url.pathname}${url.search}`);
    return resposta.json();
  }
  throw new Error('EMUSYS_HTTP_429 persistente apos 6 tentativas');
}

async function coletarUnidade(unidade) {
  const matriculas = [];
  const disciplinas = [];
  let cursor = null;
  let paginas = 0;

  do {
    const pagina = await buscarPagina(unidade.token, cursor);
    paginas += 1;
    for (const item of pagina.items ?? []) {
      matriculas.push({
        unidade: unidade.nome,
        unidade_id: unidade.id,
        matricula_id: item.id,
        data_matricula: item.data_matricula,
        status: item.status,
        motivo_inativa: item.motivo_inativa ?? null,
        trancamento_ativo: item.trancamento_ativo ?? null,
        qtd_contratos: item.qtd_contratos ?? null,
        aluno_id: item.aluno?.id ?? null,
        aluno_nome: item.aluno?.nome ?? null,
        lead_id: item.aluno?.lead_id ?? null,
        contrato_id: item.contrato_atual?.id ?? null,
        inadimplente: item.contrato_atual?.inadimplente ?? null,
      });
      for (const disciplina of item.contrato_atual?.disciplinas ?? []) {
        disciplinas.push({
          unidade: unidade.nome,
          unidade_id: unidade.id,
          matricula_id: item.id,
          aluno_id: item.aluno?.id ?? null,
          aluno_nome: item.aluno?.nome ?? null,
          lead_id: item.aluno?.lead_id ?? null,
          status_matricula: item.status,
          matricula_disciplina_id: disciplina.matricula_disciplina_id ?? disciplina.id ?? null,
          disciplina_id: disciplina.disciplina_id ?? null,
          disciplina_nome: disciplina.nome ?? null,
          nome_professor: disciplina.nome_professor ?? null,
          nr_aulas_contratadas: disciplina.nr_aulas_contratadas ?? null,
          nr_aulas_passadas: disciplina.nr_aulas_passadas ?? null,
          nr_aulas_futuras: disciplina.nr_aulas_futuras ?? null,
        });
      }
    }
    cursor = pagina.paginacao?.tem_mais ? pagina.paginacao.proximo_cursor : null;
    process.stderr.write(`\r${unidade.nome}: ${paginas} pág, ${matriculas.length} matrículas, ${disciplinas.length} disciplinas   `);
    if (cursor) await espera(PAUSA_MS);
  } while (cursor);

  process.stderr.write('\n');
  return { matriculas, disciplinas, paginas };
}

// Grava por unidade assim que termina: 51 paginas de Campo Grande nao podem ser
// perdidas porque a Barra tomou 429 depois.
const pastaSaida = process.argv[2] || path.join(raizRepo, 'outputs');
fs.mkdirSync(pastaSaida, { recursive: true });

const resumo = [];
for (const unidade of UNIDADES) {
  if (!unidade.token) throw new Error(`token ausente para ${unidade.nome}`);
  const arquivo = path.join(pastaSaida, `emusys-matriculas-${unidade.nome.toLowerCase().replace(/\s+/g, '-')}.json`);
  if (fs.existsSync(arquivo)) {
    process.stderr.write(`${unidade.nome}: já coletada, pulando\n`);
    const jaTem = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    resumo.push(sintetizar(unidade.nome, jaTem));
    continue;
  }
  const dados = await coletarUnidade(unidade);
  fs.writeFileSync(arquivo, JSON.stringify({ gerado_em: new Date().toISOString(), ...dados }));
  resumo.push(sintetizar(unidade.nome, dados));
  await espera(PAUSA_MS * 4);
}

function sintetizar(nome, dados) {
  return {
    unidade: nome,
    paginas: dados.paginas,
    matriculas: dados.matriculas.length,
    ativas: dados.matriculas.filter((m) => m.status === 'ativa').length,
    disciplinas: dados.disciplinas.length,
    md_ids_distintos: new Set(dados.disciplinas.map((d) => d.matricula_disciplina_id)).size,
    professores_distintos: new Set(dados.disciplinas.map((d) => d.nome_professor)).size,
  };
}

console.log(JSON.stringify({ pastaSaida, resumo }, null, 2));

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const areas = JSON.parse(fs.readFileSync(path.join(AQUI, 'areas.json'), 'utf8'));

export const DOMINIOS = [
  'aluno', 'comercial', 'professor', 'financeiro',
  'gestao', 'operacao', 'plataforma', 'integracao',
];

export const SEM_DOMINIO = 'outros';

// Prefixos ordenados do mais longo para o mais curto: 'alunos_emusys' precisa
// vencer 'alunos', senao a divergencia de sync viraria dominio de aluno.
const prefixosOrdenados = Object.entries(areas.prefixos)
  .sort(([a], [b]) => b.length - a.length);

// A busca por token conhece tambem as chaves genericas demais para servirem de
// prefixo ('kpis' abriria get_kpis_professor_* e o mandaria para gestao).
const tokensOrdenados = Object.entries({ ...areas.prefixos, ...areas.tokens })
  .sort(([a], [b]) => b.length - a.length);

const verbos = new Set(areas.verbosIgnorados);

// Remove os verbos do inicio: 'get_kpis_professor' e materia de professor, nao
// de um dominio 'get'. Roda em laco porque ha nomes com dois verbos empilhados
// ('fn_registrar_...', 'app_marcar_...').
function miolo(nome) {
  let partes = nome.split('_');
  while (partes.length > 1 && verbos.has(partes[0])) partes = partes.slice(1);
  return partes.join('_');
}

function porPrefixo(nome) {
  for (const [prefixo, dominio] of prefixosOrdenados) {
    if (nome === prefixo || nome.startsWith(`${prefixo}_`)) return dominio;
  }
  return null;
}

// Ultimo recurso, para nome de funcao onde o assunto nao abre a string:
// 'get_carteira_professor_periodo' abre por 'carteira', mas 'contagem_trancados'
// so revela o assunto no meio. Token mais longo vence; empate decide pela
// posicao mais a esquerda, que e onde costuma estar o substantivo principal.
function porToken(nome) {
  const tokens = nome.split('_');
  let melhor = null;
  for (const [chave, dominio] of tokensOrdenados) {
    const partesChave = chave.split('_');
    for (let i = 0; i <= tokens.length - partesChave.length; i += 1) {
      if (partesChave.every((p, j) => tokens[i + j] === p)) {
        const candidato = { dominio, tamanho: chave.length, posicao: i };
        if (!melhor
          || candidato.tamanho > melhor.tamanho
          || (candidato.tamanho === melhor.tamanho && candidato.posicao < melhor.posicao)) {
          melhor = candidato;
        }
        break;
      }
    }
  }
  return melhor ? melhor.dominio : null;
}

export function classificarDominio(nome) {
  if (areas.excecoes[nome]) return areas.excecoes[nome];

  const semVerbo = miolo(nome);
  if (areas.excecoes[semVerbo]) return areas.excecoes[semVerbo];

  return porPrefixo(semVerbo) ?? porToken(semVerbo) ?? SEM_DOMINIO;
}

/**
 * Ensaio de banda é RECORRENTE e já está cadastrado: `banda.dia_semana` + `banda.horario`
 * vêm da grade do Emusys e estão preenchidos nas 27 bandas ativas. Não existe tabela de
 * ocorrência de ensaio — projetar a partir da banda é o que evita criar uma.
 *
 * `banda_evento` com tipo='ensaio' continua existindo para o ensaio PONTUAL (extra, fora
 * do horário fixo); os dois convivem nas telas.
 *
 * ⚠️ `banda.frequencia` é NULL nas 27 bandas ativas, então a projeção é SEMANAL. Se um dia
 * passar a existir 'quinzenal', é aqui que entra — e o teste vai pegar, porque hoje ele
 * trava o comportamento semanal.
 */

const DIAS = [
  ['domingo', 0],
  ['segunda', 1],
  ['terca', 2],
  ['quarta', 3],
  ['quinta', 4],
  ['sexta', 5],
  ['sabado', 6],
];

export const NOME_DO_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Tira acento e sufixo "-feira": o banco tem 'Terça' e o sync já gravou 'Terça-feira'. */
export function normalizarDia(texto) {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/-?\s*feira\s*$/, '')
    .trim();
}

/** 'Terça-feira' -> 2. Devolve null quando não reconhece (não chuta domingo). */
export function indiceDoDia(texto) {
  const alvo = normalizarDia(texto);
  if (!alvo) return null;
  const achado = DIAS.find(([nome]) => alvo === nome || alvo.startsWith(nome));
  return achado ? achado[1] : null;
}

/** '14:00:00' -> '14:00'. Aceita já curto e devolve null se vazio. */
export function horarioCurto(horario) {
  if (!horario) return null;
  const texto = String(horario);
  return texto.length >= 5 ? texto.slice(0, 5) : texto;
}

/**
 * Ordena as bandas na grade da semana: dia, depois horário, depois nome.
 * Banda sem dia/horário reconhecido fica FORA — não inventa um lugar na grade.
 */
export function agruparEnsaiosPorDiaDaSemana(bandas) {
  const porDia = new Map();
  for (const banda of bandas || []) {
    const indice = indiceDoDia(banda.dia_semana);
    const hora = horarioCurto(banda.horario);
    if (indice === null || !hora) continue;
    if (!porDia.has(indice)) porDia.set(indice, []);
    porDia.get(indice).push({ ...banda, horario_curto: hora });
  }
  return [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([indice, lista]) => ({
      indice,
      nome: NOME_DO_DIA[indice],
      bandas: lista.sort(
        (a, b) =>
          a.horario_curto.localeCompare(b.horario_curto) || String(a.nome).localeCompare(String(b.nome)),
      ),
    }));
}

/** Bandas ativas sem dia/horário — viram aviso na tela em vez de sumir em silêncio. */
export function bandasSemHorarioDeEnsaio(bandas) {
  return (bandas || []).filter((b) => indiceDoDia(b.dia_semana) === null || !horarioCurto(b.horario));
}

/**
 * Projeta cada banda em todas as ocorrências do seu dia da semana dentro do intervalo,
 * no formato que o calendário já consome (mesma forma de EventoBanda).
 *
 * `evento_id` é NEGATIVO de propósito: marca ocorrência sintética, que não existe em
 * `banda_evento` e portanto não pode ser editada nem cancelada pela tela de evento.
 */
export function projetarEnsaiosNoIntervalo(bandas, inicio, fim) {
  const grade = agruparEnsaiosPorDiaDaSemana(bandas);
  if (grade.length === 0) return [];

  const porIndice = new Map(grade.map((d) => [d.indice, d.bandas]));
  const ocorrencias = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const limite = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());

  while (cursor <= limite) {
    const doDia = porIndice.get(cursor.getDay());
    if (doDia) {
      for (const banda of doDia) {
        const [hh, mm] = banda.horario_curto.split(':');
        const quando = new Date(
          cursor.getFullYear(), cursor.getMonth(), cursor.getDate(),
          Number(hh), Number(mm), 0, 0,
        );
        ocorrencias.push({
          evento_id: -banda.banda_id,
          banda_id: banda.banda_id,
          recorrente: true,
          titulo: banda.nome,
          tipo: 'ensaio',
          status: 'agendado',
          data_inicio: quando.toISOString(),
          data_fim: null,
          local: null,
          sala_nome: null,
          orcamento: null,
          bandas: banda.nome,
          unidade_nome: banda.unidade_nome ?? null,
          produtor_nome: banda.produtor_nome ?? null,
          integrantes: banda.integrantes ?? null,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return ocorrencias;
}

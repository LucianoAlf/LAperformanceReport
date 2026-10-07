// Sonoramente: núcleo de inclusão da LA (Campo Grande), fora do Emusys.
// O aluno que migra chega como evasão da unidade de origem; aqui ele vira
// "transferido para o Sonoramente": continua na Lista de Alunos (apagado, com o
// ícone) e não conta como evasão/churn. Regra e banco em
// supabase/migrations/20261007150000_transferencia_sonoramente.sql.

export const DESTINO_SONORAMENTE = 'sonoramente' as const;
export type DestinoExterno = typeof DESTINO_SONORAMENTE;

export const SONORAMENTE_NOME = 'Sonoramente';
export const SONORAMENTE_ICONE_URL = '/sonoramente-icon.png';

export function isDestinoSonoramente(destinoExterno?: string | null): boolean {
  return String(destinoExterno || '').trim().toLowerCase() === DESTINO_SONORAMENTE;
}

export interface TransferenciaSonoramenteLinha {
  aluno_id: number | string | null;
  data_transferencia: string | null;
  destino_externo?: string | null;
}

/**
 * Indexa as transferências para o Sonoramente por aluno_id, guardando a data mais recente.
 * A pessoa pode ter mais de uma matrícula (2 cursos = 2 linhas em `alunos`): quem consome
 * deve propagar pela chave de pessoa, não só pelo aluno_id gravado na transferência.
 */
export function indexarTransferenciasSonoramente(
  linhas: TransferenciaSonoramenteLinha[] | null | undefined
): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const linha of linhas || []) {
    if (!isDestinoSonoramente(linha.destino_externo)) continue;
    // Number(null) é 0: sem esta guarda, linha sem aluno viraria o "aluno 0".
    const id = Number(linha.aluno_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const data = linha.data_transferencia || '';
    const atual = mapa.get(id);
    if (!atual || data > atual) mapa.set(id, data);
  }
  return mapa;
}

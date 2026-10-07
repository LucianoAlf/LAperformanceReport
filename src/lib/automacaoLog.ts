import { abreviarNome } from './nomeExibicao.mjs';

/**
 * O vocabulário do log de automações — compartilhado pelo computador e pelo
 * celular.
 *
 * O que estava dentro do componente: o rótulo de cada ação, o rótulo de cada
 * evento, como resumir os detalhes numa linha e o recorte local da busca.
 * Reescrever isso na tela do celular faria a MESMA linha de log aparecer como
 * "Renovado" num lugar e "Atualizado" no outro.
 */

export interface RegistroAutomacaoLog {
  id: number;
  aluno_nome: string;
  aluno_id: number | null;
  unidade_nome: string | null;
  evento: string;
  acao: string;
  detalhes: Record<string, unknown> | null;
  workflow_id: string | null;
  execution_id: string | null;
  created_at: string;
}

export interface EstiloAcao {
  bg: string;
  text: string;
  label: string;
}

/** Ações de OPERAÇÃO — as que mexeram em aluno de verdade. */
export const ESTILOS_ACAO_OPERACAO: Record<string, EstiloAcao> = {
  inserido: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Novo Aluno' },
  atualizado: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualizado' },
  status_ativo: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Renovado' },
  status_trancado: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Trancado' },
  status_evadido: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Evadido' },
  segundo_curso: { bg: 'bg-violet-500/20', text: 'text-violet-400', label: '2º Curso' },
  nao_encontrado: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Não Encontrado' },
  erro_aluno_nao_encontrado: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Erro: Não Encontrado' },
  evento_ignorado: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Ignorado' },
};

/**
 * Ações do observador em dry-run.
 *
 * ⚠️ Ficam FORA do mapa de operação de propósito: aquele também gera os
 * cartões de contagem do topo, e sombra não é métrica de operação. Sem estas
 * entradas elas caíam no padrão e apareciam como "Atualizado" — parecendo
 * alteração real de aluno, quando nada foi escrito.
 */
export const ESTILOS_ACAO_OBSERVADOR: Record<string, EstiloAcao> = {
  processado_sombra: { bg: 'bg-slate-600/30', text: 'text-slate-300', label: 'Sombra (teste)' },
  webhook_observado_direto: { bg: 'bg-slate-600/30', text: 'text-slate-300', label: 'Sombra (payload)' },
  processado: { bg: 'bg-teal-500/20', text: 'text-teal-300', label: 'Processado (Emusys)' },
  erro_processamento: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Erro no processamento' },
};

export const ROTULOS_EVENTO: Record<string, string> = {
  matricula_nova: 'Matrícula Nova',
  matricula_renovacao: 'Renovação',
  matricula_trancamento: 'Trancamento',
  matricula_finalizacao: 'Finalização',
  sync_presenca: 'Sync Presença',
};

/** Ação desconhecida cai em "Atualizado", como na tela do computador. */
export function estiloDaAcao(acao: string): EstiloAcao {
  return ESTILOS_ACAO_OPERACAO[acao] ?? ESTILOS_ACAO_OBSERVADOR[acao] ?? ESTILOS_ACAO_OPERACAO.atualizado;
}

/** Evento sem rótulo conhecido volta cru — inventar nome esconderia o novo. */
export function rotuloDoEvento(evento: string): string {
  return ROTULOS_EVENTO[evento] ?? evento;
}

/** Ação de sombra é ensaio: não tocou em aluno nenhum. */
export function ehAcaoDeSombra(acao: string): boolean {
  return acao === 'processado_sombra' || acao === 'webhook_observado_direto';
}

/**
 * Resume os detalhes numa linha.
 *
 * ⚠️ `sync_presenca` tem forma própria (data · curso · professor) e sai antes:
 * nele o `curso` sozinho não diz de que aula se trata.
 */
export interface OpcoesDetalheLog {
  /**
   * Encurta o nome do professor ("Caio Tenório de Araújo" → "Caio Araújo").
   *
   * ⚠️ É opção de LAYOUT, não de regra: quais campos entram na linha continua
   * sendo decidido num lugar só. Medido a 390px: sem isto, 26 das 200 linhas
   * do log truncavam, e o que sumia era sempre o fim do nome do professor.
   */
  abreviarProfessor?: boolean;
}

export function formatarDetalhesLog(
  item: Pick<RegistroAutomacaoLog, 'evento' | 'detalhes'>,
  { abreviarProfessor = false }: OpcoesDetalheLog = {},
): string {
  const detalhes = (item.detalhes || {}) as Record<string, string | undefined>;
  const partes: string[] = [];
  const professor = detalhes.professor
    ? (abreviarProfessor ? abreviarNome(detalhes.professor) : detalhes.professor)
    : undefined;

  if (item.evento === 'sync_presenca') {
    if (detalhes.data) partes.push(detalhes.data);
    if (detalhes.curso) partes.push(detalhes.curso);
    if (professor) partes.push(`Prof. ${professor}`);
    return partes.join(' · ');
  }

  if (detalhes.curso) partes.push(detalhes.curso);
  if (professor) partes.push(`Prof. ${professor}`);
  if (detalhes.dia && detalhes.horario) partes.push(`${detalhes.dia} ${detalhes.horario}`);

  return partes.join(' · ');
}

/** O aluno ficou sem professor vinculado — o alerta que a linha carrega. */
export function registroSemProfessor(item: Pick<RegistroAutomacaoLog, 'detalhes'>): boolean {
  return (item.detalhes as Record<string, unknown> | null)?.sem_professor === true;
}

export interface FiltroLogLocal {
  busca?: string;
  /** `'sem_professor'` é um recorte, não um evento do banco. */
  evento?: string;
}

/**
 * O recorte que acontece NO CLIENTE, depois da consulta.
 *
 * Período, evento e ação viajam para o banco; estes dois não, porque
 * `sem_professor` mora dentro do jsonb e a busca é por nome do aluno.
 */
export function filtrarRegistrosLog<T extends Pick<RegistroAutomacaoLog, 'aluno_nome' | 'detalhes'>>(
  registros: readonly T[],
  { busca = '', evento = '' }: FiltroLogLocal = {},
): T[] {
  const termo = busca.trim().toLowerCase();
  return registros.filter((r) => {
    if (evento === 'sem_professor' && !registroSemProfessor(r)) return false;
    if (termo && !r.aluno_nome?.toLowerCase().includes(termo)) return false;
    return true;
  });
}

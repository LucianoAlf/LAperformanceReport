import type { EntradaDaChegada } from '@/lib/eventos';
import type { BlocoDaGrade, EventoComResumo, ParticipacaoComChegada } from '@/hooks/useEventos';

/**
 * Entrada da lista do dia (`montarListaDeChegada`), montada num lugar só.
 *
 * Duas abas perguntam "quem é esperado / quem chegou": o Check-in, para a porta, e Documentos,
 * para saber a quem emitir certificado. Uma cópia do mapeamento em cada aba divergiria no
 * primeiro campo novo — e o certificado sairia para uma lista diferente da que a porta vê.
 */
export function entradaDaChegada(
  evento: EventoComResumo,
  blocos: BlocoDaGrade[],
  participacoes: Pick<ParticipacaoComChegada, 'pessoa_chave' | 'nome' | 'status' | 'checkin_em' | 'aluno_id'>[],
): EntradaDaChegada {
  return {
    evento: {
      data_evento: evento.data_evento,
      horario_inicio: evento.horario_inicio,
      duracao_padrao_segundos: evento.duracao_padrao_segundos,
      intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
    },
    blocos: blocos.map((b) => ({
      id: b.id,
      nome: b.nome,
      ordem: b.ordem,
      data: b.data,
      horario_inicial: b.horario_inicial,
      inicio_manual: b.inicio_manual,
      apresentacoes: b.apresentacoes.map((a) => ({
        id: a.id,
        ordem: a.ordem,
        duracao_segundos: a.duracao_segundos,
        pessoa_chave: a.pessoa_chave,
        aluno_id: a.aluno_id,
        aluno_nome: a.aluno_nome,
        curso_nome: a.curso_nome,
        musica: a.musica,
        grupo_id: a.grupo_id,
      })),
    })),
    participacoes: participacoes.map((p) => ({
      pessoa_chave: p.pessoa_chave,
      nome: p.nome,
      status: p.status,
      checkin_em: p.checkin_em,
      aluno_id: p.aluno_id,
    })),
  };
}

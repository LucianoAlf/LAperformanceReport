import { supabase } from '@/lib/supabase';

/**
 * Vincular uma sala a uma turma — a única escrita da aba Turmas.
 *
 * Morava dentro do componente do desktop. Como a versão de celular precisa da
 * mesma operação, ela vem para cá: duas implementações de "grave a sala desta
 * turma" divergiriam no primeiro campo que alguém acrescentasse (a criação
 * monta oito colunas à mão).
 *
 * ⚠️ A turma pode ser IMPLÍCITA — derivada das matrículas, sem linha própria
 * em `turmas_explicitas`. Por isso a função procura a linha por
 * (unidade, professor, dia, horário) e só cria quando não existe: escrever
 * direto um INSERT duplicaria a turma na grade.
 */

export interface TurmaParaVincularSala {
  unidade_id: string;
  professor_id: number;
  professor_nome?: string;
  curso_id?: number;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  turma_explicita_id?: number;
}

export interface ResultadoVinculoSala {
  ok: boolean;
  /** `atualizou` quando a turma já existia; `criou` quando era implícita. */
  acao?: 'atualizou' | 'criou';
  erro?: string;
}

const CAPACIDADE_PADRAO = 4;

export async function vincularSalaNaTurma(
  turma: TurmaParaVincularSala,
  salaId: number,
  salas: ReadonlyArray<{ id: number; nome: string; capacidade_maxima: number }>,
): Promise<ResultadoVinculoSala> {
  const sala = salas.find((s) => s.id === salaId);
  const capacidade = sala?.capacidade_maxima || CAPACIDADE_PADRAO;
  // Sem isto, um erro vira "erro ao vincular sala" e ninguém acha a turma.
  const ondeFoi = `turma ${turma.professor_nome ?? turma.professor_id} ${turma.dia_semana} ${turma.horario_inicio}`;

  try {
    let turmaExplicitaId = turma.turma_explicita_id || null;

    if (!turmaExplicitaId) {
      const { data: existente, error: erroBusca } = await supabase
        .from('turmas_explicitas')
        .select('id')
        .eq('unidade_id', turma.unidade_id)
        .eq('professor_id', turma.professor_id)
        .eq('dia_semana', turma.dia_semana)
        .eq('horario_inicio', turma.horario_inicio)
        .maybeSingle();

      // O client devolve `{ data, error }` e não lança: não conferir aqui
      // transformaria uma falha de leitura em "não existe" e criaria uma
      // turma duplicada.
      if (erroBusca) return { ok: false, erro: `${ondeFoi}: falha ao procurar a turma (${erroBusca.message})` };
      turmaExplicitaId = existente?.id || null;
    }

    if (turmaExplicitaId) {
      const { error } = await supabase
        .from('turmas_explicitas')
        .update({
          sala_id: salaId,
          capacidade_maxima: capacidade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', turmaExplicitaId);

      if (error) return { ok: false, erro: `${ondeFoi}: ${error.message}` };
      return { ok: true, acao: 'atualizou' };
    }

    const { error } = await supabase.from('turmas_explicitas').insert({
      tipo: 'turma',
      nome: `${turma.curso_nome} - ${turma.professor_nome}`,
      professor_id: turma.professor_id,
      curso_id: turma.curso_id,
      dia_semana: turma.dia_semana,
      horario_inicio: turma.horario_inicio,
      sala_id: salaId,
      unidade_id: turma.unidade_id,
      capacidade_maxima: capacidade,
      ativo: true,
    });

    if (error) return { ok: false, erro: `${ondeFoi}: ${error.message}` };
    return { ok: true, acao: 'criou' };
  } catch (e) {
    return { ok: false, erro: `${ondeFoi}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

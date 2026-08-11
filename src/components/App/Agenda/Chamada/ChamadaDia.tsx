import { useMemo } from 'react';
import { AlertTriangle, CalendarX, Clock } from 'lucide-react';
import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { useAuth } from '@/contexts/AuthContext';
import { aulaJaOcorreu } from '@/lib/agenda';
import { alunoSemDestino, chamadaCompleta, estadoDoAluno } from './chamadaUtils';
import { ChamadaAulaBloco } from './ChamadaAulaBloco';
import type { ItemChamada } from './useChamadaAcoes';
import type { AlunoAgenda } from '@/hooks/useAgendaDia';

interface Props {
  data: string;
  aulas: AulaAgenda[];
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDrawer: (aula: AulaAgenda) => void;
}

/**
 * Visao Dia da chamada. Cada aula do dia vira um bloco com acoes de nivel
 * aula (todos presentes, reagendar, cancelar) e os cards de nivel aluno.
 *
 * Pendencias (alunos sem destino em aulas ja ocorridas) ficam em banner no
 * topo: e o "digest" pedindo atencao da equipe, sem precisar de cron.
 */
export function ChamadaDia({
  data,
  aulas,
  salvando,
  onRegistrar,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDrawer,
}: Props) {
  const { hasPermission } = useAuth();
  const podeOperar = hasPermission('agenda.chamada');
  const agora = useMemo(() => new Date(), []);

  const ordenadas = useMemo(
    () => [...aulas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [aulas],
  );

  // Pendencias: alunos em aulas JA OCORRIDAS sem destino humano. E o que o
  // digest diario cobra — mostrar aqui deixa a equipe agir antes do digest.
  const pendentes = useMemo(() => {
    const lista: Array<{ aula: AulaAgenda; aluno: AlunoAgenda }> = [];
    for (const aula of ordenadas) {
      if (aula.cancelada) continue;
      if (!aulaJaOcorreu(data, aula.hora_fim, agora)) continue;
      for (const aluno of aula.alunos) {
        if (aluno.aluno_id == null) continue;
        if (alunoSemDestino(aula, aluno, data, agora)) {
          lista.push({ aula, aluno });
        }
      }
    }
    return lista;
  }, [ordenadas, data, agora]);

  const totalAulas = ordenadas.length;
  const aulasConcluidas = ordenadas.filter((a) => chamadaCompleta(a, data, agora)).length;

  if (ordenadas.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-12 text-center">
        <CalendarX className="mx-auto mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">Nenhuma aula neste dia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Banner de pendencias — so aparece quando ha alunos sem destino em
          aulas que ja terminaram. E o "digest" ao vivo, na cara da equipe. */}
      {pendentes.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-200">
              {pendentes.length} {pendentes.length === 1 ? 'aluno sem destino' : 'alunos sem destino'}
              {' '}em aulas que já ocorreram
            </p>
            <p className="mt-0.5 text-xs text-amber-300/80">
              Ninguém registrou presença, falta ou justificativa. Esses alunos entram no digest diário.
            </p>
            <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-amber-200/90">
              {pendentes.slice(0, 8).map(({ aula, aluno }) => (
                <li key={`${aula.chave}-${aluno.aluno_id}`} className="truncate">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {aula.hora_inicio} · {aluno.nome} · {aula.curso_nome}
                </li>
              ))}
              {pendentes.length > 8 && (
                <li className="text-amber-400/70">… e mais {pendentes.length - 8}</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Progresso do dia */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2.5 text-xs text-slate-400">
        <span>
          <b className="text-slate-200">{aulasConcluidas}</b> de <b className="text-slate-200">{totalAulas}</b> aulas com chamada completa
        </span>
        <span>
          {ordenadas.filter((a) => a.cancelada).length} cancelada(s)
        </span>
      </div>

      {/* Blocos de aula em ordem de horario */}
      <div className="space-y-3">
        {ordenadas.map((aula) => (
          <ChamadaAulaBloco
            key={aula.chave}
            aula={aula}
            data={data}
            podeOperar={podeOperar}
            salvando={salvando}
            onMarcar={(aluno, status) =>
              onRegistrar([
                {
                  aula_emusys_id: aluno.aula_emusys_id!,
                  aluno_id: aluno.aluno_id!,
                  status,
                },
              ])
            }
            onJustificar={(aluno) => onJustificar(aluno, aula)}
            onTodosPresentes={(a) => onRegistrarTodosPresentes(a, onRegistrar)}
            onCancelarAula={onCancelarAula}
            onReagendarAula={onReagendarAula}
            onAbrirDrawer={onAbrirDrawer}
          />
        ))}
      </div>
    </div>
  );
}

/** Marca todos os alunos vinculados como presentes em um unico lote. */
function onRegistrarTodosPresentes(aula: AulaAgenda, onRegistrar: (itens: ItemChamada[]) => void) {
  const itens: ItemChamada[] = aula.alunos
    .filter((a) => a.aluno_id != null && a.aula_emusys_id != null && estadoDoAluno(a) !== 'presente')
    .map((a) => ({
      aula_emusys_id: a.aula_emusys_id!,
      aluno_id: a.aluno_id!,
      status: 'presente' as const,
    }));
  if (itens.length > 0) onRegistrar(itens);
}

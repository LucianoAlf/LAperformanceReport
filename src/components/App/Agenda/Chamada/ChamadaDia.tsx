import { useMemo } from 'react';
import { CalendarX } from 'lucide-react';
import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { useAuth } from '@/contexts/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { chamadaCompleta, estadoDoAluno } from './chamadaUtils';
import { ChamadaAulaBloco } from './ChamadaAulaBloco';
import { AlertaPendencias } from './AlertaPendencias';
import type { ItemChamada } from './useChamadaAcoes';
import type { AlunoAgenda } from '@/hooks/useAgendaDia';

interface OutletContext {
  unidadeSelecionada: string | null;
}

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
  const context = useOutletContext<OutletContext | undefined>();
  const consolidado = !context?.unidadeSelecionada;

  const ordenadas = useMemo(
    () => [...aulas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [aulas],
  );

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
      {/* Alerta de pendências — ao vivo, separado por hoje/ontem, clicável */}
      <AlertaPendencias
        data={data}
        aulas={ordenadas}
        consolidado={consolidado}
        onAbrirDrawer={onAbrirDrawer}
      />

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

import { useMemo, useState } from 'react';
import { CalendarX, User } from 'lucide-react';
import type { AulaAgenda, LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { useAuth } from '@/contexts/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { chamadaCompleta, estadoDoAluno } from './chamadaUtils';
import { ChamadaAulaBloco } from './ChamadaAulaBloco';
import { AlertaPendencias } from './AlertaPendencias';
import { ProfessorPresencaToggle } from './ProfessorPresencaToggle';
import type { ItemChamada } from './useChamadaAcoes';
import type { AlunoAgenda } from '@/hooks/useAgendaDia';
import { cn } from '@/lib/utils';

interface OutletContext {
  unidadeSelecionada: string | null;
}

interface Props {
  data: string;
  aulas: AulaAgenda[];
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onRegistrarExperimental: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDrawer: (aula: AulaAgenda) => void;
  onAbrirDrawerLead: (lead: LeadExperimentalAgenda, aula: AulaAgenda) => void;
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
  onRegistrarExperimental,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDrawer,
  onAbrirDrawerLead,
}: Props) {
  const { hasPermission } = useAuth();
  const podeOperar = hasPermission('agenda.chamada');
  const agora = useMemo(() => new Date(), []);
  const context = useOutletContext<OutletContext | undefined>();
  const consolidado = !context?.unidadeSelecionada;
  const [filtroExperimental, setFiltroExperimental] = useState<'todas' | 'regulares' | 'experimentais'>('todas');

  const ordenadas = useMemo(
    () => [...aulas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [aulas],
  );

  // Filtro: separar experimental de regular
  const filtradas = useMemo(() => {
    if (filtroExperimental === 'regulares') return ordenadas.filter((a) => a.categoria !== 'experimental');
    if (filtroExperimental === 'experimentais') return ordenadas.filter((a) => a.categoria === 'experimental');
    return ordenadas;
  }, [ordenadas, filtroExperimental]);

  const totalAulas = filtradas.length;
  const aulasConcluidas = filtradas.filter((a) => chamadaCompleta(a, data, agora)).length;

  // Agrupa aulas por professor para o toggle de presenca
  const aulasPorProfessor = useMemo(() => {
    const mapa = new Map<number, { nome: string; aulas: AulaAgenda[]; presente: boolean | null }>();
    for (const aula of filtradas) {
      if (aula.professor_id == null) continue;
      const existente = mapa.get(aula.professor_id);
      if (existente) {
        existente.aulas.push(aula);
      } else {
        // Determina se o professor esta presente baseado na primeira aula
        const presente = aula.professor_presenca === 'presente'
          ? true
          : aula.professor_presenca === 'ausente'
            ? false
            : null;
        mapa.set(aula.professor_id, {
          nome: aula.professor_nome ?? 'Professor',
          aulas: [aula],
          presente,
        });
      }
    }
    return Array.from(mapa.entries()).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [filtradas]);

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
        unidadeId={context?.unidadeSelecionada ?? null}
        onAbrirDrawer={onAbrirDrawer}
      />

      {/* Filtro: separar experimental de regular */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mostrar:</span>
        <button
          type="button"
          onClick={() => setFiltroExperimental(filtroExperimental === 'todas' ? 'regulares' : 'todas')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors',
            filtroExperimental !== 'experimentais'
              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
              : 'border-slate-700 text-slate-400 hover:text-slate-200',
          )}
        >
          Regulares
        </button>
        <button
          type="button"
          onClick={() => setFiltroExperimental(filtroExperimental === 'experimentais' ? 'todas' : 'experimentais')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors',
            filtroExperimental === 'experimentais'
              ? 'border-violet-500 bg-violet-500/10 text-violet-300'
              : 'border-slate-700 text-slate-400 hover:text-slate-200',
          )}
        >
          <User className="mr-1 inline h-3 w-3" />
          Experimentais
        </button>
      </div>

      {/* Progresso do dia */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2.5 text-xs text-slate-400">
        <span>
          <b className="text-slate-200">{aulasConcluidas}</b> de <b className="text-slate-200">{totalAulas}</b> aulas com chamada completa
          {filtroExperimental !== 'todas' && (
            <span className="ml-1 text-slate-500">
              ({filtroExperimental === 'regulares' ? 'regulares' : 'experimentais'})
            </span>
          )}
        </span>
        <span>
          {filtradas.filter((a) => a.cancelada).length} cancelada(s)
        </span>
      </div>

      {/* Presenca dos professores — toggle por professor para o dia inteiro */}
      {podeOperar && aulasPorProfessor.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Professores:</span>
          {aulasPorProfessor.map(([professorId, { nome, aulas: aulasProf, presente }]) => (
            <ProfessorPresencaToggle
              key={professorId}
              professorId={professorId}
              professorNome={nome}
              data={data}
              unidadeId={context?.unidadeSelecionada ?? ''}
              totalAulas={aulasProf.length}
              presente={presente}
              onMudou={() => onRegistrar([])} // forca recarga
            />
          ))}
        </div>
      )}

      {/* Blocos de aula em ordem de horario */}
      <div className="space-y-3">
        {filtradas.map((aula) => (
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
            onMarcarExperimental={onRegistrarExperimental}
            onJustificar={(aluno) => onJustificar(aluno, aula)}
            onTodosPresentes={(a) => onRegistrarTodosPresentes(a, onRegistrar)}
            onCancelarAula={onCancelarAula}
            onReagendarAula={onReagendarAula}
            onAbrirDrawer={onAbrirDrawer}
            onAbrirDrawerLead={onAbrirDrawerLead}
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

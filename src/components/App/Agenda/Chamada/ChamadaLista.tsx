import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Filter, Paperclip, RotateCcw, User } from 'lucide-react';
import type { AulaAgenda, AlunoAgenda, LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';
import { estadoDoAluno, rotuloOrigem, temConflito, type EstadoChamada } from './chamadaUtils';
import { cn } from '@/lib/utils';

interface Props {
  data: string;
  aulas: AulaAgenda[];
  onAbrirDrawer: (aula: AulaAgenda) => void;
}

type FiltroLista = 'todos' | 'pendentes' | 'presentes' | 'faltas' | 'justificadas' | 'canceladas' | 'experimentais';

const FILTROS: Array<{ valor: FiltroLista; rotulo: string }> = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'pendentes', rotulo: 'Sem destino' },
  { valor: 'presentes', rotulo: 'Presentes' },
  { valor: 'faltas', rotulo: 'Faltas' },
  { valor: 'justificadas', rotulo: 'Justificadas' },
  { valor: 'canceladas', rotulo: 'Canceladas' },
  { valor: 'experimentais', rotulo: 'Experimentais' },
];

interface LinhaLista {
  aula: AulaAgenda;
  aluno: AlunoAgenda | null;
  lead?: LeadExperimentalAgenda | null;
  estado: EstadoChamada | 'cancelada' | 'experimental';
}

/**
 * Visao Lista: auditavel e filtravel. Cada linha e um (aula, aluno) ou uma
 * aula cancelada (sem aluno). Filtros por estado. Origem e conflito aparecem
 * como colunas — e a visao que a equipe usa para fechar o dia.
 */
export function ChamadaLista({ data, aulas, onAbrirDrawer }: Props) {
  const [filtro, setFiltro] = useState<FiltroLista>('todos');
  const agora = useMemo(() => new Date(), []);

  const linhas = useMemo<LinhaLista[]>(() => {
    const out: LinhaLista[] = [];
    for (const aula of aulas) {
      if (aula.cancelada) {
        out.push({ aula, aluno: null, estado: 'cancelada' });
        continue;
      }
      // Alunos matriculados
      for (const aluno of aula.alunos) {
        if (aluno.aluno_id == null) continue;
        out.push({ aula, aluno, estado: estadoDoAluno(aluno) });
      }
      // Leads experimentais
      for (const lead of aula.experimental_leads ?? []) {
        const estadoLead = lead.status === 'experimental_realizada'
          ? 'presente'
          : lead.status === 'experimental_faltou'
            ? 'falta'
            : 'experimental';
        out.push({ aula, aluno: null, lead, estado: estadoLead as LinhaLista['estado'] });
      }
    }
    return out;
  }, [aulas]);

  const filtradas = useMemo(() => {
    if (filtro === 'todos') return linhas;
    if (filtro === 'canceladas') return linhas.filter((l) => l.estado === 'cancelada');
    if (filtro === 'experimentais') return linhas.filter((l) => l.lead != null);
    if (filtro === 'pendentes') {
      return linhas.filter((l) => {
        if (l.estado === 'cancelada') return false;
        if (l.lead) return l.estado === 'experimental';
        if (l.aluno && !aulaJaOcorreu(data, l.aula.hora_fim, agora)) return false;
        return l.estado === 'indeterminado';
      });
    }
    return linhas.filter((l) => l.estado === filtro);
  }, [linhas, filtro, data, agora]);

  const contagemPorFiltro = useMemo(() => {
    const c: Record<FiltroLista, number> = {
      todos: linhas.length,
      pendentes: 0,
      presentes: 0,
      faltas: 0,
      justificadas: 0,
      canceladas: 0,
      experimentais: 0,
    };
    for (const l of linhas) {
      if (l.lead) {
        c.experimentais++;
        if (l.estado === 'experimental') c.pendentes++;
        else if (l.estado === 'presente') c.presentes++;
        else if (l.estado === 'falta') c.faltas++;
      } else if (l.estado === 'cancelada') c.canceladas++;
      else if (l.estado === 'presente') c.presentes++;
      else if (l.estado === 'falta') c.faltas++;
      else if (l.estado === 'falta_justificada') c.justificadas++;
      else if (l.aluno && aulaJaOcorreu(data, l.aula.hora_fim, agora)) c.pendentes++;
    }
    return c;
  }, [linhas, data, agora]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="mr-1 h-3.5 w-3.5 text-slate-500" />
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            aria-pressed={filtro === f.valor}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
              filtro === f.valor
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200',
            )}
          >
            {f.rotulo} <span className="ml-0.5 text-[10px] text-slate-500">({contagemPorFiltro[f.valor]})</span>
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-8 text-center text-sm text-slate-400">
          Nenhum registro neste filtro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Hora</th>
                <th className="px-3 py-2 font-semibold">Aluno / Aula</th>
                <th className="px-3 py-2 font-semibold">Professor</th>
                <th className="px-3 py-2 font-semibold">Curso</th>
                <th className="px-3 py-2 font-semibold">Unidade</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtradas.map(({ aula, aluno, estado }) => (
                <LinhaTabela
                  key={`${aula.chave}-${aluno?.aluno_id ?? 'cancelada'}`}
                  aula={aula}
                  aluno={aluno}
                  estado={estado}
                  data={data}
                  onAbrir={() => onAbrirDrawer(aula)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinhaTabela({
  aula,
  aluno,
  lead,
  estado,
  data,
  onAbrir,
}: {
  aula: AulaAgenda;
  aluno: AlunoAgenda | null;
  lead?: LeadExperimentalAgenda | null;
  estado: EstadoChamada | 'cancelada' | 'experimental';
  data: string;
  onAbrir: () => void;
}) {
  const conflito = aluno ? temConflito(aluno) : false;
  // `aula.chave` e um hash MD5, nao uma data — usar a prop `data` (yyyy-MM-dd).
  const rotuloData = format(parseISO(data), 'dd/MM', { locale: ptBR });

  return (
    <tr
      onClick={onAbrir}
      className={cn(
        'cursor-pointer text-slate-300 hover:bg-slate-800/40',
        lead ? 'bg-violet-500/[0.04]' : 'bg-slate-900/30',
      )}
    >
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-400">
        {rotuloData} {aula.hora_inicio}
      </td>
      <td className="px-3 py-2">
        {lead ? (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3 text-violet-400" />
            <span className="font-medium text-violet-200">{lead.nome}</span>
            <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-bold text-violet-300">exp.</span>
          </div>
        ) : aluno ? (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-200">{aluno.nome}</span>
            {aluno.nr_da_aula != null && aluno.qtd_aulas_contrato != null && (
              <span className="text-[10px] text-slate-500">({aluno.nr_da_aula}/{aluno.qtd_aulas_contrato})</span>
            )}
            {(aluno.reposicoes_pendentes ?? 0) > 0 && (
              <RotateCcw className="h-3 w-3 text-amber-400" aria-label="reposição pendente" />
            )}
          </div>
        ) : (
          <span className="italic text-slate-500">Aula cancelada</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-400">{aula.professor_nome ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-400">{aula.curso_nome ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{aula.unidade_nome}</td>
      <td className="px-3 py-2">
        <BadgeEstado estado={estado} motivo={aluno?.justificada_motivo ?? aula.cancelada_motivo ?? null} evidencia={aluno?.justificada_evidencia ?? null} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">
            {lead ? 'Emusys' : aluno ? rotuloOrigem(aluno.respondido_por) : aula.cancelada_origem ?? '—'}
          </span>
          {conflito && (
            <AlertTriangle className="h-3 w-3 text-amber-400" aria-label="conflito com Emusys" />
          )}
        </div>
      </td>
    </tr>
  );
}

function BadgeEstado({
  estado,
  motivo,
  evidencia,
}: {
  estado: EstadoChamada | 'cancelada' | 'experimental';
  motivo: string | null;
  evidencia: string | null;
}) {
  const map: Record<EstadoChamada | 'cancelada' | 'experimental', { rotulo: string; classe: string }> = {
    presente: { rotulo: 'Presente', classe: 'bg-emerald-500/15 text-emerald-300' },
    falta: { rotulo: 'Falta', classe: 'bg-rose-500/15 text-rose-300' },
    falta_justificada: { rotulo: 'Falta justificada', classe: 'bg-amber-500/15 text-amber-300' },
    indeterminado: { rotulo: 'Sem destino', classe: 'bg-slate-700/40 text-slate-400' },
    cancelada: { rotulo: 'Cancelada', classe: 'bg-rose-500/15 text-rose-300' },
    experimental: { rotulo: 'Aguardando', classe: 'bg-violet-500/15 text-violet-300' },
  };
  const cfg = map[estado];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold', cfg.classe)}>
      {cfg.rotulo}
      {evidencia && <Paperclip className="h-2.5 w-2.5" />}
      {motivo && estado !== 'indeterminado' && (
        <span className="max-w-[160px] truncate font-normal opacity-80" title={motivo}>· {motivo}</span>
      )}
    </span>
  );
}

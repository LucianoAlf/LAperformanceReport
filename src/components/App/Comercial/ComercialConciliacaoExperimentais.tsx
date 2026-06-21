import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  HelpCircle,
  Link2,
  Loader2,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ComercialConciliacaoExperimentaisProps {
  unidadeId: string | 'todos' | null | undefined;
  ano: number;
  mes: number;
}

interface ConciliacaoResumo {
  experimentais_agendadas?: number;
  experimentais_realizadas_confirmadas?: number;
  experimentais_faltaram?: number;
  experimentais_canceladas?: number;
  matriculas_diretas?: number;
  ignoradas_por_decisao?: number;
  pendentes_conciliacao?: number;
  realizadas_sem_presenca_confirmada?: number;
  realizadas_status_operacional?: number;
}

interface ConciliacaoItem {
  id: number;
  lead_id: number | null;
  nome_aluno: string | null;
  lead_nome: string | null;
  lead_telefone: string | null;
  unidade_nome: string | null;
  data_experimental: string | null;
  horario_experimental: string | null;
  status_operacional: string | null;
  etapa_canonica: string;
  motivo_fila: string;
  professor_nome: string | null;
  curso_nome: string | null;
  aluno_id: number | null;
  aluno_vinculado_nome: string | null;
  aluno_vinculado_status: string | null;
  aluno_sugerido_id: number | null;
  aluno_sugerido_nome: string | null;
  aluno_sugerido_status: string | null;
  presenca_confirmada: boolean;
  sinal_conversao: boolean;
  decisao_humana: string | null;
  incluir_denominador_exp_mat: boolean | null;
  decisao_motivo: string | null;
}

interface ConciliacaoPayload {
  resumo?: ConciliacaoResumo;
  items?: ConciliacaoItem[];
}

const resumoVazio: Required<ConciliacaoResumo> = {
  experimentais_agendadas: 0,
  experimentais_realizadas_confirmadas: 0,
  experimentais_faltaram: 0,
  experimentais_canceladas: 0,
  matriculas_diretas: 0,
  ignoradas_por_decisao: 0,
  pendentes_conciliacao: 0,
  realizadas_sem_presenca_confirmada: 0,
  realizadas_status_operacional: 0,
};

const etapaLabel: Record<string, string> = {
  experimental_agendada: 'Agendada',
  experimental_realizada_confirmada: 'Realizada confirmada',
  experimental_faltou: 'Faltou',
  experimental_cancelada: 'Cancelada',
  matricula_direta: 'Matricula direta',
  ignorada_decisao_humana: 'Ignorada',
  pendente_conciliacao: 'Pendente',
  realizada_sem_presenca_confirmada: 'Sem presenca',
};

const motivoLabel: Record<string, string> = {
  duplicidade_reagendamento_ignorar: 'Duplicidade/reagendamento',
  matricula_direta_sem_experimental: 'Matricula direta',
  responsavel_sem_aluno: 'Responsavel no lugar do aluno',
  pendente_cadastro_nao_encontrado: 'Cadastro nao encontrado',
  aluno_excluido_pos_matricula: 'Aluno excluido apos matricula',
  sem_aluno_vinculado_com_sinal_conversao: 'Sem aluno vinculado',
  aluno_vinculado_sem_presenca_experimental: 'Sem presenca experimental',
  realizada_sem_conversao_aparente: 'Realizada sem conversao aparente',
  aguardando_aula: 'Aguardando aula',
  falta_operacional: 'Falta operacional',
  cancelada_operacional: 'Cancelada',
  revisar_manual: 'Revisar manualmente',
};

function normalizarUnidade(unidadeId: ComercialConciliacaoExperimentaisProps['unidadeId']) {
  return !unidadeId || unidadeId === 'todos' ? null : unidadeId;
}

function formatarData(data: string | null) {
  if (!data) return '-';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarHora(hora: string | null) {
  return hora ? hora.slice(0, 5) : '-';
}

function formatarTelefone(telefone: string | null) {
  if (!telefone) return '-';
  const digitos = telefone.replace(/\D/g, '');
  if (digitos.length < 10) return telefone;
  const ddd = digitos.slice(0, 2);
  const primeira = digitos.length === 11 ? digitos.slice(2, 7) : digitos.slice(2, 6);
  const segunda = digitos.length === 11 ? digitos.slice(7) : digitos.slice(6);
  return `(${ddd}) ${primeira}-${segunda}`;
}

function getEtapaStyle(etapa: string) {
  if (etapa === 'pendente_conciliacao') {
    return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
  }
  if (etapa === 'realizada_sem_presenca_confirmada') {
    return 'border-sky-400/40 bg-sky-500/10 text-sky-200';
  }
  if (etapa === 'matricula_direta') {
    return 'border-violet-400/40 bg-violet-500/10 text-violet-200';
  }
  if (etapa === 'ignorada_decisao_humana') {
    return 'border-slate-500/50 bg-slate-700/40 text-slate-300';
  }
  return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200';
}

function getMotivoHumano(item: ConciliacaoItem) {
  return motivoLabel[item.decisao_humana || item.motivo_fila] || item.motivo_fila || 'Revisar';
}

export function ComercialConciliacaoExperimentais({
  unidadeId,
  ano,
  mes,
}: ComercialConciliacaoExperimentaisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ConciliacaoPayload | null>(null);

  const carregar = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_conciliacao_experimentais_v2', {
        p_unidade_id: normalizarUnidade(unidadeId),
        p_ano: ano,
        p_mes: mes,
        p_periodo: 'mensal',
        p_data: null,
      });

      if (rpcError) throw rpcError;
      setPayload((data || {}) as ConciliacaoPayload);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar conciliacao de experimentais');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, ano, mes]);

  const resumo = { ...resumoVazio, ...(payload?.resumo || {}) };
  const items = payload?.items || [];

  const grupos = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.etapa_canonica] = (acc[item.etapa_canonica] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  if (loading) {
    return (
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
        <div className="flex items-center justify-center gap-3 text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-300" />
          Carregando fila de conciliacao...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-300 mt-0.5" />
          <div>
            <h3 className="text-rose-100 font-semibold">Erro ao carregar conciliacao</h3>
            <p className="text-rose-100/80 text-sm mt-1">{error}</p>
            <button
              onClick={carregar}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-500/20 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/30"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-500/10 via-slate-800/60 to-amber-500/10 border-b border-slate-700/50 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold mb-2">
                <ClipboardCheck className="w-4 h-4" />
                P02R.1 - leitura operacional
              </div>
              <h2 className="text-2xl font-bold text-white">Conciliação de Experimentais</h2>
              <p className="text-sm text-slate-300 mt-1 max-w-3xl">
                Visao do funil experimental por etapa: agendada, realizada confirmada, falta,
                matricula direta e pendencias de vinculo/presenca. Esta tela ainda nao altera dados.
              </p>
            </div>
            <button
              onClick={carregar}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <ResumoCard
              icon={Calendar}
              label="Agendadas"
              value={resumo.experimentais_agendadas}
              tone="cyan"
            />
            <ResumoCard
              icon={CheckCircle2}
              label="Realizadas confirmadas"
              value={resumo.experimentais_realizadas_confirmadas}
              tone="emerald"
            />
            <ResumoCard
              icon={UserX}
              label="Faltas"
              value={resumo.experimentais_faltaram}
              tone="rose"
            />
            <ResumoCard
              icon={AlertTriangle}
              label="Sem presenca"
              value={resumo.realizadas_sem_presenca_confirmada}
              tone="sky"
            />
            <ResumoCard
              icon={Link2}
              label="Pendentes"
              value={resumo.pendentes_conciliacao}
              tone="amber"
            />
            <ResumoCard
              icon={HelpCircle}
              label="Diretas/ignoradas"
              value={resumo.matriculas_diretas + resumo.ignoradas_por_decisao}
              tone="violet"
            />
          </div>

          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-100">Taxa Experimental &gt; Matricula segue bloqueada</h3>
                <p className="text-sm text-amber-100/80 mt-1">
                  Esta tela mostra a fila que precisa ser conciliada antes de publicar KPI oficial.
                  Botões de decisão entram no proximo passo, depois de validarmos a leitura com a equipe.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {Object.entries(grupos).map(([etapa, total]) => (
              <div key={etapa} className={cn('rounded-xl border px-4 py-3', getEtapaStyle(etapa))}>
                <p className="text-xs opacity-80">{etapaLabel[etapa] || etapa}</p>
                <p className="text-2xl font-bold">{total}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Fila de leitura</h3>
            <p className="text-sm text-slate-400">
              {items.length} caso(s) que explicam divergencias entre Emusys, funil e KPIs.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
            <h4 className="text-white font-semibold">Nenhuma pendencia encontrada neste filtro</h4>
            <p className="text-sm text-slate-400 mt-1">Troque unidade ou competencia para revisar outros casos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Data</th>
                  <th className="text-left font-medium px-4 py-3">Lead / aluno</th>
                  <th className="text-left font-medium px-4 py-3">Etapa</th>
                  <th className="text-left font-medium px-4 py-3">Problema</th>
                  <th className="text-left font-medium px-4 py-3">Professor / curso</th>
                  <th className="text-left font-medium px-4 py-3">Aluno sugerido</th>
                  <th className="text-left font-medium px-4 py-3">Sinais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 align-top">
                      <p className="text-white font-medium">{formatarData(item.data_experimental)}</p>
                      <p className="text-slate-400 text-xs">{formatarHora(item.horario_experimental)}</p>
                      <p className="text-slate-500 text-xs mt-1">{item.unidade_nome || '-'}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-white font-semibold">{item.nome_aluno || item.lead_nome || '-'}</p>
                      {item.lead_nome && item.lead_nome !== item.nome_aluno && (
                        <p className="text-slate-400 text-xs">Lead: {item.lead_nome}</p>
                      )}
                      <p className="text-slate-500 text-xs">{formatarTelefone(item.lead_telefone)}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', getEtapaStyle(item.etapa_canonica))}>
                        {etapaLabel[item.etapa_canonica] || item.etapa_canonica}
                      </span>
                      <p className="text-slate-500 text-xs mt-2">{item.status_operacional || '-'}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-slate-200 font-medium">{getMotivoHumano(item)}</p>
                      {item.decisao_motivo && (
                        <p className="text-slate-500 text-xs mt-1 max-w-xs">{item.decisao_motivo}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-slate-200">{item.professor_nome || 'Sem professor'}</p>
                      <p className="text-slate-500 text-xs">{item.curso_nome || 'Sem curso'}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {item.aluno_vinculado_nome ? (
                        <>
                          <p className="text-emerald-200 font-medium">{item.aluno_vinculado_nome}</p>
                          <p className="text-slate-500 text-xs">ID {item.aluno_id} - {item.aluno_vinculado_status || '-'}</p>
                        </>
                      ) : item.aluno_sugerido_nome ? (
                        <>
                          <p className="text-amber-200 font-medium">{item.aluno_sugerido_nome}</p>
                          <p className="text-slate-500 text-xs">sugestao ID {item.aluno_sugerido_id}</p>
                        </>
                      ) : (
                        <span className="text-slate-500">Sem aluno sugerido</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1.5">
                        <Sinal ativo={item.presenca_confirmada} label="Presenca" />
                        <Sinal ativo={item.sinal_conversao} label="Conversao" />
                        <Sinal ativo={Boolean(item.decisao_humana)} label="Decisao humana" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

interface ResumoCardProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: 'cyan' | 'emerald' | 'rose' | 'sky' | 'amber' | 'violet';
}

const toneClasses: Record<ResumoCardProps['tone'], string> = {
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
};

function ResumoCard({ icon: Icon, label, value, tone }: ResumoCardProps) {
  return (
    <div className={cn('rounded-xl border p-4', toneClasses[tone])}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium opacity-80">{label}</span>
        <Icon className="w-4 h-4 opacity-80" />
      </div>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}

function Sinal({ ativo, label }: { ativo: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs',
        ativo
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          : 'border-slate-600 bg-slate-800/70 text-slate-500',
      )}
    >
      {label}
    </span>
  );
}

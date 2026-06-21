import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ClipboardX,
  GraduationCap,
  HelpCircle,
  Link2,
  Loader2,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

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
  decisoes_humanas?: number;
  conversoes_confirmadas_decisao?: number;
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
  contar_conversao_exp_mat: boolean | null;
  aluno_id_decidido: number | null;
  decisao_motivo: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
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
  decisoes_humanas: 0,
  conversoes_confirmadas_decisao: 0,
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
  realizada_sem_matricula_confirmada: 'Realizada sem matricula',
  realizada_com_matricula_confirmada: 'Realizada com matricula',
  experimental_faltou_confirmada: 'Falta confirmada',
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

interface AcaoConciliacao {
  decisao: string;
  label: string;
  descricao: string;
  motivo: string;
  incluirDenominador: boolean;
  contarConversao: boolean;
  usarAlunoSugerido?: boolean;
  tone: 'emerald' | 'cyan' | 'rose' | 'violet' | 'amber' | 'slate';
  icon: ComponentType<{ className?: string }>;
}

const acoesConciliacao: AcaoConciliacao[] = [
  {
    decisao: 'realizada_sem_matricula_confirmada',
    label: 'Fez experimental, nao matriculou',
    descricao: 'Conta como experimental realizada, mas nao como conversao.',
    motivo: 'Decisao humana: experimental realizada sem matricula.',
    incluirDenominador: true,
    contarConversao: false,
    tone: 'cyan',
    icon: CheckCircle2,
  },
  {
    decisao: 'realizada_com_matricula_confirmada',
    label: 'Fez experimental e matriculou',
    descricao: 'Conta como experimental realizada e conversao, usando aluno vinculado/sugerido.',
    motivo: 'Decisao humana: experimental realizada com matricula.',
    incluirDenominador: true,
    contarConversao: true,
    usarAlunoSugerido: true,
    tone: 'emerald',
    icon: GraduationCap,
  },
  {
    decisao: 'experimental_faltou_confirmada',
    label: 'Faltou / no-show',
    descricao: 'Remove do denominador de Exp -> Mat e marca como falta operacional validada.',
    motivo: 'Decisao humana: aluno faltou a experimental.',
    incluirDenominador: false,
    contarConversao: false,
    tone: 'rose',
    icon: UserX,
  },
  {
    decisao: 'matricula_direta_sem_experimental',
    label: 'Matricula direta',
    descricao: 'Matriculou sem fazer experimental. Nao entra na taxa Exp -> Mat.',
    motivo: 'Decisao humana: matricula direta sem experimental realizada.',
    incluirDenominador: false,
    contarConversao: false,
    tone: 'violet',
    icon: GraduationCap,
  },
  {
    decisao: 'duplicidade_reagendamento_ignorar',
    label: 'Ignorar duplicidade/reagendamento',
    descricao: 'Caso antigo, duplicado ou reagendado que nao deve afetar o funil.',
    motivo: 'Decisao humana: ignorar por duplicidade ou reagendamento.',
    incluirDenominador: false,
    contarConversao: false,
    tone: 'slate',
    icon: ClipboardX,
  },
  {
    decisao: 'responsavel_sem_aluno',
    label: 'Responsavel/familia',
    descricao: 'Nome do responsavel no funil. Precisa vinculo de aluno correto.',
    motivo: 'Decisao humana: responsavel/familia no lugar do aluno.',
    incluirDenominador: false,
    contarConversao: false,
    tone: 'amber',
    icon: Link2,
  },
  {
    decisao: 'revisar_manual',
    label: 'Revisar depois',
    descricao: 'Mantem o caso em pendencia humana para analise posterior.',
    motivo: 'Decisao humana: manter em revisao manual.',
    incluirDenominador: false,
    contarConversao: false,
    tone: 'amber',
    icon: AlertTriangle,
  },
];

const actionToneClasses: Record<AcaoConciliacao['tone'], string> = {
  emerald: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20',
  cyan: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20',
  rose: 'border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20',
  violet: 'border-violet-400/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20',
  amber: 'border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20',
  slate: 'border-slate-500/60 bg-slate-700/40 text-slate-200 hover:bg-slate-700/70',
};

export function ComercialConciliacaoExperimentais({
  unidadeId,
  ano,
  mes,
}: ComercialConciliacaoExperimentaisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ConciliacaoPayload | null>(null);
  const [itemEmDecisao, setItemEmDecisao] = useState<ConciliacaoItem | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

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

  const abrirDecisao = (item: ConciliacaoItem) => {
    setItemEmDecisao(item);
    setObservacao('');
  };

  const fecharDecisao = () => {
    if (salvando) return;
    setItemEmDecisao(null);
    setObservacao('');
  };

  const salvarDecisao = async (acao: AcaoConciliacao) => {
    if (!itemEmDecisao) return;

    const alunoIdDecidido = acao.usarAlunoSugerido
      ? itemEmDecisao.aluno_id || itemEmDecisao.aluno_sugerido_id || null
      : null;

    if (acao.usarAlunoSugerido && !alunoIdDecidido) {
      toast.error('Esta decisao precisa de aluno vinculado ou sugerido. Marque como responsavel/familia ou revisar depois.');
      return;
    }

    setSalvando(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || 'usuario_app';
      const nota = observacao.trim();
      const motivo = nota ? `${acao.motivo} Observacao: ${nota}` : acao.motivo;

      const { error: upsertError } = await supabase
        .from('lead_experimentais_decisoes_humanas')
        .upsert(
          {
            lead_experimental_id: itemEmDecisao.id,
            decisao: acao.decisao,
            incluir_denominador_exp_mat: acao.incluirDenominador,
            contar_conversao_exp_mat: acao.contarConversao,
            aluno_id_decidido: alunoIdDecidido,
            motivo,
            decidido_por: email,
            metadata: {
              origem: 'p02r2_conciliacao_ui',
              unidade_nome: itemEmDecisao.unidade_nome,
              nome_aluno: itemEmDecisao.nome_aluno,
              lead_nome: itemEmDecisao.lead_nome,
              status_operacional: itemEmDecisao.status_operacional,
              data_experimental: itemEmDecisao.data_experimental,
              horario_experimental: itemEmDecisao.horario_experimental,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'lead_experimental_id' },
        );

      if (upsertError) throw upsertError;

      toast.success('Decisao salva. A fila foi atualizada.');
      setItemEmDecisao(null);
      setObservacao('');
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar decisao humana');
    } finally {
      setSalvando(false);
    }
  };

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
                P02R.2 - conciliacao operacional
              </div>
              <h2 className="text-2xl font-bold text-white">Conciliação de Experimentais</h2>
              <p className="text-sm text-slate-300 mt-1 max-w-3xl">
                Visao do funil experimental por etapa: agendada, realizada confirmada, falta,
                matricula direta e pendencias de vinculo/presenca. As decisoes gravam somente na camada humana.
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
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
            <ResumoCard
              icon={ClipboardCheck}
              label="Decididas"
              value={resumo.decisoes_humanas}
              tone="slate"
            />
          </div>

          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-100">Taxa Experimental &gt; Matricula segue bloqueada</h3>
                <p className="text-sm text-amber-100/80 mt-1">
                  Os botoes abaixo nao alteram Emusys nem status original. Eles registram a leitura humana
                  para limpar a fila e preparar o KPI canônico com seguranca.
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
            <h3 className="text-lg font-bold text-white">Fila de acao</h3>
            <p className="text-sm text-slate-400">
              {items.length} caso(s) que precisam de uma decisao humana para sair da divergencia.
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
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Data</th>
                  <th className="text-left font-medium px-4 py-3">Lead / aluno</th>
                  <th className="text-left font-medium px-4 py-3">Etapa</th>
                  <th className="text-left font-medium px-4 py-3">Problema</th>
                  <th className="text-left font-medium px-4 py-3">Professor / curso</th>
                  <th className="text-left font-medium px-4 py-3">Aluno sugerido</th>
                  <th className="text-left font-medium px-4 py-3">Sinais</th>
                  <th className="text-left font-medium px-4 py-3">Acao</th>
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
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={() => abrirDecisao(item)}
                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Decidir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(itemEmDecisao)} onOpenChange={(open) => !open && fecharDecisao()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-950">
          {itemEmDecisao && (
            <>
              <DialogHeader>
                <DialogTitle>Decidir experimental</DialogTitle>
                <DialogDescription>
                  Escolha o que aconteceu de verdade. A decisao salva aqui nao altera o historico original.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <InfoLinha label="Aluno/lead" value={itemEmDecisao.nome_aluno || itemEmDecisao.lead_nome || '-'} />
                  <InfoLinha label="Data e hora" value={`${formatarData(itemEmDecisao.data_experimental)} ${formatarHora(itemEmDecisao.horario_experimental)}`} />
                  <InfoLinha label="Professor" value={itemEmDecisao.professor_nome || 'Sem professor'} />
                  <InfoLinha label="Curso" value={itemEmDecisao.curso_nome || 'Sem curso'} />
                  <InfoLinha label="Status atual" value={itemEmDecisao.status_operacional || '-'} />
                  <InfoLinha label="Problema" value={getMotivoHumano(itemEmDecisao)} />
                </div>

                {(itemEmDecisao.aluno_vinculado_nome || itemEmDecisao.aluno_sugerido_nome) && (
                  <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-semibold text-amber-200">Aluno para vinculo/decisao</p>
                    <p className="text-sm text-amber-50 mt-1">
                      {itemEmDecisao.aluno_vinculado_nome || itemEmDecisao.aluno_sugerido_nome}
                      <span className="text-amber-100/70">
                        {' '}ID {itemEmDecisao.aluno_id || itemEmDecisao.aluno_sugerido_id}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-200">Observacao opcional</label>
                <Textarea
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                  placeholder="Ex.: confirmado pela Vitoria, aluno veio; ou caso de irmaos/familia..."
                  className="mt-2 min-h-[84px] border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {acoesConciliacao.map((acao) => {
                  const Icon = acao.icon;
                  const bloqueadaSemAluno = acao.usarAlunoSugerido && !(itemEmDecisao.aluno_id || itemEmDecisao.aluno_sugerido_id);
                  return (
                    <button
                      key={acao.decisao}
                      onClick={() => salvarDecisao(acao)}
                      disabled={salvando || bloqueadaSemAluno}
                      className={cn(
                        'rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45',
                        actionToneClasses[acao.tone],
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 mt-0.5" />
                        <div>
                          <p className="font-semibold">{acao.label}</p>
                          <p className="text-xs opacity-80 mt-1">{bloqueadaSemAluno ? 'Precisa de aluno vinculado/sugerido.' : acao.descricao}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between gap-3 border-t border-slate-800 pt-4">
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Ban className="w-4 h-4" />
                  Nao altera Emusys, status, presenca ou matricula.
                </p>
                <button
                  onClick={fecharDecisao}
                  disabled={salvando}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ResumoCardProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: 'cyan' | 'emerald' | 'rose' | 'sky' | 'amber' | 'violet' | 'slate';
}

const toneClasses: Record<ResumoCardProps['tone'], string> = {
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
  slate: 'border-slate-500/30 bg-slate-700/40 text-slate-200',
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

function InfoLinha({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-100 mt-0.5">{value}</p>
    </div>
  );
}

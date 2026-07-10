import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastContainer } from '@/components/ui/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';

type Disponibilidade = Record<string, { inicio: string; fim: string }>;
type AcaoProposta = 'aprovar' | 'rejeitar' | 'efetivar';

interface EspelhoDisponibilidade {
  professores_unidade_id: number;
  professor_id: number;
  professor_nome: string;
  unidade_id: string;
  unidade_nome: string;
  disponibilidade: Disponibilidade;
  emusys_id: number | null;
  validacao_status: string | null;
  last_seen_em: string | null;
  proposta_ativa_id: string | null;
  proposta_status: 'pendente_aprovacao' | 'aprovada_aguardando_emusys' | null;
  disponibilidade_proposta: Disponibilidade | null;
  disponibilidade_vigente_proposta: Disponibilidade | null;
  proposta_versao: number | null;
  proposta_criada_em: string | null;
}

interface AulaAgenda {
  id: number;
  professor_id: number;
  unidade_id: string;
  data_aula: string;
  data_hora_inicio: string;
  data_hora_fim: string | null;
  duracao_minutos: number | null;
  curso_nome: string | null;
  turma_nome: string | null;
  tipo: string | null;
}

interface Props {
  unidadeAtual: UnidadeId;
}

const DIAS = [
  { chave: 'Segunda', rotulo: 'Seg' },
  { chave: 'Terca', rotulo: 'Ter' },
  { chave: 'Quarta', rotulo: 'Qua' },
  { chave: 'Quinta', rotulo: 'Qui' },
  { chave: 'Sexta', rotulo: 'Sex' },
  { chave: 'Sabado', rotulo: 'Sab' },
] as const;

const ALIASES_DIA: Record<string, string[]> = {
  Segunda: ['Segunda-feira'],
  Terca: ['Terça', 'Terca-feira', 'Terça-feira'],
  Quarta: ['Quarta-feira'],
  Quinta: ['Quinta-feira'],
  Sexta: ['Sexta-feira'],
  Sabado: ['Sábado', 'Sabado-feira', 'Sábado-feira'],
};

function disponibilidadeDoDia(disponibilidade: Disponibilidade, chave: string) {
  if (disponibilidade?.[chave]) return disponibilidade[chave];
  const alias = ALIASES_DIA[chave]?.find(nome => disponibilidade?.[nome]);
  return alias ? disponibilidade[alias] : null;
}

function minutosDoIntervalo(inicio: string, fim: string) {
  const [horaInicio, minutoInicio] = inicio.split(':').map(Number);
  const [horaFim, minutoFim] = fim.split(':').map(Number);
  return Math.max(0, horaFim * 60 + minutoFim - horaInicio * 60 - minutoInicio);
}

function formatarMinutos(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const restante = minutos % 60;
  if (horas === 0) return `${restante}min`;
  return restante === 0 ? `${horas}h` : `${horas}h${String(restante).padStart(2, '0')}`;
}

function disponibilidadeNormalizada(disponibilidade: Disponibilidade | null) {
  return DIAS.reduce<Record<string, { inicio: string; fim: string } | null>>((resultado, dia) => {
    resultado[dia.chave] = disponibilidadeDoDia(disponibilidade || {}, dia.chave);
    return resultado;
  }, {});
}

function disponibilidadesIguais(a: Disponibilidade | null, b: Disponibilidade | null) {
  return JSON.stringify(disponibilidadeNormalizada(a)) === JSON.stringify(disponibilidadeNormalizada(b));
}

function temConflito(row: EspelhoDisponibilidade) {
  if (!row.proposta_ativa_id || !row.disponibilidade_vigente_proposta || !row.disponibilidade_proposta) {
    return false;
  }

  const espelhoMudou = !disponibilidadesIguais(row.disponibilidade, row.disponibilidade_vigente_proposta);
  const emusysJaRefletiuProposta = disponibilidadesIguais(row.disponibilidade, row.disponibilidade_proposta);
  return espelhoMudou && !emusysJaRefletiuProposta;
}

function statusProposta(row: EspelhoDisponibilidade) {
  if (temConflito(row)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-300">
        <TriangleAlert className="h-3 w-3" />
        Conflito
      </span>
    );
  }
  if (row.proposta_status === 'pendente_aprovacao') {
    return <span className="text-[11px] text-amber-300">Pendente</span>;
  }
  if (row.proposta_status === 'aprovada_aguardando_emusys') {
    return <span className="text-[11px] text-cyan-300">Aguardando Emusys</span>;
  }
  return <span className="text-[11px] text-emerald-300">Espelho ativo</span>;
}

function ResumoDisponibilidade({ disponibilidade }: { disponibilidade: Disponibilidade | null }) {
  return (
    <div className="divide-y divide-slate-800">
      {DIAS.map(dia => {
        const intervalo = disponibilidadeDoDia(disponibilidade || {}, dia.chave);
        return (
          <div key={dia.chave} className="flex min-h-9 items-center justify-between gap-4 py-2 text-xs">
            <span className="text-slate-400">{dia.rotulo}</span>
            <span className={intervalo ? 'font-medium text-slate-100' : 'text-slate-600'}>
              {intervalo ? `${intervalo.inicio} - ${intervalo.fim}` : 'Indisponivel'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GradeDisponibilidadeProfessores({ unidadeAtual }: Props) {
  const toast = useToast();
  const { error: showError, success: showSuccess } = toast;
  const [semana, setSemana] = useState(new Date());
  const [modo, setModo] = useState<'geral' | 'professor'>('geral');
  const [professorSelecionado, setProfessorSelecionado] = useState('');
  const [espelhos, setEspelhos] = useState<EspelhoDisponibilidade[]>([]);
  const [aulas, setAulas] = useState<AulaAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [dialogo, setDialogo] = useState<{ acao: AcaoProposta; row: EspelhoDisponibilidade } | null>(null);
  const [comparacao, setComparacao] = useState<EspelhoDisponibilidade | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  const inicioSemana = useMemo(() => startOfWeek(semana, { weekStartsOn: 1 }), [semana]);
  const datas = useMemo(() => DIAS.map((_, index) => addDays(inicioSemana, index)), [inicioSemana]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let queryEspelhos = supabase
        .from('vw_disponibilidade_professores')
        .select('*')
        .order('professor_nome');

      let queryAulas = supabase
        .from('aulas_emusys')
        .select('id, professor_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim, duracao_minutos, curso_nome, turma_nome, tipo')
        .gte('data_aula', format(inicioSemana, 'yyyy-MM-dd'))
        .lte('data_aula', format(addDays(inicioSemana, 5), 'yyyy-MM-dd'))
        .eq('cancelada', false)
        .not('professor_id', 'is', null)
        .order('data_hora_inicio');

      if (unidadeAtual !== 'todos') {
        queryEspelhos = queryEspelhos.eq('unidade_id', unidadeAtual);
        queryAulas = queryAulas.eq('unidade_id', unidadeAtual);
      }

      const [espelhosResult, aulasResult] = await Promise.all([queryEspelhos, queryAulas]);
      if (espelhosResult.error) throw espelhosResult.error;
      if (aulasResult.error) throw aulasResult.error;

      const espelhosCarregados = (espelhosResult.data || []) as EspelhoDisponibilidade[];
      const idsPropostas = espelhosCarregados
        .map(row => row.proposta_ativa_id)
        .filter((id): id is string => Boolean(id));

      let propostasPorId = new Map<string, {
        disponibilidade_vigente: Disponibilidade;
        versao: number;
        created_at: string;
      }>();

      if (idsPropostas.length > 0) {
        const propostasResult = await supabase
          .from('disponibilidade_professor_propostas')
          .select('id, disponibilidade_vigente, versao, created_at')
          .in('id', idsPropostas);

        if (propostasResult.error) throw propostasResult.error;
        propostasPorId = new Map((propostasResult.data || []).map(proposta => [proposta.id, proposta]));
      }

      setEspelhos(espelhosCarregados.map(row => {
        const proposta = row.proposta_ativa_id ? propostasPorId.get(row.proposta_ativa_id) : null;
        return {
          ...row,
          disponibilidade_vigente_proposta: proposta?.disponibilidade_vigente || null,
          proposta_versao: proposta?.versao || null,
          proposta_criada_em: proposta?.created_at || null,
        };
      }));
      setAulas((aulasResult.data || []) as AulaAgenda[]);
    } catch (error) {
      console.error('Erro ao carregar grade de professores:', error);
      setErro('Nao foi possivel carregar a grade e as propostas.');
      showError('Erro ao carregar grade');
    } finally {
      setLoading(false);
    }
  }, [inicioSemana, showError, unidadeAtual]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const professores = useMemo(() => {
    const mapa = new Map<number, string>();
    espelhos.forEach(row => mapa.set(row.professor_id, row.professor_nome));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [espelhos]);

  useEffect(() => {
    if (modo === 'professor' && !professorSelecionado && professores.length > 0) {
      setProfessorSelecionado(String(professores[0][0]));
    }
  }, [modo, professorSelecionado, professores]);

  const linhas = useMemo(() => {
    if (modo === 'geral') return espelhos;
    return espelhos.filter(row => String(row.professor_id) === professorSelecionado);
  }, [espelhos, modo, professorSelecionado]);

  const aulasPorProfessorData = useMemo(() => {
    const mapa = new Map<string, AulaAgenda[]>();
    aulas.forEach(aula => {
      const chave = `${aula.professor_id}:${aula.unidade_id}:${aula.data_aula}`;
      const lista = mapa.get(chave) || [];
      lista.push(aula);
      mapa.set(chave, lista);
    });
    return mapa;
  }, [aulas]);

  const abrirDialogo = (acao: AcaoProposta, row: EspelhoDisponibilidade) => {
    setMotivoRejeicao('');
    setDialogo({ acao, row });
  };

  const confirmarAcao = async () => {
    if (!dialogo?.row.proposta_ativa_id) return;
    setProcessando(true);
    try {
      const { error } = dialogo.acao === 'efetivar'
        ? await supabase.rpc('admin_efetivar_proposta_disponibilidade', {
            p_proposta_id: dialogo.row.proposta_ativa_id,
            p_confirmacao_emusys: true,
          })
        : await supabase.rpc('admin_decidir_proposta_disponibilidade', {
            p_proposta_id: dialogo.row.proposta_ativa_id,
            p_decisao: dialogo.acao,
            p_motivo: dialogo.acao === 'rejeitar' ? motivoRejeicao.trim() : null,
          });

      if (error) throw error;
      showSuccess(
        dialogo.acao === 'aprovar'
          ? 'Proposta aprovada'
          : dialogo.acao === 'rejeitar'
            ? 'Proposta rejeitada'
            : 'Espelho atualizado'
      );
      setDialogo(null);
      await carregar();
    } catch (error: any) {
      console.error('Erro ao operar proposta de disponibilidade:', error);
      showError('Não foi possível concluir', error.message);
    } finally {
      setProcessando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 border-y border-red-500/20 bg-red-500/5 px-6 text-center">
        <TriangleAlert className="h-7 w-7 text-red-300" />
        <div>
          <p className="text-sm font-medium text-slate-100">Grade indisponivel</p>
          <p className="mt-1 text-xs text-slate-400">{erro}</p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-700 bg-slate-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setModo('geral')}
              className={`flex h-8 items-center gap-2 rounded px-3 text-xs font-medium ${modo === 'geral' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="h-4 w-4" />
              Agenda geral
            </button>
            <button
              type="button"
              onClick={() => setModo('professor')}
              className={`flex h-8 items-center gap-2 rounded px-3 text-xs font-medium ${modo === 'professor' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <UserRound className="h-4 w-4" />
              Por professor
            </button>
          </div>

          {modo === 'professor' && professores.length > 0 && (
            <Select value={professorSelecionado} onValueChange={setProfessorSelecionado}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {professores.map(([id, nome]) => (
                  <SelectItem key={id} value={String(id)}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setSemana(subWeeks(semana, 1))} title="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium text-slate-200">
            {format(inicioSemana, "dd 'de' MMM", { locale: ptBR })} - {format(addDays(inicioSemana, 5), "dd 'de' MMM", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setSemana(addWeeks(semana, 1))} title="Próxima semana">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={carregar} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Livre</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-500" />Com aula</span>
        <span className="ml-auto text-slate-500">Espelho Emusys</span>
      </div>

      <div className="overflow-x-auto border-y border-slate-700/70">
        <div className="min-w-[1180px]">
          <div className="grid grid-cols-[210px_repeat(6,minmax(150px,1fr))] border-b border-slate-700/70 bg-slate-900/50">
            <div className="p-3 text-xs font-semibold text-slate-400">Professor e unidade</div>
            {datas.map((data, index) => (
              <div key={data.toISOString()} className="border-l border-slate-700/60 p-3 text-center">
                <p className="text-xs font-semibold text-slate-200">{DIAS[index].rotulo}</p>
                <p className="text-[11px] text-slate-500">{format(data, 'dd/MM')}</p>
              </div>
            ))}
          </div>

          {linhas.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">Nenhuma disponibilidade encontrada.</div>
          ) : linhas.map(row => {
            const conflito = temConflito(row);
            return (
            <div key={row.professores_unidade_id} className="grid grid-cols-[210px_repeat(6,minmax(150px,1fr))] border-b border-slate-800 bg-slate-950/20 hover:bg-slate-900/30">
              <div className="p-3">
                <p className="truncate text-sm font-medium text-white">{row.professor_nome}</p>
                <p className="truncate text-xs text-slate-500">{row.unidade_nome}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {statusProposta(row)}
                  {row.proposta_ativa_id && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300" onClick={() => setComparacao(row)} title="Comparar vigente e proposta">
                      <GitCompareArrows className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {row.proposta_status === 'pendente_aprovacao' && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400" onClick={() => abrirDialogo('aprovar', row)} title={conflito ? 'Resolva o conflito antes de aprovar' : 'Aprovar'} disabled={conflito}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => abrirDialogo('rejeitar', row)} title="Rejeitar">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {row.proposta_status === 'aprovada_aguardando_emusys' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-cyan-300" onClick={() => abrirDialogo('efetivar', row)} disabled={conflito}>
                      Efetivar
                    </Button>
                  )}
                </div>
              </div>

              {datas.map((data, index) => {
                const dataChave = format(data, 'yyyy-MM-dd');
                const disponibilidade = disponibilidadeDoDia(row.disponibilidade || {}, DIAS[index].chave);
                const aulasDia = aulasPorProfessorData.get(`${row.professor_id}:${row.unidade_id}:${dataChave}`) || [];
                const minutosDisponiveis = disponibilidade
                  ? minutosDoIntervalo(disponibilidade.inicio, disponibilidade.fim)
                  : 0;
                const minutosEmAula = aulasDia.reduce((total, aula) => total + (aula.duracao_minutos || 0), 0);
                const minutosLivres = Math.max(0, minutosDisponiveis - minutosEmAula);

                return (
                  <div key={dataChave} className="min-h-28 border-l border-slate-800 p-2">
                    {!disponibilidade ? (
                      <span className="text-[11px] text-slate-600">Indisponível</span>
                    ) : (
                      <>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                            <Clock3 className="h-3 w-3" />
                            {disponibilidade.inicio}-{disponibilidade.fim}
                          </span>
                          <span className="text-[10px] text-emerald-400/80">{formatarMinutos(minutosLivres)} livres</span>
                        </div>
                        <div className="space-y-1">
                          {aulasDia.slice(0, 3).map(aula => (
                            <div key={aula.id} className="border-l-2 border-cyan-500 bg-cyan-500/10 px-2 py-1">
                              <p className="flex items-center gap-1 text-[11px] font-medium text-cyan-200">
                                <BookOpen className="h-3 w-3" />
                                {format(new Date(aula.data_hora_inicio), 'HH:mm')} {aula.curso_nome || 'Aula'}
                              </p>
                              {aula.turma_nome && <p className="truncate text-[10px] text-slate-500">{aula.turma_nome}</p>}
                            </div>
                          ))}
                          {aulasDia.length > 3 && (
                            <p className="text-[10px] text-slate-500">+{aulasDia.length - 3} aulas</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );})}
        </div>
      </div>

      <AlertDialog open={!!comparacao} onOpenChange={open => !open && setComparacao(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Vigente x proposta</AlertDialogTitle>
            <AlertDialogDescription>
              {comparacao?.professor_nome} em {comparacao?.unidade_nome}
              {comparacao?.proposta_versao ? `, versao ${comparacao.proposta_versao}` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {comparacao && (
            <>
              {temConflito(comparacao) && (
                <div className="flex items-start gap-2 border-y border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  O espelho mudou depois do envio e nao corresponde a proposta. Revise no Emusys antes de decidir.
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <section>
                  <p className="border-b border-slate-700 pb-2 text-xs font-semibold text-slate-300">Vigente no envio</p>
                  <ResumoDisponibilidade disponibilidade={comparacao.disponibilidade_vigente_proposta || comparacao.disponibilidade} />
                </section>
                <section>
                  <p className="border-b border-cyan-500/40 pb-2 text-xs font-semibold text-cyan-300">Proposta</p>
                  <ResumoDisponibilidade disponibilidade={comparacao.disponibilidade_proposta} />
                </section>
              </div>
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setComparacao(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dialogo} onOpenChange={open => !open && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogo?.acao === 'aprovar' && 'Aprovar proposta'}
              {dialogo?.acao === 'rejeitar' && 'Rejeitar proposta'}
              {dialogo?.acao === 'efetivar' && 'Efetivar espelho'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialogo?.acao === 'aprovar' && 'A proposta ficará aguardando a alteração oficial no Emusys.'}
              {dialogo?.acao === 'rejeitar' && 'O professor verá a decisão e o motivo informado.'}
              {dialogo?.acao === 'efetivar' && 'Confirme somente depois de atualizar a disponibilidade no Emusys.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogo?.acao === 'rejeitar' && (
            <Input
              value={motivoRejeicao}
              onChange={event => setMotivoRejeicao(event.target.value)}
              placeholder="Motivo da rejeição"
              autoFocus
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                confirmarAcao();
              }}
              disabled={processando || (dialogo?.acao === 'rejeitar' && motivoRejeicao.trim().length < 3)}
            >
              {processando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

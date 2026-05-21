import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, Plus, Wrench, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ModalPendenciaInventario } from './ModalPendenciaInventario';
import { ModalConcluirPendencia } from './ModalConcluirPendencia';
import type { ItemInventario, PendenciaInventario, Sala, Unidade } from './types';
import {
  PRIORIDADES_PENDENCIA,
  STATUS_PENDENCIA,
  getCategoriaPendenciaLabel,
  getPrioridadePendenciaConfig,
  getStatusPendenciaConfig,
} from './types';

interface PendenciasTabProps {
  unidadeAtual: string;
  salas: Sala[];
  unidades: Unidade[];
  salaFiltroInicial?: number | null;
}

const PRIORIDADE_ORDEM: PendenciaInventario['prioridade'][] = ['urgente', 'importante', 'futuramente'];

export function PendenciasTab({ unidadeAtual, salas, unidades, salaFiltroInicial }: PendenciasTabProps) {
  const { isAdmin, usuario, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState<number | null>(null);
  const [pendencias, setPendencias] = useState<PendenciaInventario[]>([]);
  const [itensAtivos, setItensAtivos] = useState<ItemInventario[]>([]);
  const [filtroUnidade, setFiltroUnidade] = useState(unidadeAtual !== 'todos' ? unidadeAtual : 'todos');
  const [filtroSala, setFiltroSala] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<PendenciaInventario['status']>('aberta');
  const [filtroPrioridade, setFiltroPrioridade] = useState<'todos' | PendenciaInventario['prioridade']>('todos');
  const [busca, setBusca] = useState('');
  const [modalPendenciaOpen, setModalPendenciaOpen] = useState(false);
  const [modalConcluirOpen, setModalConcluirOpen] = useState(false);
  const [pendenciaEditando, setPendenciaEditando] = useState<PendenciaInventario | null>(null);
  const [pendenciaConcluindo, setPendenciaConcluindo] = useState<PendenciaInventario | null>(null);
  const [pendenciaCancelando, setPendenciaCancelando] = useState<PendenciaInventario | null>(null);

  useEffect(() => {
    if (unidadeAtual !== 'todos') {
      setFiltroUnidade(unidadeAtual);
    }
  }, [unidadeAtual]);

  useEffect(() => {
    if (salaFiltroInicial) {
      setFiltroSala(String(salaFiltroInicial));
    }
  }, [salaFiltroInicial]);

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual]);

  async function carregarDados() {
    setLoading(true);
    try {
      let queryPendencias = supabase
        .from('inventario_pendencias')
        .select(`
          *,
          salas(nome),
          unidades(nome),
          inventario:item_vinculado_id(nome)
        `)
        .order('created_at', { ascending: false });

      let queryItens = supabase
        .from('inventario')
        .select('id, sala_id, unidade_id, nome, status, ativo')
        .eq('ativo', true)
        .order('nome');

      if (unidadeAtual !== 'todos') {
        queryPendencias = queryPendencias.eq('unidade_id', unidadeAtual);
        queryItens = queryItens.eq('unidade_id', unidadeAtual);
      }

      const [{ data: pendenciasData, error: pendenciasError }, { data: itensData, error: itensError }] = await Promise.all([
        queryPendencias,
        queryItens,
      ]);

      if (pendenciasError) throw pendenciasError;
      if (itensError) throw itensError;

      setPendencias(
        (pendenciasData || []).map((pendencia: any) => ({
          ...pendencia,
          sala_nome: pendencia.salas?.nome || 'Sala',
          unidade_nome: pendencia.unidades?.nome || 'Unidade',
          item_vinculado_nome: pendencia.inventario?.nome || null,
        }))
      );

      setItensAtivos((itensData || []) as ItemInventario[]);
    } catch (error) {
      console.error('Erro ao carregar pendências:', error);
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }

  const salasFiltradas = useMemo(() => {
    if (filtroUnidade === 'todos') return salas;
    return salas.filter((sala) => sala.unidade_id === filtroUnidade);
  }, [filtroUnidade, salas]);

  const itensDaSalaConcluindo = useMemo(() => {
    if (!pendenciaConcluindo?.sala_id) return [];
    return itensAtivos.filter((item) => item.sala_id === pendenciaConcluindo.sala_id && item.ativo);
  }, [itensAtivos, pendenciaConcluindo?.sala_id]);

  const pendenciasFiltradas = useMemo(() => {
    return pendencias.filter((pendencia) => {
      if (filtroUnidade !== 'todos' && pendencia.unidade_id !== filtroUnidade) return false;
      if (filtroSala !== 'todos' && String(pendencia.sala_id) !== filtroSala) return false;
      if (pendencia.status !== filtroStatus) return false;
      if (filtroPrioridade !== 'todos' && pendencia.prioridade !== filtroPrioridade) return false;
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const conteudo = [
          pendencia.titulo,
          pendencia.descricao || '',
          pendencia.sala_nome || '',
          pendencia.unidade_nome || '',
          pendencia.solicitante || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!conteudo.includes(termo)) return false;
      }
      return true;
    });
  }, [busca, filtroPrioridade, filtroSala, filtroStatus, filtroUnidade, pendencias]);

  const pendenciasAgrupadas = useMemo(() => {
    return PRIORIDADE_ORDEM.map((prioridade) => ({
      prioridade,
      itens: pendenciasFiltradas.filter((pendencia) => pendencia.prioridade === prioridade),
    })).filter((grupo) => grupo.itens.length > 0);
  }, [pendenciasFiltradas]);

  async function handleSalvarPendencia(payload: {
    unidade_id: string;
    sala_id: number | null;
    titulo: string;
    categoria: PendenciaInventario['categoria'];
    prioridade: PendenciaInventario['prioridade'];
    descricao: string;
    solicitante: string;
  }) {
    try {
      const dados = {
        unidade_id: payload.unidade_id,
        sala_id: payload.sala_id,
        titulo: payload.titulo,
        categoria: payload.categoria,
        prioridade: payload.prioridade,
        descricao: payload.descricao || null,
        solicitante: payload.solicitante || usuario?.nome || user?.email || null,
        created_via: pendenciaEditando?.created_via || 'LA Report',
      };

      if (pendenciaEditando) {
        const { error } = await supabase
          .from('inventario_pendencias')
          .update(dados)
          .eq('id', pendenciaEditando.id);

        if (error) throw error;
        toast.success('Pendência atualizada');
      } else {
        const { error } = await supabase.from('inventario_pendencias').insert(dados);
        if (error) throw error;
        toast.success('Pendência criada');
      }

      setPendenciaEditando(null);
      await carregarDados();
      return true;
    } catch (error) {
      console.error('Erro ao salvar pendência:', error);
      toast.error('Erro ao salvar pendência');
      return false;
    }
  }

  async function handleAtualizarStatus(pendencia: PendenciaInventario, status: PendenciaInventario['status']) {
    setSavingAction(pendencia.id);
    try {
      const { error } = await supabase
        .from('inventario_pendencias')
        .update({ status })
        .eq('id', pendencia.id);

      if (error) throw error;
      toast.success(status === 'em_andamento' ? 'Pendência movida para em andamento' : 'Pendência atualizada');
      await carregarDados();
    } catch (error) {
      console.error('Erro ao atualizar status da pendência:', error);
      toast.error('Erro ao atualizar status');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleConcluirPendencia(payload: { resolucao_obs: string; item_vinculado_id: number | null }) {
    if (!pendenciaConcluindo) return false;

    setSavingAction(pendenciaConcluindo.id);
    try {
      const { error } = await supabase
        .from('inventario_pendencias')
        .update({
          status: 'concluida',
          resolvido_em: new Date().toISOString(),
          resolvido_por: usuario?.nome || user?.email || 'Usuário',
          resolucao_obs: payload.resolucao_obs,
          item_vinculado_id: payload.item_vinculado_id,
        })
        .eq('id', pendenciaConcluindo.id);

      if (error) throw error;
      toast.success('Pendência concluída');
      setPendenciaConcluindo(null);
      await carregarDados();
      return true;
    } catch (error) {
      console.error('Erro ao concluir pendência:', error);
      toast.error('Erro ao concluir pendência');
      return false;
    } finally {
      setSavingAction(null);
    }
  }

  async function handleCancelarPendencia() {
    if (!pendenciaCancelando) return;

    setSavingAction(pendenciaCancelando.id);
    try {
      const { error } = await supabase
        .from('inventario_pendencias')
        .update({ status: 'cancelada' })
        .eq('id', pendenciaCancelando.id);

      if (error) throw error;
      toast.success('Pendência cancelada');
      setPendenciaCancelando(null);
      await carregarDados();
    } catch (error) {
      console.error('Erro ao cancelar pendência:', error);
      toast.error('Erro ao cancelar pendência');
    } finally {
      setSavingAction(null);
    }
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString('pt-BR');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pendência..."
            className="min-w-[220px] flex-1 border-slate-700 bg-slate-900"
          />

          {isAdmin && (
            <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
              <SelectTrigger className="w-[180px] border-slate-700 bg-slate-900">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as unidades</SelectItem>
                {unidades.map((unidade) => (
                  <SelectItem key={unidade.id} value={unidade.id}>
                    {unidade.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filtroSala} onValueChange={setFiltroSala}>
            <SelectTrigger className="w-[180px] border-slate-700 bg-slate-900">
              <SelectValue placeholder="Sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as salas</SelectItem>
              {salasFiltradas.map((sala) => (
                <SelectItem key={sala.id} value={String(sala.id)}>
                  {sala.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => {
            setPendenciaEditando(null);
            setModalPendenciaOpen(true);
          }}
          className="bg-purple-600 hover:bg-purple-500"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova pendência
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_PENDENCIA.map((status) => {
            const ativo = filtroStatus === status.value;
            return (
              <button
                key={status.value}
                onClick={() => setFiltroStatus(status.value as PendenciaInventario['status'])}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${ativo ? status.cor : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}
              >
                {status.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltroPrioridade('todos')}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${filtroPrioridade === 'todos' ? 'border-slate-500 bg-slate-700 text-white' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}
          >
            Todas as prioridades
          </button>
          {PRIORIDADES_PENDENCIA.map((prioridade) => {
            const ativo = filtroPrioridade === prioridade.value;
            return (
              <button
                key={prioridade.value}
                onClick={() => setFiltroPrioridade(prioridade.value as PendenciaInventario['prioridade'])}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${ativo ? prioridade.cor : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}
              >
                {prioridade.emoji} {prioridade.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      ) : pendenciasAgrupadas.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-12 text-center">
          <ClipboardList className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <p className="text-slate-400">Nenhuma pendência encontrada com os filtros aplicados.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pendenciasAgrupadas.map((grupo) => {
            const prioridadeConfig = getPrioridadePendenciaConfig(grupo.prioridade);
            return (
              <section key={grupo.prioridade} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${prioridadeConfig.cor}`}>
                    {prioridadeConfig.emoji} {prioridadeConfig.label.toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-400">{grupo.itens.length} pendência(s)</span>
                </div>

                <div className="space-y-3">
                  {grupo.itens.map((pendencia) => {
                    const statusConfig = getStatusPendenciaConfig(pendencia.status);
                    const emProcesso = savingAction === pendencia.id;
                    return (
                      <div key={pendencia.id} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-white">{pendencia.titulo}</h3>
                              <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusConfig.cor}`}>
                                {statusConfig.label}
                              </div>
                              <div className="inline-flex items-center rounded-full border border-slate-600 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                                {getCategoriaPendenciaLabel(pendencia.categoria)}
                              </div>
                            </div>

                            <p className="text-sm text-slate-400">
                              {pendencia.sala_nome} · {pendencia.unidade_nome}
                            </p>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{pendencia.solicitante || 'Sem solicitante'}</span>
                              <span>{formatarData(pendencia.created_at)}</span>
                              {pendencia.item_vinculado_nome && <span>Vinculado: {pendencia.item_vinculado_nome}</span>}
                            </div>

                            {pendencia.descricao && <p className="text-sm text-slate-300">{pendencia.descricao}</p>}
                            {pendencia.resolucao_obs && (
                              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
                                <p className="font-medium text-emerald-300">Resolução</p>
                                <p className="mt-1">{pendencia.resolucao_obs}</p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {pendencia.status !== 'concluida' && pendencia.status !== 'cancelada' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={emProcesso}
                                onClick={() => {
                                  setPendenciaConcluindo(pendencia);
                                  setModalConcluirOpen(true);
                                }}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Concluir
                              </Button>
                            )}

                            {pendencia.status === 'aberta' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={emProcesso}
                                onClick={() => handleAtualizarStatus(pendencia, 'em_andamento')}
                              >
                                <Wrench className="mr-2 h-4 w-4" />
                                Em andamento
                              </Button>
                            )}

                            {pendencia.status !== 'concluida' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={emProcesso}
                                onClick={() => {
                                  setPendenciaEditando(pendencia);
                                  setModalPendenciaOpen(true);
                                }}
                              >
                                Editar
                              </Button>
                            )}

                            {pendencia.status !== 'cancelada' && pendencia.status !== 'concluida' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={emProcesso}
                                onClick={() => setPendenciaCancelando(pendencia)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ModalPendenciaInventario
        open={modalPendenciaOpen}
        onOpenChange={(open) => {
          setModalPendenciaOpen(open);
          if (!open) setPendenciaEditando(null);
        }}
        onSave={handleSalvarPendencia}
        pendencia={pendenciaEditando}
        unidades={unidades}
        salas={salas}
        defaultUnidadeId={filtroUnidade !== 'todos' ? filtroUnidade : unidadeAtual !== 'todos' ? unidadeAtual : undefined}
        defaultSalaId={filtroSala !== 'todos' ? Number(filtroSala) : undefined}
        defaultSolicitante={usuario?.nome || user?.email || ''}
      />

      <ModalConcluirPendencia
        open={modalConcluirOpen}
        onOpenChange={(open) => {
          setModalConcluirOpen(open);
          if (!open) setPendenciaConcluindo(null);
        }}
        pendencia={pendenciaConcluindo}
        itensDaSala={itensDaSalaConcluindo}
        onSave={handleConcluirPendencia}
      />

      <AlertDialog open={!!pendenciaCancelando} onOpenChange={(open) => !open && setPendenciaCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pendência</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar <strong className="text-white">{pendenciaCancelando?.titulo}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendenciaCancelando(null)}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelarPendencia}>Cancelar pendência</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

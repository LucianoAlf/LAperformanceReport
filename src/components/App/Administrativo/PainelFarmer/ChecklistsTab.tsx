'use client';

import React, { useState, useCallback } from 'react';
import {
  Plus,
  ClipboardList,
  LayoutTemplate,
  Archive,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Loader2,
  Zap,
  GripVertical,
  Trash2,
  ChevronRight,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { useColaboradorAtual, useChecklists } from './hooks';
import { TarefasTab } from './TarefasTab';
import { ChecklistDetail } from './ChecklistDetail';
import type { FarmerChecklist, FarmerChecklistTemplate, TaskBuilderItem } from './types';

interface ChecklistsTabProps {
  unidadeId: string;
}

type FiltroStatus = 'ativo' | 'concluido' | 'todos';

export function ChecklistsTab({ unidadeId }: ChecklistsTabProps) {
  const { colaborador } = useColaboradorAtual(unidadeId);
  const {
    checklists,
    checklistsAtivos,
    checklistsConcluidos,
    templates,
    loading,
    filtroStatus,
    setFiltroStatus,
    criarChecklist,
    criarFromTemplate,
    arquivarChecklist,
    refetch,
  } = useChecklists(colaborador?.id || null, unidadeId, colaborador?.unidade_id);

  // Estado de navegação: lista ou detalhe
  const [checklistAberto, setChecklistAberto] = useState<string | null>(null);
  const [filtroDepartamento, setFiltroDepartamento] = useState<'todos_dept' | 'administrativo' | 'comercial' | 'pedagogico'>('todos_dept');

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalTemplatesAberto, setModalTemplatesAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Form state — novo checklist manual (TODOS os campos do wireframe)
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [periodicidade, setPeriodicidade] = useState<'pontual' | 'diario' | 'semanal' | 'mensal'>('pontual');
  const [departamento, setDepartamento] = useState<'administrativo' | 'comercial' | 'pedagogico' | 'geral'>('administrativo');
  const [prioridade, setPrioridade] = useState<'alta' | 'media' | 'baixa'>('media');
  const [dataInicio, setDataInicio] = useState<Date | undefined>(new Date());
  const [dataPrazo, setDataPrazo] = useState<Date | undefined>();
  const [tipoVinculo, setTipoVinculo] = useState<'nenhum' | 'todos_alunos' | 'por_curso' | 'por_professor' | 'manual'>('nenhum');
  const [alertaDiasAntes, setAlertaDiasAntes] = useState<string>('sem');
  const [alertaHora, setAlertaHora] = useState<string>('08:00');
  const [lembreteWhatsapp, setLembreteWhatsapp] = useState(false);
  const [templateNoModal, setTemplateNoModal] = useState<string>('');

  // Task Builder state
  const [tarefas, setTarefas] = useState<TaskBuilderItem[]>([
    { id: crypto.randomUUID(), descricao: '', canal: null, subtarefas: [] },
  ]);

  // Form state — criar a partir de template (modal separado)
  const [templateSelecionado, setTemplateSelecionado] = useState<string>('');
  const [tituloTemplate, setTituloTemplate] = useState('');
  const [dataPrazoTemplate, setDataPrazoTemplate] = useState<Date | undefined>();

  // Task Builder helpers
  const addTarefa = useCallback(() => {
    setTarefas(prev => [...prev, { id: crypto.randomUUID(), descricao: '', canal: null, subtarefas: [] }]);
  }, []);

  const removeTarefa = useCallback((tarefaId: string) => {
    setTarefas(prev => prev.filter(t => t.id !== tarefaId));
  }, []);

  const updateTarefa = useCallback((tarefaId: string, field: 'descricao' | 'canal', value: string | null) => {
    setTarefas(prev => prev.map(t => t.id === tarefaId ? { ...t, [field]: value } : t));
  }, []);

  const addSubtarefa = useCallback((tarefaId: string) => {
    setTarefas(prev => prev.map(t =>
      t.id === tarefaId
        ? { ...t, subtarefas: [...t.subtarefas, { id: crypto.randomUUID(), descricao: '', canal: null }] }
        : t
    ));
  }, []);

  const removeSubtarefa = useCallback((tarefaId: string, subId: string) => {
    setTarefas(prev => prev.map(t =>
      t.id === tarefaId
        ? { ...t, subtarefas: t.subtarefas.filter(s => s.id !== subId) }
        : t
    ));
  }, []);

  const updateSubtarefa = useCallback((tarefaId: string, subId: string, field: 'descricao' | 'canal', value: string | null) => {
    setTarefas(prev => prev.map(t =>
      t.id === tarefaId
        ? { ...t, subtarefas: t.subtarefas.map(s => s.id === subId ? { ...s, [field]: value } : s) }
        : t
    ));
  }, []);

  // Preencher tarefas a partir de template selecionado no modal
  const preencherFromTemplate = useCallback((tmplId: string) => {
    setTemplateNoModal(tmplId);
    if (!tmplId) return;
    const tmpl = templates.find(t => t.id === tmplId);
    if (tmpl) {
      if (!titulo.trim()) setTitulo(tmpl.nome);
      if (!descricao.trim() && tmpl.descricao) setDescricao(tmpl.descricao);
      // Converter itens do template para TaskBuilderItems
      const novasTarefas: TaskBuilderItem[] = (tmpl.itens || []).map(item => ({
        id: crypto.randomUUID(),
        descricao: item.descricao,
        canal: item.canal,
        subtarefas: (item.subs || []).map(s => ({
          id: crypto.randomUUID(),
          descricao: s.descricao,
          canal: s.canal,
        })),
      }));
      if (novasTarefas.length > 0) setTarefas(novasTarefas);
    }
  }, [templates, titulo, descricao]);

  const resetFormNovo = () => {
    setTitulo('');
    setDescricao('');
    setPeriodicidade('pontual');
    setDepartamento('administrativo');
    setPrioridade('media');
    setDataInicio(new Date());
    setDataPrazo(undefined);
    setTipoVinculo('nenhum');
    setAlertaDiasAntes('sem');
    setAlertaHora('08:00');
    setLembreteWhatsapp(false);
    setTemplateNoModal('');
    setTarefas([{ id: crypto.randomUUID(), descricao: '', canal: null, subtarefas: [] }]);
  };

  const resetFormTemplate = () => {
    setTemplateSelecionado('');
    setTituloTemplate('');
    setDataPrazoTemplate(undefined);
  };

  const handleCriarManual = async () => {
    if (!titulo.trim()) return;
    // Filtrar tarefas vazias
    const tarefasValidas = tarefas.filter(t => t.descricao.trim());
    setSalvando(true);
    try {
      const checklist = await criarChecklist({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        periodicidade,
        departamento,
        prioridade,
        tipo_vinculo: tipoVinculo,
        data_inicio: dataInicio?.toISOString().split('T')[0],
        data_prazo: dataPrazo?.toISOString().split('T')[0],
        alerta_dias_antes: alertaDiasAntes !== 'sem' ? parseInt(alertaDiasAntes) : undefined,
        alerta_hora: alertaDiasAntes !== 'sem' ? alertaHora : undefined,
        lembrete_whatsapp: lembreteWhatsapp,
      });

      // Se criou com sucesso e tem tarefas, inserir os itens
      if (checklist?.id && tarefasValidas.length > 0) {
        const { supabase } = await import('@/lib/supabase');
        const itensParaInserir: { checklist_id: string; descricao: string; ordem: number; canal: string | null; parent_id: string | null }[] = [];
        
        // Primeiro inserir tarefas-pai
        for (let i = 0; i < tarefasValidas.length; i++) {
          const t = tarefasValidas[i];
          itensParaInserir.push({
            checklist_id: checklist.id,
            descricao: t.descricao.trim(),
            ordem: i,
            canal: t.canal,
            parent_id: null,
          });
        }

        const { data: itensCriados } = await supabase
          .from('farmer_checklist_items')
          .insert(itensParaInserir)
          .select('id, ordem');

        // Inserir subtarefas vinculadas aos pais
        if (itensCriados) {
          const subsParaInserir: { checklist_id: string; descricao: string; ordem: number; canal: string | null; parent_id: string }[] = [];
          for (let i = 0; i < tarefasValidas.length; i++) {
            const parentItem = itensCriados.find(ic => ic.ordem === i);
            if (!parentItem) continue;
            const subsValidas = tarefasValidas[i].subtarefas.filter(s => s.descricao.trim());
            for (let j = 0; j < subsValidas.length; j++) {
              subsParaInserir.push({
                checklist_id: checklist.id,
                descricao: subsValidas[j].descricao.trim(),
                ordem: j,
                canal: subsValidas[j].canal,
                parent_id: parentItem.id,
              });
            }
          }
          if (subsParaInserir.length > 0) {
            await supabase.from('farmer_checklist_items').insert(subsParaInserir);
          }
        }
      }

      setModalNovoAberto(false);
      resetFormNovo();
      // Abrir o checklist criado
      if (checklist?.id) {
        await refetch();
        setChecklistAberto(checklist.id);
      }
    } catch (err) {
      console.error('Erro ao criar checklist:', err);
    } finally {
      setSalvando(false);
    }
  };

  const handleCriarFromTemplate = async () => {
    if (!templateSelecionado) return;
    setSalvando(true);
    try {
      const checklistId = await criarFromTemplate(
        templateSelecionado,
        tituloTemplate.trim() || undefined,
        dataPrazoTemplate?.toISOString().split('T')[0]
      );
      setModalTemplatesAberto(false);
      resetFormTemplate();
      if (checklistId) {
        setChecklistAberto(checklistId);
      }
    } catch (err) {
      console.error('Erro ao criar checklist do template:', err);
    } finally {
      setSalvando(false);
    }
  };

  // Se um checklist está aberto, mostrar o detalhe
  if (checklistAberto) {
    return (
      <ChecklistDetail
        checklistId={checklistAberto}
        unidadeId={unidadeId}
        onVoltar={() => {
          setChecklistAberto(null);
          refetch();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-slate-700 rounded w-1/4 animate-pulse" />
          <div className="h-10 bg-slate-700 rounded w-40 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-slate-700 rounded w-2/3 mb-3" />
              <div className="h-3 bg-slate-700/50 rounded w-full mb-2" />
              <div className="h-2 bg-slate-700/50 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Checklists</h3>
          <p className="text-sm text-slate-400">Gerencie seus checklists e tarefas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setModalTemplatesAberto(true)}
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <LayoutTemplate className="w-4 h-4 mr-2" />
            Templates
          </Button>
          <Button
            onClick={() => setModalNovoAberto(true)}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Checklist
          </Button>
        </div>
      </div>

      {/* Filtros de Status + Departamento (wireframe L276-284) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-slate-800/70 rounded-xl p-1 border border-slate-700/50">
          {([
            { id: 'ativo' as FiltroStatus, label: 'Ativos', count: checklistsAtivos.length },
            { id: 'concluido' as FiltroStatus, label: 'Concluídos', count: checklistsConcluidos.length },
            { id: 'todos' as FiltroStatus, label: 'Todos', count: checklists.length },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroStatus(f.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                filtroStatus === f.id
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(['todos_dept', 'administrativo', 'comercial', 'pedagogico'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setFiltroDepartamento(d)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                filtroDepartamento === d
                  ? 'bg-slate-700/50 text-white border-slate-600/50'
                  : 'text-slate-400 hover:text-white border-transparent hover:border-slate-600/50'
              )}
            >
              {d === 'todos_dept' ? 'Todos' : d === 'administrativo' ? 'Administrativo' : d === 'comercial' ? 'Comercial' : 'Pedagógico'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Checklists (filtrada por departamento) */}
      {(() => {
        const filtrados = filtroDepartamento === 'todos_dept'
          ? checklists
          : checklists.filter(c => c.departamento === filtroDepartamento);
        return filtrados.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
            <ClipboardList className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h4 className="text-lg font-medium text-white mb-2">Nenhum checklist encontrado</h4>
            <p className="text-slate-400 mb-4">
              {filtroStatus === 'ativo'
                ? 'Crie seu primeiro checklist ou use um template'
                : 'Nenhum checklist com esse filtro'}
            </p>
            <Button onClick={() => setModalNovoAberto(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Checklist
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(checklist => (
              <ChecklistCard
                key={checklist.id}
                checklist={checklist}
                onClick={() => setChecklistAberto(checklist.id)}
              />
            ))}
          </div>
        );
      })()}

      {/* Seção: Tarefas Rápidas */}
      <div className="pt-4 border-t border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-white">Tarefas Rápidas</h3>
          <span className="text-xs text-slate-500">
            (tarefas avulsas, sem checklist)
          </span>
        </div>
        <TarefasTab unidadeId={unidadeId} />
      </div>

      {/* Modal: Novo Checklist — COMPLETO (wireframe) */}
      <Dialog open={modalNovoAberto} onOpenChange={setModalNovoAberto}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg">Novo Checklist</DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  Crie um checklist com tarefas, subtarefas e vínculos
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Título */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Título do Checklist *</label>
              <Input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Recesso de Carnaval — Comunicação"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Descrição</label>
              <Textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva o objetivo..."
                className="bg-slate-800 border-slate-700 min-h-[60px] resize-none"
              />
            </div>

            {/* Periodicidade + Departamento + Prioridade */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Periodicidade</label>
                <Select value={periodicidade} onValueChange={(v: typeof periodicidade) => setPeriodicidade(v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="pontual">Pontual</SelectItem>
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Departamento</label>
                <Select value={departamento} onValueChange={(v: typeof departamento) => setDepartamento(v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="administrativo">Administrativo</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="pedagogico">Pedagógico</SelectItem>
                    <SelectItem value="geral">Geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Prioridade</label>
                <Select value={prioridade} onValueChange={(v: typeof prioridade) => setPrioridade(v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="baixa">Normal</SelectItem>
                    <SelectItem value="media">Alta</SelectItem>
                    <SelectItem value="alta">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Data Início + Data Prazo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Data Início</label>
                <DatePicker date={dataInicio} onDateChange={setDataInicio} placeholder="Selecione..." />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Data Prazo</label>
                <DatePicker date={dataPrazo} onDateChange={setDataPrazo} placeholder="Selecione..." />
              </div>
            </div>

            {/* Vincular Alunos */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Vincular Alunos</label>
              <div className="grid grid-cols-2 gap-3">
                <Select value={tipoVinculo} onValueChange={(v: typeof tipoVinculo) => setTipoVinculo(v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="nenhum">Sem vínculo</SelectItem>
                    <SelectItem value="todos_alunos">Todos os Alunos</SelectItem>
                    <SelectItem value="por_curso">Por Curso</SelectItem>
                    <SelectItem value="por_professor">Por Professor</SelectItem>
                    <SelectItem value="manual">Seleção Manual</SelectItem>
                  </SelectContent>
                </Select>
                {tipoVinculo !== 'nenhum' && (
                  <Select>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {tipoVinculo === 'todos_alunos' && <SelectItem value="todos">Todos os alunos da unidade</SelectItem>}
                      {tipoVinculo === 'por_curso' && (
                        <>
                          <SelectItem value="guitarra">Guitarra</SelectItem>
                          <SelectItem value="piano">Piano</SelectItem>
                          <SelectItem value="bateria">Bateria</SelectItem>
                          <SelectItem value="canto">Canto</SelectItem>
                          <SelectItem value="violao">Violão</SelectItem>
                        </>
                      )}
                      {tipoVinculo === 'por_professor' && <SelectItem value="todos_prof">Todos os Professores</SelectItem>}
                      {tipoVinculo === 'manual' && <SelectItem value="selecionar">Selecionar alunos...</SelectItem>}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {/* Divisão de Carteira (quando há vínculo) */}
              {tipoVinculo !== 'nenhum' && (
                <div className="mt-3 p-3 bg-slate-800/30 border border-slate-700/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400">Divisão de Carteira</span>
                    <button className="text-[10px] text-violet-400 hover:text-violet-300">
                      Sugestão automática (A-M / N-Z)
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 w-20">{colaborador?.apelido || 'Farmer 1'}:</span>
                      <div className="flex-1 bg-slate-700/50 rounded-full h-2">
                        <div className="bg-violet-500 h-2 rounded-full" style={{ width: '50%' }} />
                      </div>
                      <span className="text-xs text-slate-400">50%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ========== TASK BUILDER ========== */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Tarefas</label>
              <div className="space-y-2">
                {tarefas.map((tarefa, idx) => (
                  <div key={tarefa.id}>
                    {/* Tarefa principal */}
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-slate-600 flex-shrink-0 cursor-grab" />
                      <Input
                        value={tarefa.descricao}
                        onChange={e => updateTarefa(tarefa.id, 'descricao', e.target.value)}
                        placeholder="Descrição da tarefa..."
                        className="flex-1 bg-slate-800 border-slate-700 text-sm"
                      />
                      <Select
                        value={tarefa.canal || 'sem_canal'}
                        onValueChange={v => updateTarefa(tarefa.id, 'canal', v === 'sem_canal' ? null : v)}
                      >
                        <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="sem_canal">Sem canal</SelectItem>
                          <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                          <SelectItem value="Email">Email</SelectItem>
                          <SelectItem value="Telefone">Telefone</SelectItem>
                          <SelectItem value="Presencial">Presencial</SelectItem>
                          <SelectItem value="Instagram">Instagram</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => addSubtarefa(tarefa.id)}
                        className="text-xs text-violet-400 hover:text-violet-300 whitespace-nowrap px-1"
                        title="Adicionar subtarefa"
                      >
                        ↳ Sub
                      </button>
                      {tarefas.length > 1 && (
                        <button
                          onClick={() => removeTarefa(tarefa.id)}
                          className="text-slate-500 hover:text-red-400 flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Subtarefas */}
                    {tarefa.subtarefas.map(sub => (
                      <div key={sub.id} className="flex items-center gap-2 ml-8 mt-1.5">
                        <ChevronRight className="w-3 h-3 text-slate-700 flex-shrink-0" />
                        <Input
                          value={sub.descricao}
                          onChange={e => updateSubtarefa(tarefa.id, sub.id, 'descricao', e.target.value)}
                          placeholder="Subtarefa..."
                          className="flex-1 bg-slate-800/50 border-slate-700/50 text-xs h-8"
                        />
                        <Select
                          value={sub.canal || 'sem_canal'}
                          onValueChange={v => updateSubtarefa(tarefa.id, sub.id, 'canal', v === 'sem_canal' ? null : v)}
                        >
                          <SelectTrigger className="w-28 bg-slate-800/50 border-slate-700/50 text-[11px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="sem_canal">Sem canal</SelectItem>
                            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="Telefone">Telefone</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => removeSubtarefa(tarefa.id, sub.id)}
                          className="text-slate-500 hover:text-red-400 flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <button
                onClick={addTarefa}
                className="mt-2 text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1.5 font-medium px-2 py-1.5 rounded-lg hover:bg-violet-500/10"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Tarefa
              </button>
            </div>

            {/* Alerta + Horário */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Alerta (dias antes)</label>
                <Select value={alertaDiasAntes} onValueChange={setAlertaDiasAntes}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="sem">Sem alerta</SelectItem>
                    <SelectItem value="1">1 dia antes</SelectItem>
                    <SelectItem value="2">2 dias antes</SelectItem>
                    <SelectItem value="7">1 semana antes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Horário do lembrete</label>
                <Select value={alertaHora} onValueChange={setAlertaHora} disabled={alertaDiasAntes === 'sem'}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="08:00">08:00</SelectItem>
                    <SelectItem value="09:00">09:00</SelectItem>
                    <SelectItem value="10:00">10:00</SelectItem>
                    <SelectItem value="14:00">14:00</SelectItem>
                    <SelectItem value="18:00">18:00</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Checkbox WhatsApp */}
            <div className="flex items-center gap-3 p-3 bg-slate-800/30 border border-slate-700/30 rounded-lg">
              <Checkbox
                id="lembrete-whatsapp"
                checked={lembreteWhatsapp}
                onCheckedChange={(checked) => setLembreteWhatsapp(checked === true)}
              />
              <label htmlFor="lembrete-whatsapp" className="text-sm text-slate-300 cursor-pointer">
                Receber lembrete no meu WhatsApp
              </label>
            </div>

            {/* Criar a partir de template */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Criar a partir de template</label>
              <Select value={templateNoModal} onValueChange={preencherFromTemplate}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue placeholder="Sem template (criar do zero)" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="nenhum">Sem template (criar do zero)</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome} ({t.itens?.length || 0} itens)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-700/50 pt-4">
            <Button variant="ghost" onClick={() => { setModalNovoAberto(false); resetFormNovo(); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleCriarManual}
              disabled={!titulo.trim() || salvando}
              className="bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/20"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Criar Checklist
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Templates */}
      <Dialog open={modalTemplatesAberto} onOpenChange={setModalTemplatesAberto}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-violet-400" />
              Criar a partir de Template
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Seleção de Template */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Escolha um template
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {templates.map(tmpl => (
                  <TemplateOption
                    key={tmpl.id}
                    template={tmpl}
                    selecionado={templateSelecionado === tmpl.id}
                    onClick={() => {
                      setTemplateSelecionado(tmpl.id);
                      setTituloTemplate(tmpl.nome);
                    }}
                  />
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">
                    Nenhum template disponível
                  </p>
                )}
              </div>
            </div>

            {/* Título personalizado */}
            {templateSelecionado && (
              <>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block">
                    Título (personalize se quiser)
                  </label>
                  <Input
                    value={tituloTemplate}
                    onChange={e => setTituloTemplate(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block">
                    Prazo (opcional)
                  </label>
                  <DatePicker
                    date={dataPrazoTemplate}
                    onDateChange={setDataPrazoTemplate}
                    placeholder="Selecione o prazo"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setModalTemplatesAberto(false); resetFormTemplate(); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleCriarFromTemplate}
              disabled={!templateSelecionado || salvando}
              className="bg-gradient-to-r from-violet-600 to-purple-600"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar do Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Sub-componente: Card de Checklist
// ============================================

interface ChecklistCardProps {
  checklist: FarmerChecklist;
  onClick: () => void;
}

function ChecklistCard({ checklist, onClick }: ChecklistCardProps) {
  const prioStyles: Record<string, string> = {
    alta: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    media: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    baixa: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  const prioLabels: Record<string, string> = {
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  };

  const progressColor =
    checklist.percentual_progresso >= 100
      ? 'bg-emerald-500'
      : checklist.percentual_progresso >= 50
        ? 'bg-gradient-to-r from-violet-500 to-emerald-500'
        : 'bg-gradient-to-r from-violet-500 to-amber-500';

  const isConcluido = checklist.status === 'concluido';

  // Calcular urgência do prazo
  const diasRestantes = checklist.data_prazo
    ? Math.ceil((new Date(checklist.data_prazo + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const prazoLabel = checklist.data_prazo
    ? new Date(checklist.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-slate-800/40 border rounded-xl p-4 hover:bg-slate-800/60 hover:border-violet-500/30 transition-all cursor-pointer group',
        isConcluido ? 'border-emerald-500/20' : 'border-slate-700/30'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
            isConcluido ? 'bg-emerald-500/20' : 'bg-violet-500/20'
          )}>
            {isConcluido ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <ClipboardList className="w-5 h-5 text-violet-400" />
            )}
          </div>
          <div>
            <h4 className={cn(
              'text-sm font-semibold group-hover:text-violet-300 transition-colors',
              isConcluido ? 'text-slate-400 line-through' : 'text-white'
            )}>
              {checklist.titulo}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {checklist.total_items} tarefas
              {checklist.total_contatos > 0 && ` · ${checklist.total_contatos} alunos`}
              {' · '}{checklist.colaborador_apelido || checklist.colaborador_nome}
              {prazoLabel && ` · Prazo: ${prazoLabel}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Badge de prioridade */}
          {!isConcluido && (
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md',
              prioStyles[checklist.prioridade]
            )}>
              {prioLabels[checklist.prioridade]}
            </span>
          )}

          {/* Badge de periodicidade (wireframe L303) */}
          {checklist.periodicidade && checklist.periodicidade !== 'pontual' && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-400">
              {checklist.periodicidade === 'diario' ? 'Diário' :
               checklist.periodicidade === 'semanal' ? 'Semanal' : 'Mensal'}
            </span>
          )}

          {/* Badge de prazo urgente */}
          {diasRestantes !== null && diasRestantes <= 1 && !isConcluido && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {diasRestantes <= 0 ? 'Vencido' : 'Amanhã'}
            </span>
          )}
        </div>
      </div>

      {/* Barra de Progresso */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', progressColor)}
            style={{ width: `${checklist.percentual_progresso}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-400 w-16 text-right">
          {checklist.items_concluidos}/{checklist.total_items}
        </span>
        <span className={cn(
          'text-xs font-bold w-10 text-right',
          checklist.percentual_progresso >= 100 ? 'text-emerald-400' :
          checklist.percentual_progresso >= 50 ? 'text-violet-400' : 'text-amber-400'
        )}>
          {checklist.percentual_progresso}%
        </span>
      </div>

      {/* Taxa de sucesso + mini-resumo canais (wireframe L310) */}
      {checklist.total_contatos > 0 && (
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>
              {checklist.contatos_responderam}/{checklist.total_contatos} responderam
              ({checklist.taxa_sucesso}%)
            </span>
          </div>
          {checklist.canais_resumo && checklist.canais_resumo.length > 0 && (
            <div className="flex items-center gap-3">
              {checklist.canais_resumo.map((ch) => (
                <div key={ch.canal} className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full', 
                    ch.canal === 'WhatsApp' ? 'bg-emerald-400' :
                    ch.canal === 'Email' ? 'bg-blue-400' :
                    ch.canal === 'Telefone' ? 'bg-amber-400' :
                    ch.canal === 'Presencial' ? 'bg-violet-400' :
                    ch.canal === 'Instagram' ? 'bg-pink-400' : 'bg-slate-400'
                  )} />
                  <span>{ch.canal} {ch.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-componente: Opção de Template
// ============================================

interface TemplateOptionProps {
  template: FarmerChecklistTemplate;
  selecionado: boolean;
  onClick: () => void;
}

function TemplateOption({ template, selecionado, onClick }: TemplateOptionProps) {
  const categoriaLabels: Record<string, string> = {
    onboarding: 'Onboarding',
    recesso: 'Recesso',
    evento: 'Evento',
    comunicacao: 'Comunicação',
    administrativo: 'Administrativo',
  };

  const categoriaColors: Record<string, string> = {
    onboarding: 'bg-emerald-500/20 text-emerald-400',
    recesso: 'bg-amber-500/20 text-amber-400',
    evento: 'bg-pink-500/20 text-pink-400',
    comunicacao: 'bg-blue-500/20 text-blue-400',
    administrativo: 'bg-violet-500/20 text-violet-400',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        selecionado
          ? 'bg-violet-500/20 border-violet-500 ring-1 ring-violet-500/50'
          : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">{template.nome}</p>
          {template.descricao && (
            <p className="text-xs text-slate-400 mt-0.5">{template.descricao}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            categoriaColors[template.categoria] || categoriaColors.administrativo
          )}>
            {categoriaLabels[template.categoria] || template.categoria}
          </span>
          <span className="text-xs text-slate-500">
            {template.itens?.length || 0} itens
          </span>
        </div>
      </div>
    </button>
  );
}

export default ChecklistsTab;

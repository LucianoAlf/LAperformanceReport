'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Plus,
  GripVertical,
  Trash2,
  Users,
  Loader2,
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
import { supabase } from '@/lib/supabase';
import type { TaskBuilderItem } from './types';

interface NovoChecklistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string;
  colaborador: { id: number; tipo: string; apelido?: string | null; nome?: string; unidade_id?: number } | null;
  onCriar: (data: CriarChecklistData) => Promise<void>;
  loading?: boolean;
}

export interface CriarChecklistData {
  titulo: string;
  descricao?: string;
  periodicidade: 'pontual' | 'diario' | 'semanal' | 'mensal';
  departamento: 'administrativo' | 'comercial' | 'pedagogico' | 'geral';
  prioridade: 'alta' | 'media' | 'baixa';
  data_inicio?: string;
  data_prazo?: string;
  responsavel_id?: number;
  tipo_vinculo: 'nenhum' | 'todos_alunos' | 'por_curso' | 'por_professor' | 'manual';
  vinculo_filtro_ids?: number[];
  alerta_dias_antes?: number;
  alerta_hora?: string;
  lembrete_whatsapp: boolean;
  tarefas: TaskBuilderItem[];
}

export function NovoChecklistModal({
  open,
  onOpenChange,
  unidadeId,
  colaborador,
  onCriar,
  loading = false,
}: NovoChecklistModalProps) {
  // Form state
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [periodicidade, setPeriodicidade] = useState<'pontual' | 'diario' | 'semanal' | 'mensal'>('pontual');
  const [departamento, setDepartamento] = useState<'administrativo' | 'comercial' | 'pedagogico' | 'geral'>('administrativo');
  const [prioridade, setPrioridade] = useState<'alta' | 'media' | 'baixa'>('media');
  const [dataInicio, setDataInicio] = useState<Date | undefined>(new Date());
  const [dataPrazo, setDataPrazo] = useState<Date | undefined>();
  const [tipoVinculo, setTipoVinculo] = useState<'nenhum' | 'todos_alunos' | 'por_curso' | 'por_professor' | 'manual'>('nenhum');
  const [vinculoFiltroIds, setVinculoFiltroIds] = useState<string[]>([]);
  const [cursosUnidadeModal, setCursosUnidadeModal] = useState<{ id: number; nome: string }[]>([]);
  const [professoresUnidadeModal, setProfessoresUnidadeModal] = useState<{ id: number; nome: string }[]>([]);
  const [alertaDiasAntes, setAlertaDiasAntes] = useState<string>('sem');
  const [alertaHora, setAlertaHora] = useState<string>('08:00');
  const [lembreteWhatsapp, setLembreteWhatsapp] = useState(false);
  const [responsavelId, setResponsavelId] = useState<string>('');
  const [colaboradoresUnidade, setColaboradoresUnidade] = useState<{ id: number; nome: string; apelido: string | null }[]>([]);

  // Task Builder state
  const [tarefas, setTarefas] = useState<TaskBuilderItem[]>([
    { id: crypto.randomUUID(), descricao: '', canal: null, subtarefas: [] },
  ]);

  // Buscar colaboradores, cursos e professores da unidade
  useEffect(() => {
    async function fetchDadosUnidade() {
      // Usar unidade do colaborador como fallback quando unidadeId for 'todos'
      const unidadeParaBuscar = unidadeId && unidadeId !== 'todos' ? unidadeId : colaborador?.unidade_id;
      console.log('[DEBUG] fetchDadosUnidade - unidadeId:', unidadeId, 'unidadeParaBuscar:', unidadeParaBuscar, 'colaborador:', colaborador);
      
      if (!unidadeParaBuscar) {
        console.log('[DEBUG] Abortando: nenhuma unidade disponível');
        return;
      }

      // Colaboradores - com lógica de permissões
      const isAdmin = colaborador?.tipo === 'admin';
      console.log('[DEBUG] isAdmin:', isAdmin, 'tipo:', colaborador?.tipo);

      let query = supabase
        .from('colaboradores')
        .select('id, nome, apelido')
        .eq('ativo', true);

      if (isAdmin) {
        query = query.order('nome');
        console.log('[DEBUG] Query admin (todos colaboradores)');
      } else {
        query = query
          .or(`unidade_id.eq.${unidadeParaBuscar},tipo.eq.admin`)
          .order('nome');
        console.log('[DEBUG] Query não-admin (unidade + admin):', `unidade_id.eq.${unidadeParaBuscar},tipo.eq.admin`);
      }

      const { data: colabs, error } = await query;
      console.log('[DEBUG] Resultado colaboradores:', colabs?.length, 'erro:', error);
      if (colabs) setColaboradoresUnidade(colabs);

      // Cursos distintos via alunos ativos
      const { data: cursosData } = await supabase
        .from('alunos')
        .select('curso_id, cursos:curso_id(id, nome)')
        .eq('unidade_id', unidadeParaBuscar)
        .eq('status', 'ativo')
        .not('curso_id', 'is', null);
      if (cursosData) {
        const mapa = new Map<number, string>();
        cursosData.forEach((a: any) => {
          if (a.cursos?.id && a.cursos?.nome) mapa.set(a.cursos.id, a.cursos.nome);
        });
        setCursosUnidadeModal(
          Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
        );
      }

      // Professores distintos via alunos ativos
      const { data: profsData } = await supabase
        .from('alunos')
        .select('professor_atual_id, professores:professor_atual_id(id, nome)')
        .eq('unidade_id', unidadeParaBuscar)
        .eq('status', 'ativo')
        .not('professor_atual_id', 'is', null);
      if (profsData) {
        const mapa = new Map<number, string>();
        profsData.forEach((a: any) => {
          if (a.professores?.id && a.professores?.nome) mapa.set(a.professores.id, a.professores.nome);
        });
        setProfessoresUnidadeModal(
          Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
        );
      }
    }
    fetchDadosUnidade();
  }, [unidadeId, colaborador]);

  // Reset form quando abre/fecha
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
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
    setResponsavelId('');
    setVinculoFiltroIds([]);
    setTarefas([{ id: crypto.randomUUID(), descricao: '', canal: null, subtarefas: [] }]);
  };

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

  const handleSubmit = async () => {
    if (!titulo.trim()) return;

    await onCriar({
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      periodicidade,
      departamento,
      prioridade,
      data_inicio: dataInicio?.toISOString().split('T')[0],
      data_prazo: dataPrazo?.toISOString().split('T')[0],
      responsavel_id: responsavelId ? parseInt(responsavelId) : undefined,
      tipo_vinculo: tipoVinculo,
      vinculo_filtro_ids: vinculoFiltroIds.length > 0 ? vinculoFiltroIds.map(id => parseInt(id)) : undefined,
      alerta_dias_antes: alertaDiasAntes !== 'sem' ? parseInt(alertaDiasAntes) : undefined,
      alerta_hora: alertaDiasAntes !== 'sem' ? alertaHora : undefined,
      lembrete_whatsapp: lembreteWhatsapp,
      tarefas: tarefas.filter(t => t.descricao.trim()),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          {/* Responsável */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Responsável</label>
            <Select value={responsavelId || 'sem'} onValueChange={v => setResponsavelId(v === 'sem' ? '' : v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Selecione o responsável..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="sem">Sem responsável definido</SelectItem>
                {colaboradoresUnidade.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.apelido || c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vincular Alunos */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Vincular Alunos</label>
            <div className="grid grid-cols-2 gap-3">
              <Select value={tipoVinculo} onValueChange={(v: typeof tipoVinculo) => { setTipoVinculo(v); setVinculoFiltroIds([]); }}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="nenhum">Sem vínculo</SelectItem>
                  <SelectItem value="todos_alunos">Todos os Alunos</SelectItem>
                  <SelectItem value="por_curso">Por Curso</SelectItem>
                  <SelectItem value="por_professor">Por Professor</SelectItem>
                  <SelectItem value="manual">Seleção Manual</SelectItem>
                </SelectContent>
              </Select>
              {tipoVinculo === 'todos_alunos' && (
                <div className="flex items-center text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  Todos os alunos ativos da unidade
                </div>
              )}
              {tipoVinculo === 'por_curso' && (
                <div className="max-h-40 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg p-2 space-y-1">
                  {cursosUnidadeModal.length === 0 ? (
                    <p className="text-xs text-slate-500 px-2 py-1">Nenhum curso encontrado</p>
                  ) : cursosUnidadeModal.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700/50 cursor-pointer">
                      <Checkbox
                        checked={vinculoFiltroIds.includes(c.id.toString())}
                        onCheckedChange={(checked) => {
                          setVinculoFiltroIds(prev =>
                            checked
                              ? [...prev, c.id.toString()]
                              : prev.filter(id => id !== c.id.toString())
                          );
                        }}
                      />
                      <span className="text-xs text-slate-300">{c.nome}</span>
                    </label>
                  ))}
                </div>
              )}
              {tipoVinculo === 'por_professor' && (
                <div className="max-h-40 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg p-2 space-y-1">
                  {professoresUnidadeModal.length === 0 ? (
                    <p className="text-xs text-slate-500 px-2 py-1">Nenhum professor encontrado</p>
                  ) : professoresUnidadeModal.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700/50 cursor-pointer">
                      <Checkbox
                        checked={vinculoFiltroIds.includes(p.id.toString())}
                        onCheckedChange={(checked) => {
                          setVinculoFiltroIds(prev =>
                            checked
                              ? [...prev, p.id.toString()]
                              : prev.filter(id => id !== p.id.toString())
                          );
                        }}
                      />
                      <span className="text-xs text-slate-300">{p.nome}</span>
                    </label>
                  ))}
                </div>
              )}
              {tipoVinculo === 'manual' && (
                <div className="flex items-center text-xs text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2">
                  Seleção manual disponível após criar o checklist
                </div>
              )}
            </div>
          </div>

          {/* Task Builder */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Tarefas</label>
            <div className="space-y-2">
              {tarefas.map((tarefa) => (
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
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Subtarefas */}
                  {tarefa.subtarefas.length > 0 && (
                    <div className="ml-8 mt-2 space-y-2">
                      {tarefa.subtarefas.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
                          <Input
                            value={sub.descricao}
                            onChange={e => updateSubtarefa(tarefa.id, sub.id, 'descricao', e.target.value)}
                            placeholder="Subtarefa..."
                            className="flex-1 bg-slate-800/50 border-slate-700 text-xs"
                          />
                          <Select
                            value={sub.canal || 'sem_canal'}
                            onValueChange={v => updateSubtarefa(tarefa.id, sub.id, 'canal', v === 'sem_canal' ? null : v)}
                          >
                            <SelectTrigger className="w-28 bg-slate-800/50 border-slate-700 text-xs">
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
                            onClick={() => removeSubtarefa(tarefa.id, sub.id)}
                            className="text-slate-500 hover:text-red-400 flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Botão Adicionar Tarefa */}
            <button
              onClick={addTarefa}
              className="mt-2 w-full py-2 border border-dashed border-slate-700 rounded-lg text-xs text-slate-400 hover:text-violet-400 hover:border-violet-500/50 transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Tarefa
            </button>
          </div>

          {/* Alertas */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Alertas</label>
            <div className="grid grid-cols-3 gap-3">
              <Select value={alertaDiasAntes} onValueChange={setAlertaDiasAntes}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                  <SelectValue placeholder="Lembrar antes..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="sem">Sem alerta</SelectItem>
                  <SelectItem value="1">1 dia antes</SelectItem>
                  <SelectItem value="2">2 dias antes</SelectItem>
                  <SelectItem value="3">3 dias antes</SelectItem>
                  <SelectItem value="7">1 semana antes</SelectItem>
                </SelectContent>
              </Select>

              {alertaDiasAntes !== 'sem' && (
                <>
                  <Input
                    type="time"
                    value={alertaHora}
                    onChange={e => setAlertaHora(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-xs"
                  />
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/50 cursor-pointer text-xs">
                    <Checkbox
                      checked={lembreteWhatsapp}
                      onCheckedChange={(checked) => setLembreteWhatsapp(checked as boolean)}
                    />
                    <span className="text-slate-300">WhatsApp</span>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-700/50 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!titulo.trim() || loading}
            className="bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/20"
          >
            {loading ? (
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
  );
}

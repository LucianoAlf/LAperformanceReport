'use client';

import React, { useState } from 'react';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
import { useColaboradorAtual, useRotinas, useFarmersUnidade } from './hooks';
import type { FarmerRotina, CreateRotinaInput } from './types';

interface RotinasTabProps {
  unidadeId: string;
  modalAberto?: boolean;
  onModalClose?: () => void;
}

const DIAS_SEMANA = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

export function RotinasTab({ unidadeId, modalAberto: modalAbertoExterno, onModalClose }: RotinasTabProps) {
  // Passar unidadeId para o hook respeitar o filtro global
  const { colaborador } = useColaboradorAtual(unidadeId);
  const { farmers } = useFarmersUnidade(unidadeId);
  const [farmerSelecionado, setFarmerSelecionado] = useState<string | null>(null);
  
  // Usar o farmer selecionado ou o colaborador atual para as rotinas
  const colaboradorIdParaRotinas = farmerSelecionado || colaborador?.id || null;
  
  const { rotinas, loading, criarRotina, atualizarRotina, excluirRotina } = useRotinas(
    colaboradorIdParaRotinas,
    unidadeId
  );

  // Estado interno do modal, pode ser controlado externamente
  const [modalAbertoInterno, setModalAbertoInterno] = useState(false);
  const modalAberto = modalAbertoExterno ?? modalAbertoInterno;
  
  const setModalAberto = (aberto: boolean) => {
    setModalAbertoInterno(aberto);
    if (!aberto && onModalClose) {
      onModalClose();
    }
  };
  const [editando, setEditando] = useState<FarmerRotina | null>(null);
  const [rotinaParaExcluir, setRotinaParaExcluir] = useState<string | null>(null);
  const [modalConfirmacaoAberto, setModalConfirmacaoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Form state
  const [descricao, setDescricao] = useState('');
  const [frequencia, setFrequencia] = useState<'diario' | 'semanal' | 'mensal'>('diario');
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [diaMes, setDiaMes] = useState<number>(1);
  const [prioridade, setPrioridade] = useState<'normal' | 'alta'>('normal');
  const [lembreteWhatsapp, setLembreteWhatsapp] = useState(false);
  const [responsavelId, setResponsavelId] = useState<string>('');

  const abrirModal = (rotina?: FarmerRotina) => {
    if (rotina) {
      setEditando(rotina);
      setDescricao(rotina.descricao);
      setFrequencia(rotina.frequencia);
      setDiasSemana(rotina.dias_semana || []);
      setDiaMes(rotina.dia_mes || 1);
      setPrioridade(rotina.prioridade);
      setLembreteWhatsapp(rotina.lembrete_whatsapp);
    } else {
      setEditando(null);
      setDescricao('');
      setFrequencia('diario');
      setDiasSemana([]);
      setDiaMes(1);
      setPrioridade('normal');
      setLembreteWhatsapp(false);
      setResponsavelId(colaborador?.id || '');
    }
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setEditando(null);
  };

  const salvar = async () => {
    if (!descricao.trim()) return;

    setSalvando(true);
    try {
      const input: CreateRotinaInput = {
        descricao: descricao.trim(),
        frequencia,
        prioridade,
        lembrete_whatsapp: lembreteWhatsapp,
      };

      if (frequencia === 'semanal') {
        input.dias_semana = diasSemana;
      } else if (frequencia === 'mensal') {
        input.dia_mes = diaMes;
      }

      if (editando) {
        await atualizarRotina(editando.id, input);
      } else {
        await criarRotina(input);
      }

      fecharModal();
    } catch (err) {
      console.error('Erro ao salvar rotina:', err);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = (id: string) => {
    setRotinaParaExcluir(id);
    setModalConfirmacaoAberto(true);
  };

  const confirmarExclusao = async () => {
    if (!rotinaParaExcluir) return;
    
    try {
      await excluirRotina(rotinaParaExcluir);
      setModalConfirmacaoAberto(false);
      setRotinaParaExcluir(null);
    } catch (err) {
      console.error('Erro ao excluir rotina:', err);
    }
  };

  const toggleDiaSemana = (dia: number) => {
    setDiasSemana(prev => 
      prev.includes(dia) 
        ? prev.filter(d => d !== dia)
        : [...prev, dia].sort()
    );
  };

  // Agrupar rotinas por frequência
  const rotinasDiarias = rotinas.filter(r => r.frequencia === 'diario');
  const rotinasSemanais = rotinas.filter(r => r.frequencia === 'semanal');
  const rotinasMensais = rotinas.filter(r => r.frequencia === 'mensal');

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/4 mb-6"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 bg-slate-700/50 rounded-lg"></div>
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
          <h3 className="text-lg font-semibold text-white">Minhas Rotinas</h3>
          <p className="text-sm text-slate-400">Gerencie suas rotinas diárias, semanais e mensais</p>
        </div>
        <Button 
          onClick={() => abrirModal()}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Rotina
        </Button>
      </div>

      {/* Filtro por Farmer */}
      {farmers.length > 1 && (
        <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <span className="text-sm text-slate-400">👤 Ver rotinas de:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setFarmerSelecionado(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                !farmerSelecionado
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              )}
            >
              Todos
            </button>
            {farmers.map(farmer => (
              <button
                key={farmer.id}
                onClick={() => setFarmerSelecionado(farmer.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  farmerSelecionado === farmer.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                )}
              >
                {farmer.apelido || farmer.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros por Frequência */}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="bg-slate-700/50">
          Todas ({rotinas.length})
        </Button>
        <Button variant="ghost" size="sm" className="text-blue-400">
          Diárias ({rotinasDiarias.length})
        </Button>
        <Button variant="ghost" size="sm" className="text-violet-400">
          Semanais ({rotinasSemanais.length})
        </Button>
        <Button variant="ghost" size="sm" className="text-amber-400">
          Mensais ({rotinasMensais.length})
        </Button>
      </div>

      {/* Lista de Rotinas */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {rotinas.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h4 className="text-lg font-medium text-white mb-2">Nenhuma rotina cadastrada</h4>
            <p className="text-slate-400 mb-4">Crie suas primeiras rotinas para organizar seu dia a dia</p>
            <Button onClick={() => abrirModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeira Rotina
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {/* Rotinas Diárias */}
            {rotinasDiarias.length > 0 && (
              <>
                <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
                  <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2">
                    ☀️ Rotinas Diárias
                    <span className="text-xs bg-blue-500/20 px-2 py-0.5 rounded-full">
                      {rotinasDiarias.length}
                    </span>
                  </h4>
                </div>
                {rotinasDiarias.map(rotina => (
                  <RotinaRow 
                    key={rotina.id} 
                    rotina={rotina} 
                    onEdit={() => abrirModal(rotina)}
                    onDelete={() => handleExcluir(rotina.id)}
                  />
                ))}
              </>
            )}

            {/* Rotinas Semanais */}
            {rotinasSemanais.length > 0 && (
              <>
                <div className="px-4 py-3 bg-violet-500/10 border-b border-violet-500/20">
                  <h4 className="text-sm font-medium text-violet-400 flex items-center gap-2">
                    📅 Rotinas Semanais
                    <span className="text-xs bg-violet-500/20 px-2 py-0.5 rounded-full">
                      {rotinasSemanais.length}
                    </span>
                  </h4>
                </div>
                {rotinasSemanais.map(rotina => (
                  <RotinaRow 
                    key={rotina.id} 
                    rotina={rotina} 
                    onEdit={() => abrirModal(rotina)}
                    onDelete={() => handleExcluir(rotina.id)}
                  />
                ))}
              </>
            )}

            {/* Rotinas Mensais */}
            {rotinasMensais.length > 0 && (
              <>
                <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
                  <h4 className="text-sm font-medium text-amber-400 flex items-center gap-2">
                    🗓️ Rotinas Mensais
                    <span className="text-xs bg-amber-500/20 px-2 py-0.5 rounded-full">
                      {rotinasMensais.length}
                    </span>
                  </h4>
                </div>
                {rotinasMensais.map(rotina => (
                  <RotinaRow 
                    key={rotina.id} 
                    rotina={rotina} 
                    onEdit={() => abrirModal(rotina)}
                    onDelete={() => handleExcluir(rotina.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal de Criar/Editar */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editando ? 'Editar Rotina' : 'Nova Rotina'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Responsável */}
            {farmers.length > 1 && (
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  👤 Responsável
                </label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {farmers.map(farmer => (
                      <SelectItem key={farmer.id} value={farmer.id}>
                        {farmer.apelido || farmer.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  Quem será responsável por esta rotina
                </p>
              </div>
            )}

            {/* Descrição */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Descrição da Rotina
              </label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Conferir agenda do dia"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Frequência */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Frequência
              </label>
              <Select value={frequencia} onValueChange={(v: any) => setFrequencia(v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="diario">☀️ Diário</SelectItem>
                  <SelectItem value="semanal">📅 Semanal</SelectItem>
                  <SelectItem value="mensal">🗓️ Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dias da Semana (se semanal) */}
            {frequencia === 'semanal' && (
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  Dias da Semana
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIAS_SEMANA.map(dia => (
                    <button
                      key={dia.value}
                      type="button"
                      onClick={() => toggleDiaSemana(dia.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                        diasSemana.includes(dia.value)
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      )}
                    >
                      {dia.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dia do Mês (se mensal) */}
            {frequencia === 'mensal' && (
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  Dia do Mês
                </label>
                <Select value={String(diaMes)} onValueChange={(v) => setDiaMes(Number(v))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(dia => (
                      <SelectItem key={dia} value={String(dia)}>
                        Dia {dia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Prioridade */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Prioridade
              </label>
              <Select value={prioridade} onValueChange={(v: any) => setPrioridade(v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">⚠️ Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lembrete WhatsApp */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-300">Lembrete WhatsApp</p>
                <p className="text-xs text-slate-500">Receber lembrete no WhatsApp</p>
              </div>
              <Switch
                checked={lembreteWhatsapp}
                onCheckedChange={setLembreteWhatsapp}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button 
              onClick={salvar} 
              disabled={!descricao.trim() || salvando}
              className="bg-gradient-to-r from-violet-600 to-purple-600"
            >
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={modalConfirmacaoAberto} onOpenChange={setModalConfirmacaoAberto}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Excluir Rotina
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir esta rotina? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setModalConfirmacaoAberto(false);
                setRotinaParaExcluir(null);
              }}
              className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarExclusao}
              className="bg-rose-500 text-white hover:bg-rose-600"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Componente: Linha de Rotina
interface RotinaRowProps {
  rotina: FarmerRotina;
  onEdit: () => void;
  onDelete: () => void;
}

function RotinaRow({ rotina, onEdit, onDelete }: RotinaRowProps) {
  const frequenciaLabels: Record<string, string> = {
    diario: 'Todo dia',
    semanal: rotina.dias_semana?.map(d => ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][d]).join(', ') || 'Semanal',
    mensal: `Dia ${rotina.dia_mes}`,
  };

  const frequenciaStyles: Record<string, string> = {
    diario: 'bg-blue-500/20 text-blue-400',
    semanal: 'bg-violet-500/20 text-violet-400',
    mensal: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <div className="px-4 py-3 flex items-center gap-4 hover:bg-slate-700/20 transition-colors group">
      <div className="flex-1">
        <p className="text-sm font-medium text-white flex items-center gap-2">
          {rotina.descricao}
          {rotina.prioridade === 'alta' && (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            frequenciaStyles[rotina.frequencia]
          )}>
            {frequenciaLabels[rotina.frequencia]}
          </span>
          {rotina.colaboradores && (
            <span className="text-xs text-slate-400">
              • {rotina.colaboradores.apelido || rotina.colaboradores.nome}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="w-4 h-4 text-slate-400" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-rose-400" />
        </Button>
      </div>
    </div>
  );
}

export default RotinasTab;

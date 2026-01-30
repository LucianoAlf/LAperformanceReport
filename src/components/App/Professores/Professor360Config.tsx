import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Tooltip } from '@/components/ui/Tooltip';
import {
  Clock,
  UserX,
  Building2,
  Calendar,
  Sparkles,
  Settings2,
  Pencil,
  Save,
  RotateCcw,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { useCriterios360, useConfig360, Criterio360 } from '@/hooks/useProfessor360';
import { toast } from 'sonner';

interface Professor360ConfigProps {
  readOnly?: boolean;
}

// Ícones para cada critério
const CRITERIO_ICONS: Record<string, React.ReactNode> = {
  atrasos: <Clock className="h-4 w-4" />,
  faltas: <UserX className="h-4 w-4" />,
  organizacao_sala: <Building2 className="h-4 w-4" />,
  uniforme: <span className="text-sm">👔</span>,
  prazos: <Calendar className="h-4 w-4" />,
  emusys: <span className="text-sm">💻</span>,
  projetos: <Sparkles className="h-4 w-4" />,
};

export function Professor360Config({ readOnly = false }: Professor360ConfigProps) {
  const { criterios, loading: loadingCriterios, updateCriterio } = useCriterios360();
  const { config, loading: loadingConfig, updateConfig } = useConfig360();

  const [pesoHealthScore, setPesoHealthScore] = useState(20);
  const [bonusMaxProjetos, setBonusMaxProjetos] = useState(10);
  const [pontosPorProjeto, setPontosPorProjeto] = useState(5);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal de edição de critério
  const [modalCriterio, setModalCriterio] = useState<Criterio360 | null>(null);
  const [editingCriterio, setEditingCriterio] = useState<Partial<Criterio360>>({});

  // Sincronizar config do banco
  useEffect(() => {
    if (!loadingConfig) {
      setPesoHealthScore(config.peso_health_score);
      setBonusMaxProjetos(config.bonus_max_projetos);
      setPontosPorProjeto(config.pontos_por_projeto);
    }
  }, [config, loadingConfig]);

  // Detectar mudanças
  useEffect(() => {
    const changed = 
      pesoHealthScore !== config.peso_health_score ||
      bonusMaxProjetos !== config.bonus_max_projetos ||
      pontosPorProjeto !== config.pontos_por_projeto;
    setHasChanges(changed);
  }, [pesoHealthScore, bonusMaxProjetos, pontosPorProjeto, config]);

  // Salvar configurações
  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await updateConfig('peso_health_score', pesoHealthScore.toString());
      await updateConfig('bonus_max_projetos', bonusMaxProjetos.toString());
      await updateConfig('pontos_por_projeto', pontosPorProjeto.toString());
      toast.success('Configurações salvas com sucesso!');
      setHasChanges(false);
    } catch (error) {
      toast.error('Erro ao salvar configurações');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Restaurar padrões
  const handleRestore = () => {
    setPesoHealthScore(20);
    setBonusMaxProjetos(10);
    setPontosPorProjeto(5);
  };

  // Abrir modal de edição
  const handleEditCriterio = (criterio: Criterio360) => {
    setEditingCriterio({ ...criterio });
    setModalCriterio(criterio);
  };

  // Salvar critério
  const handleSaveCriterio = async () => {
    if (!modalCriterio || !editingCriterio) return;

    setSaving(true);
    try {
      await updateCriterio(modalCriterio.id, {
        nome: editingCriterio.nome,
        descricao: editingCriterio.descricao,
        peso: editingCriterio.peso,
        pontos_perda: editingCriterio.pontos_perda,
        tolerancia: editingCriterio.tolerancia,
        regra_detalhada: editingCriterio.regra_detalhada,
      });
      toast.success('Critério atualizado com sucesso!');
      setModalCriterio(null);
    } catch (error) {
      toast.error('Erro ao atualizar critério');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Soma dos pesos (excluindo bônus)
  const somaPesos = criterios
    .filter(c => c.tipo === 'penalidade')
    .reduce((sum, c) => sum + c.peso, 0);

  if (loadingCriterios || loadingConfig) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Peso no Health Score */}
      <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">🎯</span>
          <div>
            <h3 className="font-semibold text-white">Peso no Health Score</h3>
            <p className="text-sm text-slate-400">Define quanto a avaliação 360° impacta no Health Score final</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-slate-300">Professor 360°</Label>
            <span className="text-lg font-bold text-cyan-400">{pesoHealthScore}%</span>
          </div>
          
          <input
            type="range"
            value={pesoHealthScore}
            onChange={(e) => setPesoHealthScore(parseInt(e.target.value))}
            min={0}
            max={50}
            step={5}
            disabled={readOnly}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          
          <div className="flex justify-between text-xs text-slate-500">
            <span>0%</span>
            <span>50%</span>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-3 text-sm flex items-center gap-2 text-slate-400">
            <Info className="h-4 w-4" />
            <span>
              Health Score = Métricas Automáticas ({100 - pesoHealthScore}%) + 360° ({pesoHealthScore}%)
            </span>
          </div>
        </div>
      </div>

      {/* Critérios de Avaliação */}
      <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <div>
              <h3 className="font-semibold text-white">Critérios de Avaliação</h3>
              <p className="text-sm text-slate-400">Configure os critérios e seus pesos</p>
            </div>
          </div>
          {somaPesos !== 100 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-rose-500/20 text-rose-400 rounded text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              Soma dos pesos: {somaPesos}%
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Critério</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Peso</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tolerância</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pts/Ocorr.</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {criterios.map((criterio) => (
                <tr key={criterio.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        criterio.tipo === 'bonus' ? 'bg-purple-500/20' : 'bg-slate-700'
                      }`}>
                        {CRITERIO_ICONS[criterio.codigo] || <Settings2 className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{criterio.nome}</span>
                          {criterio.tipo === 'bonus' && (
                            <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded">BÔNUS</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-[250px]">
                          {criterio.descricao}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-center px-4 py-4">
                    {criterio.tipo === 'penalidade' ? (
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-sm font-medium">
                        {criterio.peso}%
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-4 text-slate-300">
                    {criterio.tipo === 'penalidade' ? criterio.tolerancia : '-'}
                  </td>
                  <td className="text-center px-4 py-4">
                    {criterio.tipo === 'penalidade' ? (
                      <span className="text-rose-400 font-medium">-{criterio.pontos_perda}</span>
                    ) : (
                      <span className="text-emerald-400 font-medium">+{pontosPorProjeto}</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-4">
                    {!readOnly && (
                      <Tooltip content="Editar critério">
                        <button
                          onClick={() => handleEditCriterio(criterio)}
                          className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configurações de Bônus */}
      <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">⚙️</span>
          <div>
            <h3 className="font-semibold text-white">Configurações de Bônus</h3>
            <p className="text-sm text-slate-400">Configure os pontos extras por projetos pedagógicos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Máximo de pontos bônus</Label>
            <Input
              type="number"
              value={bonusMaxProjetos}
              onChange={(e) => setBonusMaxProjetos(parseInt(e.target.value) || 0)}
              min={0}
              max={50}
              disabled={readOnly}
            />
            <p className="text-xs text-slate-500">
              Limite máximo de pontos extras
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Pontos por projeto</Label>
            <Input
              type="number"
              value={pontosPorProjeto}
              onChange={(e) => setPontosPorProjeto(parseInt(e.target.value) || 0)}
              min={0}
              max={20}
              disabled={readOnly}
            />
            <p className="text-xs text-slate-500">
              Pontos ganhos por cada projeto
            </p>
          </div>
        </div>
      </div>

      {/* Botões de ação */}
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleRestore}
            disabled={saving}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrões
          </Button>
          <Button
            onClick={handleSaveConfig}
            disabled={!hasChanges || saving}
            className="gap-2 bg-violet-600 hover:bg-violet-700"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      )}

      {/* Modal de Edição de Critério */}
      <Dialog open={!!modalCriterio} onOpenChange={(open) => !open && setModalCriterio(null)}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Pencil className="h-5 w-5" />
              Editar Critério
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Nome</Label>
              <Input
                value={editingCriterio.nome || ''}
                onChange={(e) => setEditingCriterio({ ...editingCriterio, nome: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Descrição</Label>
              <Input
                value={editingCriterio.descricao || ''}
                onChange={(e) => setEditingCriterio({ ...editingCriterio, descricao: e.target.value })}
              />
            </div>

            {editingCriterio.tipo === 'penalidade' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Peso (%)</Label>
                    <Input
                      type="number"
                      value={editingCriterio.peso || 0}
                      onChange={(e) => setEditingCriterio({ ...editingCriterio, peso: parseInt(e.target.value) || 0 })}
                      min={0}
                      max={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Tolerância</Label>
                    <Input
                      type="number"
                      value={editingCriterio.tolerancia || 0}
                      onChange={(e) => setEditingCriterio({ ...editingCriterio, tolerancia: parseInt(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Pontos perdidos por ocorrência</Label>
                  <Input
                    type="number"
                    value={editingCriterio.pontos_perda || 0}
                    onChange={(e) => setEditingCriterio({ ...editingCriterio, pontos_perda: parseInt(e.target.value) || 0 })}
                    min={0}
                    max={100}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label className="text-slate-300">Regra Detalhada</Label>
              <textarea
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={editingCriterio.regra_detalhada || ''}
                onChange={(e) => setEditingCriterio({ ...editingCriterio, regra_detalhada: e.target.value })}
                placeholder="Descreva a regra em detalhes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCriterio(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCriterio} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Professor360Config;

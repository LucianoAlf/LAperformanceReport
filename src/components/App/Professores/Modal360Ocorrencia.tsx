import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, Clock, UserX, Building2, Calendar, Sparkles } from 'lucide-react';
import { Criterio360 } from '@/hooks/useProfessor360';
import { format } from 'date-fns';

interface Modal360OcorrenciaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professores: any[];
  criterios: Criterio360[];
  professorSelecionado?: any;
  competencia: string;
  onSave: (data: any) => Promise<void>;
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

export function Modal360Ocorrencia({
  open,
  onOpenChange,
  professores,
  criterios,
  professorSelecionado,
  competencia,
  onSave,
}: Modal360OcorrenciaProps) {
  const [professorId, setProfessorId] = useState<string>('');
  const [unidadeId, setUnidadeId] = useState<string>('');
  const [criterioId, setCriterioId] = useState<string>('');
  const [dataOcorrencia, setDataOcorrencia] = useState<Date>(new Date());
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  // Resetar form quando abrir
  useEffect(() => {
    if (open) {
      if (professorSelecionado) {
        setProfessorId(professorSelecionado.id?.toString() || '');
        if (professorSelecionado.unidades?.length === 1) {
          setUnidadeId(professorSelecionado.unidades[0].id);
        }
      } else {
        setProfessorId('');
        setUnidadeId('');
      }
      setCriterioId('');
      setDataOcorrencia(new Date());
      setDescricao('');
    }
  }, [open, professorSelecionado]);

  // Unidades do professor selecionado
  const professorAtual = professores.find(p => p.id?.toString() === professorId);
  const unidadesProfessor = professorAtual?.unidades || [];

  // Critério selecionado
  const criterioAtual = criterios.find(c => c.id === criterioId);

  const handleSubmit = async () => {
    if (!professorId || !unidadeId || !criterioId) return;

    setSaving(true);
    try {
      await onSave({
        professor_id: parseInt(professorId),
        unidade_id: unidadeId,
        criterio_id: criterioId,
        data_ocorrencia: format(dataOcorrencia, 'yyyy-MM-dd'),
        descricao: descricao.trim() || null,
        competencia,
      });
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Plus className="h-5 w-5 text-violet-400" />
            Registrar Ocorrência
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Professor */}
          <div className="space-y-2">
            <Label className="text-slate-300">Professor</Label>
            <Select value={professorId} onValueChange={(val) => {
              setProfessorId(val);
              setUnidadeId('');
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o professor" />
              </SelectTrigger>
              <SelectContent>
                {professores.filter(p => p.ativo).map(prof => (
                  <SelectItem key={prof.id} value={prof.id.toString()}>
                    {prof.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unidade */}
          {professorId && (
            <div className="space-y-2">
              <Label className="text-slate-300">Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidadesProfessor.map((u: any) => (
                    <SelectItem key={u.id || u.unidade_id} value={u.id || u.unidade_id}>
                      {u.nome || u.unidade_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Critério */}
          <div className="space-y-2">
            <Label className="text-slate-300">Tipo de Ocorrência</Label>
            <Select value={criterioId} onValueChange={setCriterioId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {criterios.map(crit => (
                  <SelectItem key={crit.id} value={crit.id.toString()}>
                    {crit.nome} {crit.tipo === 'bonus' && '🎯'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {criterioAtual && (
              <p className="text-xs text-slate-500">{criterioAtual.descricao}</p>
            )}
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label className="text-slate-300">Data da Ocorrência</Label>
            <DatePicker
              date={dataOcorrencia}
              onDateChange={(date) => date && setDataOcorrencia(date)}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label className="text-slate-300">Descrição (opcional)</Label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes sobre a ocorrência..."
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!professorId || !unidadeId || !criterioId || saving}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {saving ? 'Salvando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Modal360Ocorrencia;

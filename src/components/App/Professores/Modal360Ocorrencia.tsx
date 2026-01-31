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
import { Plus, Clock, UserX, Building2, Calendar, Sparkles, Shirt, Monitor, UserCircle, MessageSquare } from 'lucide-react';
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
  uniforme: <Shirt className="h-4 w-4" />,
  prazos: <Calendar className="h-4 w-4" />,
  emusys: <Monitor className="h-4 w-4" />,
  projetos: <Sparkles className="h-4 w-4" />,
};

// Lista de colaboradores que podem registrar ocorrências
const COLABORADORES = [
  { id: 'luciano', nome: 'Luciano Alf', cargo: 'Gerente' },
  { id: 'gabriela', nome: 'Gabriela', cargo: 'Farmer - CG' },
  { id: 'jhonatan', nome: 'Jhonatan', cargo: 'Farmer - CG' },
  { id: 'fernanda', nome: 'Fernanda', cargo: 'Farmer - REC' },
  { id: 'daiana', nome: 'Daiana', cargo: 'Farmer - REC' },
  { id: 'eduarda', nome: 'Eduarda', cargo: 'Farmer - BARRA' },
  { id: 'arthur', nome: 'Arthur', cargo: 'Farmer - BARRA' },
  { id: 'vitoria', nome: 'Vitória', cargo: 'Hunter - CG' },
  { id: 'clayton', nome: 'Clayton', cargo: 'Hunter - REC' },
  { id: 'kailane', nome: 'Kailane', cargo: 'Hunter - BARRA' },
];

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
  const [registradoPor, setRegistradoPor] = useState<string>('');
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
      setRegistradoPor('');
    }
  }, [open, professorSelecionado]);

  // Verificar se formulário está válido (todos campos obrigatórios preenchidos)
  const formValido = professorId && unidadeId && criterioId && registradoPor;

  // Unidades do professor selecionado
  const professorAtual = professores.find(p => p.id?.toString() === professorId);
  const unidadesProfessor = professorAtual?.unidades || [];

  // Critério selecionado
  const criterioAtual = criterios.find(c => c.id === criterioId);

  // Colaborador selecionado
  const colaboradorAtual = COLABORADORES.find(c => c.id === registradoPor);

  const handleSubmit = async () => {
    if (!formValido) return;

    setSaving(true);
    try {
      await onSave({
        professor_id: parseInt(professorId),
        unidade_id: unidadeId,
        criterio_id: criterioId,
        data_ocorrencia: format(dataOcorrencia, 'yyyy-MM-dd'),
        descricao: descricao.trim() || null,
        registrado_por: registradoPor,
        registrado_por_nome: colaboradorAtual?.nome || '',
        competencia,
        // TODO: Integração WhatsApp - enviar notificação ao professor
        // whatsapp_enviado: false,
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

          {/* Registrado por - OBRIGATÓRIO */}
          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Registrado por <span className="text-rose-400">*</span>
            </Label>
            <Select value={registradoPor} onValueChange={setRegistradoPor}>
              <SelectTrigger className={!registradoPor ? 'border-rose-500/50' : ''}>
                <SelectValue placeholder="Quem está registrando?" />
              </SelectTrigger>
              <SelectContent>
                {COLABORADORES.map(colab => (
                  <SelectItem key={colab.id} value={colab.id}>
                    {colab.nome} <span className="text-slate-500">({colab.cargo})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!registradoPor && (
              <p className="text-xs text-rose-400">Campo obrigatório</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Descrição
            </Label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes sobre a ocorrência (será enviado ao professor via WhatsApp)..."
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Aviso WhatsApp */}
          {formValido && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-xs text-emerald-400 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                O professor será notificado via WhatsApp após o registro
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!formValido || saving}
            className={`${formValido ? 'bg-violet-600 hover:bg-violet-700' : 'bg-slate-700 cursor-not-allowed'}`}
          >
            {saving ? 'Salvando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Modal360Ocorrencia;

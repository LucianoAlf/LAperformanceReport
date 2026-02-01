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
import { Plus, Clock, UserX, Building2, Calendar, Sparkles, Shirt, Monitor, UserCircle, MessageSquare, AlertTriangle, AlertCircle, CheckCircle, X, Smartphone } from 'lucide-react';
import { Criterio360 } from '@/hooks/useProfessor360';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

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
  videos_renovacao: <Smartphone className="h-4 w-4" />,
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
  const [minutosAtraso, setMinutosAtraso] = useState<string>('');
  const [saving, setSaving] = useState(false);
  
  // Estado para tolerância
  const [toleranciaInfo, setToleranciaInfo] = useState<{
    totalOcorrencias: number;
    tolerancia: number;
    dentroTolerancia: boolean;
    ocorrenciasRestantes: number;
  } | null>(null);
  const [loadingTolerancia, setLoadingTolerancia] = useState(false);

  // Buscar info de tolerância quando professor, unidade e critério são selecionados
  useEffect(() => {
    const fetchTolerancia = async () => {
      if (!professorId || !unidadeId || !criterioId) {
        setToleranciaInfo(null);
        return;
      }
      
      const criterio = criterios.find(c => c.id.toString() === criterioId);
      if (!criterio || (criterio.tolerancia || 0) === 0) {
        setToleranciaInfo(null);
        return;
      }
      
      setLoadingTolerancia(true);
      try {
        // Contar ocorrências do mês para este professor/unidade/critério
        const { data, error } = await supabase
          .from('professor_360_ocorrencias')
          .select('id')
          .eq('professor_id', parseInt(professorId))
          .eq('unidade_id', unidadeId)
          .eq('criterio_id', parseInt(criterioId))
          .eq('competencia', competencia);
        
        if (error) throw error;
        
        const totalOcorrencias = data?.length || 0;
        const tolerancia = criterio.tolerancia || 0;
        
        setToleranciaInfo({
          totalOcorrencias,
          tolerancia,
          dentroTolerancia: totalOcorrencias < tolerancia,
          ocorrenciasRestantes: Math.max(0, tolerancia - totalOcorrencias),
        });
      } catch (err) {
        console.error('Erro ao buscar tolerância:', err);
        setToleranciaInfo(null);
      } finally {
        setLoadingTolerancia(false);
      }
    };
    
    fetchTolerancia();
  }, [professorId, unidadeId, criterioId, competencia, criterios]);

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
      setMinutosAtraso('');
    }
  }, [open, professorSelecionado]);

  // Unidades do professor selecionado
  const professorAtual = professores.find(p => p.id?.toString() === professorId);
  const unidadesProfessor = professorAtual?.unidades || [];

  // Critério selecionado
  const criterioAtual = criterios.find(c => c.id.toString() === criterioId);
  
  // Verificar se é critério de pontualidade
  const isPontualidade = criterioAtual?.codigo === 'atrasos';
  
  // Verificar se formulário está válido (todos campos obrigatórios preenchidos)
  // Para pontualidade, minutos de atraso é obrigatório
  const formValido = professorId && unidadeId && criterioId && registradoPor && 
    (!isPontualidade || (isPontualidade && minutosAtraso));

  // Colaborador selecionado
  const colaboradorAtual = COLABORADORES.find(c => c.id === registradoPor);

  const handleSubmit = async () => {
    if (!formValido) return;

    setSaving(true);
    try {
      // Para pontualidade: atraso > 10 min = perde ponto direto (sem tolerância)
      const minutosInt = isPontualidade ? parseInt(minutosAtraso) : null;
      const atrasoGrave = isPontualidade && minutosInt && minutosInt > 10;
      
      // Calcular info de tolerância considerando regra de atraso grave
      let toleranciaInfoFinal = toleranciaInfo ? {
        ocorrencia_numero: toleranciaInfo.totalOcorrencias + 1,
        tolerancia_total: toleranciaInfo.tolerancia,
        tolerancia_esgotada: toleranciaInfo.ocorrenciasRestantes === 0,
        ultima_tolerancia: toleranciaInfo.ocorrenciasRestantes === 1,
        pontos_descontados: toleranciaInfo.ocorrenciasRestantes === 0 ? (criterioAtual?.pontos_perda || 0) : 0,
      } : null;
      
      // Se atraso > 10 min, sempre perde ponto (ignora tolerância)
      if (atrasoGrave) {
        toleranciaInfoFinal = {
          ocorrencia_numero: (toleranciaInfo?.totalOcorrencias || 0) + 1,
          tolerancia_total: toleranciaInfo?.tolerancia || 0,
          tolerancia_esgotada: true, // Força como esgotada
          ultima_tolerancia: false,
          pontos_descontados: criterioAtual?.pontos_perda || 0,
        };
      }
      
      await onSave({
        professor_id: parseInt(professorId),
        unidade_id: unidadeId,
        criterio_id: parseInt(criterioId),
        data_ocorrencia: format(dataOcorrencia, 'yyyy-MM-dd'),
        descricao: descricao.trim() || null,
        registrado_por: registradoPor,
        competencia,
        minutos_atraso: minutosInt,
        atraso_grave: atrasoGrave,
        // Informações de tolerância para a mensagem WhatsApp
        tolerancia_info: toleranciaInfoFinal,
      });
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-violet-400" />
            Registrar Ocorrência
          </h3>
          <button onClick={() => onOpenChange(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content com scroll */}
        <div 
          className="p-6 overflow-y-auto flex-1 space-y-4"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#475569 transparent',
          }}
        >
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

          {/* Campo Tempo do Atraso - apenas para Pontualidade */}
          {isPontualidade && (
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo do Atraso <span className="text-rose-400">*</span>
              </Label>
              <Select value={minutosAtraso} onValueChange={setMinutosAtraso}>
                <SelectTrigger className={!minutosAtraso ? 'border-rose-500/50' : ''}>
                  <SelectValue placeholder="Selecione o tempo de atraso" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {/* De 1 em 1 até 20 minutos */}
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(min => (
                    <SelectItem key={min} value={min.toString()}>
                      {min} {min === 1 ? 'minuto' : 'minutos'}
                    </SelectItem>
                  ))}
                  {/* De 5 em 5 a partir de 25 minutos */}
                  <SelectItem value="25">25 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="35">35 minutos</SelectItem>
                  <SelectItem value="40">40 minutos</SelectItem>
                  <SelectItem value="45">45 minutos</SelectItem>
                  <SelectItem value="50">50 minutos</SelectItem>
                  <SelectItem value="55">55 minutos</SelectItem>
                  <SelectItem value="60">1 hora ou mais</SelectItem>
                </SelectContent>
              </Select>
              {minutosAtraso && parseInt(minutosAtraso) > 10 && (
                <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                  <p className="text-xs text-rose-400">
                    ⚠️ Atraso acima de 10 minutos: desconto automático de pontos (sem tolerância)
                  </p>
                </div>
              )}
              {minutosAtraso && parseInt(minutosAtraso) <= 10 && (
                <p className="text-xs text-slate-500">
                  Atraso até 10 minutos: usa a tolerância configurada
                </p>
              )}
            </div>
          )}

          {/* Status de Tolerância */}
          {toleranciaInfo && (
            <div className={`p-3 rounded-lg border ${
              toleranciaInfo.ocorrenciasRestantes === 0
                ? 'bg-rose-500/10 border-rose-500/30'
                : toleranciaInfo.ocorrenciasRestantes === 1
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-blue-500/10 border-blue-500/30'
            }`}>
              <div className="flex items-start gap-2">
                {toleranciaInfo.ocorrenciasRestantes === 0 ? (
                  <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5" />
                ) : toleranciaInfo.ocorrenciasRestantes === 1 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-blue-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    toleranciaInfo.ocorrenciasRestantes === 0
                      ? 'text-rose-400'
                      : toleranciaInfo.ocorrenciasRestantes === 1
                        ? 'text-amber-400'
                        : 'text-blue-400'
                  }`}>
                    {toleranciaInfo.ocorrenciasRestantes === 0 
                      ? '🔴 Tolerância esgotada!' 
                      : toleranciaInfo.ocorrenciasRestantes === 1
                        ? '⚠️ Última tolerância!'
                        : `ℹ️ Tolerância: ${toleranciaInfo.totalOcorrencias}/${toleranciaInfo.tolerancia}`
                    }
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {toleranciaInfo.ocorrenciasRestantes === 0 
                      ? `Este registro irá descontar ${criterioAtual?.pontos_perda || 0} pontos do professor.`
                      : toleranciaInfo.ocorrenciasRestantes === 1
                        ? `Esta é a última tolerância. A próxima ocorrência descontará ${criterioAtual?.pontos_perda || 0} pontos.`
                        : `O professor ainda tem ${toleranciaInfo.ocorrenciasRestantes} tolerância(s) restante(s) este mês.`
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
          {loadingTolerancia && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400 animate-pulse">Verificando tolerância...</p>
            </div>
          )}

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
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
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

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-700 flex-shrink-0">
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
        </div>
      </div>
    </div>
  );
}

export default Modal360Ocorrencia;

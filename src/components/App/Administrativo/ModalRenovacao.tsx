import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { AutocompleteAluno, type Aluno } from '@/components/ui/AutocompleteAluno';
import type { MovimentacaoAdmin } from './AdministrativoPage';

export type ModoRenovacao = 'confirmada' | 'pendente_validacao' | 'antecipada_pendente';

interface ModalRenovacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  onMarcarNaoRenovou?: (item: MovimentacaoAdmin) => void;
  editingItem: MovimentacaoAdmin | null;
  formasPagamento: { id: number; nome: string; sigla: string }[];
  cursos: { id: number; nome: string }[];
  competencia: string;
  unidadeId?: string | null;
  modo?: ModoRenovacao;
}

const modoConfig = {
  confirmada: {
    titulo: 'Registrar Renovação',
    descricao: 'Renovação operacional já confirmada pela equipe.',
    botao: 'Registrar Renovação',
    Icon: CheckCircle2,
    iconClass: 'from-emerald-500 to-teal-500',
    buttonClass: 'from-emerald-500 to-teal-500',
    aviso: '',
  },
  pendente_validacao: {
    titulo: 'Registrar Renovação Pendente',
    descricao: 'Renovação que precisa de validação da DM antes de contar como realizada.',
    botao: 'Registrar Pendente',
    Icon: AlertTriangle,
    iconClass: 'from-amber-500 to-yellow-500',
    buttonClass: 'from-amber-500 to-yellow-500',
    aviso: 'Renovação pendente não entra como realizada até ser validada.',
  },
  antecipada_pendente: {
    titulo: 'Registrar Renovação Antecipada',
    descricao: 'Capturada agora, mas válida na competência da primeira aula do novo ciclo.',
    botao: 'Registrar Antecipada',
    Icon: Clock3,
    iconClass: 'from-cyan-500 to-blue-500',
    buttonClass: 'from-cyan-500 to-blue-500',
    aviso: 'Renovação antecipada não contamina o mês de captura.',
  },
} satisfies Record<ModoRenovacao, {
  titulo: string;
  descricao: string;
  botao: string;
  Icon: typeof CheckCircle2;
  iconClass: string;
  buttonClass: string;
  aviso: string;
}>;

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inicioMesISO(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`;
}

function modoFromItem(item: MovimentacaoAdmin | null, fallback: ModoRenovacao): ModoRenovacao {
  if (!item) return fallback;
  if (item.renovacao_status === 'antecipada_pendente' || item.renovacao_status === 'antecipada_confirmada' || item.renovacao_antecipada) {
    return 'antecipada_pendente';
  }
  if (item.renovacao_status === 'pendente_validacao') {
    return 'pendente_validacao';
  }
  return 'confirmada';
}

function statusNovoPorModo(modo: ModoRenovacao): MovimentacaoAdmin['renovacao_status'] {
  if (modo === 'antecipada_pendente') return 'antecipada_pendente';
  if (modo === 'pendente_validacao') return 'pendente_validacao';
  return 'confirmada';
}

export function ModalRenovacao({
  open,
  onOpenChange,
  onSave,
  onMarcarNaoRenovou,
  editingItem,
  formasPagamento,
  cursos,
  competencia,
  unidadeId,
  modo = 'confirmada',
}: ModalRenovacaoProps) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [formData, setFormData] = useState({
    data: new Date(),
    renovacao_primeira_aula_novo_ciclo: null as Date | null,
    aluno_nome: '',
    aluno_id: null as number | null,
    curso_id: '',
    valor_parcela_anterior: '',
    valor_parcela_novo: '',
    forma_pagamento_id: '',
    agente_comercial: '',
  });

  const modoEfetivo = modoFromItem(editingItem, modo);
  const config = modoConfig[modoEfetivo];
  const Icon = config.Icon;
  const isAntecipada = modoEfetivo === 'antecipada_pendente';

  useEffect(() => {
    if (!open) return;

    if (editingItem) {
      setFormData({
        data: new Date(`${editingItem.data}T00:00:00`),
        renovacao_primeira_aula_novo_ciclo: editingItem.renovacao_primeira_aula_novo_ciclo
          ? new Date(`${editingItem.renovacao_primeira_aula_novo_ciclo}T00:00:00`)
          : null,
        aluno_nome: editingItem.aluno_nome,
        aluno_id: (editingItem as any).aluno_id || null,
        curso_id: editingItem.curso_id?.toString() || '',
        valor_parcela_anterior: (editingItem.valor_parcela_anterior ?? editingItem.alunos?.valor_parcela ?? '').toString(),
        valor_parcela_novo: editingItem.valor_parcela_novo?.toString() || '',
        forma_pagamento_id: editingItem.forma_pagamento_id?.toString() || '',
        agente_comercial: editingItem.agente_comercial || '',
      });
    } else {
      const [ano, mes] = competencia.split('-');
      setFormData({
        data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
        renovacao_primeira_aula_novo_ciclo: null,
        aluno_nome: '',
        aluno_id: null,
        curso_id: '',
        valor_parcela_anterior: '',
        valor_parcela_novo: '',
        forma_pagamento_id: '',
        agente_comercial: '',
      });
    }

    setErro('');
  }, [open, editingItem, competencia, modo]);

  const anterior = parseFloat(formData.valor_parcela_anterior) || 0;
  const novo = parseFloat(formData.valor_parcela_novo) || 0;
  const reajuste = anterior > 0 ? ((novo - anterior) / anterior) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim()) return;

    const dataISO = toDateOnly(formData.data);
    const primeiraAulaISO = formData.renovacao_primeira_aula_novo_ciclo
      ? toDateOnly(formData.renovacao_primeira_aula_novo_ciclo)
      : null;
    const competenciaReferencia = isAntecipada && primeiraAulaISO
      ? inicioMesISO(primeiraAulaISO)
      : inicioMesISO(dataISO);

    if (isAntecipada && !primeiraAulaISO) {
      setErro('Informe a primeira aula do novo ciclo para registrar uma renovação antecipada.');
      return;
    }

    if (isAntecipada && competenciaReferencia <= inicioMesISO(dataISO)) {
      setErro('A primeira aula do novo ciclo precisa estar em uma competência futura.');
      return;
    }

    setLoading(true);
    setErro('');

    const success = await onSave({
      tipo: 'renovacao',
      data: dataISO,
      competencia_referencia: competenciaReferencia,
      renovacao_primeira_aula_novo_ciclo: primeiraAulaISO,
      renovacao_antecipada: isAntecipada,
      renovacao_status: editingItem?.renovacao_status ?? statusNovoPorModo(modoEfetivo),
      aluno_nome: formData.aluno_nome.trim(),
      aluno_id: formData.aluno_id,
      curso_id: formData.curso_id ? parseInt(formData.curso_id) : null,
      valor_parcela_anterior: parseFloat(formData.valor_parcela_anterior) || null,
      valor_parcela_novo: parseFloat(formData.valor_parcela_novo) || null,
      forma_pagamento_id: formData.forma_pagamento_id ? parseInt(formData.forma_pagamento_id) : null,
      agente_comercial: formData.agente_comercial.trim() || null,
    });

    setLoading(false);

    if (success) {
      onOpenChange(false);
      return;
    }

    setErro('Não foi possível salvar esta renovação. Verifique se já existe registro para a mesma competência.');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-white text-xl">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.iconClass} flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <span>{editingItem ? 'Editar Renovação' : config.titulo}</span>
              <p className="mt-1 text-sm font-normal text-slate-400">{config.descricao}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {config.aviso && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {config.aviso}
            </div>
          )}

          <div>
            <Label className="text-slate-300">Data da Renovação</Label>
            <DatePicker
              date={formData.data}
              onDateChange={(date) => date && setFormData({ ...formData, data: date })}
            />
          </div>

          {isAntecipada && (
            <div>
              <Label className="text-slate-300">Primeira aula do novo ciclo *</Label>
              <DatePicker
                date={formData.renovacao_primeira_aula_novo_ciclo || undefined}
                onDateChange={(date) => date && setFormData({ ...formData, renovacao_primeira_aula_novo_ciclo: date })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Essa data define a competência em que a renovação vai contar.
              </p>
            </div>
          )}

          <div>
            <Label className="text-slate-300">Nome do Aluno *</Label>
            <AutocompleteAluno
              value={formData.aluno_nome}
              onChange={(nome: string, aluno?: Aluno) => {
                setFormData({
                  ...formData,
                  aluno_nome: nome,
                  aluno_id: aluno?.id || null,
                  curso_id: aluno?.curso_id?.toString() || formData.curso_id,
                  valor_parcela_anterior: aluno?.valor_parcela?.toString() || formData.valor_parcela_anterior,
                });
              }}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
            />
          </div>

          <div>
            <Label className="text-slate-300">Curso</Label>
            <Select
              value={formData.curso_id}
              onValueChange={(value) => setFormData({ ...formData, curso_id: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Selecione o curso..." />
              </SelectTrigger>
              <SelectContent>
                {cursos.map((curso) => (
                  <SelectItem key={curso.id} value={curso.id.toString()}>
                    {curso.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Parcela Anterior (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.valor_parcela_anterior}
                onChange={(e) => setFormData({ ...formData, valor_parcela_anterior: e.target.value })}
                placeholder="0,00"
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <Label className="text-slate-300">Parcela Nova (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.valor_parcela_novo}
                onChange={(e) => setFormData({ ...formData, valor_parcela_novo: e.target.value })}
                placeholder="0,00"
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          {anterior > 0 && novo > 0 && (
            <div className={`p-3 rounded-lg text-center ${reajuste >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
              <p className="text-xs text-slate-400">Reajuste</p>
              <p className={`text-2xl font-bold ${reajuste >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {reajuste >= 0 ? '+' : ''}{reajuste.toFixed(1)}%
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Forma de Pagamento</Label>
              <Select
                value={formData.forma_pagamento_id}
                onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {formasPagamento.map((fp) => (
                    <SelectItem key={fp.id} value={fp.id.toString()}>
                      {fp.nome} ({fp.sigla})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Agente Administrativo</Label>
              <Input
                value={formData.agente_comercial}
                onChange={(e) => setFormData({ ...formData, agente_comercial: e.target.value })}
                placeholder="Nome"
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {editingItem && modoEfetivo === 'pendente_validacao' && onMarcarNaoRenovou && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onMarcarNaoRenovou(editingItem)}
                className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100 sm:flex-1"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Não renovou
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading || !formData.aluno_nome.trim() || (isAntecipada && !formData.renovacao_primeira_aula_novo_ciclo)}
              className={`bg-gradient-to-r ${config.buttonClass} sm:flex-1`}
            >
              {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : config.botao}
            </Button>
          </div>

          {erro && (
            <p className="text-center text-sm text-rose-300">{erro}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

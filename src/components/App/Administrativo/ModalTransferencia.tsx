import React, { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AutocompleteAluno, type Aluno } from '@/components/ui/AutocompleteAluno';
import { supabase } from '@/lib/supabase';

export interface TransferenciaPayload {
  aluno: Aluno;
  unidadeOrigemId: string;
  unidadeDestinoId: string;
  dataTransferencia: string;
  observacao?: string;
}

interface UnidadeOption {
  id: string;
  nome: string;
  codigo: string;
}

interface ModalTransferenciaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: TransferenciaPayload) => Promise<boolean>;
  unidadeId?: string | null;
}

export function ModalTransferencia({
  open,
  onOpenChange,
  onSave,
  unidadeId,
}: ModalTransferenciaProps) {
  const [loading, setLoading] = useState(false);
  const [alunoNome, setAlunoNome] = useState('');
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null);
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [unidadeOrigemId, setUnidadeOrigemId] = useState('');
  const [unidadeDestinoId, setUnidadeDestinoId] = useState('');
  const [dataTransferencia, setDataTransferencia] = useState('');
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!open) return;
    setAlunoNome('');
    setAlunoSelecionado(null);
    setUnidadeOrigemId('');
    setUnidadeDestinoId(unidadeId && unidadeId !== 'todos' ? unidadeId : '');
    setDataTransferencia(new Date().toISOString().slice(0, 10));
    setObservacao('');
  }, [open, unidadeId]);

  useEffect(() => {
    if (!open) return;

    let cancelado = false;
    async function carregarUnidades() {
      const { data, error } = await supabase
        .from('unidades')
        .select('id, nome, codigo')
        .order('nome');

      if (!cancelado && !error) {
        setUnidades((data || []) as UnidadeOption[]);
      }
    }

    void carregarUnidades();
    return () => {
      cancelado = true;
    };
  }, [open]);

  function handleAlunoChange(nome: string, aluno?: Aluno) {
    setAlunoNome(nome);
    setAlunoSelecionado(aluno || null);

    if (aluno) {
      setUnidadeDestinoId(aluno.unidade_id || unidadeDestinoId || '');
      if (aluno.data_matricula) {
        setDataTransferencia(aluno.data_matricula);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alunoSelecionado || !unidadeOrigemId || !unidadeDestinoId || !dataTransferencia) return;
    if (unidadeOrigemId === unidadeDestinoId) return;

    setLoading(true);
    const sucesso = await onSave({
      aluno: alunoSelecionado,
      unidadeOrigemId,
      unidadeDestinoId,
      dataTransferencia,
      observacao: observacao.trim() || undefined,
    });
    setLoading(false);

    if (sucesso) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-white text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            Registrar Transferencia
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
            <p className="text-sm text-sky-200">
              Registra a transferencia interna com origem e destino. A unidade de origem nao perde
              aluno por evasao e a unidade de destino nao ganha matricula nova comercial.
            </p>
          </div>

          <div>
            <Label className="text-slate-300">Aluno transferido *</Label>
            <AutocompleteAluno
              value={alunoNome}
              onChange={handleAlunoChange}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
              apenasAtivos={false}
            />
            <p className="text-xs text-slate-500 mt-1">
              Selecione o cadastro correto. A alteracao sera aplicada no tipo de matricula do aluno.
            </p>
          </div>

          {alunoSelecionado && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-xl border border-slate-700/70 bg-slate-800/40 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Aluno</p>
                <p className="text-sm font-semibold text-white">{alunoSelecionado.nome}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Curso</p>
                <p className="text-sm text-slate-200">{alunoSelecionado.cursos?.nome || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Professor</p>
                <p className="text-sm text-slate-200">{alunoSelecionado.professores?.nome || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Unidade atual</p>
                <p className="text-sm text-slate-200">{alunoSelecionado.unidades?.codigo || '-'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-300">Unidade origem *</Label>
              <Select value={unidadeOrigemId} onValueChange={setUnidadeOrigemId}>
                <SelectTrigger>
                  <SelectValue placeholder="De onde saiu" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map(unidade => (
                    <SelectItem key={unidade.id} value={unidade.id}>
                      {unidade.codigo} - {unidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300">Unidade destino *</Label>
              <Select value={unidadeDestinoId} onValueChange={setUnidadeDestinoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Para onde entrou" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map(unidade => (
                    <SelectItem key={unidade.id} value={unidade.id}>
                      {unidade.codigo} - {unidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {unidadeOrigemId && unidadeDestinoId && unidadeOrigemId === unidadeDestinoId && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Origem e destino precisam ser unidades diferentes.
            </div>
          )}

          <div>
            <Label className="text-slate-300">Data da transferencia *</Label>
            <Input
              type="date"
              value={dataTransferencia}
              onChange={(event) => setDataTransferencia(event.target.value)}
            />
          </div>

          <div>
            <Label className="text-slate-300">Observacao</Label>
            <Textarea
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              placeholder="Ex.: veio de Campo Grande para Barra; nao conta como aquisicao nem evasao."
              className="min-h-20"
            />
          </div>

          <Button
            type="submit"
            disabled={
              loading
              || !alunoSelecionado
              || !unidadeOrigemId
              || !unidadeDestinoId
              || !dataTransferencia
              || unidadeOrigemId === unidadeDestinoId
            }
            className="w-full bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400"
          >
            {loading ? 'Salvando...' : 'Registrar transferencia interna'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

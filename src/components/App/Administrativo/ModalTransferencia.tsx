import React, { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AutocompleteAluno, type Aluno } from '@/components/ui/AutocompleteAluno';

interface ModalTransferenciaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (aluno: Aluno) => Promise<boolean>;
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

  useEffect(() => {
    if (!open) return;
    setAlunoNome('');
    setAlunoSelecionado(null);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alunoSelecionado) return;

    setLoading(true);
    const sucesso = await onSave(alunoSelecionado);
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
              Classifica o aluno como transferencia interna. Ele continua contando em base ativa,
              pagantes, ticket e MRR, mas sai de matricula nova comercial, conversoes e Matriculador+.
            </p>
          </div>

          <div>
            <Label className="text-slate-300">Aluno transferido *</Label>
            <AutocompleteAluno
              value={alunoNome}
              onChange={(nome, aluno) => {
                setAlunoNome(nome);
                setAlunoSelecionado(aluno || null);
              }}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
              apenasAtivos={false}
            />
            <p className="text-xs text-slate-500 mt-1">
              Selecione o cadastro correto. A alteracao sera aplicada no tipo de matricula do aluno.
            </p>
          </div>

          {alunoSelecionado && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-700/70 bg-slate-800/40 p-4">
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
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !alunoSelecionado}
            className="w-full bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400"
          >
            {loading ? 'Salvando...' : 'Marcar como transferencia'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

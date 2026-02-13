import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PipelineEtapa } from '../types';

interface ModalNovoLeadProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  etapas: PipelineEtapa[];
  canais: { id: number; nome: string }[];
  cursos: { id: number; nome: string }[];
}

export function ModalNovoLead({ aberto, onClose, onSalvo, etapas, canais, cursos }: ModalNovoLeadProps) {
  const [salvando, setSalvando] = useState(false);

  // Campos do formulário
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [canalOrigemId, setCanalOrigemId] = useState('');
  const [cursoInteresseId, setCursoInteresseId] = useState('');
  const [faixaEtaria, setFaixaEtaria] = useState('');
  const [sabiaPreco, setSabiaPreco] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const limpar = () => {
    setNome('');
    setTelefone('');
    setEmail('');
    setUnidadeId('');
    setCanalOrigemId('');
    setCursoInteresseId('');
    setFaixaEtaria('');
    setSabiaPreco('');
    setObservacoes('');
  };

  const handleClose = () => {
    limpar();
    onClose();
  };

  const handleSalvar = async () => {
    if (!nome.trim() || !unidadeId) return;

    setSalvando(true);
    try {
      const { error } = await supabase.from('leads').insert({
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        whatsapp: telefone.trim() || null,
        email: email.trim() || null,
        unidade_id: unidadeId,
        canal_origem_id: canalOrigemId ? Number(canalOrigemId) : null,
        curso_interesse_id: cursoInteresseId ? Number(cursoInteresseId) : null,
        faixa_etaria: faixaEtaria || null,
        sabia_preco: sabiaPreco === 'sim' ? true : sabiaPreco === 'nao' ? false : null,
        observacoes: observacoes.trim() || null,
        etapa_pipeline_id: 1, // Novo Lead
        temperatura: 'quente',
        data_contato: new Date().toISOString().split('T')[0],
        data_ultimo_contato: new Date().toISOString(),
      });

      if (error) throw error;

      limpar();
      onClose();
      onSalvo?.();
    } catch (err) {
      console.error('Erro ao criar lead:', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/20">
              <Plus className="w-4 h-4 text-violet-400" />
            </div>
            Novo Lead
          </DialogTitle>
          <DialogDescription>
            Cadastrar um novo lead manualmente no CRM
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome + Telefone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nome *</label>
              <Input
                placeholder="Nome do lead"
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Telefone / WhatsApp</label>
              <Input
                placeholder="(21) 99999-9999"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
          </div>

          {/* Email + Unidade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email</label>
              <Input
                placeholder="email@exemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Unidade *</label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2ec861f6-023f-4d7b-9927-3960ad8c2a92">Campo Grande</SelectItem>
                  <SelectItem value="95553e96-971b-4590-a6eb-0201d013c14d">Recreio</SelectItem>
                  <SelectItem value="368d47f5-2d88-4475-bc14-ba084a9a348e">Barra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KPIs: Canal + Curso */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">📡 Canal de Origem</label>
              <Select value={canalOrigemId} onValueChange={setCanalOrigemId}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {canais.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">🎸 Curso de Interesse</label>
              <Select value={cursoInteresseId} onValueChange={setCursoInteresseId}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {cursos.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KPIs: Faixa Etária + Sabe Preço */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">👶 Faixa Etária</label>
              <Select value={faixaEtaria} onValueChange={setFaixaEtaria}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0-3">0-3 anos (Bebê)</SelectItem>
                  <SelectItem value="4-6">4-6 anos (LAMK)</SelectItem>
                  <SelectItem value="7-11">7-11 anos (LAMK)</SelectItem>
                  <SelectItem value="12-17">12-17 anos (EMLA)</SelectItem>
                  <SelectItem value="18+">18+ anos (Adulto)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">💰 Sabe o Preço?</label>
              <Select value={sabiaPreco} onValueChange={setSabiaPreco}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Observações</label>
            <textarea
              placeholder="Notas sobre o lead..."
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={!nome.trim() || !unidadeId || salvando}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {salvando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              <><Plus className="w-4 h-4 mr-2" /> Criar Lead</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalNovoLead;

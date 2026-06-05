import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { LeadCRM } from '../types';

interface ModalEditarLeadProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  lead: LeadCRM | null;
  experimentalId?: number | null;
}

export function ModalEditarLead({ aberto, onClose, onSalvo, lead, experimentalId }: ModalEditarLeadProps) {
  const [salvando, setSalvando] = useState(false);
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  const [professores, setProfessores] = useState<{ id: number; nome: string }[]>([]);
  const [canais, setCanais] = useState<{ id: number; nome: string }[]>([]);

  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    canal_origem_id: '',
    curso_interesse_id: '',
    professor_experimental_id: '',
    data_experimental: '',
    horario_experimental: '',
    observacoes: '',
  });

  useEffect(() => {
    if (aberto && lead) {
      setForm({
        nome: lead.nome || '',
        telefone: lead.telefone || '',
        canal_origem_id: lead.canal_origem_id?.toString() || '',
        curso_interesse_id: lead.curso_interesse_id?.toString() || '',
        professor_experimental_id: lead.professor_experimental_id?.toString() || '',
        data_experimental: lead.data_experimental || '',
        horario_experimental: lead.horario_experimental?.slice(0, 5) || '',
        observacoes: lead.observacoes || '',
      });
    }
  }, [aberto, lead]);

  useEffect(() => {
    if (!aberto) return;
    Promise.all([
      supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('canais_origem').select('id, nome').order('nome'),
    ]).then(([c, p, ca]) => {
      if (c.data) setCursos(c.data);
      if (p.data) setProfessores(p.data);
      if (ca.data) setCanais(ca.data);
    });
  }, [aberto]);

  const handleClose = () => onClose();

  const handleSalvar = async () => {
    if (!lead) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          nome: form.nome.trim() || null,
          telefone: form.telefone.trim() || null,
          canal_origem_id: form.canal_origem_id ? parseInt(form.canal_origem_id) : null,
          curso_interesse_id: form.curso_interesse_id ? parseInt(form.curso_interesse_id) : null,
          professor_experimental_id: form.professor_experimental_id ? parseInt(form.professor_experimental_id) : null,
          data_experimental: form.data_experimental || null,
          horario_experimental: form.horario_experimental ? `${form.horario_experimental}:00` : null,
          observacoes: form.observacoes.trim() || null,
        })
        .eq('id', lead.id);

      if (error) throw error;

      if (experimentalId) {
        await supabase
          .from('lead_experimentais')
          .update({
            nome_aluno: form.nome.trim() || null,
            professor_experimental_id: form.professor_experimental_id ? parseInt(form.professor_experimental_id) : null,
            data_experimental: form.data_experimental || null,
            horario_experimental: form.horario_experimental ? `${form.horario_experimental}:00` : null,
          })
          .eq('id', experimentalId);
      }

      toast.success('Lead atualizado.');
      handleClose();
      onSalvo?.();
    } catch (err) {
      console.error('Erro ao salvar lead:', err);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/20">
              <Pencil className="w-4 h-4 text-blue-400" />
            </div>
            Editar Lead
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nome</label>
            <input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Telefone</label>
            <input
              value={form.telefone}
              onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
              className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Canal</label>
              <Select value={form.canal_origem_id} onValueChange={v => setForm(f => ({ ...f, canal_origem_id: v }))}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {canais.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Curso</label>
              <Select value={form.curso_interesse_id} onValueChange={v => setForm(f => ({ ...f, curso_interesse_id: v }))}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {cursos.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Data da Experimental</label>
              <input
                type="date"
                value={form.data_experimental}
                onChange={e => setForm(f => ({ ...f, data_experimental: e.target.value }))}
                className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Horário</label>
              <input
                type="time"
                value={form.horario_experimental}
                onChange={e => setForm(f => ({ ...f, horario_experimental: e.target.value }))}
                className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Professor</label>
            <Select value={form.professor_experimental_id} onValueChange={v => setForm(f => ({ ...f, professor_experimental_id: v }))}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700">
                <SelectValue placeholder="Selecionar professor" />
              </SelectTrigger>
              <SelectContent>
                {professores.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              rows={2}
              className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">
            {salvando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              <><Pencil className="w-4 h-4 mr-2" /> Salvar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalEditarLead;

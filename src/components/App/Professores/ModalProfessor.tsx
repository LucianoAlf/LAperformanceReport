import React, { useState, useEffect } from 'react';
import { User, Calendar, Building2, Music, Save, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerNascimento } from '@/components/ui/date-picker-nascimento';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageCropUpload } from '@/components/ui/ImageCropUpload';
import type { Professor, Unidade, Curso, ProfessorFormData } from './types';

interface ModalProfessorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ProfessorFormData) => Promise<void>;
  professor?: Professor | null;
  unidades: Unidade[];
  cursos: Curso[];
  modo: 'novo' | 'editar';
}

export function ModalProfessor({
  open,
  onClose,
  onSave,
  professor,
  unidades,
  cursos,
  modo
}: ModalProfessorProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ProfessorFormData>({
    nome: '',
    data_admissao: null,
    comissao_percentual: 0,
    observacoes: '',
    foto_url: '',
    unidades_ids: [],
    cursos_ids: []
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Preencher formulário ao editar
  useEffect(() => {
    if (professor && modo === 'editar') {
      setFormData({
        nome: professor.nome || '',
        data_admissao: professor.data_admissao ? new Date(professor.data_admissao) : null,
        comissao_percentual: professor.comissao_percentual || 0,
        observacoes: professor.observacoes || '',
        foto_url: professor.foto_url || '',
        unidades_ids: professor.unidades?.map(u => u.unidade_id) || [],
        cursos_ids: professor.cursos?.map(c => c.curso_id) || []
      });
    } else {
      // Reset para novo professor
      setFormData({
        nome: '',
        data_admissao: null,
        comissao_percentual: 0,
        observacoes: '',
        foto_url: '',
        unidades_ids: [],
        cursos_ids: []
      });
    }
    setErrors({});
  }, [professor, modo, open]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório';
    }
    
    if (formData.unidades_ids.length === 0) {
      newErrors.unidades = 'Selecione pelo menos uma unidade';
    }
    
    if (formData.cursos_ids.length === 0) {
      newErrors.cursos = 'Selecione pelo menos um curso/especialidade';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar professor:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUnidade = (unidadeId: string) => {
    setFormData(prev => ({
      ...prev,
      unidades_ids: prev.unidades_ids.includes(unidadeId)
        ? prev.unidades_ids.filter(id => id !== unidadeId)
        : [...prev.unidades_ids, unidadeId]
    }));
  };

  const toggleCurso = (cursoId: number) => {
    setFormData(prev => ({
      ...prev,
      cursos_ids: prev.cursos_ids.includes(cursoId)
        ? prev.cursos_ids.filter(id => id !== cursoId)
        : [...prev.cursos_ids, cursoId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-violet-400" />
            {modo === 'novo' ? 'Novo Professor' : 'Editar Professor'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Foto e Nome */}
          <div className="flex gap-4">
            {/* Avatar/Foto */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden">
                {formData.foto_url ? (
                  <img 
                    src={formData.foto_url} 
                    alt="Foto" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-slate-500" />
                )}
              </div>
              <ImageCropUpload
                currentImage={formData.foto_url}
                onImageChange={(imageDataUrl) => setFormData(prev => ({ ...prev, foto_url: imageDataUrl }))}
              />
            </div>

            {/* Nome */}
            <div className="flex-1 space-y-4">
              <div>
                <Label htmlFor="nome" className="mb-2 block">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome do professor"
                  className={errors.nome ? 'border-red-500' : ''}
                />
                {errors.nome && <span className="text-xs text-red-400">{errors.nome}</span>}
              </div>

              {/* Data de Admissão */}
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Data de Admissão
                </Label>
                <DatePickerNascimento
                  date={formData.data_admissao || undefined}
                  onDateChange={(date) => setFormData(prev => ({ ...prev, data_admissao: date || null }))}
                  placeholder="Selecione a data de início"
                />
              </div>
            </div>
          </div>

          {/* Unidades (Multi-select com checkboxes) */}
          <div>
            <Label className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-amber-400" />
              Unidades de Atuação *
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {unidades.filter(u => u.ativo).map((unidade) => (
                <label
                  key={unidade.id}
                  className={`
                    flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all
                    ${formData.unidades_ids.includes(unidade.id)
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }
                  `}
                >
                  <Checkbox
                    checked={formData.unidades_ids.includes(unidade.id)}
                    onCheckedChange={() => toggleUnidade(unidade.id)}
                  />
                  <span className="text-sm font-medium">{unidade.nome}</span>
                </label>
              ))}
            </div>
            {errors.unidades && <span className="text-xs text-red-400 mt-1 block">{errors.unidades}</span>}
          </div>

          {/* Cursos/Especialidades (Multi-select com checkboxes) */}
          <div>
            <Label className="flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-cyan-400" />
              Cursos / Especialidades *
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {cursos.map((curso) => (
                <label
                  key={curso.id}
                  className={`
                    flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm
                    ${formData.cursos_ids.includes(curso.id)
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }
                  `}
                >
                  <Checkbox
                    checked={formData.cursos_ids.includes(curso.id)}
                    onCheckedChange={() => toggleCurso(curso.id)}
                  />
                  <span className="truncate">{curso.nome}</span>
                </label>
              ))}
            </div>
            {errors.cursos && <span className="text-xs text-red-400 mt-1 block">{errors.cursos}</span>}
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {modo === 'novo' ? 'Cadastrar' : 'Salvar Alterações'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, AlertTriangle, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Unidade } from './types';

interface ModalAdicionarPessoaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidades: Unidade[];
  onSucesso: () => void;
}

const DEPARTAMENTOS = ['Atendimento', 'Administrativo', 'Professores'] as const;

type EstadoModal = 'form' | 'salvando' | 'sucesso' | 'erro';

interface ResultadoCriar {
  colaborador_id: number;
  token: string;
  nome: string;
}

export function ModalAdicionarPessoa({
  open,
  onOpenChange,
  unidades,
  onSucesso,
}: ModalAdicionarPessoaProps) {
  const [estado, setEstado] = useState<EstadoModal>('form');
  const [erroMsg, setErroMsg] = useState('');
  const [resultado, setResultado] = useState<ResultadoCriar | null>(null);
  const [whatsappSalvo, setWhatsappSalvo] = useState('');
  const [copiado, setCopiado] = useState(false);

  // Campos do formulário
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [departamento, setDepartamento] = useState<string>('Atendimento');

  function resetar() {
    setEstado('form');
    setErroMsg('');
    setResultado(null);
    setWhatsappSalvo('');
    setCopiado(false);
    setNome('');
    setWhatsapp('');
    setUnidadeId('');
    setDepartamento('Atendimento');
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Se fechar no sucesso, atualiza a lista
      if (estado === 'sucesso') {
        onSucesso();
      }
      resetar();
    }
    onOpenChange(next);
  }

  async function salvar() {
    if (!nome.trim()) {
      setErroMsg('Nome é obrigatório');
      setEstado('erro');
      return;
    }
    if (!unidadeId) {
      setErroMsg('Selecione uma unidade');
      setEstado('erro');
      return;
    }

    setEstado('salvando');
    setErroMsg('');

    // Limpa WhatsApp: só números
    const whatsappLimpo = whatsapp.replace(/\D/g, '') || null;

    try {
      const { data, error } = await supabase.rpc('criar_ficha_pessoa', {
        p_nome: nome.trim(),
        p_whatsapp: whatsappLimpo,
        p_unidade_id: unidadeId,
        p_departamento: departamento,
        p_situacao: 'candidato',
        p_cargo_contexto: 'ATENDIMENTO',
      });

      if (error) throw error;

      const r = Array.isArray(data) ? data[0] : data;
      if (!r || !r.token) throw new Error('RPC não retornou token');

      setResultado(r);
      setWhatsappSalvo(whatsappLimpo || '');
      setEstado('sucesso');
    } catch (err: any) {
      setErroMsg(err?.message || 'Erro ao criar ficha');
      setEstado('erro');
    }
  }

  const link = resultado
    ? `https://la-performance-report.vercel.app/ficha-tecnica/?t=${resultado.token}`
    : '';

  const primeiroNome = (resultado?.nome || nome).split(' ')[0].toLowerCase();
  const msgWhatsApp = `Oi, ${primeiroNome}! Tudo bem? Antes da nossa conversa, queria te pedir pra preencher a Ficha Técnica da LA. São uns 15 minutos e não tem resposta certa nem errada — é pra gente te conhecer melhor. Segue o link: ${link}`;
  const linkWhatsApp = whatsappSalvo
    ? `https://wa.me/55${whatsappSalvo}?text=${encodeURIComponent(msgWhatsApp)}`
    : '';

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback: select manual
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {estado === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle>Adicionar pessoa</DialogTitle>
              <DialogDescription>
                Cria um candidato e gera o link da Ficha Técnica pra enviar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Nome completo <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Maria Silva"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  WhatsApp <span className="text-slate-500 text-xs">(opcional, só números com DDD)</span>
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex.: 21999999999"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Unidade */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Unidade <span className="text-red-400">*</span>
                </label>
                <select
                  value={unidadeId}
                  onChange={(e) => setUnidadeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione...</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              {/* Departamento */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Departamento
                </label>
                <select
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  {DEPARTAMENTOS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={!nome.trim() || !unidadeId}>
                Criar e gerar link
              </Button>
            </div>
          </>
        )}

        {estado === 'salvando' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
            <p className="text-slate-400 text-sm">Criando ficha...</p>
          </div>
        )}

        {estado === 'erro' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-red-400">Erro</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-400">{erroMsg}</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>Fechar</Button>
              <Button onClick={() => setEstado('form')}>Tentar de novo</Button>
            </div>
          </>
        )}

        {estado === 'sucesso' && resultado && (
          <>
            <DialogHeader>
              <DialogTitle>Ficha criada!</DialogTitle>
              <DialogDescription>
                {resultado.nome} foi adicionada como candidata.
              </DialogDescription>
            </DialogHeader>

            {/* Aviso: token só aparece agora */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-none mt-0.5" />
              <p className="text-xs text-amber-200/80">
                O link só aparece agora. Se você fechar sem copiar, não tem como recuperar pela tela — cria de novo.
              </p>
            </div>

            {/* Link */}
            <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
              <p className="text-xs text-slate-500 mb-1">Link da Ficha Técnica:</p>
              <p className="text-sm text-cyan-300 break-all font-mono">{link}</p>
            </div>

            {/* Botões */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  onClick={copiarLink}
                  className="flex-1"
                  variant={copiado ? 'secondary' : 'default'}
                >
                  {copiado ? (
                    <><Check className="w-4 h-4 mr-2" /> Copiado!</>
                  ) : (
                    <><Copy className="w-4 h-4 mr-2" /> Copiar link</>
                  )}
                </Button>
                <Button
                  onClick={() => window.open(linkWhatsApp, '_blank')}
                  disabled={!whatsappSalvo}
                  className="flex-1"
                  variant="secondary"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir no WhatsApp
                </Button>
              </div>
              {!whatsappSalvo && (
                <p className="text-xs text-slate-500 text-center">
                  WhatsApp não informado — botão desabilitado.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Concluir
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

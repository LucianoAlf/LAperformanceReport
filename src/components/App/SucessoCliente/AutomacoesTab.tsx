import { useState } from 'react';
import { Zap, Pencil, Send, Loader2, Save, X } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAutomacoesSucessoAluno } from './hooks/useAutomacoesSucessoAluno';

const UNIDADES = [
  { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande' },
  { id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio' },
  { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra' },
];

export function AutomacoesTab({ unidadeAtual }: { unidadeAtual: UnidadeId }) {
  const { automacoes, textoCarrossel, loadingTexto, salvarTextoCarrossel, dispararTeste } = useAutomacoesSucessoAluno();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);

  const unidadePadrao = unidadeAtual !== 'todos' ? String(unidadeAtual) : UNIDADES[1].id;
  const [unidadeDisparo, setUnidadeDisparo] = useState(unidadePadrao);
  const [numero, setNumero] = useState('');
  const [disparando, setDisparando] = useState(false);

  const abrirEdicao = () => { setRascunho(textoCarrossel); setEditando(true); };
  const salvar = async () => {
    setSalvando(true);
    const ok = await salvarTextoCarrossel(rascunho);
    setSalvando(false);
    if (ok) setEditando(false);
  };
  const disparar = async () => {
    if (!numero.trim()) return;
    setDisparando(true);
    await dispararTeste(unidadeDisparo, numero, { responsavel: 'Maria', aluno: 'João', curso: 'Violão' });
    setDisparando(false);
  };

  return (
    <div className="space-y-4">
      {automacoes.map((a) => (
        <div key={a.slug} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white">{a.nome}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    a.gatilho === 'automatico'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  }`}>
                    {a.gatilho === 'automatico' ? 'Automático' : 'Manual'}
                  </span>
                  {!a.editavel && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-600/20 text-slate-400 border-slate-600/40">
                      Texto no código
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-0.5">{a.descricao}</p>
              </div>
            </div>
          </div>

          {a.editavel && a.slug === 'boas_vindas_equipe' && (
            <div className="mt-4 border-t border-slate-700/50 pt-4 space-y-3">
              {!editando ? (
                <>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-auto">
                    {loadingTexto ? 'Carregando…' : textoCarrossel}
                  </pre>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="border-slate-700" onClick={abrirEdicao}>
                      <Pencil className="w-4 h-4 mr-2" /> Editar texto
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <select
                        value={unidadeDisparo}
                        onChange={(e) => setUnidadeDisparo(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 px-2 py-2"
                      >
                        {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                      <Input placeholder="Número (DDD)" value={numero} onChange={(e) => setNumero(e.target.value)} className="w-44" />
                      <Button size="sm" onClick={disparar} disabled={disparando || !numero.trim()}
                        className="bg-gradient-to-r from-pink-500 to-violet-500">
                        {disparando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        Disparar teste
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    rows={12}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 p-3 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Variáveis: {'{responsavel}'} {'{aluno}'} {'{curso}'} {'{unidade}'} {'{secretaria_whatsapp}'} {'{secretaria_fixo}'} {'{equipe}'} (lista gerada da equipe).
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={salvar} disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500">
                      {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-700" onClick={() => setEditando(false)}>
                      <X className="w-4 h-4 mr-2" /> Cancelar
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

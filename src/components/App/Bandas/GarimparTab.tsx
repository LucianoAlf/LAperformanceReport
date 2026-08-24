import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { UserSearch, Guitar, UserPlus, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { AutocompleteAluno, type Aluno } from '@/components/ui/AutocompleteAluno';
import { useBandasGarimpar, upsertIntegranteBanda, type BandaGarimpar } from '@/hooks/useBandas';

interface GarimparTabProps {
  unidadeAtual: string;
}

export function GarimparTab({ unidadeAtual }: GarimparTabProps) {
  const [minIntegrantes, setMinIntegrantes] = useState('3');
  const { bandas, loading, recarregar } = useBandasGarimpar(unidadeAtual, Number(minIntegrantes));

  const [bandaDestino, setBandaDestino] = useState<BandaGarimpar | null>(null);
  const [candidatoNome, setCandidatoNome] = useState('');
  const [candidato, setCandidato] = useState<Aluno | null>(null);
  const [instrumento, setInstrumento] = useState('');
  const [funcao, setFuncao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (bandaDestino) {
      setCandidatoNome('');
      setCandidato(null);
      setInstrumento('');
      setFuncao('');
    }
  }, [bandaDestino]);

  async function handleAdicionarCandidato() {
    if (!bandaDestino) return;
    if (!candidato) {
      toast.error('Selecione um aluno da lista de busca.');
      return;
    }
    setSalvando(true);
    const { error } = await upsertIntegranteBanda({
      bandaId: bandaDestino.banda_id,
      alunoId: candidato.id,
      instrumento: instrumento.trim() || null,
      funcao: funcao.trim() || null,
    });
    setSalvando(false);
    if (error) {
      toast.error('Erro ao adicionar candidato', { description: error.message });
      return;
    }
    toast.success('Candidato registrado na banda', {
      description: `${candidato.nome} → ${bandaDestino.nome}. A matrícula no curso de banda é feita no Emusys.`,
    });
    setBandaDestino(null);
    recarregar();
  }

  return (
    <div className="space-y-4">
      <AlertBanner
        type="info"
        title="Garimpar vagas em bandas"
        message="Bandas ativas com poucos integrantes. Ao adicionar um candidato aqui você registra o interesse (instrumento/função); a matrícula no curso de banda continua sendo feita no Emusys — até lá, ele aparece na aba Conciliação."
        dismissible
      />

      <div className="flex items-center gap-3">
        <Label className="text-sm text-slate-300 whitespace-nowrap">Bandas com menos de</Label>
        <Select value={minIntegrantes} onValueChange={setMinIntegrantes}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['2', '3', '4', '5'].map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-400">integrantes</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Carregando...</div>
      ) : bandas.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
          <UserSearch className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhuma banda com vaga</p>
          <p className="text-slate-500 text-sm mt-1">
            Todas as bandas ativas têm pelo menos {minIntegrantes} integrantes.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl divide-y divide-slate-700/50">
          {bandas.map((banda) => (
            <div key={banda.banda_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{banda.nome}</p>
                <p className="text-xs text-slate-400">
                  {banda.unidade_nome} · {banda.curso_nome} · Produtor: {banda.produtor_nome || '—'}
                </p>
              </div>
              <Badge variant={banda.integrantes === 0 ? 'error' : 'warning'} className="gap-1">
                <Guitar className="w-3 h-3" />
                {banda.integrantes} {banda.integrantes === 1 ? 'integrante' : 'integrantes'}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBandaDestino(banda)}
              >
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                Adicionar candidato
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!bandaDestino} onOpenChange={() => setBandaDestino(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar candidato</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400 -mt-2">{bandaDestino?.nome}</p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Aluno</Label>
              <AutocompleteAluno
                value={candidatoNome}
                onChange={(nome, aluno) => {
                  setCandidatoNome(nome);
                  setCandidato(aluno || null);
                }}
                unidadeId={unidadeAtual !== 'todos' ? unidadeAtual : null}
                placeholder="Buscar aluno por nome..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="garimpo-instrumento">Instrumento</Label>
                <Input
                  id="garimpo-instrumento"
                  value={instrumento}
                  onChange={(e) => setInstrumento(e.target.value)}
                  placeholder="Ex.: Baixo, Bateria..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="garimpo-funcao">Função</Label>
                <Input
                  id="garimpo-funcao"
                  value={funcao}
                  onChange={(e) => setFuncao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setBandaDestino(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleAdicionarCandidato} disabled={salvando || !candidato}>
              <Save className="w-4 h-4 mr-2" />
              {salvando ? 'Salvando...' : 'Registrar candidato'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

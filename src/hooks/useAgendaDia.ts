import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatarFrescor } from '@/lib/agenda';

export interface AlunoAgenda {
  // integer no banco (alunos.id), nao uuid. Null quando o participante e lead.
  aluno_id: number | null;
  nome: string;
  idade: number | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  status_presenca: string | null;
  risco_pct: number | null;
  inadimplente: boolean;
  nota_pesquisa: number | null;
  data_ultima_aula: string | null;
}

export interface AulaAgenda {
  chave: string;
  unidade_id: string;
  unidade_nome: string;
  professor_nome: string | null;
  professor_id: number | null;
  sala_nome: string | null;
  curso_nome: string | null;
  turma_nome: string | null;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number;
  categoria: string | null;
  tipo: string | null;
  cancelada: boolean;
  justificada: boolean;
  reagendada: boolean;
  hora_original: string | null;
  nr_da_aula: number | null;
  qtd_alunos: number;
  anotacoes: string | null;
  professor_presenca: string | null;
  alunos: AlunoAgenda[];
}

interface Params {
  data: string;
  unidadeId: string | null;
}

export function useAgendaDia({ data, unidadeId }: Params) {
  const [aulas, setAulas] = useState<AulaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [frescor, setFrescor] = useState('sem dado de sincronizacao');

  const buscar = useCallback(async () => {
    // Capturados no inicio: se `data`/`unidadeId` mudarem antes desta busca
    // resolver (navegacao rapida dia a dia), a resposta ficou obsoleta e e
    // descartada em vez de sobrescrever o estado com dados da data errada.
    const dataDaBusca = data;
    const unidadeIdDaBusca = unidadeId;
    const aindaValida = () => dataDaBusca === data && unidadeIdDaBusca === unidadeId;

    setCarregando(true);
    setErro(null);

    const { data: linhas, error } = await supabase.rpc('get_agenda_dia', {
      p_data: dataDaBusca,
      p_unidade_id: unidadeIdDaBusca,
    });

    if (!aindaValida()) return;

    if (error) {
      setErro(error.message);
      setAulas([]);
      setCarregando(false);
      return;
    }

    setAulas((linhas || []) as unknown as AulaAgenda[]);

    // Frescor: ultima linha inserida em aulas_emusys para o escopo atual.
    let q = supabase
      .from('aulas_emusys')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (unidadeIdDaBusca) q = q.eq('unidade_id', unidadeIdDaBusca);
    const { data: ultima, error: erroFrescor } = await q;

    if (!aindaValida()) return;

    if (erroFrescor) {
      // Frescor e informacao acessoria: falha aqui nao deve derrubar a tela
      // nem se misturar com `erro` (que e da RPC principal). So loga p/ diagnostico.
      console.error('[useAgendaDia] falha ao consultar frescor (aulas_emusys):', {
        unidadeId: unidadeIdDaBusca,
        error: erroFrescor,
      });
    }

    setFrescor(formatarFrescor(ultima?.[0]?.created_at ?? null, new Date()));
    setCarregando(false);
  }, [data, unidadeId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  return { aulas, carregando, erro, frescor, recarregar: buscar };
}

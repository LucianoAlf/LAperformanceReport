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
    setCarregando(true);
    setErro(null);

    const { data: linhas, error } = await supabase.rpc('get_agenda_dia', {
      p_data: data,
      p_unidade_id: unidadeId,
    });

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
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data: ultima } = await q;

    setFrescor(formatarFrescor(ultima?.[0]?.created_at ?? null, new Date()));
    setCarregando(false);
  }, [data, unidadeId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  return { aulas, carregando, erro, frescor, recarregar: buscar };
}

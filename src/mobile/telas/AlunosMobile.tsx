import { Users } from 'lucide-react';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useAlunosLista } from '@/hooks/useAlunosLista';

import { ListaAlunosMobile } from './alunos/ListaAlunosMobile';

/**
 * A lista de alunos como tela autônoma de celular.
 *
 * ⚠️ NÃO está ligada ao router. A rota `/app/alunos` monta a `AlunosPage`, que
 * tem os 6 KPIs e as 8 abas — e, no celular, renderiza a MESMA
 * `ListaAlunosMobile` na aba Lista, com a lista que ela já carregou.
 *
 * Este arquivo existe para o dia em que a lista precisar de rota própria (um
 * atalho, um deep link, uma tela cheia vinda de outro módulo). Ele é o único
 * consumidor de `useAlunosLista`; enquanto a AlunosPage não migrar para o
 * hook, essa é a única leitura paralela — e `tests/mobileAlunosTela.test.mjs`
 * trava os filtros dela contra os do desktop.
 */
export function AlunosMobile() {
  useSetPageTitle({
    titulo: 'Alunos',
    subtitulo: 'Lista de alunos por unidade',
    icone: Users,
    iconeCor: 'text-emerald-400',
    iconeWrapperCor: 'bg-emerald-500/20',
  });

  const { alunos, carregando, erro, consolidado } = useAlunosLista();

  if (carregando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (erro) {
    // Falha não pode ser muda: "nenhum aluno" e "a consulta quebrou" são
    // estados diferentes e a tela tem de dizer qual dos dois aconteceu.
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        Não consegui carregar a lista de alunos.
        <span className="mt-1 block text-[12px] text-rose-300/80">{erro}</span>
      </div>
    );
  }

  return <ListaAlunosMobile alunos={alunos} mostrarUnidade={consolidado} />;
}

export default AlunosMobile;

import { supabase } from '@/lib/supabase';
import { descartarCopiasListaAlunos } from '@/lib/alunosListaCopia';

// O signOut do AuthContext não recarrega a página, então a memória sobreviveria ao logout.
// A chave já leva o usuário (outro login não leria a cópia), mas dado pessoal de quem saiu
// não deve ficar no processo. Registrado uma vez, na carga do módulo: vale mesmo quando o
// logout acontece com a Lista de Alunos desmontada.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') descartarCopiasListaAlunos();
});

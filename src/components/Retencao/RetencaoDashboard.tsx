import { useState, useRef, useEffect } from 'react';
import { SidebarRetencao } from './SidebarRetencao';
import { RetencaoInicio } from './RetencaoInicio';
import { RetencaoVisaoGeral } from './RetencaoVisaoGeral';
import { RetencaoTendencias } from './RetencaoTendencias';
import { RetencaoMotivos } from './RetencaoMotivos';
import { RetencaoProfessores } from './RetencaoProfessores';
import { RetencaoSazonalidade } from './RetencaoSazonalidade';
import { RetencaoComparativo } from './RetencaoComparativo';
import { RetencaoAlertas } from './RetencaoAlertas';
import { RetencaoAcoes } from './RetencaoAcoes';
import { SecaoRetencao, UnidadeRetencao } from '../../types/retencao';

interface RetencaoDashboardProps {
  onPageChange: (page: 'gestao' | 'comercial' | 'retencao') => void;
}

export function RetencaoDashboard({ onPageChange }: RetencaoDashboardProps) {
  const [activeSection, setActiveSection] = useState<SecaoRetencao>('inicio');
  const [ano, setAno] = useState(2025);
  const [unidade, setUnidade] = useState<UnidadeRetencao>('Consolidado');
  
  const mainRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll para seção
  const scrollToSection = (sectionId: SecaoRetencao) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Intersection Observer para detectar seção ativa
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SecaoRetencao);
          }
        });
      },
      { threshold: 0.3, rootMargin: '-100px 0px -50% 0px' }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const handleSectionChange = (section: SecaoRetencao) => {
    setActiveSection(section);
    scrollToSection(section);
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <SidebarRetencao
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onPageChange={onPageChange}
      />
      
      <main ref={mainRef} className="flex-1 ml-64 overflow-y-auto scroll-smooth">
        <div 
          id="inicio" 
          ref={(el) => (sectionRefs.current['inicio'] = el)}
          className="min-h-screen"
        >
          <RetencaoInicio onStart={() => handleSectionChange('visao-geral')} />
        </div>

        <div 
          id="visao-geral" 
          ref={(el) => (sectionRefs.current['visao-geral'] = el)}
          className="min-h-screen"
        >
          <RetencaoVisaoGeral 
            ano={ano} 
            unidade={unidade} 
            onAnoChange={setAno}
            onUnidadeChange={setUnidade}
          />
        </div>

        <div 
          id="tendencias" 
          ref={(el) => (sectionRefs.current['tendencias'] = el)}
          className="min-h-screen"
        >
          <RetencaoTendencias ano={ano} unidade={unidade} />
        </div>

        <div 
          id="motivos" 
          ref={(el) => (sectionRefs.current['motivos'] = el)}
          className="min-h-screen"
        >
          <RetencaoMotivos ano={ano} unidade={unidade} />
        </div>

        <div 
          id="professores" 
          ref={(el) => (sectionRefs.current['professores'] = el)}
          className="min-h-screen"
        >
          <RetencaoProfessores ano={ano} unidade={unidade} />
        </div>

        <div 
          id="sazonalidade" 
          ref={(el) => (sectionRefs.current['sazonalidade'] = el)}
          className="min-h-screen"
        >
          <RetencaoSazonalidade ano={ano} unidade={unidade} />
        </div>

        <div 
          id="comparativo" 
          ref={(el) => (sectionRefs.current['comparativo'] = el)}
          className="min-h-screen"
        >
          <RetencaoComparativo ano={ano} />
        </div>

        <div 
          id="alertas" 
          ref={(el) => (sectionRefs.current['alertas'] = el)}
          className="min-h-screen"
        >
          <RetencaoAlertas ano={ano} unidade={unidade} />
        </div>

        <div 
          id="acoes" 
          ref={(el) => (sectionRefs.current['acoes'] = el)}
          className="min-h-screen"
        >
          <RetencaoAcoes ano={ano} unidade={unidade} />
        </div>
      </main>
    </div>
  );
}

export default RetencaoDashboard;

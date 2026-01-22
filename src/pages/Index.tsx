import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Film, Sparkles, Shield, Users } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-6 py-24">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-[hsl(80,100%,40%)] flex items-center justify-center shadow-glow">
                <Zap className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-foreground text-xl leading-none">ManIAS</span>
                <span className="text-xs text-primary font-medium tracking-widest">LAB.</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link to="/auth">Iniciar Sesión</Link>
              </Button>
              <Button variant="lime" asChild>
                <Link to="/auth">Comenzar</Link>
              </Button>
            </div>
          </nav>

          {/* Hero content */}
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Estudio de Producción con IA</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-foreground leading-tight mb-6">
              Crea Producciones de <span className="text-gradient-lime">Calidad Cinematográfica</span> con IA
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
              Pipeline de producción de video profesional con control de calidad, 
              gestión de continuidad y herramientas de colaboración. Sin experiencia necesaria.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button variant="lime" size="xl" asChild>
                <Link to="/auth">
                  Empezar a Crear
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="xl">
                Ver Demo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Pipeline Profesional, Cero Complejidad
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Todo lo que necesitas para crear contenido de calidad blockbuster, 
              guiado por IA en cada paso.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="panel p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Film className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Flujo Canon-First</h3>
              <p className="text-muted-foreground">
                Construye tu biblia de producción con personajes, locaciones y guías de estilo 
                antes de generar un solo fotograma.
              </p>
            </div>

            <div className="panel p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-6">
                <Shield className="w-7 h-7 text-success" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Control de Calidad</h3>
              <p className="text-muted-foreground">
                Verificaciones QC automáticas para continuidad, audio y ritmo. 
                Nada se exporta hasta que cumple estándares profesionales.
              </p>
            </div>

            <div className="panel p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-info/10 flex items-center justify-center mx-auto mb-6">
                <Users className="w-7 h-7 text-info" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Colaboración de Estudio</h3>
              <p className="text-muted-foreground">
                Roles integrados, aprobaciones, revisión de dailies y gestión de tareas 
                para equipos de cualquier tamaño.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            ¿Listo para Crear tu Primera Producción?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Comienza con nuestro asistente guiado y ten tu primera escena renderizando en minutos.
          </p>
          <Button variant="lime" size="xl" asChild>
            <Link to="/auth">
              Comenzar Gratis
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">ManIAS Lab.</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 ManIAS Lab
          </p>
        </div>
      </footer>
    </div>
  );
}

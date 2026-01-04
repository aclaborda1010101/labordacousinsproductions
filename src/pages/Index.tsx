import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clapperboard, ArrowRight, Film, Sparkles, Shield, Users } from 'lucide-react';

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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-glow">
                <Clapperboard className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-foreground text-lg">LC Studio</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button variant="gold" asChild>
                <Link to="/auth">Get Started</Link>
              </Button>
            </div>
          </nav>

          {/* Hero content */}
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Production Studio</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-foreground leading-tight mb-6">
              Create <span className="text-gradient-gold">Cinema-Quality</span> Productions with AI
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
              Professional-grade video production pipeline with quality gates, continuity management, 
              and studio collaboration tools. No experience required.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button variant="gold" size="xl" asChild>
                <Link to="/auth">
                  Start Creating
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="xl">
                Watch Demo
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
              Professional Pipeline, Zero Complexity
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to create blockbuster-quality content, 
              guided by AI at every step.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="panel p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Film className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Canon-First Workflow</h3>
              <p className="text-muted-foreground">
                Build your production bible with characters, locations, and style guides 
                before generating a single frame.
              </p>
            </div>

            <div className="panel p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-qc-pass/10 flex items-center justify-center mx-auto mb-6">
                <Shield className="w-7 h-7 text-qc-pass" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Quality Gates</h3>
              <p className="text-muted-foreground">
                Automatic QC checks for continuity, audio, and rhythm. 
                Nothing exports until it meets professional standards.
              </p>
            </div>

            <div className="panel p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-info/10 flex items-center justify-center mx-auto mb-6">
                <Users className="w-7 h-7 text-info" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Studio Collaboration</h3>
              <p className="text-muted-foreground">
                Built-in roles, approvals, dailies review, and task management 
                for teams of any size.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Ready to Create Your First Production?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Start with our guided wizard and have your first scene rendering in minutes.
          </p>
          <Button variant="gold" size="xl" asChild>
            <Link to="/auth">
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clapperboard className="w-4 h-4" />
            <span className="text-sm">CINEFORGE Studio</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 Blockbuster Factory
          </p>
        </div>
      </footer>
    </div>
  );
}

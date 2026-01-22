/**
 * Dailies Page - SIMPLIFIED
 * dailies_sessions, dailies_items, and frame_notes tables removed.
 * This page is deprecated and shows placeholder content.
 */

import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { Film, Info } from 'lucide-react';

export default function Dailies() {
  const { t } = useLanguage();

  return (
    <AppLayout>
      <PageHeader
        title={t.dailies.title}
        description={t.dailies.subtitle}
      />
      
      <div className="p-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Sistema de Dailies
            </CardTitle>
            <CardDescription>
              Revisión de tomas y selección de mejores versiones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="mb-2">
                  El sistema de Dailies está siendo rediseñado para una mejor experiencia.
                </p>
                <p>
                  Por ahora, puedes revisar y aceptar tus renders directamente desde 
                  la vista de Escenas de cada proyecto.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

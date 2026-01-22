/**
 * Página Principal: Sistema Editorial MVP
 * SIMPLIFIED - editorial_* tables removed
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Construction } from 'lucide-react';

export default function EditorialWorkspace() {
  const navigate = useNavigate();

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Editorial Workspace</h1>
          <p className="text-muted-foreground">Sistema de edición de contenido</p>
        </div>
      </div>

      {/* Placeholder */}
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <Construction className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <CardTitle>En Desarrollo</CardTitle>
          <CardDescription>
            El sistema Editorial está siendo migrado al sistema de proyectos principal.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Mientras tanto, puedes gestionar tus personajes, locaciones y escenas
            directamente desde la vista de proyecto.
          </p>
          <Button onClick={() => navigate('/projects')}>
            Ir a Proyectos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

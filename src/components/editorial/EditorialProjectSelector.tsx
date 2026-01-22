/**
 * Pantalla: Selector/Creador de Proyecto Editorial MVP
 * NOTE: editorial_projects table removed. This component is deprecated.
 * Redirects to main projects page.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function EditorialProjectSelector() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to main projects since editorial_projects table was removed
    navigate('/projects');
  }, [navigate]);

  return (
    <div className="container max-w-4xl py-8">
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Redirigiendo a proyectos...</p>
        </CardContent>
      </Card>
    </div>
  );
}

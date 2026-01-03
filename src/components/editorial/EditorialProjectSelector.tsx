/**
 * Pantalla: Selector/Creador de Proyecto Editorial MVP
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, FolderOpen, Compass, Factory } from 'lucide-react';
import { useEditorialMVP } from '@/hooks/useEditorialMVP';
import type { EditorialProjectPhase } from '@/lib/editorialMVPTypes';

export function EditorialProjectSelector() {
  const navigate = useNavigate();
  const { projects, createProject, isLoading } = useEditorialMVP();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhase, setNewPhase] = useState<EditorialProjectPhase>('exploracion');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await createProject(newName.trim(), newPhase);
      if (id) {
        navigate(`/editorial/${id}/assets`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (id: string) => {
    navigate(`/editorial/${id}/assets`);
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Sistema Editorial</h1>
        <p className="text-muted-foreground">
          Selecciona un proyecto existente o crea uno nuevo para comenzar.
        </p>
      </div>

      {/* Crear nuevo proyecto */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nuevo Proyecto
          </CardTitle>
          <CardDescription>
            Inicia un nuevo proyecto con el sistema editorial jerárquico
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showCreate ? (
            <Button onClick={() => setShowCreate(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Crear Proyecto
            </Button>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="project-name">Nombre del proyecto</Label>
                <Input
                  id="project-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Mi proyecto creativo..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Fase inicial</Label>
                <RadioGroup
                  value={newPhase}
                  onValueChange={(v) => setNewPhase(v as EditorialProjectPhase)}
                  className="mt-2"
                >
                  <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="exploracion" id="phase-exp" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="phase-exp" className="flex items-center gap-2 cursor-pointer">
                        <Compass className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Exploración</span>
                        <Badge variant="secondary" className="ml-2">Recomendado</Badge>
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Mayor tolerancia. Ideal para experimentar y definir la dirección creativa.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="produccion" id="phase-prod" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="phase-prod" className="flex items-center gap-2 cursor-pointer">
                        <Factory className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">Producción</span>
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Control estricto. Para proyectos con identidad visual y narrativa definida.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                  {creating ? 'Creando...' : 'Crear Proyecto'}
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Proyectos existentes */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Proyectos Existentes
        </h2>

        {isLoading ? (
          <p className="text-muted-foreground">Cargando proyectos...</p>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No tienes proyectos aún. Crea uno para comenzar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handleSelect(project.id)}
              >
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Actualizado: {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={project.phase === 'exploracion' ? 'secondary' : 'default'}>
                    {project.phase === 'exploracion' ? (
                      <><Compass className="h-3 w-3 mr-1" /> Exploración</>
                    ) : (
                      <><Factory className="h-3 w-3 mr-1" /> Producción</>
                    )}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

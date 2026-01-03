/**
 * Pantalla: Gestión de Assets (Personajes y Locaciones)
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, User, MapPin, Pencil, Trash2, Lock, X } from 'lucide-react';
import type { AssetCharacter, AssetLocation } from '@/lib/editorialMVPTypes';

interface AssetsManagerProps {
  characters: AssetCharacter[];
  locations: AssetLocation[];
  onCreateCharacter: (name: string, traitsText: string, fixedTraits: string[], referenceImageUrl?: string) => Promise<void>;
  onUpdateCharacter: (id: string, updates: Partial<Pick<AssetCharacter, 'name' | 'traitsText' | 'fixedTraits' | 'referenceImageUrl'>>) => Promise<void>;
  onDeleteCharacter: (id: string) => Promise<void>;
  onCreateLocation: (name: string, traitsText: string, fixedElements: string[], referenceImageUrl?: string) => Promise<void>;
  onUpdateLocation: (id: string, updates: Partial<Pick<AssetLocation, 'name' | 'traitsText' | 'fixedElements' | 'referenceImageUrl'>>) => Promise<void>;
  onDeleteLocation: (id: string) => Promise<void>;
}

export function AssetsManager({
  characters,
  locations,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onCreateLocation,
  onUpdateLocation,
  onDeleteLocation
}: AssetsManagerProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Assets del Proyecto</h2>
        <p className="text-muted-foreground">
          Define los personajes y locaciones que usarás en las generaciones.
        </p>
      </div>

      <Tabs defaultValue="characters">
        <TabsList>
          <TabsTrigger value="characters" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Personajes ({characters.length})
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Locaciones ({locations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="characters" className="mt-4">
          <CharactersList
            characters={characters}
            onCreate={onCreateCharacter}
            onUpdate={onUpdateCharacter}
            onDelete={onDeleteCharacter}
          />
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <LocationsList
            locations={locations}
            onCreate={onCreateLocation}
            onUpdate={onUpdateLocation}
            onDelete={onDeleteLocation}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Lista de personajes
function CharactersList({
  characters,
  onCreate,
  onUpdate,
  onDelete
}: {
  characters: AssetCharacter[];
  onCreate: AssetsManagerProps['onCreateCharacter'];
  onUpdate: AssetsManagerProps['onUpdateCharacter'];
  onDelete: AssetsManagerProps['onDeleteCharacter'];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Añadir Personaje
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Personaje</DialogTitle>
            <DialogDescription>
              Define las características visuales y los rasgos fijos del personaje.
            </DialogDescription>
          </DialogHeader>
          <CharacterForm
            onSubmit={async (data) => {
              await onCreate(data.name, data.traitsText, data.fixedTraits, data.referenceImageUrl);
              setDialogOpen(false);
            }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {characters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay personajes definidos. Añade uno para comenzar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {characters.map((char) => (
            <Card key={char.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {char.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {char.traitsText}
                    </p>
                    {char.fixedTraits.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {char.fixedTraits.map((trait, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            {trait}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={editingId === char.id} onOpenChange={(open) => setEditingId(open ? char.id : null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Editar Personaje</DialogTitle>
                        </DialogHeader>
                        <CharacterForm
                          initial={char}
                          onSubmit={async (data) => {
                            await onUpdate(char.id, data);
                            setEditingId(null);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar personaje?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. El personaje "{char.name}" será eliminado permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(char.id)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Formulario de personaje
function CharacterForm({
  initial,
  onSubmit,
  onCancel
}: {
  initial?: AssetCharacter;
  onSubmit: (data: { name: string; traitsText: string; fixedTraits: string[]; referenceImageUrl?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [traitsText, setTraitsText] = useState(initial?.traitsText || '');
  const [fixedTraitsInput, setFixedTraitsInput] = useState(initial?.fixedTraits.join(', ') || '');
  const [referenceImageUrl, setReferenceImageUrl] = useState(initial?.referenceImageUrl || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !traitsText.trim()) return;
    
    setSubmitting(true);
    try {
      const fixedTraits = fixedTraitsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      await onSubmit({
        name: name.trim(),
        traitsText: traitsText.trim(),
        fixedTraits,
        referenceImageUrl: referenceImageUrl.trim() || undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="char-name">Nombre</Label>
        <Input
          id="char-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Elena García"
          required
        />
      </div>

      <div>
        <Label htmlFor="char-traits">Descripción visual</Label>
        <Textarea
          id="char-traits"
          value={traitsText}
          onChange={(e) => setTraitsText(e.target.value)}
          placeholder="Describe las características físicas, vestimenta típica, rasgos distintivos..."
          rows={4}
          required
        />
      </div>

      <div>
        <Label htmlFor="char-fixed">
          Rasgos fijos (bloqueados)
          <span className="text-muted-foreground font-normal ml-2">Separados por comas</span>
        </Label>
        <Input
          id="char-fixed"
          value={fixedTraitsInput}
          onChange={(e) => setFixedTraitsInput(e.target.value)}
          placeholder="Ej: ojos verdes, cabello negro corto, cicatriz en ceja izquierda"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Estos rasgos se incluirán siempre y el sistema advertirá si intentas cambiarlos.
        </p>
      </div>

      <div>
        <Label htmlFor="char-ref">URL de imagen de referencia (opcional)</Label>
        <Input
          id="char-ref"
          value={referenceImageUrl}
          onChange={(e) => setReferenceImageUrl(e.target.value)}
          placeholder="https://..."
          type="url"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || !name.trim() || !traitsText.trim()}>
          {submitting ? 'Guardando...' : (initial ? 'Guardar Cambios' : 'Crear Personaje')}
        </Button>
      </div>
    </form>
  );
}

// Lista de locaciones (similar a personajes)
function LocationsList({
  locations,
  onCreate,
  onUpdate,
  onDelete
}: {
  locations: AssetLocation[];
  onCreate: AssetsManagerProps['onCreateLocation'];
  onUpdate: AssetsManagerProps['onUpdateLocation'];
  onDelete: AssetsManagerProps['onDeleteLocation'];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Añadir Locación
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Locación</DialogTitle>
            <DialogDescription>
              Define las características del espacio y los elementos fijos.
            </DialogDescription>
          </DialogHeader>
          <LocationForm
            onSubmit={async (data) => {
              await onCreate(data.name, data.traitsText, data.fixedElements, data.referenceImageUrl);
              setDialogOpen(false);
            }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {locations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay locaciones definidas. Añade una para comenzar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {locations.map((loc) => (
            <Card key={loc.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {loc.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {loc.traitsText}
                    </p>
                    {loc.fixedElements.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {loc.fixedElements.map((elem, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            {elem}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={editingId === loc.id} onOpenChange={(open) => setEditingId(open ? loc.id : null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Editar Locación</DialogTitle>
                        </DialogHeader>
                        <LocationForm
                          initial={loc}
                          onSubmit={async (data) => {
                            await onUpdate(loc.id, data);
                            setEditingId(null);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar locación?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. La locación "{loc.name}" será eliminada permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(loc.id)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Formulario de locación
function LocationForm({
  initial,
  onSubmit,
  onCancel
}: {
  initial?: AssetLocation;
  onSubmit: (data: { name: string; traitsText: string; fixedElements: string[]; referenceImageUrl?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [traitsText, setTraitsText] = useState(initial?.traitsText || '');
  const [fixedElementsInput, setFixedElementsInput] = useState(initial?.fixedElements.join(', ') || '');
  const [referenceImageUrl, setReferenceImageUrl] = useState(initial?.referenceImageUrl || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !traitsText.trim()) return;
    
    setSubmitting(true);
    try {
      const fixedElements = fixedElementsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      await onSubmit({
        name: name.trim(),
        traitsText: traitsText.trim(),
        fixedElements,
        referenceImageUrl: referenceImageUrl.trim() || undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="loc-name">Nombre</Label>
        <Input
          id="loc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Café del Centro"
          required
        />
      </div>

      <div>
        <Label htmlFor="loc-traits">Descripción del espacio</Label>
        <Textarea
          id="loc-traits"
          value={traitsText}
          onChange={(e) => setTraitsText(e.target.value)}
          placeholder="Describe la arquitectura, iluminación, mobiliario, ambiente..."
          rows={4}
          required
        />
      </div>

      <div>
        <Label htmlFor="loc-fixed">
          Elementos fijos (bloqueados)
          <span className="text-muted-foreground font-normal ml-2">Separados por comas</span>
        </Label>
        <Input
          id="loc-fixed"
          value={fixedElementsInput}
          onChange={(e) => setFixedElementsInput(e.target.value)}
          placeholder="Ej: ventanal grande, barra de madera oscura, lámparas de latón"
        />
      </div>

      <div>
        <Label htmlFor="loc-ref">URL de imagen de referencia (opcional)</Label>
        <Input
          id="loc-ref"
          value={referenceImageUrl}
          onChange={(e) => setReferenceImageUrl(e.target.value)}
          placeholder="https://..."
          type="url"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || !name.trim() || !traitsText.trim()}>
          {submitting ? 'Guardando...' : (initial ? 'Guardar Cambios' : 'Crear Locación')}
        </Button>
      </div>
    </form>
  );
}

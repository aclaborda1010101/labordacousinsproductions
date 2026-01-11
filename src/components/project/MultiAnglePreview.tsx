/**
 * MultiAnglePreview - Preview dialog for multi-angle generation
 * 
 * Shows 4 AI-generated angle variants with:
 * - Reference image thumbnail
 * - Editable descriptions
 * - Checkbox selection for which to generate
 * - Generate button to create selected variants
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Camera, Sparkles, Edit2, Check, X, RotateCcw } from 'lucide-react';

export interface AngleVariant {
  id: string;
  angleIndex: number;
  requestedAngle: string;
  description: string;
  previewPrompt: string;
}

interface MultiAnglePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  referenceImageUrl: string;
  entityName: string;
  entityType: 'character' | 'location' | 'scene' | 'keyframe';
  variants: AngleVariant[];
  isLoading?: boolean;
  onGenerate: (selectedVariants: AngleVariant[]) => void;
  onRegenerate?: () => void;
}

export default function MultiAnglePreview({
  isOpen,
  onClose,
  referenceImageUrl,
  entityName,
  entityType,
  variants,
  isLoading = false,
  onGenerate,
  onRegenerate,
}: MultiAnglePreviewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(variants.map(v => v.id)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedDescriptions, setEditedDescriptions] = useState<Record<string, string>>({});

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => setSelectedIds(new Set(variants.map(v => v.id)));
  const selectNone = () => setSelectedIds(new Set());

  const handleEdit = (id: string, description: string) => {
    setEditedDescriptions(prev => ({ ...prev, [id]: description }));
  };

  const getDescription = (variant: AngleVariant) => {
    return editedDescriptions[variant.id] ?? variant.description;
  };

  const handleGenerate = () => {
    const selectedVariants = variants
      .filter(v => selectedIds.has(v.id))
      .map(v => ({
        ...v,
        description: getDescription(v),
      }));
    onGenerate(selectedVariants);
  };

  const entityTypeLabels: Record<string, string> = {
    character: 'Personaje',
    location: 'Localización',
    scene: 'Escena',
    keyframe: 'Keyframe',
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Multi-Ángulo: {entityName}
          </DialogTitle>
          <DialogDescription>
            Previsualiza y edita las variantes de ángulo antes de generar
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <div>
                <p className="font-medium">Generando descripciones de ángulos...</p>
                <p className="text-sm text-muted-foreground">Analizando imagen de referencia con IA</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Reference Image */}
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-background border flex-shrink-0">
                <img
                  src={referenceImageUrl}
                  alt="Referencia"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <Badge variant="secondary" className="mb-1">
                  {entityTypeLabels[entityType] || entityType}
                </Badge>
                <h3 className="font-medium truncate">{entityName}</h3>
                <p className="text-sm text-muted-foreground">
                  {variants.length} ángulos generados • {selectedIds.size} seleccionados
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Todos
                </Button>
                <Button variant="outline" size="sm" onClick={selectNone}>
                  Ninguno
                </Button>
                {onRegenerate && (
                  <Button variant="outline" size="sm" onClick={onRegenerate}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Regenerar
                  </Button>
                )}
              </div>
            </div>

            {/* Angle Variants */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                {variants.map((variant) => {
                  const isSelected = selectedIds.has(variant.id);
                  const isEditing = editingId === variant.id;
                  const description = getDescription(variant);

                  return (
                    <Card
                      key={variant.id}
                      className={`transition-all ${
                        isSelected ? 'ring-2 ring-primary' : 'opacity-60'
                      }`}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelection(variant.id)}
                            />
                            <Badge variant="outline">Ángulo {variant.angleIndex}</Badge>
                          </div>
                          {!isEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingId(variant.id)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {/* Requested Angle */}
                        <p className="text-xs text-muted-foreground">
                          {variant.requestedAngle}
                        </p>

                        {/* Description */}
                        {isEditing ? (
                          <div className="space-y-2">
                            <Textarea
                              value={description}
                              onChange={(e) => handleEdit(variant.id, e.target.value)}
                              rows={4}
                              className="text-sm"
                              placeholder="Descripción del ángulo..."
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditedDescriptions(prev => {
                                    const next = { ...prev };
                                    delete next[variant.id];
                                    return next;
                                  });
                                  setEditingId(null);
                                }}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Guardar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={selectedIds.size === 0}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generar {selectedIds.size} variantes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

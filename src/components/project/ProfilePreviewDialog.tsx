/**
 * ProfilePreviewDialog - Preview generated profile before image generation
 * Allows users to edit the description if they don't like the auto-generated one
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Edit3, Check, X } from 'lucide-react';

interface ProfilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  entityType: 'location' | 'character';
  generatedDescription: string;
  profileDetails?: {
    style?: string;
    timeOfDay?: string;
    locationType?: string;
    characterRole?: string;
  };
  isLoading?: boolean;
  onConfirm: (description: string) => void;
  onCancel: () => void;
  onRegenerate?: () => void;
}

export default function ProfilePreviewDialog({
  open,
  onOpenChange,
  entityName,
  entityType,
  generatedDescription,
  profileDetails,
  isLoading,
  onConfirm,
  onCancel,
  onRegenerate,
}: ProfilePreviewDialogProps) {
  const [editedDescription, setEditedDescription] = useState(generatedDescription);
  const [isEditing, setIsEditing] = useState(false);

  // Update editedDescription when generatedDescription changes
  const handleDescriptionChange = (value: string) => {
    setEditedDescription(value);
  };

  // Reset when dialog opens with new description
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setEditedDescription(generatedDescription);
      setIsEditing(false);
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = () => {
    onConfirm(editedDescription);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Perfil Generado: {entityName}
          </DialogTitle>
          <DialogDescription>
            Revisa el perfil generado automáticamente. Puedes editarlo antes de generar la imagen.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generando perfil con IA...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Profile details badges */}
            {profileDetails && (
              <div className="flex flex-wrap gap-2">
                {profileDetails.style && (
                  <Badge variant="secondary">{profileDetails.style}</Badge>
                )}
                {profileDetails.timeOfDay && (
                  <Badge variant="outline">{profileDetails.timeOfDay}</Badge>
                )}
                {profileDetails.locationType && (
                  <Badge variant="outline">{profileDetails.locationType}</Badge>
                )}
                {profileDetails.characterRole && (
                  <Badge variant="outline">{profileDetails.characterRole}</Badge>
                )}
              </div>
            )}

            {/* Description preview/edit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Descripción para generación</Label>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>

              {isEditing ? (
                <Textarea
                  value={editedDescription}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                  placeholder="Describe el aspecto visual..."
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {editedDescription || generatedDescription || 'Sin descripción generada'}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:justify-between">
          <div className="flex gap-2">
            {onRegenerate && !isLoading && (
              <Button variant="outline" onClick={onRegenerate}>
                <Sparkles className="w-4 h-4 mr-2" />
                Regenerar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleConfirm} disabled={isLoading || !editedDescription.trim()}>
              <Check className="w-4 h-4 mr-2" />
              Generar Imagen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Star } from 'lucide-react';

interface SetCanonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  imageUrl?: string;
  outputUrl?: string; // Alias for imageUrl
  projectId: string;
  defaultAssetType?: AssetType;
  defaultName?: string;
  onSuccess?: () => void;
  onSaved?: (canonAssetId: string) => void;
}

type AssetType = 'character' | 'location' | 'style';

export default function SetCanonModal({
  open,
  onOpenChange,
  runId,
  imageUrl,
  outputUrl,
  projectId,
  defaultAssetType,
  defaultName,
  onSuccess,
  onSaved
}: SetCanonModalProps) {
  const resolvedImageUrl = imageUrl || outputUrl || '';
  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType || 'character');
  const [name, setName] = useState(defaultName || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      // Insert new canon asset (trigger will deactivate previous if exists)
      const { data: insertedCanon, error } = await supabase
        .from('canon_assets')
        .insert({
          project_id: projectId,
          asset_type: assetType,
          name: name.trim(),
          run_id: runId,
          image_url: resolvedImageUrl,
          notes: notes.trim() || null,
          is_active: true
        })
        .select('id')
        .single();

      if (error) throw error;

      // Also mark the run as canon
      await supabase
        .from('generation_runs')
        .update({ is_canon: true })
        .eq('id', runId);

      toast.success(`${assetType} "${name}" establecido como aprobado ⭐`);
      onOpenChange(false);
      onSuccess?.();
      onSaved?.(insertedCanon.id);
      
      // Reset form
      setName(defaultName || '');
      setNotes('');
      setAssetType(defaultAssetType || 'character');
    } catch (error) {
      console.error('Error setting canon:', error);
      toast.error('Error al establecer como aprobado');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Establecer como Aprobado
          </DialogTitle>
          <DialogDescription>
            Este asset se usará como referencia oficial en futuras generaciones.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
        {/* Preview */}
          {resolvedImageUrl && (
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              <img 
                src={resolvedImageUrl} 
                alt="Canon preview" 
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {/* Asset Type */}
          <div className="grid gap-2">
            <Label htmlFor="asset-type">Tipo de Asset</Label>
            <Select value={assetType} onValueChange={(v) => setAssetType(v as AssetType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="character">Personaje</SelectItem>
                <SelectItem value="location">Localización</SelectItem>
                <SelectItem value="style">Estilo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">
              Nombre {assetType === 'character' && '(ej: Elena, Marco)'}
              {assetType === 'location' && '(ej: Café Central, Oficina)'}
              {assetType === 'style' && '(ej: Noir, Saturado)'}
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                assetType === 'character' ? 'Nombre del personaje' :
                assetType === 'location' ? 'Nombre de la localización' :
                'Nombre del estilo'
              }
            />
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Rasgos distintivos, elementos a mantener..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Star className="w-4 h-4 mr-2" />
            )}
            Establecer Aprobado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Star, Check, X, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';

interface ReferenceAnchor {
  anchor_id: string;
  image_url: string;
  anchor_type: string;
  priority: number;
  usage_count: number;
  is_active?: boolean;
  approved?: boolean;
}

interface ReferenceAnchorManagerProps {
  characterId: string;
  projectId: string;
}

const ANCHOR_TYPES = [
  { value: 'identity_primary', label: 'Identity Primary', description: 'Main identity reference (highest priority)' },
  { value: 'identity_secondary', label: 'Identity Secondary', description: 'Secondary identity reference' },
  { value: 'expression_neutral', label: 'Neutral Expression', description: 'Neutral expression anchor' },
  { value: 'turnaround_front', label: 'Front View', description: 'Front view anchor' },
  { value: 'turnaround_side', label: 'Side View', description: 'Side view anchor' },
  { value: 'outfit_default', label: 'Default Outfit', description: 'Default outfit anchor' },
];

export function ReferenceAnchorManager({ characterId, projectId }: ReferenceAnchorManagerProps) {
  const [anchors, setAnchors] = useState<ReferenceAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    loadAnchors();
  }, [characterId]);

  const loadAnchors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reference_anchors')
        .select('*')
        .eq('character_id', characterId)
        .order('priority', { ascending: true });
      
      if (error) throw error;
      
      setAnchors((data || []).map(a => ({
        anchor_id: a.id,
        image_url: a.image_url,
        anchor_type: a.anchor_type,
        priority: a.priority,
        usage_count: a.usage_count,
        is_active: a.is_active,
        approved: a.approved
      })));
    } catch (err) {
      console.error('Error loading anchors:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: File, anchorType: string) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setUploading(anchorType);
    try {
      // 1. Upload to storage
      const fileName = `${characterId}/${anchorType}_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('character-packs')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('character-packs')
        .getPublicUrl(fileName);

      // 3. Create anchor
      const { error: insertError } = await supabase
        .from('reference_anchors')
        .insert({
          character_id: characterId,
          anchor_type: anchorType,
          image_url: publicUrl,
          priority: anchorType === 'identity_primary' ? 1 : 100,
          is_active: true,
          approved: true,
          approved_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      toast.success(`${anchorType.replace(/_/g, ' ')} anchor created!`);
      loadAnchors();
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload reference');
    } finally {
      setUploading(null);
    }
  };

  const handleSetPrimary = async (anchorId: string) => {
    try {
      // Set all anchors for this character to priority 100
      await supabase
        .from('reference_anchors')
        .update({ priority: 100 })
        .eq('character_id', characterId);

      // Set this anchor as priority 1
      await supabase
        .from('reference_anchors')
        .update({ priority: 1 })
        .eq('id', anchorId);

      toast.success('Primary anchor updated!');
      loadAnchors();
    } catch (err) {
      toast.error('Failed to update priority');
    }
  };

  const handleToggleActive = async (anchorId: string, currentActive: boolean) => {
    try {
      await supabase
        .from('reference_anchors')
        .update({ is_active: !currentActive })
        .eq('id', anchorId);

      loadAnchors();
    } catch (err) {
      toast.error('Failed to toggle anchor');
    }
  };

  const handleDelete = async (anchorId: string) => {
    try {
      await supabase
        .from('reference_anchors')
        .delete()
        .eq('id', anchorId);

      toast.success('Anchor deleted');
      loadAnchors();
    } catch (err) {
      toast.error('Failed to delete anchor');
    }
  };

  const getAnchorForType = (type: string) => 
    anchors.find(a => a.anchor_type === type);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Reference Anchors
        </CardTitle>
        <CardDescription>
          Upload reference images to guide generation with 70% influence
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Anchor Type Upload Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {ANCHOR_TYPES.map((type) => {
            const existingAnchor = getAnchorForType(type.value);
            const isUploading = uploading === type.value;

            return (
              <div key={type.value} className="relative">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => { fileInputRefs.current[type.value] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file, type.value);
                    e.target.value = '';
                  }}
                />
                
                {existingAnchor ? (
                  <div className="relative group">
                    <img
                      src={existingAnchor.image_url}
                      alt={type.label}
                      className="w-full h-32 object-cover rounded-lg border"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      {existingAnchor.priority !== 1 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSetPrimary(existingAnchor.anchor_id)}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleActive(existingAnchor.anchor_id, existingAnchor.is_active ?? true)}
                      >
                        {existingAnchor.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(existingAnchor.anchor_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute top-2 left-2 flex gap-1">
                      {existingAnchor.priority === 1 && (
                        <Badge className="bg-yellow-500 text-white">Primary</Badge>
                      )}
                      {!existingAnchor.is_active && (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="outline" className="bg-background/80 text-xs">
                        Used {existingAnchor.usage_count}x
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-32 flex flex-col gap-2"
                    onClick={() => fileInputRefs.current[type.value]?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Upload className="h-6 w-6" />
                    )}
                    <span className="text-xs text-center">{type.label}</span>
                  </Button>
                )}
                
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {type.description}
                </p>
              </div>
            );
          })}
        </div>

        {anchors.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No reference anchors yet.</p>
            <p className="text-sm">Upload images above to improve generation consistency.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

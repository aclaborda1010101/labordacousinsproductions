import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Check, X, Trash2, Loader2, Image as ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';

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
  onPackComplete?: (complete: boolean) => void;
}

// Identity Pack: exactly 4 canonical reference images
const IDENTITY_PACK_SLOTS = [
  { 
    value: 'face_front', 
    label: 'Face – Front', 
    category: 'PRIMARY IDENTITY',
    required: true,
    priority: 1,
    description: 'Frontal face portrait, neutral expression, eyes at camera',
    rules: [
      'Full face visible',
      'Hairline and hairstyle clearly visible',
      'Beard as final canonical version',
      'Soft, even lighting',
      'Plain, neutral background',
      'NO sunglasses, NO hats, NO strong expressions'
    ],
    purpose: 'Lock facial identity and hair'
  },
  { 
    value: 'face_side', 
    label: 'Face – Side Profile', 
    category: 'IDENTITY SECONDARY',
    required: true,
    priority: 2,
    description: 'Full side profile (90º), head straight, neutral expression',
    rules: [
      'Ear, nose, forehead clearly visible',
      'Same hairstyle and beard as frontal',
      'Same lighting and background style'
    ],
    purpose: 'Lock skull shape, nose, forehead, and jawline'
  },
  { 
    value: 'body_front', 
    label: 'Body – Front', 
    category: 'BODY CANON',
    required: true,
    priority: 3,
    description: 'Full body standing upright, facing camera',
    rules: [
      'Arms relaxed at sides',
      'Neutral posture',
      'Simple clothing (t-shirt + jeans preferred)',
      'No dramatic pose',
      'Plain background'
    ],
    purpose: 'Lock height, body proportions, and general build'
  },
  { 
    value: 'body_side', 
    label: 'Body – Side', 
    category: 'BODY SECONDARY',
    required: true,
    priority: 4,
    description: 'Full body side view, natural posture',
    rules: [
      'Same clothing as front body',
      'No exaggerated pose',
      'Same background and lighting'
    ],
    purpose: 'Lock body depth, posture, and silhouette'
  },
];

// DB constraint only allows legacy anchor_type values; map Identity Pack slots to them.
const IDENTITY_SLOT_TO_ANCHOR_TYPE: Record<string, string> = {
  face_front: 'identity_primary',
  face_side: 'identity_secondary',
  body_front: 'turnaround_front',
  body_side: 'turnaround_side',
};

export function ReferenceAnchorManager({ characterId, projectId, onPackComplete }: ReferenceAnchorManagerProps) {
  const [anchors, setAnchors] = useState<ReferenceAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    loadAnchors();
  }, [characterId]);

  // Check pack completeness and notify parent
  useEffect(() => {
    const completeSlots = IDENTITY_PACK_SLOTS.filter((slot) => {
      const dbType = IDENTITY_SLOT_TO_ANCHOR_TYPE[slot.value];
      return anchors.some((a) => a.anchor_type === dbType && a.is_active);
    });
    const isComplete = completeSlots.length === IDENTITY_PACK_SLOTS.length;
    onPackComplete?.(isComplete);
  }, [anchors, onPackComplete]);

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
        priority: a.priority ?? 100,
        usage_count: a.usage_count ?? 0,
        is_active: a.is_active,
        approved: a.approved
      })));
    } catch (err) {
      console.error('Error loading anchors:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: File, slotValue: string) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const slotConfig = IDENTITY_PACK_SLOTS.find((s) => s.value === slotValue);
    if (!slotConfig) return;

    const dbAnchorType = IDENTITY_SLOT_TO_ANCHOR_TYPE[slotValue];
    if (!dbAnchorType) {
      toast.error('Tipo de referencia no soportado');
      return;
    }

    setUploading(slotValue);
    try {
      // Delete any existing anchors of this DB type first (avoid duplicates)
      const { error: deleteError } = await supabase
        .from('reference_anchors')
        .delete()
        .eq('character_id', characterId)
        .eq('anchor_type', dbAnchorType);

      if (deleteError) throw deleteError;

      // 1. Upload to storage
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${projectId}/${characterId}/${slotValue}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('character-references')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('character-references')
        .getPublicUrl(fileName);

      // 3. Create anchor with correct priority
      const { error: insertError } = await supabase
        .from('reference_anchors')
        .insert({
          character_id: characterId,
          anchor_type: dbAnchorType,
          image_url: publicUrl,
          priority: slotConfig.priority,
          is_active: true,
          approved: true,
          approved_at: new Date().toISOString(),
          metadata: {
            slot: slotValue,
            source: 'user_upload',
            type: slotValue.startsWith('face_') ? 'face' : 'body',
          },
        });

      if (insertError) throw insertError;

      toast.success(`${slotConfig.label} uploaded successfully!`);
      loadAnchors();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err?.message || 'Failed to upload reference');
    } finally {
      setUploading(null);
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

  const getAnchorForSlot = (slotValue: string) => {
    const dbType = IDENTITY_SLOT_TO_ANCHOR_TYPE[slotValue];
    return anchors.find((a) => a.anchor_type === dbType);
  };

  const completedCount = IDENTITY_PACK_SLOTS.filter((slot) => {
    const dbType = IDENTITY_SLOT_TO_ANCHOR_TYPE[slot.value];
    return anchors.some((a) => a.anchor_type === dbType && a.is_active);
  }).length;

  const isPackComplete = completedCount === IDENTITY_PACK_SLOTS.length;

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Identity Pack
            </CardTitle>
            <CardDescription>
              Upload exactly 4 canonical reference images to lock character identity
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isPackComplete ? 'default' : 'secondary'}
              className={isPackComplete ? 'bg-green-600' : ''}
            >
              {completedCount}/{IDENTITY_PACK_SLOTS.length}
            </Badge>
            {isPackComplete && (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Validation Alert */}
        {!isPackComplete && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600">Identity Pack Incomplete</p>
              <p className="text-muted-foreground mt-1">
                Upload all 4 reference images before generating. These become the ONLY source of truth for this character.
              </p>
            </div>
          </div>
        )}

        {/* 2x2 Grid for Identity Pack */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {IDENTITY_PACK_SLOTS.map((slot) => {
            const existingAnchor = getAnchorForSlot(slot.value);
            const isUploading = uploading === slot.value;

            return (
              <div key={slot.value} className="space-y-2">
                {/* Slot Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="outline" className="text-xs mb-1">
                      {slot.category}
                    </Badge>
                    <h4 className="font-medium">{slot.label}</h4>
                  </div>
                  {existingAnchor && (
                    <Badge 
                      variant={existingAnchor.is_active ? 'default' : 'secondary'}
                      className={existingAnchor.is_active ? 'bg-green-600' : ''}
                    >
                      {existingAnchor.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  )}
                </div>

                {/* Image Upload Area */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => { fileInputRefs.current[slot.value] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file, slot.value);
                    e.target.value = '';
                  }}
                />
                
                {existingAnchor ? (
                  <div className="relative group">
                    <img
                      src={existingAnchor.image_url}
                      alt={slot.label}
                      className="w-full h-48 object-cover rounded-lg border-2 border-border"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => fileInputRefs.current[slot.value]?.click()}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Replace
                      </Button>
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
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-48 flex flex-col gap-3 border-dashed border-2"
                    onClick={() => fileInputRefs.current[slot.value]?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Click to upload</span>
                      </>
                    )}
                  </Button>
                )}

                {/* Slot Description & Rules */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{slot.description}</p>
                  <details className="cursor-pointer">
                    <summary className="text-primary hover:underline">View requirements</summary>
                    <ul className="mt-2 ml-4 space-y-0.5 list-disc">
                      {slot.rules.map((rule, i) => (
                        <li key={i}>{rule}</li>
                      ))}
                    </ul>
                    <p className="mt-2 font-medium text-foreground/80">Purpose: {slot.purpose}</p>
                  </details>
                </div>
              </div>
            );
          })}
        </div>

        {/* Critical Rules Summary */}
        <div className="p-4 rounded-lg bg-muted/50 border space-y-2 text-xs">
          <p className="font-medium text-sm">Critical Rules</p>
          <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
            <li>All images must depict the <strong>SAME PERSON</strong></li>
            <li>All images must be neutral and non-artistic</li>
            <li>Haircut and beard must be consistent across all 4 images</li>
            <li>Clothing in body shots must be identical</li>
            <li>NO outdoor photos, NO cinematic lighting, NO expressive poses</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

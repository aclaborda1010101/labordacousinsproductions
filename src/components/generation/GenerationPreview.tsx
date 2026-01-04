import { Badge } from '@/components/ui/badge';
import { Check, Star, Loader2, AlertCircle } from 'lucide-react';
import type { GenerationStatus } from './GenerationActionBar';

interface GenerationPreviewProps {
  imageUrl: string | null;
  altText: string;
  status: GenerationStatus;
  isAccepted: boolean;
  isCanon: boolean;
  aspectRatio?: 'square' | 'video' | 'portrait';
  className?: string;
}

export function GenerationPreview({
  imageUrl,
  altText,
  status,
  isAccepted,
  isCanon,
  aspectRatio = 'square',
  className = '',
}: GenerationPreviewProps) {
  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
  };

  const isGenerating = status === 'generating';
  const isError = status === 'error';

  if (!imageUrl && !isGenerating) {
    return null;
  }

  return (
    <div className={`relative ${aspectClasses[aspectRatio]} rounded-lg overflow-hidden bg-muted ${className}`}>
      {isGenerating ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="w-full h-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
      ) : imageUrl ? (
        <img 
          src={imageUrl} 
          alt={altText}
          className="w-full h-full object-cover"
        />
      ) : null}

      {/* Status badges overlay */}
      <div className="absolute top-2 right-2 flex gap-1">
        {isCanon && (
          <Badge className="bg-amber-500 gap-1">
            <Star className="w-3 h-3" />
          </Badge>
        )}
        {isAccepted && !isCanon && (
          <Badge className="bg-green-600 gap-1">
            <Check className="w-3 h-3" />
          </Badge>
        )}
      </div>
    </div>
  );
}

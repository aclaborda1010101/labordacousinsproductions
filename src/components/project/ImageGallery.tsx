import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, ZoomIn, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: string[];
  labels?: string[];
  className?: string;
  thumbnailSize?: 'sm' | 'md' | 'lg';
}

export function ImageGallery({ images, labels, className, thumbnailSize = 'md' }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const thumbnailSizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-28 h-28',
  };

  const handlePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') setSelectedIndex(null);
  };

  const handleDownload = (url: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `image_${labels?.[index] || index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {images.map((url, index) => (
          <button
            key={index}
            onClick={() => setSelectedIndex(index)}
            className={cn(
              thumbnailSizeClasses[thumbnailSize],
              'rounded-lg overflow-hidden border border-border hover:border-primary transition-all group relative'
            )}
          >
            <img
              src={url}
              alt={labels?.[index] || `Image ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <ZoomIn className="w-4 h-4 text-white" />
            </div>
            {labels?.[index] && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] py-0.5 text-center truncate">
                {labels[index]}
              </div>
            )}
          </button>
        ))}
      </div>

      <Dialog open={selectedIndex !== null} onOpenChange={() => setSelectedIndex(null)}>
        <DialogContent 
          className="max-w-4xl bg-black/95 border-none p-0"
          onKeyDown={handleKeyDown}
        >
          <div className="relative">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={() => setSelectedIndex(null)}
            >
              <X className="w-5 h-5" />
            </Button>

            {/* Download button */}
            {selectedIndex !== null && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-14 z-10 text-white hover:bg-white/20"
                onClick={() => handleDownload(images[selectedIndex], selectedIndex)}
              >
                <Download className="w-5 h-5" />
              </Button>
            )}

            {/* Navigation */}
            {selectedIndex !== null && selectedIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
                onClick={handlePrev}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>
            )}
            {selectedIndex !== null && selectedIndex < images.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
                onClick={handleNext}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            )}

            {/* Main image */}
            {selectedIndex !== null && (
              <div className="flex flex-col items-center py-8 px-16">
                <img
                  src={images[selectedIndex]}
                  alt={labels?.[selectedIndex] || `Image ${selectedIndex + 1}`}
                  className="max-h-[70vh] object-contain rounded-lg"
                />
                {labels?.[selectedIndex] && (
                  <p className="text-white mt-4 text-lg font-medium">
                    {labels[selectedIndex]}
                  </p>
                )}
                <p className="text-gray-400 mt-2 text-sm">
                  {selectedIndex + 1} / {images.length}
                </p>
              </div>
            )}

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex justify-center gap-2 pb-6 px-4">
                {images.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={cn(
                      'w-12 h-12 rounded overflow-hidden border-2 transition-all',
                      selectedIndex === index ? 'border-primary' : 'border-transparent opacity-50 hover:opacity-100'
                    )}
                  >
                    <img
                      src={url}
                      alt={labels?.[index] || `Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Columns, Play, Pause, RotateCcw, CheckCircle2, XCircle, Wrench, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Render {
  id: string;
  take_label: string;
  video_url: string | null;
  status: string;
  shot?: {
    shot_no: number;
    scene?: {
      slugline: string;
      scene_no: number;
    };
  };
}

interface DailiesItem {
  id: string;
  render_id: string;
  decision: 'SELECT' | 'FIX' | 'REJECT' | 'NONE';
  render?: Render;
}

interface RenderComparisonProps {
  items: DailiesItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectWinner: (itemId: string, decision: 'SELECT' | 'FIX' | 'REJECT') => void;
}

export function RenderComparison({ items, open, onOpenChange, onSelectWinner }: RenderComparisonProps) {
  const [leftItemId, setLeftItemId] = useState<string | null>(null);
  const [rightItemId, setRightItemId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  
  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);

  // Set default selections when items change
  useEffect(() => {
    if (items.length >= 2) {
      setLeftItemId(items[0].id);
      setRightItemId(items[1].id);
    } else if (items.length === 1) {
      setLeftItemId(items[0].id);
      setRightItemId(null);
    }
  }, [items]);

  const leftItem = items.find(i => i.id === leftItemId);
  const rightItem = items.find(i => i.id === rightItemId);

  const syncVideos = () => {
    if (leftVideoRef.current && rightVideoRef.current) {
      const leftTime = leftVideoRef.current.currentTime;
      rightVideoRef.current.currentTime = leftTime;
    }
  };

  const handlePlayPause = () => {
    if (playing) {
      leftVideoRef.current?.pause();
      rightVideoRef.current?.pause();
    } else {
      leftVideoRef.current?.play();
      rightVideoRef.current?.play();
    }
    setPlaying(!playing);
  };

  const handleReset = () => {
    if (leftVideoRef.current) leftVideoRef.current.currentTime = 0;
    if (rightVideoRef.current) rightVideoRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const handleTimeUpdate = () => {
    if (leftVideoRef.current) {
      setCurrentTime(leftVideoRef.current.currentTime);
    }
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'SELECT': return <Badge variant="pass">SELECT</Badge>;
      case 'FIX': return <Badge variant="pending">FIX</Badge>;
      case 'REJECT': return <Badge variant="fail">REJECT</Badge>;
      default: return null;
    }
  };

  const availableForRight = items.filter(i => i.id !== leftItemId);
  const availableForLeft = items.filter(i => i.id !== rightItemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns className="w-5 h-5" />
            Comparar Takes
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Video comparison area */}
          <div className="flex-1 grid grid-cols-2 gap-4">
            {/* Left video */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Select value={leftItemId || ''} onValueChange={setLeftItemId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar take" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForLeft.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        Take {item.render?.take_label} - Shot {item.render?.shot?.shot_no}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leftItem?.decision !== 'NONE' && getDecisionBadge(leftItem?.decision || '')}
              </div>
              <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
                {leftItem?.render?.video_url ? (
                  <video
                    ref={leftVideoRef}
                    src={leftItem.render.video_url}
                    className="w-full h-full object-contain"
                    muted={muted}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Play className="w-12 h-12 opacity-50" />
                  </div>
                )}
                <Badge className="absolute top-2 left-2 bg-background/80">A</Badge>
              </div>
              {/* Decision buttons for left */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={leftItem?.decision === 'SELECT' ? 'success' : 'outline'}
                  onClick={() => leftItem && onSelectWinner(leftItem.id, 'SELECT')}
                  className="flex-1"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  SELECT
                </Button>
                <Button
                  size="sm"
                  variant={leftItem?.decision === 'FIX' ? 'warning' : 'outline'}
                  onClick={() => leftItem && onSelectWinner(leftItem.id, 'FIX')}
                  className="flex-1"
                >
                  <Wrench className="w-4 h-4 mr-1" />
                  FIX
                </Button>
                <Button
                  size="sm"
                  variant={leftItem?.decision === 'REJECT' ? 'destructive' : 'outline'}
                  onClick={() => leftItem && onSelectWinner(leftItem.id, 'REJECT')}
                  className="flex-1"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  REJECT
                </Button>
              </div>
            </div>

            {/* Right video */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Select value={rightItemId || ''} onValueChange={setRightItemId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar take" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForRight.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        Take {item.render?.take_label} - Shot {item.render?.shot?.shot_no}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rightItem?.decision !== 'NONE' && getDecisionBadge(rightItem?.decision || '')}
              </div>
              <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
                {rightItem?.render?.video_url ? (
                  <video
                    ref={rightVideoRef}
                    src={rightItem.render.video_url}
                    className="w-full h-full object-contain"
                    muted={muted}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Play className="w-12 h-12 opacity-50" />
                  </div>
                )}
                <Badge className="absolute top-2 left-2 bg-background/80">B</Badge>
              </div>
              {/* Decision buttons for right */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={rightItem?.decision === 'SELECT' ? 'success' : 'outline'}
                  onClick={() => rightItem && onSelectWinner(rightItem.id, 'SELECT')}
                  className="flex-1"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  SELECT
                </Button>
                <Button
                  size="sm"
                  variant={rightItem?.decision === 'FIX' ? 'warning' : 'outline'}
                  onClick={() => rightItem && onSelectWinner(rightItem.id, 'FIX')}
                  className="flex-1"
                >
                  <Wrench className="w-4 h-4 mr-1" />
                  FIX
                </Button>
                <Button
                  size="sm"
                  variant={rightItem?.decision === 'REJECT' ? 'destructive' : 'outline'}
                  onClick={() => rightItem && onSelectWinner(rightItem.id, 'REJECT')}
                  className="flex-1"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  REJECT
                </Button>
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-4 p-4 bg-muted/30 rounded-lg">
            <Button variant="outline" size="icon" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button size="lg" onClick={handlePlayPause}>
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            <Button variant="outline" onClick={syncVideos}>
              Sincronizar
            </Button>
            <span className="text-sm text-muted-foreground ml-4">
              {currentTime.toFixed(1)}s
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

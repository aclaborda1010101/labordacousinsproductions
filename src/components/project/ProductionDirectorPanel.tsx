import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  X, 
  Trash2, 
  RotateCcw, 
  Sparkles,
  Zap,
  Brain,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProductionDirector, Message } from '@/hooks/useProductionDirector';
import { cn } from '@/lib/utils';

interface ProductionDirectorPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductionDirectorPanel({ 
  projectId, 
  isOpen, 
  onClose 
}: ProductionDirectorPanelProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    currentModel,
    sendMessage,
    clearHistory,
    retryLast,
  } = useProductionDirector({ projectId });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  const getModelBadge = (model?: string) => {
    if (!model) return null;
    const isPro = model.includes('pro');
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-[10px] px-1.5 py-0",
          isPro ? "border-amber-500/50 text-amber-500" : "border-blue-500/50 text-blue-500"
        )}
      >
        {isPro ? <Brain className="w-2.5 h-2.5 mr-0.5" /> : <Zap className="w-2.5 h-2.5 mr-0.5" />}
        {isPro ? 'Pro' : 'Flash'}
      </Badge>
    );
  };

  return (
    <div 
      className={cn(
        "fixed bottom-4 right-4 z-50 bg-background border rounded-xl shadow-2xl flex flex-col transition-all duration-300",
        isExpanded 
          ? "w-[600px] h-[80vh] max-h-[800px]" 
          : "w-[400px] h-[500px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Forge</h3>
          <p className="text-xs text-muted-foreground truncate">Director de Producción AI</p>
        </div>
        <div className="flex items-center gap-1">
          {currentModel && getModelBadge(currentModel)}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isExpanded ? 'Reducir' : 'Expandir'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={clearHistory}
                  disabled={messages.length === 0}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Limpiar historial</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground" />
            </div>
            <h4 className="font-medium mb-2">¿En qué puedo ayudarte?</h4>
            <p className="text-sm text-muted-foreground max-w-xs">
              Soy Forge, tu Director de Producción. Pregúntame sobre cinematografía, 
              narrativa, personajes o cualquier aspecto de tu proyecto.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {[
                '¿Qué lente para close-up?',
                'Analiza el arco de mi protagonista',
                'Sugerencias de iluminación',
              ].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setInput(suggestion);
                    textareaRef.current?.focus();
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble 
                key={message.id} 
                message={message} 
                isStreaming={isStreaming && message === messages[messages.length - 1]}
                getModelBadge={getModelBadge}
              />
            ))}
            {isLoading && !isStreaming && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="flex-1 bg-muted rounded-lg p-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <div className="flex items-center justify-between">
            <p className="text-xs text-destructive">{error}</p>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs"
              onClick={retryLast}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reintentar
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-muted/10">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta sobre tu proyecto..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || isLoading}
            className="shrink-0 h-11 w-11"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </form>
    </div>
  );
}

// Message Bubble Component
interface MessageBubbleProps {
  message: Message;
  isStreaming: boolean;
  getModelBadge: (model?: string) => React.ReactNode;
}

function MessageBubble({ message, isStreaming, getModelBadge }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      <div className={cn(
        "flex-1 rounded-lg p-3 max-w-[85%]",
        isUser 
          ? "bg-primary text-primary-foreground ml-auto" 
          : "bg-muted"
      )}>
        <div 
          className={cn(
            "text-sm prose prose-sm max-w-none",
            isUser ? "prose-invert" : "dark:prose-invert"
          )}
          dangerouslySetInnerHTML={{ 
            __html: formatMessage(message.content) 
          }}
        />
        {!isUser && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
            {getModelBadge(message.modelUsed)}
            {message.modelReason && (
              <span className="text-[10px] text-muted-foreground">
                {message.modelReason}
              </span>
            )}
            {isStreaming && (
              <span className="text-[10px] text-primary animate-pulse">
                Escribiendo...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Format message with markdown-like syntax
function formatMessage(content: string): string {
  if (!content) return '';
  
  return content
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Bullet points
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive li elements in ul
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="list-disc pl-4 my-2">$&</ul>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}

// Floating trigger button for when panel is closed
interface ProductionDirectorTriggerProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function ProductionDirectorTrigger({ onClick, hasUnread }: ProductionDirectorTriggerProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onClick}
            size="icon"
            className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full shadow-lg bg-gradient-to-br from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90"
          >
            <Sparkles className="w-6 h-6 text-primary-foreground" />
            {hasUnread && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-destructive rounded-full border-2 border-background" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Director de Producción AI</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ProductionDirectorPanel;

import { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(
  function PageHeader({ title, description, children, className }, ref) {
    return (
      <header 
        ref={ref}
        className={cn(
          "border-b border-border bg-card/50 backdrop-blur-sm shrink-0",
          "px-3 py-2 lg:px-6 lg:py-3 flex items-center justify-between gap-2",
          className
        )}
      >
        <div className="min-w-0 flex-shrink">
          <h1 className="text-sm lg:text-lg font-semibold text-foreground truncate">{title}</h1>
          {description && (
            <p className="text-[10px] lg:text-sm text-muted-foreground truncate">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-1.5 lg:gap-3 flex-shrink-0">
            {children}
          </div>
        )}
      </header>
    );
  }
);


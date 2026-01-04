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
          "px-4 py-3 lg:px-6 lg:h-16 lg:flex lg:items-center lg:justify-between",
          className
        )}
      >
        <div className="mb-2 lg:mb-0">
          <h1 className="text-base lg:text-lg font-semibold text-foreground">{title}</h1>
          {description && (
            <p className="text-xs lg:text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
            {children}
          </div>
        )}
      </header>
    );
  }
);


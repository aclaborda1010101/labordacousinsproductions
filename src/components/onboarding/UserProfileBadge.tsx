import React from 'react';
import { cn } from '@/lib/utils';
import { useUserProfileOptional, UserProfile } from '@/contexts/UserProfileContext';
import { USER_PROFILE_CONFIG } from '@/lib/userProfileTypes';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Settings2 } from 'lucide-react';

interface UserProfileBadgeProps {
  className?: string;
  compact?: boolean;
  allowChange?: boolean;
}

export function UserProfileBadge({ 
  className, 
  compact = false,
  allowChange = true 
}: UserProfileBadgeProps) {
  const profileContext = useUserProfileOptional();
  
  if (!profileContext || profileContext.isLoading) {
    return null;
  }

  const { effectiveProfile, setDeclaredProfile, confidence } = profileContext;
  const config = USER_PROFILE_CONFIG[effectiveProfile];

  const badge = (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-all',
        config.bgColor,
        config.borderColor,
        config.color,
        'border',
        allowChange && 'cursor-pointer hover:shadow-sm',
        className
      )}
    >
      <span className="text-base">{config.icon}</span>
      {!compact && <span>{config.shortLabel}</span>}
      {allowChange && <ChevronDown className="h-3 w-3 opacity-60" />}
    </div>
  );

  if (!allowChange) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground max-w-48">
              {config.description}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {badge}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            <span>Tu modo de trabajo</span>
          </div>

          <div className="space-y-1.5">
            {(Object.entries(USER_PROFILE_CONFIG) as [UserProfile, typeof USER_PROFILE_CONFIG[UserProfile]][]).map(
              ([profile, profileConfig]) => {
                const isActive = profile === effectiveProfile;
                return (
                  <button
                    key={profile}
                    onClick={() => setDeclaredProfile(profile)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-md transition-all text-left',
                      isActive
                        ? cn(profileConfig.bgColor, profileConfig.borderColor, 'border')
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <span className="text-xl">{profileConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={cn('font-medium', isActive && profileConfig.color)}>
                        {profileConfig.label}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {profileConfig.description}
                      </div>
                    </div>
                  </button>
                );
              }
            )}
          </div>

          {confidence > 0 && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              El sistema ha adaptado la interfaz basándose en tu comportamiento
              <span className="text-foreground font-medium"> ({Math.round(confidence * 100)}% de confianza)</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

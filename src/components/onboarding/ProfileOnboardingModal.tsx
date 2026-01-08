import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  ONBOARDING_QUESTIONS,
  USER_PROFILE_CONFIG,
  calculateProfileFromAnswers,
  UserProfile,
} from '@/lib/userProfileTypes';
import { CheckCircle2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface ProfileOnboardingModalProps {
  open: boolean;
  onComplete: (answers: Record<string, string>) => Promise<void>;
  onSkip?: () => void;
  showSkip?: boolean;
}

export function ProfileOnboardingModal({
  open,
  onComplete,
  onSkip,
  showSkip = true,
}: ProfileOnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isCompleting, setIsCompleting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [detectedProfile, setDetectedProfile] = useState<UserProfile>('ASSISTED');

  const totalSteps = ONBOARDING_QUESTIONS.length;
  const currentQuestion = ONBOARDING_QUESTIONS[currentStep];
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const handleSelectOption = (value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Calculate and show result
      const { profile } = calculateProfileFromAnswers(answers);
      setDetectedProfile(profile);
      setShowResult(true);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleConfirm = async () => {
    setIsCompleting(true);
    try {
      await onComplete(answers);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDirectSelect = async (profile: UserProfile) => {
    setIsCompleting(true);
    try {
      // Create minimal answers that would result in this profile
      const directAnswers: Record<string, string> = {
        experience: profile === 'ASSISTED' ? 'beginner' : 'professional',
        guidance: profile === 'ASSISTED' ? 'full' : 'minimal',
        complexity: profile === 'ASSISTED' ? 'simple' : 'complete',
      };
      await onComplete(directAnswers);
    } finally {
      setIsCompleting(false);
    }
  };

  const currentAnswer = answers[currentQuestion?.id];
  const profileConfig = USER_PROFILE_CONFIG[detectedProfile];

  if (showResult) {
    return (
      <Dialog open={open}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center">Tu perfil de experiencia</DialogTitle>
            <DialogDescription className="text-center">
              Basado en tus respuestas, hemos configurado el sistema para ti
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6 space-y-4">
            <div
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center text-4xl',
                profileConfig.bgColor,
                profileConfig.borderColor,
                'border-2'
              )}
            >
              {profileConfig.icon}
            </div>

            <div className="text-center space-y-1">
              <h3 className={cn('text-xl font-semibold', profileConfig.color)}>
                {profileConfig.label}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {profileConfig.description}
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
              <Sparkles className="h-4 w-4" />
              <span>El sistema se adaptará a tu nivel automáticamente</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={handleConfirm} disabled={isCompleting} className="w-full">
              {isCompleting ? 'Configurando...' : 'Comenzar'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowResult(false);
                setCurrentStep(0);
                setAnswers({});
              }}
              disabled={isCompleting}
              className="w-full text-muted-foreground"
            >
              Volver a responder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Personaliza tu experiencia</DialogTitle>
          <DialogDescription>
            Responde unas preguntas rápidas para que el sistema se adapte a ti
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Pregunta {currentStep + 1} de {totalSteps}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Question */}
        <div className="py-4 space-y-4">
          <h3 className="text-lg font-medium">{currentQuestion.question}</h3>

          <div className="space-y-2">
            {currentQuestion.options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelectOption(option.value)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-lg border transition-all',
                  'hover:border-primary/50 hover:bg-muted/50',
                  currentAnswer === option.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                      currentAnswer === option.value
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    )}
                  >
                    {currentAnswer === option.value && (
                      <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="font-medium">{option.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <div className="flex gap-2">
            {showSkip && onSkip && (
              <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
                Omitir
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!currentAnswer}
              className="gap-1"
            >
              {currentStep < totalSteps - 1 ? (
                <>
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                'Ver resultado'
              )}
            </Button>
          </div>
        </div>

        {/* Direct selection option - only 2 profiles now */}
        <div className="border-t pt-4 mt-2">
          <p className="text-sm text-muted-foreground text-center mb-3">
            O selecciona directamente tu perfil:
          </p>
          <div className="flex gap-2 justify-center">
            {(Object.entries(USER_PROFILE_CONFIG) as [UserProfile, typeof USER_PROFILE_CONFIG[UserProfile]][]).map(
              ([profile, config]) => (
                <Button
                  key={profile}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDirectSelect(profile)}
                  disabled={isCompleting}
                  className={cn('gap-1.5', config.borderColor)}
                >
                  <span>{config.icon}</span>
                  <span>{config.shortLabel}</span>
                </Button>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

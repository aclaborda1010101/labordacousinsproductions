-- Tabla para historial de conversaciones con Forge
CREATE TABLE public.forge_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  title TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Mensajes individuales de cada conversación
CREATE TABLE public.forge_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.forge_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_used TEXT,
  intent TEXT,
  action_executed JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Acciones ejecutadas por Forge
CREATE TABLE public.forge_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.forge_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.forge_messages(id),
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Preferencias y memoria del usuario con Forge
CREATE TABLE public.forge_user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  preferred_style TEXT,
  preferred_tone TEXT DEFAULT 'friendly',
  remembered_context JSONB DEFAULT '{}',
  interaction_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_forge_conversations_project ON public.forge_conversations(project_id);
CREATE INDEX idx_forge_conversations_user ON public.forge_conversations(user_id);
CREATE INDEX idx_forge_messages_conversation ON public.forge_messages(conversation_id);
CREATE INDEX idx_forge_actions_conversation ON public.forge_actions(conversation_id);
CREATE INDEX idx_forge_actions_status ON public.forge_actions(status);

-- RLS
ALTER TABLE public.forge_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_user_preferences ENABLE ROW LEVEL SECURITY;

-- Políticas para conversaciones
CREATE POLICY "Users can view their own conversations"
ON public.forge_conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.forge_conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.forge_conversations FOR UPDATE
USING (auth.uid() = user_id);

-- Políticas para mensajes (a través de la conversación)
CREATE POLICY "Users can view messages of their conversations"
ON public.forge_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.forge_conversations 
  WHERE id = forge_messages.conversation_id AND user_id = auth.uid()
));

CREATE POLICY "Users can create messages in their conversations"
ON public.forge_messages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.forge_conversations 
  WHERE id = forge_messages.conversation_id AND user_id = auth.uid()
));

-- Políticas para acciones
CREATE POLICY "Users can view actions of their conversations"
ON public.forge_actions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.forge_conversations 
  WHERE id = forge_actions.conversation_id AND user_id = auth.uid()
));

CREATE POLICY "Users can create actions in their conversations"
ON public.forge_actions FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.forge_conversations 
  WHERE id = forge_actions.conversation_id AND user_id = auth.uid()
));

CREATE POLICY "Users can update actions in their conversations"
ON public.forge_actions FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.forge_conversations 
  WHERE id = forge_actions.conversation_id AND user_id = auth.uid()
));

-- Políticas para preferencias
CREATE POLICY "Users can view their own preferences"
ON public.forge_user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences"
ON public.forge_user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.forge_user_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_forge_conversations_updated_at
BEFORE UPDATE ON public.forge_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forge_user_preferences_updated_at
BEFORE UPDATE ON public.forge_user_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Add character role-based configuration
ALTER TABLE characters ADD COLUMN IF NOT EXISTS character_role TEXT 
  CHECK (character_role IN ('lead', 'supporting', 'recurring', 'background', 'custom'))
  DEFAULT 'custom';

ALTER TABLE characters ADD COLUMN IF NOT EXISTS slot_config JSONB DEFAULT '{
  "closeups": 1,
  "turnarounds": 2,
  "expressions": 3,
  "outfits": 1
}'::jsonb;

-- Add LoRA training fields
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lora_training_status TEXT 
  CHECK (lora_training_status IN ('none', 'ready_to_train', 'training', 'completed', 'failed')) 
  DEFAULT 'none';

ALTER TABLE characters ADD COLUMN IF NOT EXISTS lora_training_id TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lora_url TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lora_trigger_word TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lora_trained_at TIMESTAMPTZ;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS approved_for_production BOOLEAN DEFAULT FALSE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS production_ready_slots INT DEFAULT 0;

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_characters_role ON characters(character_role);
CREATE INDEX IF NOT EXISTS idx_characters_lora_status ON characters(lora_training_status);
CREATE INDEX IF NOT EXISTS idx_characters_production_ready ON characters(approved_for_production);

-- Create LoRA training logs table
CREATE TABLE IF NOT EXISTS lora_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('pending', 'training', 'completed', 'failed')) DEFAULT 'pending',
  training_steps INT DEFAULT 1500,
  images_used INT,
  cost_usd DECIMAL(10,2) DEFAULT 5.00,
  error_message TEXT,
  replicate_training_id TEXT,
  replicate_version TEXT,
  training_images_urls TEXT[],
  progress_percentage INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on lora_training_logs
ALTER TABLE lora_training_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for lora_training_logs
CREATE POLICY "Users can view lora logs for their characters" ON lora_training_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM characters c
      JOIN project_members pm ON c.project_id = pm.project_id
      WHERE c.id = lora_training_logs.character_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert lora logs for their characters" ON lora_training_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM characters c
      JOIN project_members pm ON c.project_id = pm.project_id
      WHERE c.id = lora_training_logs.character_id
      AND pm.user_id = auth.uid()
    )
  );

-- Indices for lora_training_logs
CREATE INDEX IF NOT EXISTS idx_lora_logs_character ON lora_training_logs(character_id);
CREATE INDEX IF NOT EXISTS idx_lora_logs_status ON lora_training_logs(status);
CREATE INDEX IF NOT EXISTS idx_lora_logs_replicate_id ON lora_training_logs(replicate_training_id);
-- V10.1: Change outline_parts default from '[]' to '{}'
-- This ensures proper object structure for substep locks

-- Update column default
ALTER TABLE project_outlines 
  ALTER COLUMN outline_parts SET DEFAULT '{}'::jsonb;

-- Fix existing records that have '[]' (empty array instead of empty object)
UPDATE project_outlines 
  SET outline_parts = '{}'::jsonb 
  WHERE outline_parts = '[]'::jsonb 
     OR outline_parts IS NULL;
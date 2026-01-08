-- Recalcular el pack_completeness_score de todos los personajes
-- Esto arregla los porcentajes que no se estaban actualizando correctamente

-- Primero, ejecutar recalc_character_pack para todos los personajes que tienen slots
DO $$
DECLARE
    char_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    FOR char_record IN 
        SELECT DISTINCT c.id, c.name
        FROM characters c
        INNER JOIN character_pack_slots cps ON cps.character_id = c.id
        WHERE c.pack_completeness_score IS NULL 
           OR c.pack_completeness_score = 0
           OR EXISTS (
               SELECT 1 FROM character_pack_slots s 
               WHERE s.character_id = c.id 
               AND s.status IN ('generated', 'approved', 'uploaded', 'canon')
           )
    LOOP
        -- Llamar a la función de recálculo
        PERFORM recalc_character_pack(char_record.id);
        updated_count := updated_count + 1;
        RAISE NOTICE 'Recalculated pack for character: % (%)', char_record.name, char_record.id;
    END LOOP;
    
    RAISE NOTICE 'Total characters recalculated: %', updated_count;
END $$;

-- Verificar y mostrar los resultados
SELECT 
    c.id,
    c.name,
    c.pack_completeness_score,
    c.production_ready_slots,
    (SELECT COUNT(*) FROM character_pack_slots s WHERE s.character_id = c.id AND s.status IN ('generated', 'approved', 'uploaded', 'canon')) as actual_complete_slots,
    (SELECT COUNT(*) FROM character_pack_slots s WHERE s.character_id = c.id) as total_slots
FROM characters c
WHERE EXISTS (SELECT 1 FROM character_pack_slots s WHERE s.character_id = c.id)
ORDER BY c.name;
#!/usr/bin/env python3
"""
Cinema Matcher - Cruza guiones vs películas para análisis
Reporta: coincidencias, guiones sin película, películas sin guión
"""

import json
import os
from pathlib import Path
from collections import defaultdict
import re

def normalize_title(title):
    """Normaliza títulos para matching"""
    # Eliminar año y caracteres especiales
    clean = re.sub(r'-\d{4}$', '', title)
    clean = re.sub(r'[^\w\s]', '', clean)
    return clean.lower().strip()

def load_films():
    """Carga lista de películas"""
    with open('film-slugs.json', 'r') as f:
        films = json.load(f)
    return films

def load_scripts():
    """Carga guiones parseados"""
    scripts_dir = Path('parsed')
    scripts = []
    for script_file in scripts_dir.glob('*.json'):
        scripts.append(script_file.stem)
    return scripts

def create_matching_index():
    """Crea índice normalizado para matching"""
    films = load_films()
    scripts = load_scripts()
    
    print(f"🎬 CINEMA MATCHER - ANÁLISIS DE DATOS")
    print(f"📊 Películas cargadas: {len(films)}")
    print(f"📄 Guiones cargados: {len(scripts)}")
    print(f"{'='*50}")
    
    # Crear índices normalizados
    film_index = {normalize_title(film): film for film in films}
    script_index = {normalize_title(script): script for script in scripts}
    
    # Encontrar coincidencias
    matches = []
    unmatched_scripts = []
    unmatched_films = []
    
    # Scripts que coinciden con películas
    for norm_script, original_script in script_index.items():
        if norm_script in film_index:
            matches.append({
                'script': original_script,
                'film': film_index[norm_script],
                'normalized': norm_script
            })
        else:
            unmatched_scripts.append(original_script)
    
    # Películas sin guión
    for norm_film, original_film in film_index.items():
        if norm_film not in script_index:
            unmatched_films.append(original_film)
    
    return {
        'matches': matches,
        'unmatched_scripts': unmatched_scripts,
        'unmatched_films': unmatched_films,
        'stats': {
            'total_films': len(films),
            'total_scripts': len(scripts),
            'matches_found': len(matches),
            'match_percentage': (len(matches) / len(scripts)) * 100 if scripts else 0
        }
    }

def generate_report(results):
    """Genera reporte de análisis"""
    stats = results['stats']
    
    print(f"📊 RESULTADOS DEL CRUZAMIENTO")
    print(f"{'='*50}")
    print(f"✅ Coincidencias encontradas: {stats['matches_found']}")
    print(f"📈 Porcentaje de match: {stats['match_percentage']:.1f}%")
    print(f"📄 Scripts sin película: {len(results['unmatched_scripts'])}")
    print(f"🎬 Películas sin script: {len(results['unmatched_films'])}")
    print(f"{'='*50}")
    
    # Guardar reporte detallado
    report = {
        'timestamp': str(Path().absolute()),
        'summary': stats,
        'matches': results['matches'][:10],  # Top 10 para review
        'sample_unmatched_scripts': results['unmatched_scripts'][:10],
        'sample_unmatched_films': results['unmatched_films'][:10]
    }
    
    with open('cinema_matching_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"💾 Reporte guardado: cinema_matching_report.json")
    
    # Mostrar algunos ejemplos
    if results['matches']:
        print(f"\n🎯 EJEMPLOS DE COINCIDENCIAS:")
        for match in results['matches'][:5]:
            print(f"   📄 {match['script']} ↔ 🎬 {match['film']}")
    
    return results

if __name__ == "__main__":
    try:
        results = create_matching_index()
        generate_report(results)
        print(f"\n✅ ANÁLISIS COMPLETADO")
    except Exception as e:
        print(f"❌ ERROR: {e}")
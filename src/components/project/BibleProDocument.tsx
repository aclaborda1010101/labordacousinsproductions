import { useEffect, useRef } from 'react';

interface CanonAsset {
  id: string;
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  model: string | null;
  engine: string | null;
  createdAt: string;
  assetType: string;
}

interface KeyframeData {
  id: string;
  imageUrl: string | null;
  sceneNumber?: number | null;
  shotNumber?: number | null;
  frameType?: string | null;
}

interface StylePackData {
  description?: string | null;
  tone?: string | null;
  lensStyle?: string | null;
  realismLevel?: string | null;
  colorPalette?: string[] | null;
  referenceUrls?: string[] | null;
}

interface ProjectStats {
  totalCharacters: number;
  totalLocations: number;
  totalScenes: number;
  totalShots: number;
  totalKeyframes: number;
  canonCharacters: number;
  canonLocations: number;
  canonStyle: number;
  lastUpdated: string;
}

interface BibleProData {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  version: string;
  heroImageUrl: string | null;
  stylePack: StylePackData | null;
  stats: ProjectStats;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  keyframes: KeyframeData[];
}

interface BibleProDocumentProps {
  data: BibleProData;
  onReady?: () => void;
}

export function BibleProDocument({ data, onReady }: BibleProDocumentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const images = containerRef.current?.querySelectorAll('img');
    if (!images || images.length === 0) {
      onReady?.();
      return;
    }

    let loadedCount = 0;
    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= images.length) {
        onReady?.();
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        checkAllLoaded();
      } else {
        img.addEventListener('load', checkAllLoaded);
        img.addEventListener('error', checkAllLoaded);
      }
    });
  }, [data, onReady]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const hasCanon = data.canon.characters.length > 0 || 
    data.canon.locations.length > 0 || 
    data.canon.style.length > 0;

  const hasKeyframes = data.keyframes.filter(kf => kf.imageUrl).length > 0;

  // Render characters in pairs (2 per page)
  const characterPairs: CanonAsset[][] = [];
  for (let i = 0; i < data.canon.characters.length; i += 2) {
    characterPairs.push(data.canon.characters.slice(i, i + 2));
  }

  return (
    <div ref={containerRef} className="bible-pro-document">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 14mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }

        .bible-pro-document {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #1a1a1a;
          background: #fff;
          line-height: 1.5;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 14mm;
          margin: 0 auto 20px;
          background: #fff;
          box-sizing: border-box;
          page-break-after: always;
          position: relative;
        }

        .page:last-child {
          page-break-after: avoid;
        }

        .page-footer {
          position: absolute;
          bottom: 10mm;
          left: 14mm;
          right: 14mm;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #888;
          border-top: 1px solid #eee;
          padding-top: 8px;
        }

        /* Cover Page */
        .cover-page {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          color: #fff;
        }

        .cover-hero {
          width: 100%;
          max-height: 150mm;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }

        .cover-placeholder {
          width: 100%;
          height: 120mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
          border-radius: 8px;
          margin-bottom: 24px;
          border: 2px dashed #333;
        }

        .cover-placeholder-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        .cover-placeholder-text {
          color: #555;
          font-size: 14px;
        }

        .cover-title {
          font-size: 36px;
          font-weight: 700;
          color: #f59e0b;
          margin-bottom: 12px;
          letter-spacing: -0.02em;
        }

        .cover-subtitle {
          font-size: 18px;
          color: #888;
          margin-bottom: 8px;
        }

        .cover-meta {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }

        .cover-stats {
          display: flex;
          gap: 24px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #333;
        }

        .cover-stat {
          text-align: center;
        }

        .cover-stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #f59e0b;
        }

        .cover-stat-label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Section Headers */
        .section-header {
          font-size: 24px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 3px solid #f59e0b;
        }

        .section-subtitle {
          font-size: 14px;
          color: #666;
          margin-bottom: 24px;
        }

        /* Quick Snapshot */
        .snapshot-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .snapshot-card {
          background: #f8f8f8;
          border-radius: 8px;
          padding: 16px;
          border: 1px solid #e5e5e5;
        }

        .snapshot-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #888;
          margin-bottom: 4px;
        }

        .snapshot-value {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .color-palette {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .color-swatch {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: 2px solid #e5e5e5;
        }

        /* Character Cards - 2 per page */
        .character-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        .character-card {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 20px;
          background: #f8f8f8;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e5e5;
          page-break-inside: avoid;
          min-height: 120mm;
        }

        .character-image {
          width: 100%;
          height: 100%;
          min-height: 180px;
          object-fit: cover;
          background: #e5e5e5;
        }

        .character-content {
          padding: 20px 20px 20px 0;
          display: flex;
          flex-direction: column;
        }

        .character-name {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 12px;
        }

        .character-notes {
          font-size: 13px;
          color: #555;
          margin-bottom: 16px;
          line-height: 1.7;
          flex: 1;
        }

        .character-meta {
          font-size: 10px;
          color: #888;
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          border-top: 1px solid #e5e5e5;
          padding-top: 12px;
          margin-top: auto;
        }

        .meta-item {
          display: flex;
          gap: 4px;
        }

        .meta-label {
          color: #aaa;
        }

        /* Location Scouting Layout */
        .location-scouting {
          margin-bottom: 32px;
          page-break-inside: avoid;
        }

        .location-images {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .location-main {
          width: 100%;
          height: 180px;
          object-fit: cover;
          border-radius: 8px;
        }

        .location-secondary-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .location-secondary {
          flex: 1;
          object-fit: cover;
          border-radius: 6px;
          background: #e5e5e5;
        }

        .location-info {
          background: #f8f8f8;
          border-radius: 8px;
          padding: 16px;
          border: 1px solid #e5e5e5;
        }

        .location-name {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .location-notes {
          font-size: 12px;
          color: #555;
          margin-bottom: 12px;
        }

        .location-meta {
          font-size: 10px;
          color: #888;
          display: flex;
          gap: 12px;
        }

        /* Style Section */
        .style-card {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 20px;
          background: #f8f8f8;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e5e5;
          page-break-inside: avoid;
          margin-bottom: 20px;
        }

        .style-image {
          width: 100%;
          height: 200px;
          object-fit: cover;
        }

        .style-content {
          padding: 20px 20px 20px 0;
        }

        .style-name {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        /* Continuity Grid */
        .continuity-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .continuity-frame {
          page-break-inside: avoid;
        }

        .continuity-image {
          width: 100%;
          height: 70px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid #e5e5e5;
        }

        .continuity-caption {
          font-size: 9px;
          color: #888;
          text-align: center;
          margin-top: 4px;
        }

        /* Checklist for empty state */
        .checklist {
          margin-top: 24px;
        }

        .checklist-title {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 12px;
        }

        .checklist-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }

        .checklist-icon {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .checklist-done {
          background: #22c55e;
          color: white;
        }

        .checklist-pending {
          background: #e5e5e5;
          color: #888;
        }

        .checklist-text {
          font-size: 13px;
          color: #555;
        }
      `}</style>

      {/* Cover Page */}
      <div className="page cover-page">
        {data.heroImageUrl ? (
          <img 
            src={data.heroImageUrl} 
            alt="Hero" 
            className="cover-hero"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="cover-placeholder">
            <div className="cover-placeholder-icon">🎬</div>
            <div className="cover-placeholder-text">Producción Visual Pendiente</div>
          </div>
        )}
        <h1 className="cover-title">{data.projectTitle}</h1>
        <p className="cover-subtitle">Biblia de Producción PRO</p>
        <p className="cover-meta">Versión {data.version}</p>
        <p className="cover-meta">{formatDate(data.exportedAt)}</p>
        
        <div className="cover-stats">
          <div className="cover-stat">
            <div className="cover-stat-value">{data.stats.canonCharacters}</div>
            <div className="cover-stat-label">Personajes Canon</div>
          </div>
          <div className="cover-stat">
            <div className="cover-stat-value">{data.stats.canonLocations}</div>
            <div className="cover-stat-label">Localizaciones Canon</div>
          </div>
          <div className="cover-stat">
            <div className="cover-stat-value">{data.keyframes.filter(k => k.imageUrl).length}</div>
            <div className="cover-stat-label">Keyframes</div>
          </div>
        </div>
        
        <div className="page-footer">
          <span>{data.projectId}</span>
          <span>Bible v{data.version} • {formatDate(data.exportedAt)}</span>
        </div>
      </div>

      {/* Quick Snapshot */}
      <div className="page">
        <h2 className="section-header">Quick Snapshot</h2>
        <p className="section-subtitle">Resumen visual del proyecto</p>

        <div className="snapshot-grid">
          <div className="snapshot-card">
            <div className="snapshot-label">Tono</div>
            <div className="snapshot-value">{data.stylePack?.tone || '—'}</div>
          </div>
          <div className="snapshot-card">
            <div className="snapshot-label">Estilo de Lente</div>
            <div className="snapshot-value">{data.stylePack?.lensStyle || '—'}</div>
          </div>
          <div className="snapshot-card">
            <div className="snapshot-label">Nivel de Realismo</div>
            <div className="snapshot-value">{data.stylePack?.realismLevel || '—'}</div>
          </div>
        </div>

        {data.stylePack?.description && (
          <div className="snapshot-card" style={{ marginBottom: 16 }}>
            <div className="snapshot-label">Descripción del Estilo</div>
            <div className="snapshot-value" style={{ fontSize: 14, fontWeight: 400 }}>
              {data.stylePack.description}
            </div>
          </div>
        )}

        {data.stylePack?.colorPalette && data.stylePack.colorPalette.length > 0 && (
          <div className="snapshot-card" style={{ marginTop: 16 }}>
            <div className="snapshot-label">Paleta de Color</div>
            <div className="color-palette">
              {data.stylePack.colorPalette.map((color, i) => (
                <div 
                  key={i} 
                  className="color-swatch" 
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}

        {/* If no canon, show checklist */}
        {!hasCanon && (
          <div className="checklist">
            <div className="checklist-title">Próximos Pasos del Proyecto</div>
            {[
              { done: data.stats.totalCharacters > 0, text: 'Crear personajes principales' },
              { done: data.stats.totalLocations > 0, text: 'Definir localizaciones clave' },
              { done: data.stats.canonCharacters > 0, text: 'Aprobar canon de personajes' },
              { done: data.stats.canonLocations > 0, text: 'Aprobar canon de localizaciones' },
              { done: data.stats.totalScenes > 0, text: 'Estructurar escenas' },
              { done: data.stats.totalKeyframes > 0, text: 'Generar keyframes de referencia' },
            ].map((item, i) => (
              <div key={i} className="checklist-item">
                <div className={`checklist-icon ${item.done ? 'checklist-done' : 'checklist-pending'}`}>
                  {item.done ? '✓' : '○'}
                </div>
                <span className="checklist-text">{item.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="page-footer">
          <span>{data.projectId}</span>
          <span>Bible v{data.version} • {formatDate(data.exportedAt)}</span>
        </div>
      </div>

      {/* Characters - 2 per page */}
      {characterPairs.map((pair, pageIndex) => (
        <div key={`char-page-${pageIndex}`} className="page">
          {pageIndex === 0 && (
            <>
              <h2 className="section-header">Personajes Canon</h2>
              <p className="section-subtitle">Fichas de personajes aprobados para producción</p>
            </>
          )}
          
          <div className="character-grid">
            {pair.map((char) => (
              <div key={char.id} className="character-card">
                {char.imageUrl && (
                  <img 
                    src={char.imageUrl} 
                    alt={char.name} 
                    className="character-image"
                    crossOrigin="anonymous"
                  />
                )}
                <div className="character-content">
                  <h3 className="character-name">{char.name}</h3>
                  {char.notes && (
                    <p className="character-notes">{char.notes}</p>
                  )}
                  <div className="character-meta">
                    <div className="meta-item">
                      <span className="meta-label">Motor:</span>
                      <span>{char.engine || 'N/A'}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Modelo:</span>
                      <span>{char.model || 'N/A'}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Run:</span>
                      <span>{char.runId?.slice(0, 8) || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="page-footer">
            <span>{data.projectId}</span>
            <span>Bible v{data.version} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      ))}

      {/* Locations */}
      {data.canon.locations.length > 0 && (
        <div className="page">
          <h2 className="section-header">Localizaciones Canon</h2>
          <p className="section-subtitle">Scouting visual aprobado para producción</p>

          {data.canon.locations.map((loc, index) => (
            <div key={loc.id} className="location-scouting">
              <div className="location-images">
                <img 
                  src={loc.imageUrl} 
                  alt={loc.name} 
                  className="location-main"
                  crossOrigin="anonymous"
                />
                <div className="location-secondary-stack">
                  <div className="location-secondary" style={{ background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 11 }}>
                    Key Area
                  </div>
                  <div className="location-secondary" style={{ background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 11 }}>
                    Detail
                  </div>
                </div>
              </div>
              <div className="location-info">
                <h3 className="location-name">{loc.name}</h3>
                {loc.notes && (
                  <p className="location-notes">{loc.notes}</p>
                )}
                <div className="location-meta">
                  <div className="meta-item">
                    <span className="meta-label">Motor:</span>
                    <span>{loc.engine || 'N/A'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Modelo:</span>
                    <span>{loc.model || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="page-footer">
            <span>{data.projectId}</span>
            <span>Bible v{data.version} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Style */}
      {data.canon.style.length > 0 && (
        <div className="page">
          <h2 className="section-header">Estilo Canon</h2>
          <p className="section-subtitle">Referencias visuales aprobadas</p>

          {data.canon.style.map((style) => (
            <div key={style.id} className="style-card">
              {style.imageUrl && (
                <img 
                  src={style.imageUrl} 
                  alt={style.name} 
                  className="style-image"
                  crossOrigin="anonymous"
                />
              )}
              <div className="style-content">
                <h3 className="style-name">{style.name}</h3>
                {style.notes && (
                  <p className="location-notes">{style.notes}</p>
                )}
                <div className="location-meta" style={{ marginTop: 12 }}>
                  <div className="meta-item">
                    <span className="meta-label">Motor:</span>
                    <span>{style.engine || 'N/A'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Modelo:</span>
                    <span>{style.model || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="page-footer">
            <span>{data.projectId}</span>
            <span>Bible v{data.version} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Continuity */}
      {hasKeyframes && (
        <div className="page">
          <h2 className="section-header">Continuidad Visual</h2>
          <p className="section-subtitle">Keyframes aceptados recientes</p>

          <div className="continuity-grid">
            {data.keyframes.filter(kf => kf.imageUrl).slice(0, 16).map((kf) => (
              <div key={kf.id} className="continuity-frame">
                <img 
                  src={kf.imageUrl!} 
                  alt={`Keyframe ${kf.id}`}
                  className="continuity-image"
                  crossOrigin="anonymous"
                />
                <div className="continuity-caption">
                  {kf.sceneNumber != null && kf.shotNumber != null 
                    ? `E${kf.sceneNumber} S${kf.shotNumber}`
                    : kf.frameType || 'Keyframe'}
                </div>
              </div>
            ))}
          </div>

          <div className="page-footer">
            <span>{data.projectId}</span>
            <span>Bible v{data.version} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

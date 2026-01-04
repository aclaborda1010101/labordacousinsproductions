import { useEffect, useRef } from 'react';

interface CanonAsset {
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  model: string | null;
  engine: string | null;
}

interface KeyframeData {
  id: string;
  imageUrl: string | null;
  sceneNumber?: number;
  shotNumber?: number;
}

interface StylePackData {
  genre?: string;
  tone?: string;
  era?: string;
  keywords?: string[];
  colorPalette?: string[];
  description?: string;
}

interface BibleProData {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  version?: string;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  keyframes?: KeyframeData[];
  stylePack?: StylePackData;
  heroImageUrl?: string;
}

interface BibleProDocumentProps {
  data: BibleProData;
  onReady?: () => void;
}

export function BibleProDocument({ data, onReady }: BibleProDocumentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Signal ready after images load
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

  const heroImage = data.heroImageUrl || 
    data.canon.characters[0]?.imageUrl || 
    data.canon.locations[0]?.imageUrl || 
    data.canon.style[0]?.imageUrl;

  const hasCanon = data.canon.characters.length > 0 || 
    data.canon.locations.length > 0 || 
    data.canon.style.length > 0;

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
          max-height: 160mm;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
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

        .cover-date {
          font-size: 12px;
          color: #666;
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

        .keywords-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }

        .keyword-tag {
          background: #f59e0b;
          color: #000;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 500;
        }

        .color-palette {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .color-swatch {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          border: 2px solid #e5e5e5;
        }

        /* Character Cards */
        .character-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .character-card {
          background: #f8f8f8;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e5e5;
          page-break-inside: avoid;
        }

        .character-image {
          width: 100%;
          height: 140px;
          object-fit: cover;
          background: #e5e5e5;
        }

        .character-content {
          padding: 16px;
        }

        .character-name {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .character-notes {
          font-size: 12px;
          color: #555;
          margin-bottom: 12px;
          line-height: 1.6;
        }

        .character-meta {
          font-size: 10px;
          color: #888;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
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
          margin-bottom: 24px;
          page-break-inside: avoid;
        }

        .location-main {
          width: 100%;
          height: 200px;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .location-secondary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .location-secondary {
          height: 100px;
          object-fit: cover;
          border-radius: 6px;
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
        }

        .style-image {
          width: 100%;
          height: 200px;
          object-fit: cover;
        }

        .style-content {
          padding: 20px 20px 20px 0;
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
          height: 80px;
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

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #888;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state-text {
          font-size: 16px;
        }
      `}</style>

      {/* Cover Page */}
      <div className="page cover-page">
        {heroImage && (
          <img 
            src={heroImage} 
            alt="Hero" 
            className="cover-hero"
            crossOrigin="anonymous"
          />
        )}
        <h1 className="cover-title">{data.projectTitle}</h1>
        <p className="cover-subtitle">Biblia de Producción</p>
        <p className="cover-date">Exportado: {formatDate(data.exportedAt)}</p>
        {data.version && (
          <p className="cover-date">Versión: {data.version}</p>
        )}
      </div>

      {/* Quick Snapshot */}
      {(data.stylePack || hasCanon) && (
        <div className="page">
          <h2 className="section-header">Quick Snapshot</h2>
          <p className="section-subtitle">Resumen visual del proyecto</p>

          <div className="snapshot-grid">
            <div className="snapshot-card">
              <div className="snapshot-label">Género</div>
              <div className="snapshot-value">{data.stylePack?.genre || '—'}</div>
            </div>
            <div className="snapshot-card">
              <div className="snapshot-label">Tono</div>
              <div className="snapshot-value">{data.stylePack?.tone || '—'}</div>
            </div>
            <div className="snapshot-card">
              <div className="snapshot-label">Época</div>
              <div className="snapshot-value">{data.stylePack?.era || '—'}</div>
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

          {data.stylePack?.keywords && data.stylePack.keywords.length > 0 && (
            <div className="snapshot-card">
              <div className="snapshot-label">Keywords de Mood</div>
              <div className="keywords-list">
                {data.stylePack.keywords.map((kw, i) => (
                  <span key={i} className="keyword-tag">{kw}</span>
                ))}
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

          <div className="page-footer">
            <span>{data.projectTitle} — Biblia de Producción</span>
            <span>v{data.version || '1.0'} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Characters Section */}
      {data.canon.characters.length > 0 && (
        <div className="page">
          <h2 className="section-header">Personajes</h2>
          <p className="section-subtitle">{data.canon.characters.length} personajes canon definidos</p>

          <div className="character-grid">
            {data.canon.characters.map((char, i) => (
              <div key={i} className="character-card">
                {char.imageUrl && (
                  <img 
                    src={char.imageUrl} 
                    alt={char.name} 
                    className="character-image"
                    crossOrigin="anonymous"
                  />
                )}
                <div className="character-content">
                  <div className="character-name">{char.name}</div>
                  {char.notes && (
                    <div className="character-notes">{char.notes}</div>
                  )}
                  <div className="character-meta">
                    <span className="meta-item">
                      <span className="meta-label">Motor:</span> {char.engine || 'N/A'}
                    </span>
                    <span className="meta-item">
                      <span className="meta-label">Modelo:</span> {char.model || 'N/A'}
                    </span>
                    <span className="meta-item">
                      <span className="meta-label">Run:</span> {char.runId.slice(0, 8)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="page-footer">
            <span>{data.projectTitle} — Biblia de Producción</span>
            <span>v{data.version || '1.0'} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Locations Section */}
      {data.canon.locations.length > 0 && (
        <div className="page">
          <h2 className="section-header">Localizaciones</h2>
          <p className="section-subtitle">{data.canon.locations.length} localizaciones canon definidas</p>

          {data.canon.locations.map((loc, i) => (
            <div key={i} className="location-scouting">
              {loc.imageUrl && (
                <img 
                  src={loc.imageUrl} 
                  alt={loc.name} 
                  className="location-main"
                  crossOrigin="anonymous"
                />
              )}
              <div className="location-info">
                <div className="location-name">{loc.name}</div>
                {loc.notes && (
                  <div className="location-notes">{loc.notes}</div>
                )}
                <div className="character-meta">
                  <span className="meta-item">
                    <span className="meta-label">Motor:</span> {loc.engine || 'N/A'}
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">Modelo:</span> {loc.model || 'N/A'}
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">Run:</span> {loc.runId.slice(0, 8)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <div className="page-footer">
            <span>{data.projectTitle} — Biblia de Producción</span>
            <span>v{data.version || '1.0'} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Style Section */}
      {data.canon.style.length > 0 && (
        <div className="page">
          <h2 className="section-header">Estilo Visual</h2>
          <p className="section-subtitle">Referencias de estilo canon</p>

          {data.canon.style.map((style, i) => (
            <div key={i} className="style-card" style={{ marginBottom: 16 }}>
              {style.imageUrl && (
                <img 
                  src={style.imageUrl} 
                  alt={style.name} 
                  className="style-image"
                  crossOrigin="anonymous"
                />
              )}
              <div className="style-content">
                <div className="character-name">{style.name}</div>
                {style.notes && (
                  <div className="character-notes">{style.notes}</div>
                )}
                <div className="character-meta">
                  <span className="meta-item">
                    <span className="meta-label">Motor:</span> {style.engine || 'N/A'}
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">Modelo:</span> {style.model || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <div className="page-footer">
            <span>{data.projectTitle} — Biblia de Producción</span>
            <span>v{data.version || '1.0'} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Continuity Section */}
      {data.keyframes && data.keyframes.length > 0 && (
        <div className="page">
          <h2 className="section-header">Continuidad Visual</h2>
          <p className="section-subtitle">{data.keyframes.length} keyframes de referencia</p>

          <div className="continuity-grid">
            {data.keyframes.slice(0, 16).map((kf, i) => (
              <div key={i} className="continuity-frame">
                {kf.imageUrl && (
                  <img 
                    src={kf.imageUrl} 
                    alt={`Keyframe ${i + 1}`} 
                    className="continuity-image"
                    crossOrigin="anonymous"
                  />
                )}
                <div className="continuity-caption">
                  {kf.sceneNumber && kf.shotNumber 
                    ? `S${kf.sceneNumber}/Sh${kf.shotNumber}`
                    : `Frame ${i + 1}`
                  }
                </div>
              </div>
            ))}
          </div>

          <div className="page-footer">
            <span>{data.projectTitle} — Biblia de Producción</span>
            <span>v{data.version || '1.0'} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasCanon && (
        <div className="page">
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-text">
              No hay assets canon definidos para este proyecto.<br />
              Define personajes, localizaciones o estilos como canon para verlos aquí.
            </div>
          </div>

          <div className="page-footer">
            <span>{data.projectTitle} — Biblia de Producción</span>
            <span>v{data.version || '1.0'} • {formatDate(data.exportedAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

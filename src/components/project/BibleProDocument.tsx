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
  scene: number | null;
  shot: number | null;
  runId: string | null;
  createdAt: string;
}

interface BibleProData {
  project: {
    id: string;
    name: string;
    tone: string | null;
    lensStyle: string | null;
    realismLevel: string | null;
    description: string | null;
    colorPalette: string[] | null;
  };
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  continuity: {
    keyframes: KeyframeData[];
  };
  stats: {
    totalCharacters: number;
    totalLocations: number;
    canonCharacters: number;
    canonLocations: number;
    canonStyle: number;
    acceptedKeyframes: number;
  };
  exportedAt: string;
  version: string;
}

interface BibleProDocumentProps {
  data: BibleProData;
  onReady?: () => void;
}

export function BibleProDocument({ data, onReady }: BibleProDocumentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageCount = useRef(0);

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
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasCanon = data.canon.characters.length > 0 || 
    data.canon.locations.length > 0 || 
    data.canon.style.length > 0;

  const hasKeyframes = data.continuity.keyframes.filter(kf => kf.imageUrl).length > 0;

  // Get hero image priority: keyframe > character > location > style
  const heroImage = 
    data.continuity.keyframes.find(kf => kf.imageUrl)?.imageUrl ||
    data.canon.characters[0]?.imageUrl ||
    data.canon.locations[0]?.imageUrl ||
    data.canon.style[0]?.imageUrl ||
    null;

  // Character pairs for 2-per-page layout
  const characterPairs: CanonAsset[][] = [];
  for (let i = 0; i < data.canon.characters.length; i += 2) {
    characterPairs.push(data.canon.characters.slice(i, i + 2));
  }

  const getPageNumber = () => {
    pageCount.current += 1;
    return pageCount.current;
  };

  // Reset page counter
  pageCount.current = 0;

  const PageFooter = ({ pageNum }: { pageNum: number }) => (
    <div className="page-footer">
      <span>{data.project.id}</span>
      <span>Bible v{data.version} • {formatDateTime(data.exportedAt)}</span>
      <span>Página {pageNum}</span>
    </div>
  );

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
          font-size: 8px;
          color: #999;
          border-top: 1px solid #eee;
          padding-top: 6px;
        }

        /* Cover */
        .cover {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          background: linear-gradient(160deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%);
          color: #fff;
        }

        .cover-hero {
          width: 100%;
          max-height: 145mm;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }

        .cover-placeholder {
          width: 100%;
          height: 120mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a1a 0%, #262626 100%);
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #333;
        }

        .cover-placeholder-icon {
          font-size: 56px;
          margin-bottom: 12px;
          opacity: 0.4;
        }

        .cover-placeholder-text {
          color: #555;
          font-size: 13px;
        }

        .cover-title {
          font-size: 32px;
          font-weight: 700;
          color: #f59e0b;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }

        .cover-subtitle {
          font-size: 16px;
          color: #888;
          margin-bottom: 4px;
        }

        .cover-meta {
          font-size: 11px;
          color: #666;
          margin-bottom: 2px;
        }

        .cover-stats {
          display: flex;
          gap: 32px;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #333;
        }

        .cover-stat {
          text-align: center;
        }

        .cover-stat-value {
          font-size: 22px;
          font-weight: 700;
          color: #f59e0b;
        }

        .cover-stat-label {
          font-size: 9px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Section Headers */
        .section-header {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 6px;
          padding-bottom: 8px;
          border-bottom: 3px solid #f59e0b;
        }

        .section-subtitle {
          font-size: 13px;
          color: #666;
          margin-bottom: 20px;
        }

        /* Quick Snapshot */
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 20px;
        }

        .chip {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 12px;
        }

        .chip-label {
          color: #888;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .chip-value {
          color: #1a1a1a;
          font-weight: 500;
          margin-left: 4px;
        }

        .description-box {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
          border-left: 3px solid #f59e0b;
        }

        .description-text {
          font-size: 13px;
          color: #444;
          line-height: 1.7;
        }

        .color-palette {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .color-swatch {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 2px solid #e9ecef;
        }

        /* Character Cards */
        .character-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .character-card {
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 20px;
          background: #f8f9fa;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid #e9ecef;
          page-break-inside: avoid;
          min-height: 115mm;
        }

        .character-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #e9ecef;
        }

        .character-content {
          padding: 16px 16px 16px 0;
          display: flex;
          flex-direction: column;
        }

        .character-name {
          font-size: 20px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 10px;
        }

        .character-notes {
          font-size: 12px;
          color: #555;
          margin-bottom: 12px;
          line-height: 1.7;
          flex: 1;
        }

        .character-bullets {
          list-style: none;
          padding: 0;
          margin: 0 0 12px 0;
        }

        .character-bullets li {
          font-size: 11px;
          color: #555;
          padding: 3px 0;
          padding-left: 14px;
          position: relative;
        }

        .character-bullets li::before {
          content: '•';
          color: #f59e0b;
          position: absolute;
          left: 0;
        }

        .meta-row {
          font-size: 9px;
          color: #888;
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          border-top: 1px solid #e9ecef;
          padding-top: 10px;
          margin-top: auto;
        }

        .meta-item {
          display: flex;
          gap: 4px;
        }

        .meta-label {
          color: #aaa;
        }

        /* Location Scouting */
        .location-block {
          margin-bottom: 28px;
          page-break-inside: avoid;
        }

        .location-images {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }

        .location-main {
          width: 100%;
          height: 160px;
          object-fit: cover;
          border-radius: 8px;
        }

        .location-secondary-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .location-secondary {
          flex: 1;
          object-fit: cover;
          border-radius: 6px;
          background: #e9ecef;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #aaa;
          font-size: 10px;
        }

        .location-info {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 14px;
          border: 1px solid #e9ecef;
        }

        .location-name {
          font-size: 16px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 6px;
        }

        .location-notes {
          font-size: 11px;
          color: #555;
          margin-bottom: 10px;
          line-height: 1.6;
        }

        /* Style Section */
        .style-card {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 16px;
          background: #f8f9fa;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid #e9ecef;
          page-break-inside: avoid;
          margin-bottom: 16px;
        }

        .style-image {
          width: 100%;
          height: 180px;
          object-fit: cover;
        }

        .style-content {
          padding: 16px 16px 16px 0;
        }

        .style-name {
          font-size: 16px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        /* Continuity Grid */
        .continuity-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .continuity-frame {
          page-break-inside: avoid;
        }

        .continuity-image {
          width: 100%;
          height: 65px;
          object-fit: cover;
          border-radius: 5px;
          border: 1px solid #e9ecef;
        }

        .continuity-caption {
          font-size: 8px;
          color: #888;
          text-align: center;
          margin-top: 3px;
        }

        /* Canon Pending */
        .canon-pending {
          background: linear-gradient(135deg, #fefce8 0%, #fff7ed 100%);
          border: 1px solid #fcd34d;
          border-radius: 10px;
          padding: 28px;
          text-align: center;
          margin-top: 20px;
        }

        .canon-pending-title {
          font-size: 18px;
          font-weight: 600;
          color: #92400e;
          margin-bottom: 10px;
        }

        .canon-pending-text {
          font-size: 13px;
          color: #78350f;
          line-height: 1.6;
          max-width: 420px;
          margin: 0 auto;
        }

        .canon-pending-list {
          text-align: left;
          max-width: 320px;
          margin: 16px auto 0;
        }

        .canon-pending-item {
          font-size: 12px;
          color: #92400e;
          padding: 4px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>

      {/* Cover Page */}
      <div className="page cover">
        {heroImage ? (
          <img 
            src={heroImage} 
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
        <h1 className="cover-title">{data.project.name}</h1>
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
            <div className="cover-stat-value">{data.stats.acceptedKeyframes}</div>
            <div className="cover-stat-label">Keyframes</div>
          </div>
        </div>
        
        <PageFooter pageNum={getPageNumber()} />
      </div>

      {/* Quick Snapshot */}
      <div className="page">
        <h2 className="section-header">Quick Snapshot</h2>
        <p className="section-subtitle">Visión rápida del proyecto</p>

        <div className="chips">
          {data.project.tone && (
            <div className="chip">
              <span className="chip-label">Tono:</span>
              <span className="chip-value">{data.project.tone}</span>
            </div>
          )}
          {data.project.lensStyle && (
            <div className="chip">
              <span className="chip-label">Lente:</span>
              <span className="chip-value">{data.project.lensStyle}</span>
            </div>
          )}
          {data.project.realismLevel && (
            <div className="chip">
              <span className="chip-label">Realismo:</span>
              <span className="chip-value">{data.project.realismLevel}</span>
            </div>
          )}
          {!data.project.tone && !data.project.lensStyle && !data.project.realismLevel && (
            <div className="chip">
              <span className="chip-value" style={{ color: '#888' }}>Estilo por definir</span>
            </div>
          )}
        </div>

        {data.project.description && (
          <div className="description-box">
            <p className="description-text">{data.project.description}</p>
          </div>
        )}

        {data.project.colorPalette && data.project.colorPalette.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Paleta de Color
            </div>
            <div className="color-palette">
              {data.project.colorPalette.map((color, i) => (
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

        {!hasCanon && (
          <div className="canon-pending">
            <div className="canon-pending-title">📋 Canon Pendiente</div>
            <p className="canon-pending-text">
              Para completar el dossier PRO, marca tus primeros assets como canon:
            </p>
            <div className="canon-pending-list">
              <div className="canon-pending-item">
                <span>○</span> Aceptar retratos de personajes principales
              </div>
              <div className="canon-pending-item">
                <span>○</span> Marcar localizaciones clave como canon
              </div>
              <div className="canon-pending-item">
                <span>○</span> Definir referencias de estilo visual
              </div>
              <div className="canon-pending-item">
                <span>○</span> Aprobar keyframes por escena
              </div>
            </div>
          </div>
        )}

        <PageFooter pageNum={getPageNumber()} />
      </div>

      {/* Characters - 2 per page */}
      {characterPairs.map((pair, pageIndex) => (
        <div key={`char-page-${pageIndex}`} className="page">
          {pageIndex === 0 && (
            <>
              <h2 className="section-header">Personajes Canon</h2>
              <p className="section-subtitle">Fichas de casting aprobadas para producción</p>
            </>
          )}
          
          <div className="character-grid">
            {pair.map((char) => (
              <div key={char.id} className="character-card">
                {char.imageUrl ? (
                  <img 
                    src={char.imageUrl} 
                    alt={char.name} 
                    className="character-image"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="character-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                    Sin imagen
                  </div>
                )}
                <div className="character-content">
                  <h3 className="character-name">{char.name}</h3>
                  {char.notes && (
                    <p className="character-notes">{char.notes}</p>
                  )}
                  <div className="meta-row">
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

          <PageFooter pageNum={getPageNumber()} />
        </div>
      ))}

      {/* Locations */}
      {data.canon.locations.length > 0 && (
        <div className="page">
          <h2 className="section-header">Localizaciones Canon</h2>
          <p className="section-subtitle">Scouting visual aprobado para producción</p>

          {data.canon.locations.map((loc) => (
            <div key={loc.id} className="location-block">
              <div className="location-images">
                <img 
                  src={loc.imageUrl} 
                  alt={loc.name} 
                  className="location-main"
                  crossOrigin="anonymous"
                />
                <div className="location-secondary-stack">
                  <div className="location-secondary">Key Area</div>
                  <div className="location-secondary">Detail</div>
                </div>
              </div>
              <div className="location-info">
                <h3 className="location-name">{loc.name}</h3>
                {loc.notes && (
                  <p className="location-notes">{loc.notes}</p>
                )}
                <div className="meta-row">
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

          <PageFooter pageNum={getPageNumber()} />
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
                <div className="meta-row" style={{ marginTop: 12 }}>
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

          <PageFooter pageNum={getPageNumber()} />
        </div>
      )}

      {/* Continuity */}
      {hasKeyframes && (
        <div className="page">
          <h2 className="section-header">Continuidad Visual</h2>
          <p className="section-subtitle">Keyframes aceptados para referencia de producción</p>

          <div className="continuity-grid">
            {data.continuity.keyframes.filter(kf => kf.imageUrl).slice(0, 16).map((kf) => (
              <div key={kf.id} className="continuity-frame">
                <img 
                  src={kf.imageUrl!} 
                  alt={`Keyframe`}
                  className="continuity-image"
                  crossOrigin="anonymous"
                />
                <div className="continuity-caption">
                  {kf.scene != null && kf.shot != null 
                    ? `E${kf.scene} S${kf.shot}`
                    : formatDate(kf.createdAt)}
                </div>
              </div>
            ))}
          </div>

          <PageFooter pageNum={getPageNumber()} />
        </div>
      )}
    </div>
  );
}

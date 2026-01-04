interface CanonAsset {
  id: string;
  name: string;
  imageUrl: string;
  notes: string | null;
}

interface AcceptedRun {
  id: string;
  type: string;
  name: string;
  date: string;
}

interface BibleNormalData {
  project: {
    id: string;
    name: string;
  };
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  recentRuns: AcceptedRun[];
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

interface BibleNormalDocumentProps {
  data: BibleNormalData;
}

export function BibleNormalDocument({ data }: BibleNormalDocumentProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasCanon = data.canon.characters.length > 0 || 
    data.canon.locations.length > 0 || 
    data.canon.style.length > 0;

  const totalCanon = data.stats.canonCharacters + data.stats.canonLocations + data.stats.canonStyle;
  const allCanonAssets = [...data.canon.characters, ...data.canon.locations, ...data.canon.style];

  // Checklist items
  const checklist = [
    { 
      done: data.stats.canonCharacters > 0, 
      text: 'Aceptar al menos 1 retrato por personaje principal' 
    },
    { 
      done: data.stats.canonLocations > 0, 
      text: 'Marcar canon de 1 localización clave' 
    },
    { 
      done: data.stats.acceptedKeyframes > 0, 
      text: 'Aceptar 1 keyframe por escena' 
    },
    { 
      done: data.stats.canonStyle > 0, 
      text: 'Definir estilo visual de referencia' 
    },
  ];

  const pendingSteps = checklist.filter(item => !item.done);

  return (
    <div className="bible-normal-document">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 16mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }

        .bible-normal-document {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #1a1a1a;
          background: #fff;
          line-height: 1.5;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 16mm;
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
          bottom: 12mm;
          left: 16mm;
          right: 16mm;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #999;
          border-top: 1px solid #eee;
          padding-top: 8px;
        }

        /* Header */
        .header {
          margin-bottom: 32px;
          padding-bottom: 16px;
          border-bottom: 2px solid #f59e0b;
        }

        .header-title {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 4px;
        }

        .header-subtitle {
          font-size: 14px;
          color: #666;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          border: 1px solid #e9ecef;
        }

        .stat-value {
          font-size: 36px;
          font-weight: 700;
          color: #f59e0b;
          line-height: 1;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Recent Runs */
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-title::before {
          content: '';
          width: 4px;
          height: 16px;
          background: #f59e0b;
          border-radius: 2px;
        }

        .runs-list {
          background: #f8f9fa;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 24px;
        }

        .run-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #e9ecef;
        }

        .run-item:last-child {
          border-bottom: none;
        }

        .run-type {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 500;
        }

        .run-type-character {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .run-type-location {
          background: #dcfce7;
          color: #16a34a;
        }

        .run-type-keyframe {
          background: #fef3c7;
          color: #d97706;
        }

        .run-name {
          flex: 1;
          font-size: 13px;
          color: #1a1a1a;
        }

        .run-date {
          font-size: 11px;
          color: #888;
        }

        /* Checklist */
        .checklist {
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .checklist-title {
          font-size: 14px;
          font-weight: 600;
          color: #92400e;
          margin-bottom: 12px;
        }

        .checklist-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
        }

        .checklist-icon {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          flex-shrink: 0;
        }

        .checklist-done {
          background: #22c55e;
          color: white;
        }

        .checklist-pending {
          background: #e5e7eb;
          color: #9ca3af;
        }

        .checklist-text {
          font-size: 12px;
          color: #555;
        }

        /* Canon Grid */
        .canon-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .canon-card {
          background: #f8f9fa;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e9ecef;
        }

        .canon-image {
          width: 100%;
          height: 80px;
          object-fit: cover;
          background: #e9ecef;
        }

        .canon-name {
          font-size: 11px;
          font-weight: 500;
          color: #1a1a1a;
          padding: 8px;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Unlock Pro */
        .unlock-pro {
          background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          color: #fff;
          margin-top: 32px;
        }

        .unlock-pro-title {
          font-size: 20px;
          font-weight: 600;
          color: #f59e0b;
          margin-bottom: 12px;
        }

        .unlock-pro-text {
          font-size: 13px;
          color: #9ca3af;
          line-height: 1.6;
          max-width: 400px;
          margin: 0 auto;
        }

        .empty-runs {
          text-align: center;
          padding: 24px;
          color: #888;
          font-size: 13px;
        }
      `}</style>

      {/* Page 1: Project Status */}
      <div className="page">
        <div className="header">
          <h1 className="header-title">{data.project.name}</h1>
          <p className="header-subtitle">
            Estado del Proyecto • {formatDate(data.exportedAt)} • v{data.version}
          </p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{data.stats.totalCharacters}</div>
            <div className="stat-label">Personajes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{data.stats.totalLocations}</div>
            <div className="stat-label">Localizaciones</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalCanon}</div>
            <div className="stat-label">Canon Activos</div>
          </div>
        </div>

        <div className="section-title">Últimos Runs Aceptados</div>
        {data.recentRuns.length > 0 ? (
          <div className="runs-list">
            {data.recentRuns.map((run) => (
              <div key={run.id} className="run-item">
                <span className={`run-type run-type-${run.type}`}>
                  {run.type === 'character' ? 'Personaje' : 
                   run.type === 'location' ? 'Localización' : 
                   run.type === 'keyframe' ? 'Keyframe' : 'Run'}
                </span>
                <span className="run-name">{run.name}</span>
                <span className="run-date">{formatDate(run.date)} {formatTime(run.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="runs-list">
            <div className="empty-runs">
              No hay runs aceptados todavía. Genera contenido y márcalo como canon.
            </div>
          </div>
        )}

        {pendingSteps.length > 0 && (
          <div className="checklist">
            <div className="checklist-title">📋 Próximos Pasos Recomendados</div>
            {checklist.map((item, i) => (
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
          <span>{data.project.id}</span>
          <span>Bible v{data.version} • Página 1</span>
        </div>
      </div>

      {/* Page 2: Canon Summary or Unlock PRO */}
      <div className="page">
        {hasCanon ? (
          <>
            <div className="section-title">Canon Resumido</div>
            <div className="canon-grid">
              {allCanonAssets.slice(0, 12).map((asset) => (
                <div key={asset.id} className="canon-card">
                  {asset.imageUrl && (
                    <img 
                      src={asset.imageUrl} 
                      alt={asset.name} 
                      className="canon-image"
                      crossOrigin="anonymous"
                    />
                  )}
                  <div className="canon-name">{asset.name}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="unlock-pro">
            <div className="unlock-pro-title">🎬 Desbloquea el Dossier PRO</div>
            <p className="unlock-pro-text">
              Para generar un dossier de producción completo, marca tus primeros assets como canon. 
              El PDF PRO incluirá fichas detalladas de personajes, scouting de localizaciones, 
              referencias de estilo y grid de continuidad visual.
            </p>
          </div>
        )}

        <div className="page-footer">
          <span>{data.project.id}</span>
          <span>Bible v{data.version} • Página 2</span>
        </div>
      </div>
    </div>
  );
}

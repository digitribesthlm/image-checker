'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractMetadata } from '../lib/metadata';

export default function ImageInspector() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [desiredDpi, setDesiredDpi] = useState(300);
  const [desiredWidthCm, setDesiredWidthCm] = useState('20');
  const [desiredHeightCm, setDesiredHeightCm] = useState('30');
  const [exporting, setExporting] = useState(false);
  const [exifMake, setExifMake] = useState('');
  const [exifModel, setExifModel] = useState('');
  const [exifSoftware, setExifSoftware] = useState('');
  const [exifLat, setExifLat] = useState('');
  const [exifLon, setExifLon] = useState('');
  const [savingMetadata, setSavingMetadata] = useState(false);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }, []);

  const onPick = useCallback((e) => {
    const f = e.target?.files?.[0];
    if (f) handleFile(f);
  }, []);

  const handleFile = async (f) => {
    setError(null);
    setLoading(true);
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    try {
      const m = await extractMetadata(f);
      setMetadata(m);
      // SOLUTION: Pre-populate with existing EXIF data from the image
      setExifMake(m.make || '');
      setExifModel(m.model || '');
      setExifSoftware(m.software || '');
      setExifLat(m.gpsLatitude != null ? String(m.gpsLatitude) : '');
      setExifLon(m.gpsLongitude != null ? String(m.gpsLongitude) : '');
    } catch (err) {
      setError('Failed to read image metadata');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const desiredWidthIn = useMemo(() => Math.max(0, Number(desiredWidthCm) || 0) / 2.54, [desiredWidthCm]);
  const desiredHeightIn = useMemo(() => Math.max(0, Number(desiredHeightCm) || 0) / 2.54, [desiredHeightCm]);

  const requiredWidthPx = useMemo(() => Math.round(desiredWidthIn * Math.max(1, Number(desiredDpi) || 1)), [desiredWidthIn, desiredDpi]);
  const requiredHeightPx = useMemo(() => Math.round(desiredHeightIn * Math.max(1, Number(desiredDpi) || 1)), [desiredHeightIn, desiredDpi]);

  const pass = useMemo(() => {
    if (!metadata?.width || !metadata?.height) return null;
    return metadata.width >= requiredWidthPx && metadata.height >= requiredHeightPx;
  }, [metadata, requiredWidthPx, requiredHeightPx]);

  const exportJpeg = async (resample) => {
    if (!file) return;
    setExporting(true);
    try {
      const blob = await submitForm('/api/export/jpeg', {
        file,
        dpi: desiredDpi,
        widthCm: desiredWidthCm,
        heightCm: desiredHeightCm,
        extras: { resample, exifMake, exifModel, exifSoftware, exifLat, exifLon }
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (file?.name || 'image').replace(/\.[^.]+$/, '') + `_${desiredDpi}dpi.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('JPEG export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    if (!file) return;
    setExporting(true);
    try {
      const blob = await submitForm('/api/export/pdf', {
        file,
        dpi: desiredDpi,
        widthCm: desiredWidthCm,
        heightCm: desiredHeightCm,
        extras: { center: true }
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (file?.name || 'image').replace(/\.[^.]+$/, '') + `_${desiredWidthCm}x${desiredHeightCm}cm.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const saveMetadataOnly = async () => {
    if (!file) return;
    setSavingMetadata(true);
    try {
      const ext = metadata?.format?.toLowerCase() || 'jpg';
      const endpoint = ext === 'jpeg' || ext === 'jpg' ? '/api/export/jpeg' : '/api/export/jpeg';
      const blob = await submitForm(endpoint, {
        file,
        dpi: metadata?.dpiX || 300,
        widthCm: '0',
        heightCm: '0',
        extras: { resample: false, exifMake, exifModel, exifSoftware, exifLat, exifLon }
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (file?.name || 'image').replace(/.[^.]+$/, '') + '_metadata.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('Metadata save failed');
    } finally {
      setSavingMetadata(false);
    }
  };

  return (
    <div>
      <section
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={onDrop}
        style={{
          border: '2px dashed #888',
          borderRadius: 10,
          padding: 24,
          textAlign: 'center',
          background: '#fafafa'
        }}
      >
        <p style={{ marginTop: 0, marginBottom: 12 }}>Drag & drop an image here</p>
        <input type="file" accept="image/*" onChange={onPick} />
      </section>

      {loading && (
        <p style={{ marginTop: 16 }}>Reading image...</p>
      )}

      {error && (
        <p style={{ marginTop: 16, color: 'crimson' }}>{error}</p>
      )}

      {previewUrl && (
        <div style={{ display: 'flex', gap: 24, marginTop: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 280px' }}>
            <img
              src={previewUrl}
              alt={file?.name || 'preview'}
              style={{ width: '100%', height: 'auto', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button disabled={!file || exporting} onClick={() => exportJpeg(false)}>
                Export JPEG (embed DPI)
              </button>
              <button disabled={!file || exporting} onClick={() => exportJpeg(true)}>
                Export JPEG (resample)
              </button>
              <button disabled={!file || exporting} onClick={exportPdf}>
                Export PDF @ size
              </button>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ marginTop: 0 }}>Metadata</h3>
            {metadata && (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8 }}>
                <div className="label">Filename</div><div>{file?.name}</div>
                <div className="label">Format</div><div>{metadata.format || 'Unknown'}</div>
                <div className="label">Dimensions (px)</div><div>{metadata.width} × {metadata.height}</div>
                <div className="label">Aspect ratio</div>
                <div>{metadata.width && metadata.height ? (metadata.width / metadata.height).toFixed(4) : '—'}</div>
                <div className="label">DPI (X × Y)</div>
                <div>{metadata.dpiX || '—'} {metadata.dpiX && metadata.dpiY ? '×' : ''} {metadata.dpiY || ''}</div>
                <div className="label">DPI source</div><div>{metadata.dpiSource || '—'}</div>
                <div className="label">EXIF present</div><div>{metadata.exifPresent === true ? 'Yes' : metadata.exifPresent === false ? 'No' : 'Unknown'}</div>
                <div className="label">GPS present</div><div>{metadata.gpsPresent ? 'Yes' : 'No'}</div>
                {metadata.format && (
                  <>
                    <div className="label">Make</div>
                    <div>
                      {/* SOLUTION: Show original value if exists, with optional dropdown for quick selection */}
                      <input 
                        value={exifMake} 
                        onChange={(e) => setExifMake(e.target.value)} 
                        placeholder="Camera brand" 
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                        list="make-suggestions"
                      />
                      <datalist id="make-suggestions">
                        <option value="Apple" />
                        <option value="Canon" />
                        <option value="Nikon" />
                        <option value="Sony" />
                        <option value="Samsung" />
                        <option value="Google" />
                        <option value="Fujifilm" />
                        <option value="Panasonic" />
                        <option value="Olympus" />
                        <option value="Leica" />
                        <option value="Pentax" />
                        <option value="Hasselblad" />
                      </datalist>
                    </div>
                    <div className="label">Model</div>
                    <div>
                      <input 
                        value={exifModel} 
                        onChange={(e) => setExifModel(e.target.value)} 
                        placeholder="Camera model" 
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} 
                      />
                    </div>
                    <div className="label">Software</div>
                    <div>
                      {/* SOLUTION: Show original value if exists, with optional dropdown for quick selection */}
                      <input 
                        value={exifSoftware} 
                        onChange={(e) => setExifSoftware(e.target.value)} 
                        placeholder="Editing software" 
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                        list="software-suggestions"
                      />
                      <datalist id="software-suggestions">
                        <option value="Adobe Lightroom" />
                        <option value="Adobe Photoshop" />
                        <option value="GIMP" />
                        <option value="Capture One" />
                        <option value="Affinity Photo" />
                        <option value="Darktable" />
                        <option value="Luminar" />
                        <option value="ON1 Photo RAW" />
                      </datalist>
                    </div>
                    <div className="label">GPS latitude</div>
                    <div>
                      <input 
                        value={exifLat} 
                        onChange={(e) => setExifLat(e.target.value)} 
                        inputMode="decimal" 
                        placeholder="e.g. 59.3293" 
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} 
                      />
                    </div>
                    <div className="label">GPS longitude</div>
                    <div>
                      <input 
                        value={exifLon} 
                        onChange={(e) => setExifLon(e.target.value)} 
                        inputMode="decimal" 
                        placeholder="e.g. 18.0686" 
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} 
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            {!metadata && (
              <p style={{ color: '#888', fontStyle: 'italic' }}>No metadata found for this image.</p>
            )}

            <h3 style={{ marginTop: 24 }}>Print check</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, alignItems: 'center' }}>
              <div className="label">Desired size (cm)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={desiredWidthCm}
                  onChange={(e) => setDesiredWidthCm(e.target.value)}
                  inputMode="decimal"
                  placeholder="Width"
                  style={{ flex: 1 }}
                />
                <span style={{ alignSelf: 'center' }}>×</span>
                <input
                  value={desiredHeightCm}
                  onChange={(e) => setDesiredHeightCm(e.target.value)}
                  inputMode="decimal"
                  placeholder="Height"
                  style={{ flex: 1 }}
                />
              </div>
              <div className="label">Desired DPI</div>
              <div>
                <input
                  value={desiredDpi}
                  onChange={(e) => setDesiredDpi(Number(e.target.value) || 300)}
                  inputMode="numeric"
                  style={{ width: 100 }}
                />
              </div>
              <div className="label">Required pixels</div>
              <div>{requiredWidthPx} × {requiredHeightPx}</div>
              <div className="label">Status</div>
              <div style={{ fontWeight: 600, color: pass === true ? 'green' : pass === false ? 'crimson' : '#888' }}>
                {pass === true ? '✓ Pass' : pass === false ? '✗ Fail' : '—'}
              </div>
            </div>
            <button
              disabled={!file || savingMetadata}
              onClick={saveMetadataOnly}
              style={{ marginTop: 16 }}
            >
              {savingMetadata ? 'Saving...' : 'Save metadata changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function submitForm(url, { file, dpi, widthCm, heightCm, extras }) {
  const form = new FormData();
  form.append('file', file);
  form.append('dpi', String(dpi));
  form.append('widthCm', String(widthCm));
  form.append('heightCm', String(heightCm));
  if (extras) {
    if (extras.resample != null) form.append('resample', String(extras.resample));
    if (extras.center != null) form.append('center', String(extras.center));
    if (extras.exifMake) form.append('exifMake', extras.exifMake);
    if (extras.exifModel) form.append('exifModel', extras.exifModel);
    if (extras.exifSoftware) form.append('exifSoftware', extras.exifSoftware);
    if (extras.exifLat) form.append('exifLat', extras.exifLat);
    if (extras.exifLon) form.append('exifLon', extras.exifLon);
  }
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Request failed');
  return res.blob();
}


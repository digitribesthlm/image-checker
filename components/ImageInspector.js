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
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={exifMake} onChange={(e) => setExifMake(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}>
                        <option value="">-- Select Brand --</option>
                        <option value="Apple">Apple</option>
                        <option value="Canon">Canon</option>
                        <option value="Nikon">Nikon</option>
                        <option value="Sony">Sony</option>
                        <option value="Samsung">Samsung</option>
                        <option value="Google">Google (Pixel)</option>
                        <option value="Fujifilm">Fujifilm</option>
                        <option value="Panasonic">Panasonic</option>
                      </select>
                      <input value={exifMake} onChange={(e) => setExifMake(e.target.value)} placeholder="or custom" style={{ flex: 1 }} />
                    </div>
                    <div className="label">Model</div>
                    <div><input value={exifModel} onChange={(e) => setExifModel(e.target.value)} placeholder={metadata.model || 'Camera model'} style={{ width: '100%' }} /></div>
                    <div className="label">Software</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={exifSoftware} onChange={(e) => setExifSoftware(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}>
                        <option value="">-- Select Software --</option>
                        <option value="Adobe Lightroom">Adobe Lightroom</option>
                        <option value="Photoshop">Photoshop</option>
                        <option value="GIMP">GIMP</option>
                        <option value="Capture One">Capture One</option>
                        <option value="Affinity Photo">Affinity Photo</option>
                        <option value="Darktable">Darktable</option>
                      </select>
                      <input value={exifSoftware} onChange={(e) => setExifSoftware(e.target.value)} placeholder="or custom" style={{ flex: 1 }} />
                    </div>
                    <div className="label">GPS latitude</div>
                    <div><input value={exifLat} onChange={(e) => setExifLat(e.target.value)} inputMode="decimal" placeholder={metadata.gpsLatitude != null ? String(metadata.gpsLatitude) : 'e.g. 59.3293'} style={{ width: 180 }} /></div>
                    <div className="label">GPS longitude</div>
                    <div><input value={exifLon} onChange={(e) => setExifLon(e.target.value)} inputMode="decimal" placeholder={metadata.gpsLongitude != null ? String(metadata.gpsLongitude) : 'e.g. 18.0686'} style={{ width: 180 }} /></div>
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
                  style={{ width: 90 }}
                />
                <span>×</span>
                <input
                  value={desiredHeightCm}
                  onChange={(e) => setDesiredHeightCm(e.target.value)}
                  inputMode="decimal"
                  style={{ width: 90 }}
                />
              </div>

              <div className="label">Desired DPI</div>
              <div>
                <input
                  value={desiredDpi}
                  onChange={(e) => setDesiredDpi(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 90 }}
                />
              </div>

              <div className="label">Required pixels</div>
              <div>{requiredWidthPx} × {requiredHeightPx} px</div>

              <div className="label">Your image</div>
              <div>{metadata?.width || '—'} × {metadata?.height || '—'} px</div>

              <div className="label">Result</div>
              <div>
                {pass == null ? '—' : pass ? (
                  <span style={{ color: 'green', fontWeight: 600 }}>OK for print</span>
                ) : (
                  <span style={{ color: 'crimson', fontWeight: 600 }}>Too small for desired size</span>
                )}
              </div>

              {metadata?.width && metadata?.height && (
                <>
                  <div className="label">Size @ {desiredDpi} DPI</div>
                  <div>
                    { (metadata.width / desiredDpi).toFixed(2) } in × { (metadata.height / desiredDpi).toFixed(2) } in
                    {' '}({ ((metadata.width / desiredDpi) * 2.54).toFixed(1) } cm × { ((metadata.height / desiredDpi) * 2.54).toFixed(1) } cm)
                  </div>
                </>
              )}
            </div>

            <h3 style={{ marginTop: 24 }}>Save Metadata</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px', backgroundColor: '#f0f8ff', borderRadius: 6, marginBottom: 16 }}>
              <button disabled={!file || savingMetadata} onClick={saveMetadataOnly} style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: 6, cursor: savingMetadata ? 'not-allowed' : 'pointer', opacity: !file || savingMetadata ? 0.6 : 1, fontWeight: 600 }}>
                {savingMetadata ? 'Saving...' : '💾 Save Metadata Only'}
              </button>
              <span style={{ fontSize: 13, color: '#555' }}>Download without DPI/size changes</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function submitForm(url, { file, dpi, widthCm, heightCm, extras = {} }) {
  const form = new FormData();
  form.append('file', file);
  form.append('dpi', String(dpi));
  form.append('widthCm', String(widthCm));
  form.append('heightCm', String(heightCm));
  Object.entries(extras).forEach(([k, v]) => form.append(k, String(v)));
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  return blob;
}




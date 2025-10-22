export const runtime = 'nodejs';

import sharp from 'sharp';
import piexif from 'piexifjs';

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const dpi = Number(form.get('dpi')) || 300;
    const widthCm = Number(form.get('widthCm')) || 0;
    const heightCm = Number(form.get('heightCm')) || 0;
    const resample = String(form.get('resample') || 'false') === 'true';

    if (!file || typeof file.arrayBuffer !== 'function') {
      return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const array = await file.arrayBuffer();
    const inputBuffer = Buffer.from(array);

    let image = sharp(inputBuffer, { failOn: 'none' });

    if (resample && widthCm > 0 && heightCm > 0) {
      const widthPx = Math.max(1, Math.round((widthCm / 2.54) * dpi));
      const heightPx = Math.max(1, Math.round((heightCm / 2.54) * dpi));
      image = image.resize({ width: widthPx, height: heightPx, fit: 'fill' });
    }

    let output = await image.jpeg({ quality: 100 }).withMetadata({ density: dpi }).toBuffer();

    // Optionally set EXIF Software/Make/Model or GPS if provided in form
    const exifMake = form.get('exifMake');
    const exifModel = form.get('exifModel');
    const exifSoftware = form.get('exifSoftware');
    const exifLat = form.get('exifLat');
    const exifLon = form.get('exifLon');

    const hasExifUpdates = !!(exifMake || exifModel || exifSoftware || exifLat || exifLon);
    if (hasExifUpdates) {
      try {
        const updated = injectExif(output, {
          make: exifMake ? String(exifMake) : undefined,
          model: exifModel ? String(exifModel) : undefined,
          software: exifSoftware ? String(exifSoftware) : undefined,
          lat: exifLat != null && exifLat !== '' ? Number(exifLat) : undefined,
          lon: exifLon != null && exifLon !== '' ? Number(exifLon) : undefined
        });
        if (updated) output = updated;
      } catch (e) {
        console.error('Failed to inject EXIF:', e);
      }
    }

    const fileName = sanitizeFilename((file.name || 'image') + `_${dpi}dpi.jpg`);
    return new Response(output, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to export JPEG' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function toDataUrlFromBuffer(buf) {
  const base64 = buf.toString('base64');
  return 'data:image/jpeg;base64,' + base64;
}

function fromDataUrlToBuffer(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Buffer.from(base64, 'base64');
}

function degToDmsRational(deg) {
  const sign = deg < 0 ? -1 : 1;
  const d = Math.floor(Math.abs(deg));
  const minFloat = (Math.abs(deg) - d) * 60;
  const m = Math.floor(minFloat);
  const secFloat = (minFloat - m) * 60;
  const s = Math.round(secFloat * 1000) / 1000;
  return {
    ref: sign < 0 ? 'S' : 'N',
    d: [d, 1],
    m: [m, 1],
    s: [Math.round(s * 1000), 1000]
  };
}

function degToDmsRationalLon(deg) {
  const sign = deg < 0 ? -1 : 1;
  const d = Math.floor(Math.abs(deg));
  const minFloat = (Math.abs(deg) - d) * 60;
  const m = Math.floor(minFloat);
  const secFloat = (minFloat - m) * 60;
  const s = Math.round(secFloat * 1000) / 1000;
  return {
    ref: sign < 0 ? 'W' : 'E',
    d: [d, 1],
    m: [m, 1],
    s: [Math.round(s * 1000), 1000]
  };
}

function injectExif(jpegBuffer, { make, model, software, lat, lon }) {
  try {
    let dataUrl = toDataUrlFromBuffer(jpegBuffer);
    const exifObj = { '0th': {}, 'GPS': {} };
    if (make) exifObj['0th'][piexif.ImageIFD.Make] = make;
    if (model) exifObj['0th'][piexif.ImageIFD.Model] = model;
    if (software) exifObj['0th'][piexif.ImageIFD.Software] = software;
    if (typeof lat === 'number' && !Number.isNaN(lat)) {
      const dms = degToDmsRational(lat);
      exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef] = dms.ref;
      exifObj['GPS'][piexif.GPSIFD.GPSLatitude] = [dms.d, dms.m, dms.s];
    }
    if (typeof lon === 'number' && !Number.isNaN(lon)) {
      const dmsL = degToDmsRationalLon(lon);
      exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = dmsL.ref;
      exifObj['GPS'][piexif.GPSIFD.GPSLongitude] = [dmsL.d, dmsL.m, dmsL.s];
    }
    const exifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    return fromDataUrlToBuffer(newDataUrl);
  } catch (e) {
    return null;
  }
}




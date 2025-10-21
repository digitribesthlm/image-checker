export const runtime = 'nodejs';

import sharp from 'sharp';

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

    const output = await image.jpeg({ quality: 100 }).withMetadata({ density: dpi }).toBuffer();

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



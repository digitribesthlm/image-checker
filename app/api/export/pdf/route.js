export const runtime = 'nodejs';

import { PDFDocument, rgb } from 'pdf-lib';

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const dpi = Number(form.get('dpi')) || 300;
    const widthCm = Number(form.get('widthCm')) || 5;
    const heightCm = Number(form.get('heightCm')) || 5;
    const centerOnPage = String(form.get('center') || 'true') === 'true';

    if (!file || typeof file.arrayBuffer !== 'function') {
      return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const inputBytes = new Uint8Array(await file.arrayBuffer());

    const pdf = await PDFDocument.create();
    // convert cm to points (1 inch = 2.54 cm, 1 inch = 72 points)
    const widthPt = (widthCm / 2.54) * 72;
    const heightPt = (heightCm / 2.54) * 72;

    const page = pdf.addPage([Math.max(widthPt, 72 * 2), Math.max(heightPt, 72 * 2)]);

    // Embed image
    let embedded;
    const firstByte = inputBytes[0];
    if (firstByte === 0x89) {
      embedded = await pdf.embedPng(inputBytes);
    } else if (firstByte === 0xFF) {
      embedded = await pdf.embedJpg(inputBytes);
    } else {
      embedded = await pdf.embedJpg(inputBytes);
    }

    const imgWidthPx = embedded.width;
    const imgHeightPx = embedded.height;

    const scaleX = (widthCm / 2.54) * dpi / imgWidthPx;
    const scaleY = (heightCm / 2.54) * dpi / imgHeightPx;
    const scale = Math.min(scaleX, scaleY);

    const drawWidthPt = (imgWidthPx * scale / dpi) * 72;
    const drawHeightPt = (imgHeightPx * scale / dpi) * 72;

    let x = 0, y = 0;
    if (centerOnPage) {
      x = (page.getWidth() - drawWidthPt) / 2;
      y = (page.getHeight() - drawHeightPt) / 2;
    }

    page.drawImage(embedded, {
      x,
      y,
      width: drawWidthPt,
      height: drawHeightPt
    });

    const pdfBytes = await pdf.save();
    const fileName = sanitizeFilename((file.name || 'image') + `_${widthCm}x${heightCm}cm.pdf`);
    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to export PDF' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, '_');
}




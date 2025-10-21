export async function extractMetadata(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const format = detectFormat(bytes);
  const { dpiX, dpiY, dpiSource } = await detectDpi(bytes, format);
  const { width, height } = await getImagePixelDimensions(file);

  return {
    format,
    width,
    height,
    dpiX,
    dpiY,
    dpiSource
  };
}

function detectFormat(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'PNG';
  }
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'JPEG';
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'WEBP';
  }
  if (bytes.length >= 6 &&
      ((bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x39 || bytes[4] === 0x37) && bytes[5] === 0x61))) {
    return 'GIF';
  }
  return 'Unknown';
}

async function detectDpi(bytes, format) {
  try {
    if (format === 'PNG') {
      const res = parsePngPhys(bytes);
      if (res) return { ...res, dpiSource: 'PNG pHYs' };
    } else if (format === 'JPEG') {
      const res = parseJpegJfifDpi(bytes);
      if (res) return { ...res, dpiSource: 'JPEG JFIF' };
      const exif = parseJpegExifDpi(bytes);
      if (exif) return { ...exif, dpiSource: 'JPEG EXIF' };
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('DPI parse error', e);
  }
  return { dpiX: null, dpiY: null, dpiSource: null };
}

function parsePngPhys(bytes) {
  // PNG structure: 8-byte sig, then chunks: length(4), type(4), data(length), crc(4)
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (type === 'pHYs') {
      if (length >= 9) {
        const pxPerUnitX = readUint32(bytes, dataStart);
        const pxPerUnitY = readUint32(bytes, dataStart + 4);
        const unitSpecifier = bytes[dataStart + 8]; // 1 = meter
        if (unitSpecifier === 1) {
          const dpiX = pxPerUnitX * 0.0254;
          const dpiY = pxPerUnitY * 0.0254;
          return { dpiX: round2(dpiX), dpiY: round2(dpiY) };
        }
      }
      return null;
    }
    offset = dataStart + length + 4; // skip data + crc
  }
  return null;
}

function parseJpegJfifDpi(bytes) {
  // JPEG markers: 0xFF 0xE0 (APP0) then 'JFIF\0' then density units + X/Y density
  let offset = 2; // skip SOI (FFD8)
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xFF) {
      // invalid marker alignment
      return null;
    }
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xE0) {
      // APP0
      const ident = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7], bytes[offset + 8]
      );
      if (ident === 'JFIF\u0000') {
        const units = bytes[offset + 9]; // 1 = dpi, 2 = dpcm
        const xDensity = (bytes[offset + 10] << 8) | bytes[offset + 11];
        const yDensity = (bytes[offset + 12] << 8) | bytes[offset + 13];
        if (units === 1) {
          return { dpiX: xDensity, dpiY: yDensity };
        } else if (units === 2) {
          return { dpiX: round2(xDensity * 2.54), dpiY: round2(yDensity * 2.54) };
        }
      }
    }
    if (marker === 0xDA /* SOS */) {
      // start of scan: image data follows, stop scanning APPs
      break;
    }
    offset += 2 + size;
  }
  return null;
}

function parseJpegExifDpi(bytes) {
  // Minimal EXIF TIFF parse: look for APP1 with 'Exif\0\0', then parse IFD0 for XResolution/YResolution and ResolutionUnit
  let offset = 2; // after SOI
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xFF) return null;
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xE1 && size >= 8) { // APP1
      const ident = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7], bytes[offset + 8], bytes[offset + 9]);
      if (ident.startsWith('Exif')) {
        const tiffStart = offset + 10;
        return readExifDpi(bytes, tiffStart, size - 8);
      }
    }
    if (marker === 0xDA) break;
    offset += 2 + size;
  }
  return null;
}

function readExifDpi(bytes, tiffStart, tiffLength) {
  if (tiffLength < 8) return null;
  const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
  const isLE = byteOrder === 'II';
  const magic = readUint16(bytes, tiffStart + 2, isLE);
  if (magic !== 42) return null;
  const ifd0Offset = readUint32(bytes, tiffStart + 4, isLE);
  const ifd0Start = tiffStart + ifd0Offset;
  if (ifd0Start + 2 > tiffStart + tiffLength) return null;
  const numEntries = readUint16(bytes, ifd0Start, isLE);
  let xRes = null, yRes = null, unit = 2; // default 2=inches per EXIF spec?

  for (let i = 0; i < numEntries; i++) {
    const entry = ifd0Start + 2 + i * 12;
    if (entry + 12 > tiffStart + tiffLength) break;
    const tag = readUint16(bytes, entry, isLE);
    const type = readUint16(bytes, entry + 2, isLE);
    const count = readUint32(bytes, entry + 4, isLE);
    const valueOffset = readUint32(bytes, entry + 8, isLE);

    if (tag === 0x0128) { // ResolutionUnit
      unit = valueOffset; // 2 = inch, 3 = cm
    }
    if (tag === 0x011A || tag === 0x011B) { // XResolution or YResolution
      if (type !== 5 /* RATIONAL */ || count !== 1) continue;
      const addr = tiffStart + valueOffset;
      if (addr + 8 > tiffStart + tiffLength) continue;
      const num = readUint32(bytes, addr, isLE);
      const den = readUint32(bytes, addr + 4, isLE);
      const val = den ? num / den : 0;
      if (tag === 0x011A) xRes = val;
      else yRes = val;
    }
  }
  if (xRes && yRes) {
    if (unit === 2) return { dpiX: round2(xRes), dpiY: round2(yRes) };
    if (unit === 3) return { dpiX: round2(xRes * 2.54), dpiY: round2(yRes * 2.54) };
  }
  return null;
}

function readUint16(bytes, offset, littleEndian = false) {
  if (littleEndian) return bytes[offset] | (bytes[offset + 1] << 8);
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset, littleEndian = false) {
  if (littleEndian) return (bytes[offset]) | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | (bytes[offset + 3]);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getImagePixelDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}



# Image Checker (Next.js, JavaScript only)

A simple Next.js app to inspect image metadata before printing. It shows format, dimensions, and extracts DPI from JPEG (JFIF/EXIF) and PNG (pHYs). Includes a print-size helper to check if your image meets a desired physical size and DPI.

## Requirements
- Node 18+

## Install & Run
```bash
npm install
npm run dev
```
Visit `http://localhost:3000`.

## Features
- Drag-and-drop or file picker
- Shows: format, width/height, aspect ratio, DPI (when available)
- DPI sources supported:
  - PNG: pHYs chunk (meters -> inch)
  - JPEG: JFIF density or EXIF X/YResolution + unit
- Print-size checker: enter size (cm) and DPI to validate

## Notes
- Some images may not contain DPI metadata. In that case, you can still compute printable size using pixel dimensions and your target DPI.
- No TypeScript. All files are `.js`.

## License
MIT

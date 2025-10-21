'use client';

import ImageInspector from '../components/ImageInspector';

export default function Page() {
  return (
    <main style={{ maxWidth: 920, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 8 }}>Image Metadata & Print Checker</h1>
      <p style={{ marginTop: 0, color: '#555' }}>
        Drop an image or choose a file to see DPI, dimensions, format, and print suitability.
      </p>
      <ImageInspector />
      <footer style={{ marginTop: 40, color: '#777', fontSize: 13 }}>
        Built with Next.js (JavaScript only)
      </footer>
    </main>
  );
}



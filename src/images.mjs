// Page versions of the photos through sharp. The originals in content/photos are never served:
// the page gets widths 640, 1024 and 1600 in webp and jpg, written to dist/img.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const WIDTHS = [640, 1024, 1600];
export const QUALITY = 82;

export const slugify = (name) => name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// files: the photo file names from the yaml. Returns a manifest for the renderer:
// { file: { slug, widths, width, height } } with the size of the original (after EXIF rotation).
// A version is made only when it is missing or older than the original; force remakes all.
export async function buildImages({ photosDir, distDir, files, force = false, log = console.log }) {
  const imgDir = path.join(distDir, 'img');
  await mkdir(imgDir, { recursive: true });
  const manifest = {};
  for (const file of [...new Set(files)]) {
    const src = path.join(photosDir, file);
    const original = await stat(src);
    const meta = await sharp(src).metadata();
    const swapped = (meta.orientation ?? 1) >= 5; // EXIF orientations 5..8 swap width and height
    const width = swapped ? meta.height : meta.width;
    const height = swapped ? meta.width : meta.height;
    const widths = WIDTHS.filter((w) => w <= width);
    if (widths.length === 0) widths.push(width);
    const slug = slugify(file);
    let made = 0;
    for (const w of widths) {
      const outputs = [
        ['webp', (image) => image.webp({ quality: QUALITY })],
        ['jpg', (image) => image.jpeg({ quality: QUALITY, mozjpeg: true })],
      ];
      for (const [ext, encode] of outputs) {
        const out = path.join(imgDir, `${slug}-${w}.${ext}`);
        const existing = await stat(out).catch(() => null);
        if (!force && existing && existing.mtimeMs >= original.mtimeMs) continue;
        await encode(sharp(src).rotate().resize({ width: w })).toFile(out);
        made += 1;
      }
    }
    manifest[file] = { slug, widths, width, height };
    log(`  img/${slug}-{${widths.join(',')}}.{webp,jpg}  ${made ? `${made} files made` : 'up to date'}`);
  }
  return manifest;
}

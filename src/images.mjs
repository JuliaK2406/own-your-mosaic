// Page versions of the photos through sharp. The originals in content/photos are never served:
// the page gets widths 640, 1024 and 1600 in webp and jpg, written to dist/img.

import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const WIDTHS = [640, 1024, 1600];
export const QUALITY = 82;

// Crops made at build time (sharp extract), in pixels of the original, so the page never
// loads pixels it does not show. Chosen by eye on the rendered picture, not by the numbers.
export const CROPS = {
  // the studio portrait is horizontal (5918 x 4824): a 4:5 frame on the full height,
  // the face in the upper third, both arms and the watch whole
  'julia-krylova.jpg': { left: 1755, top: 0, width: 3859, height: 4824 },
};

export const slugify = (name) => name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// files: the photo file names from the yaml. Returns a manifest for the renderer:
// { file: { slug, widths, width, height } } with the size of the served frame (the crop, or
// the original after EXIF rotation). A version is made only when it is missing or older than
// the original or than this file (the crops live here); force remakes all.
export async function buildImages({ photosDir, distDir, files, force = false, log = console.log }) {
  const imgDir = path.join(distDir, 'img');
  await mkdir(imgDir, { recursive: true });
  const selfTime = (await stat(fileURLToPath(import.meta.url))).mtimeMs;
  const manifest = {};
  for (const file of [...new Set(files)]) {
    const src = path.join(photosDir, file);
    const sourceTime = Math.max((await stat(src)).mtimeMs, selfTime);
    const meta = await sharp(src).metadata();
    const swapped = (meta.orientation ?? 1) >= 5; // EXIF orientations 5..8 swap width and height
    const fullWidth = swapped ? meta.height : meta.width;
    const fullHeight = swapped ? meta.width : meta.height;
    const crop = CROPS[file] || null;
    if (crop && (crop.left + crop.width > fullWidth || crop.top + crop.height > fullHeight)) {
      throw new Error(`${file}: the crop ${JSON.stringify(crop)} does not fit in ${fullWidth} x ${fullHeight}`);
    }
    const width = crop ? crop.width : fullWidth;
    const height = crop ? crop.height : fullHeight;
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
        if (!force && existing && existing.mtimeMs >= sourceTime) continue;
        let image = sharp(src).rotate();
        if (crop) image = image.extract(crop);
        await encode(image.resize({ width: w })).toFile(out);
        made += 1;
      }
    }
    manifest[file] = { slug, widths, width, height };
    log(`  img/${slug}-{${widths.join(',')}}.{webp,jpg}  ${crop ? 'cropped, ' : ''}${made ? `${made} files made` : 'up to date'}`);
  }
  return manifest;
}

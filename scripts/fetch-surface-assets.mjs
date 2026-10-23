// Reproducible, optional authoring step. The game serves the checked-in assets locally.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = new URL('../public/textures/surfaces/', import.meta.url);
await mkdir(folder, { recursive: true });
const manifest = [];
for (const id of ['concrete_floor', 'corrugated_iron', 'red_brick_03']) {
  const response = await fetch(`https://api.polyhaven.com/files/${id}`);
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const files = await response.json();
  const downloaded = await Promise.all(['diff', 'nor_gl', 'rough'].map(async (map) => {
    const sourceKey = map === 'diff' ? 'Diffuse' : map === 'rough' ? 'Rough' : map;
    const file = files[sourceKey]['1k'].jpg;
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const md5 = createHash('md5').update(bytes).digest('hex');
    if (md5 !== file.md5) throw new Error(`${id}/${map}: checksum mismatch`);
    const filename = `${id}_${map}_1k.jpg`;
    await writeFile(new URL(filename, folder), bytes);
    return { file: filename, bytes: bytes.length, md5, source: file.url };
  }));
  manifest.push({ id, source: `https://polyhaven.com/a/${id}`, license: 'CC0-1.0', files: downloaded });
  console.log(id, downloaded.reduce((total, file) => total + file.bytes, 0), 'bytes, verified');
}
await writeFile(new URL('manifest.json', folder), JSON.stringify(manifest, null, 2) + '\n');

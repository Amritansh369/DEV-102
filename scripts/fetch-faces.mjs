// Downloads the test portraits used by the seed into database/prisma/faces (run once; files are committed).
// Source: https://randomuser.me, free portraits published for testing and prototyping.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'database', 'prisma', 'faces');
mkdirSync(dir, { recursive: true });
const PER_GENDER = 36;
let fetched = 0;
for (const gender of ['men', 'women']) {
  for (let i = 0; i < PER_GENDER; i++) {
    const file = join(dir, `${gender}-${i}.jpg`);
    if (existsSync(file)) continue;
    const res = await fetch(`https://randomuser.me/api/portraits/${gender}/${i}.jpg`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${gender}/${i}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    fetched++;
  }
}
console.log(`[faces] ${fetched} downloaded, ${PER_GENDER * 2} available in database/prisma/faces`);

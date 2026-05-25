import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');
const seedPath = resolve(projectRoot, 'data', 'seed.json');
const dataPath = resolve(process.env.LEXYOS_DATA_PATH ?? resolve(projectRoot, 'data', 'lexyos.json'));

await mkdir(dirname(dataPath), { recursive: true });
await copyFile(seedPath, dataPath);
console.log(`Reset LexyOS data: ${dataPath}`);

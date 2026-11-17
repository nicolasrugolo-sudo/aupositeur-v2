import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} id */
export function hasCitationVideo(id) {
  return existsSync(join(process.cwd(), 'public', 'videos', 'citations', id + '.mp4'));
}

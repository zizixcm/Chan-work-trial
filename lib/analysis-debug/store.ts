import { mkdir, open, readdir, rename, unlink, writeFile, constants } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DebugRun, DebugStore, DebugSummary } from './types';

const VALID_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_RECORD_BYTES = 800_000;
const MAX_RUNS = 200;
const summary = ({input: _input, response: _response, parsed: _parsed, validated: _validated, appliedChanges: _changes, ...rest}: DebugRun): DebugSummary => rest;

/** Private diagnostic sidecar, never a job queue or authoritative result store.
 * Atomic replacement supports one writer per attempt and multiple readers.
 * Expired entries are hidden immediately, physically pruned on writes/prune(). */
export class LocalDebugStore implements DebugStore {
  constructor(private readonly root: string, private readonly clock = () => Date.now()) {}
  private location(id: string) {
    if (!VALID_ID.test(id)) throw new Error('Invalid diagnostic ID');
    return path.join(this.root, `${id}.json`);
  }
  async get(id: string): Promise<DebugRun | null> {
    if (!VALID_ID.test(id)) return null;
    let file;
    try {
      file = await open(this.location(id), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) return null;
      const value = JSON.parse(await file.readFile('utf8')) as DebugRun;
      if (value.id !== id || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= this.clock()) return null;
      return value;
    } catch (error) {
      if (error instanceof SyntaxError || ['ENOENT', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
      throw error;
    } finally { await file?.close(); }
  }
  private async ids() {
    try { return (await readdir(this.root)).filter(name => name.endsWith('.json') && VALID_ID.test(name.slice(0, -5))).map(name => name.slice(0, -5)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  async list(): Promise<DebugSummary[]> {
    const rows: DebugSummary[] = [];
    for (const id of await this.ids()) {
      const value = await this.get(id);
      if (value) rows.push(summary(value));
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_RUNS);
  }
  async prune() {
    const rows: DebugSummary[] = [];
    for (const id of await this.ids()) {
      const value = await this.get(id);
      if (!value) await unlink(this.location(id)).catch(() => {});
      else rows.push(summary(value));
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const row of rows.slice(MAX_RUNS)) await unlink(this.location(row.id)).catch(() => {});
  }
  async save(run: DebugRun) {
    const destination = this.location(run.id);
    const serialized = JSON.stringify(run);
    if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) throw new Error('Diagnostic record exceeds size limit');
    await mkdir(this.root, {recursive: true, mode: 0o700});
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, {flag: 'wx', mode: 0o600});
      await rename(temporary, destination);
    } finally { await unlink(temporary).catch(() => {}); }
    await this.prune();
  }
}

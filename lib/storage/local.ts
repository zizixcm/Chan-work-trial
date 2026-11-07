import { mkdir, readFile, writeFile, link, unlink, open, constants } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BlobStorage } from "../model";
function dataDirectory() { return path.resolve(process.env.PORTAL_DATA_DIR || path.join(process.cwd(), ".data")); }
export class LocalBlobStorage implements BlobStorage {
  constructor(private root = path.join(dataDirectory(), "files")) {}
  private location(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Uint8Array) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const destination = this.location(key);
    const temporary = destination + ".tmp-" + randomUUID();
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await link(temporary, destination); // Atomic create-only: never overwrite a retained version.
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async get(key: string) {
    const file = await open(this.location(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { return new Uint8Array(await file.readFile()); } finally { await file.close(); }
  }
  async remove(key: string) {
    await unlink(this.location(key));
  }
}

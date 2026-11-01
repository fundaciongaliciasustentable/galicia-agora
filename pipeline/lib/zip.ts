// Minimal ZIP reader for adapters that receive one archive and need one member of it, without a
// dependency: central directory → local header → stored or deflated data. No ZIP64, no
// encryption; it throws on either instead of guessing.

import { createInflateRaw } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Offset of the entry's local file header. */
  offset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Every member listed in the archive's central directory. */
export function zipEntries(buf: Buffer): ZipEntry[] {
  // The end-of-central-directory record sits in the last 22 + 65,535 (comment) bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error('Corrupt ZIP central directory');
    const flags = buf.readUInt16LE(p + 8);
    if (flags & 1) throw new Error('Encrypted ZIP members are not supported');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const entry: ZipEntry = {
      name: buf.toString('latin1', p + 46, p + 46 + nameLen),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
    };
    if (entry.compressedSize === 0xffffffff || entry.offset === 0xffffffff)
      throw new Error('ZIP64 members are not supported');
    out.push(entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The compressed bytes of one member (after its local header). */
function rawData(buf: Buffer, e: ZipEntry): Buffer {
  if (buf.readUInt32LE(e.offset) !== LOCAL) throw new Error(`Corrupt ZIP local header: ${e.name}`);
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  return buf.subarray(start, start + e.compressedSize);
}

/**
 * Stream one member's uncompressed bytes in chunks, so members far larger than a JavaScript
 * string (city GML files run to hundreds of MB) can be scanned.
 */
export async function* zipChunks(buf: Buffer, e: ZipEntry): AsyncGenerator<Buffer> {
  const data = rawData(buf, e);
  if (e.method === 0) {
    yield data;
    return;
  }
  if (e.method !== 8) throw new Error(`Unsupported ZIP compression method ${e.method}: ${e.name}`);
  const inflate = createInflateRaw();
  inflate.end(data);
  for await (const chunk of inflate) yield chunk as Buffer;
}

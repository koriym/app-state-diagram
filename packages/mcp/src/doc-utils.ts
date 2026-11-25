// Path safety and profile serialization are shared with the CLI (HTML
// output reads the same doc files), so they live in one place
import * as fs from "fs";
import { resolveSafeLocalPath } from "@alps-asd/app-state-diagram/resolver/doc-inliner.js";

export { decodeXmlReferences, resolveSafeLocalPath, serializeLike, XML_ROUNDTRIP_OPTIONS } from "@alps-asd/app-state-diagram/resolver/doc-inliner.js";

export const DOC_DIR = "alps/docs";
export const INLINE_DOC_MAX_LENGTH = 200;

export function shouldExternalize(doc: string): boolean {
  return doc.length > INLINE_DOC_MAX_LENGTH || doc.includes("\n");
}

export function safeFileName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "-");
}

/**
 * Choose the doc file for a descriptor that has no linked doc file yet:
 * alps/docs/<id>.md, or <id>-2.md, <id>-3.md, ... when that path is
 * already taken. A taken path may be another descriptor's doc (kept at its
 * old name after a rename), an id with the same safe file name ("a:b" and
 * "a-b"), or an orphaned file; none of them may be overwritten.
 */
export function newDocFile(baseDir: string, id: string): string {
  const stem = `${DOC_DIR}/${safeFileName(id)}`;
  let candidate = `${stem}.md`;
  for (let n = 2; ; n++) {
    const absPath = resolveSafeLocalPath(baseDir, candidate);
    // An unsafe path is returned as is; the caller rejects it
    if (absPath === undefined || !fs.existsSync(absPath)) {
      return candidate;
    }
    candidate = `${stem}-${n}.md`;
  }
}

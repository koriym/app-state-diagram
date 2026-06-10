/**
 * Doc store - descriptor documentation with automatic externalization
 *
 * Short docs are stored inline in the ALPS profile. When a doc is too large
 * for inline use (long text, multi-line Markdown), it is written to
 * `alps-doc/<descriptor-id>.md` next to the profile and linked from the
 * descriptor via `doc.href`, keeping the profile compact while allowing
 * rich documentation.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AlpsDescriptor, AlpsDoc } from '../parser/alps-parser';

export const DOC_DIR = 'alps-doc';

/** Docs longer than this (or multi-line) are stored in an external file */
export const INLINE_DOC_MAX_LENGTH = 200;

export type DocPlacement = 'auto' | 'inline' | 'external';

export interface SetDocResult {
  id: string;
  placement: 'inline' | 'external';
  /** Path of the external doc file (relative to the profile), when external */
  docFile?: string;
  /** Previous external doc file left behind after switching to inline */
  orphanedDocFile?: string;
}

/**
 * Decide whether a doc should be stored in an external file
 */
export function shouldExternalize(doc: string): boolean {
  return doc.length > INLINE_DOC_MAX_LENGTH || doc.includes('\n');
}

/**
 * Set or update the doc of a descriptor in a JSON ALPS profile file.
 *
 * With placement 'auto', the doc is stored externally when it is large
 * (see shouldExternalize) or when the descriptor already uses an external
 * doc file under alps-doc/ (to avoid churn between inline and external).
 */
export function setDescriptorDoc(
  profilePath: string,
  id: string,
  doc: string,
  placement: DocPlacement = 'auto'
): SetDocResult {
  const absPath = path.resolve(profilePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Profile file not found: ${profilePath}`);
  }

  const content = fs.readFileSync(absPath, 'utf-8');
  if (!content.trim().startsWith('{')) {
    throw new Error(
      'Writing docs is currently supported for JSON profiles only. ' +
        'Convert the XML profile to JSON, or edit the XML directly.'
    );
  }

  let root: any;
  try {
    root = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON format: ${(e as Error).message}`);
  }

  const descriptor = findDescriptorById(root?.alps?.descriptor, id);
  if (!descriptor) {
    throw new Error(`Descriptor not found: ${id}`);
  }

  const existingDoc: string | AlpsDoc | undefined = descriptor.doc;
  const existingHref =
    typeof existingDoc === 'object' && existingDoc?.href ? existingDoc.href : undefined;
  const hasExternalDoc = existingHref !== undefined && isDocDirHref(existingHref);

  let external: boolean;
  if (placement === 'auto') {
    external = hasExternalDoc || shouldExternalize(doc);
  } else {
    external = placement === 'external';
  }

  const baseDir = path.dirname(absPath);
  const result: SetDocResult = { id, placement: external ? 'external' : 'inline' };

  if (external) {
    // Reuse the existing alps-doc file location when present
    const docFile = hasExternalDoc ? existingHref! : `${DOC_DIR}/${safeFileName(id)}.md`;
    const docFilePath = path.resolve(baseDir, docFile);
    fs.mkdirSync(path.dirname(docFilePath), { recursive: true });
    fs.writeFileSync(docFilePath, doc.endsWith('\n') ? doc : `${doc}\n`, 'utf-8');
    descriptor.doc = { href: docFile, format: 'markdown' };
    result.docFile = docFile;
  } else {
    if (hasExternalDoc) {
      // The previous external file is kept; deleting user files silently is unsafe
      result.orphanedDocFile = existingHref;
    }
    if (typeof existingDoc === 'object' && existingDoc !== null && !hasExternalDoc) {
      // Preserve object form (and format) of an existing inline doc
      const inlineDoc: AlpsDoc = { ...existingDoc, value: doc };
      delete inlineDoc.href;
      descriptor.doc = inlineDoc;
    } else {
      descriptor.doc = doc;
    }
  }

  fs.writeFileSync(absPath, serializeLike(root, content), 'utf-8');
  return result;
}

/**
 * Resolve the doc of a descriptor, reading external alps-doc files
 */
export function resolveDoc(
  baseDir: string,
  doc: string | AlpsDoc | undefined
): { text: string; href?: string; format?: string } | undefined {
  if (doc === undefined || doc === null) {
    return undefined;
  }
  if (typeof doc === 'string') {
    return { text: doc };
  }
  if (doc.href && !/^https?:\/\//.test(doc.href)) {
    const docPath = path.resolve(baseDir, doc.href);
    if (fs.existsSync(docPath)) {
      return { text: fs.readFileSync(docPath, 'utf-8'), href: doc.href, format: doc.format };
    }
    return { text: doc.value || '', href: doc.href, format: doc.format };
  }
  return { text: doc.value || '', href: doc.href, format: doc.format };
}

/**
 * Find a descriptor by id, searching nested descriptors
 */
function findDescriptorById(descriptors: unknown, id: string): AlpsDescriptor | null {
  if (!Array.isArray(descriptors)) {
    return null;
  }
  for (const desc of descriptors) {
    if (desc && typeof desc === 'object') {
      if ((desc as AlpsDescriptor).id === id) {
        return desc as AlpsDescriptor;
      }
      const found = findDescriptorById((desc as AlpsDescriptor).descriptor, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function isDocDirHref(href: string): boolean {
  return href.startsWith(`${DOC_DIR}/`) || href.startsWith(`./${DOC_DIR}/`);
}

function safeFileName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '-');
}

/**
 * Serialize JSON keeping the original file's indentation and trailing newline
 */
function serializeLike(root: unknown, original: string): string {
  const indentMatch = original.match(/^([ \t]+)"/m);
  const indent = indentMatch ? indentMatch[1] : '  ';
  const json = JSON.stringify(root, null, indent);
  return original.endsWith('\n') ? `${json}\n` : json;
}

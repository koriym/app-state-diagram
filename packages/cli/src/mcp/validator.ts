/**
 * ALPS profile validation
 *
 * Structural and semantic checks over a parsed ALPS document. Error and
 * warning codes follow the conventions documented in the README
 * (E001-E011, W001-W004).
 */

import type { AlpsDocument, AlpsDescriptor } from '../parser/alps-parser';

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  descriptorId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const VALID_TYPES = new Set(['semantic', 'safe', 'unsafe', 'idempotent']);
const TRANSITION_TYPES = new Set(['safe', 'unsafe', 'idempotent']);

/**
 * Validate an ALPS document
 */
export function validateAlps(document: AlpsDocument): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!document || !document.alps) {
    errors.push({ code: 'E008', severity: 'error', message: 'Missing alps property' });
    return { valid: false, errors, warnings };
  }

  const descriptors = document.alps.descriptor;
  if (!descriptors || !Array.isArray(descriptors) || descriptors.length === 0) {
    errors.push({ code: 'E009', severity: 'error', message: 'Missing descriptor array' });
    return { valid: false, errors, warnings };
  }

  const allIds = new Set<string>();
  const referencedIds = new Set<string>();
  const seenIds = new Set<string>();

  // First pass: collect ids and references
  walkDescriptors(descriptors, desc => {
    if (desc.id) {
      if (seenIds.has(desc.id)) {
        errors.push({
          code: 'E005',
          severity: 'error',
          message: `Duplicate id: ${desc.id}`,
          descriptorId: desc.id,
        });
      }
      seenIds.add(desc.id);
      allIds.add(desc.id);
    }
    const href = localFragment(desc.href);
    if (href) {
      referencedIds.add(href);
    }
    const rt = localFragment(desc.rt);
    if (rt) {
      referencedIds.add(rt);
    }
  });

  // Second pass: per-descriptor checks
  walkDescriptors(descriptors, desc => {
    if (!desc.id && !desc.href) {
      errors.push({ code: 'E001', severity: 'error', message: 'Descriptor missing id or href' });
      return;
    }

    if (desc.type && !VALID_TYPES.has(desc.type)) {
      errors.push({
        code: 'E003',
        severity: 'error',
        message: `Invalid type "${desc.type}"`,
        descriptorId: desc.id,
      });
    }

    const isTransitionType = !!desc.type && TRANSITION_TYPES.has(desc.type);
    if (isTransitionType && desc.id && !desc.rt) {
      errors.push({
        code: 'E002',
        severity: 'error',
        message: `Transition "${desc.id}" is missing rt (return type)`,
        descriptorId: desc.id,
      });
    }

    const rt = localFragment(desc.rt);
    if (rt && !allIds.has(rt)) {
      errors.push({
        code: 'E004',
        severity: 'error',
        message: `Broken reference: rt "#${rt}" points to non-existent id`,
        descriptorId: desc.id,
      });
    }
    const href = localFragment(desc.href);
    if (href && !allIds.has(href)) {
      errors.push({
        code: 'E004',
        severity: 'error',
        message: `Broken reference: href "#${href}" points to non-existent id`,
        descriptorId: desc.id,
      });
    }

    if (desc.id && desc.type === 'safe' && !desc.id.startsWith('go')) {
      warnings.push({
        code: 'W002',
        severity: 'warning',
        message: `Safe transition "${desc.id}" should start with "go"`,
        descriptorId: desc.id,
      });
    }
    if (
      desc.id &&
      (desc.type === 'unsafe' || desc.type === 'idempotent') &&
      !desc.id.startsWith('do')
    ) {
      warnings.push({
        code: 'W003',
        severity: 'warning',
        message: `${desc.type} transition "${desc.id}" should start with "do"`,
        descriptorId: desc.id,
      });
    }
  });

  // Orphan check: top-level descriptors never referenced anywhere
  for (const desc of descriptors) {
    if (desc.id && !referencedIds.has(desc.id)) {
      warnings.push({
        code: 'W004',
        severity: 'warning',
        message: `Orphan descriptor "${desc.id}" is defined but never referenced`,
        descriptorId: desc.id,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Extract a local fragment id from href/rt ("#id" or "file.json#id" -> null for external)
 */
function localFragment(ref: string | undefined): string | null {
  if (!ref || !ref.startsWith('#')) {
    return null;
  }
  return ref.substring(1);
}

function walkDescriptors(
  descriptors: AlpsDescriptor[],
  visit: (desc: AlpsDescriptor) => void
): void {
  for (const desc of descriptors) {
    visit(desc);
    if (Array.isArray(desc.descriptor)) {
      walkDescriptors(desc.descriptor, visit);
    }
  }
}

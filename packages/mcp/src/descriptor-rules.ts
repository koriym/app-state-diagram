/**
 * Descriptor rules shared by the JSON and XML stores
 */

const TRANSITION_TYPES = new Set(["safe", "unsafe", "idempotent"]);

export function isTransitionType(type: string | undefined): boolean {
  return type !== undefined && TRANSITION_TYPES.has(type);
}

/** Same rule as validator W007: rt names the state a transition leads to */
export function rtTransitionWarning(target: string): string {
  return `rt target "#${target}" is a transition, not a state (W007)`;
}

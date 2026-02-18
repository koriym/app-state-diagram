/**
 * DOT Generator for Node.js
 *
 * Generates Graphviz DOT format from ALPS data.
 * Ported from docs/js/diagramAdapters.js Alps2DotAdapter.generateDotFromAlps()
 */

import type { AlpsDocument, AlpsDescriptor } from '../parser/alps-parser';

export type LabelMode = 'id' | 'title';

/**
 * Generate DOT content from ALPS data
 */
export function generateDot(alpsData: AlpsDocument, labelMode: LabelMode = 'id'): string {
  const descriptors = alpsData.alps?.descriptor || [];

  // Get all transition targets (rt values) - these are the actual states
  const transitions = descriptors.filter(d => d.type && d.rt);
  const rtTargets = new Set(transitions.map(t => t.rt!.replace('#', '')));

  // States are descriptors that are referenced as rt targets
  const states = descriptors.filter(d => d.id && rtTargets.has(d.id));

  const getLabel = (descriptor: AlpsDescriptor): string => {
    if (labelMode === 'title') {
      return descriptor.title || descriptor.id || '';
    }
    return descriptor.id || '';
  };

  let dot = `digraph application_state_diagram {
    graph [
        labelloc="t";
        fontname="Helvetica"
    ];
    node [shape = box, style = "bold,filled" fillcolor="lightgray", margin="0.3,0.1"];

`;

  // Add state nodes
  for (const state of states) {
    if (state.id) {
      dot += `    ${state.id} [margin=0.1, label="${getLabel(state)}", shape=box, URL="#${state.id}"]\n`;
    }
  }

  dot += '\n';

  // Group transitions by source-target pair
  const edgeGroups = new Map<string, Array<{ label: string; id: string; type?: string }>>();
  for (const trans of transitions) {
    if (trans.id && trans.rt) {
      const targetState = trans.rt.replace('#', '');
      const sourceStates = findSourceStatesForTransition(trans.id, descriptors);

      for (const sourceState of sourceStates) {
        const key = `${sourceState}|${targetState}`;
        if (!edgeGroups.has(key)) {
          edgeGroups.set(key, []);
        }
        edgeGroups.get(key)!.push({
          label: getLabel(trans),
          id: trans.id,
          type: trans.type,
        });
      }
    }
  }

  // Render edges - single edge per source-target pair with clickable HTML labels
  for (const [key, edges] of edgeGroups) {
    const [sourceState, targetState] = key.split('|');
    const classes = edges.map(e => e.id).join(' ');

    if (edges.length === 1) {
      const e = edges[0];
      const fontColor = getTransitionColor(e.type);
      const symbol = getTransitionSymbol(e.type);
      dot += `    ${sourceState} -> ${targetState} [label="${symbol}${e.label}" URL="#${e.id}" fontsize=13 fontcolor="${fontColor}" class="${e.id}" penwidth=1.5 color="#555555"];\n`;
    } else {
      const rows = edges.map(e => {
        const fontColor = getTransitionColor(e.type);
        const symbol = getTransitionSymbol(e.type);
        return `<TR><TD HREF="#${e.id}" TITLE="${e.id}"><FONT COLOR="${fontColor}" POINT-SIZE="13">${symbol}${e.label}</FONT></TD></TR>`;
      }).join('');
      const htmlLabel = `<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0">${rows}</TABLE>>`;
      dot += `    ${sourceState} -> ${targetState} [label=${htmlLabel} class="${classes}" penwidth=1.5 color="#555555"];\n`;
    }
  }

  dot += '\n';

  // Add basic state nodes again (for compatibility)
  for (const state of states) {
    if (state.id) {
      dot += `    ${state.id} [label="${getLabel(state)}" URL="#${state.id}"]\n`;
    }
  }

  dot += '\n}';

  return dot;
}

/**
 * Find source states that contain a transition
 */
function findSourceStatesForTransition(transitionId: string, descriptors: AlpsDescriptor[]): string[] {
  const sources: string[] = [];

  for (const desc of descriptors) {
    if (desc.descriptor && Array.isArray(desc.descriptor)) {
      const hasTransition = desc.descriptor.some(nested =>
        nested.href === `#${transitionId}` || nested.id === transitionId
      );
      if (hasTransition && desc.id) {
        sources.push(desc.id);
      }
    }
  }

  return sources.length > 0 ? sources : ['UnknownState'];
}

/**
 * Get color for transition type
 */
function getTransitionColor(type?: string): string {
  switch (type) {
    case 'safe':
      return '#00A86B';
    case 'unsafe':
      return '#FF4136';
    case 'idempotent':
      return '#D4A000';
    default:
      return '#000000';
  }
}

/**
 * Get symbol prefix for transition type
 */
function getTransitionSymbol(type?: string): string {
  switch (type) {
    case 'unsafe':
      return '\u26A0 ';
    case 'idempotent':
      return '\u21BB ';
    default:
      return '';
  }
}

/**
 * Build relationship map for parent-child highlighting
 */
export function buildRelationshipMap(alpsData: AlpsDocument): {
  parentOf: Record<string, string[]>;
  childrenOf: Record<string, string[]>;
} {
  const relationships = {
    parentOf: {} as Record<string, string[]>,
    childrenOf: {} as Record<string, string[]>,
  };

  const descriptors = alpsData.alps?.descriptor || [];

  for (const parent of descriptors) {
    if (parent.id && parent.descriptor && Array.isArray(parent.descriptor)) {
      relationships.childrenOf[parent.id] = [];

      for (const child of parent.descriptor) {
        let childId = child.href || child.id;
        if (childId && childId.startsWith('#')) {
          childId = childId.substring(1);
        }

        if (childId) {
          relationships.childrenOf[parent.id].push(childId);

          if (!relationships.parentOf[childId]) {
            relationships.parentOf[childId] = [];
          }
          relationships.parentOf[childId].push(parent.id);
        }
      }
    }
  }

  return relationships;
}

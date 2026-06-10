/**
 * ALPS MCP server
 *
 * Exposes ALPS profiles to AI agents over the Model Context Protocol
 * (stdio). Unlike the one-shot CLI, the MCP tools let an agent query the
 * application state model incrementally (filter descriptors, follow
 * transitions, enumerate paths) and update descriptor documentation.
 *
 * Large docs are automatically stored in external Markdown files under
 * alps-doc/ and linked via doc.href (see doc-store.ts).
 */

import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseAlpsAuto, docText, findDescriptorById, walkDescriptors } from '../parser/alps-parser';
import type { AlpsDocument, AlpsDescriptor } from '../parser/alps-parser';
import { FileResolver } from '../resolver/file-resolver';
import { generateDot } from '../generator/dot-generator';
import { dotToSvgHighQuality } from '../generator/svg-generator';
import { extractGraph, findPaths, formatPath, findContainers } from './graph';
import { validateAlps } from './validator';
import { setDescriptorDoc, resolveDoc, INLINE_DOC_MAX_LENGTH } from './doc-store';

// Version is read from package.json so releases bump it in one place
const SERVER_VERSION: string = require('../../package.json').version;
const DOC_PREVIEW_LENGTH = 80;

interface LoadedProfile {
  document: AlpsDocument;
  baseDir: string;
  absPath: string;
}

/**
 * Read, parse, and resolve an ALPS profile from disk.
 * Always reads fresh so edits between tool calls are visible.
 */
async function loadProfile(file: string): Promise<LoadedProfile> {
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Profile file not found: ${file}`);
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  const baseDir = path.dirname(absPath);
  const parsed = parseAlpsAuto(content);
  const resolver = new FileResolver(baseDir);
  const document = await resolver.resolve(parsed);
  return { document, baseDir, absPath };
}

/**
 * Split the space-separated tag attribute into a list
 */
function descriptorTags(desc: AlpsDescriptor): string[] {
  return (desc.tag || '').split(/\s+/).filter(Boolean);
}

/**
 * Short doc excerpt for search results; external docs show their href
 */
function docPreview(desc: AlpsDescriptor): string | undefined {
  const text = docText(desc.doc);
  if (!text) {
    const href = typeof desc.doc === 'object' ? desc.doc?.href : undefined;
    return href ? `(external: ${href})` : undefined;
  }
  return text.length > DOC_PREVIEW_LENGTH ? `${text.slice(0, DOC_PREVIEW_LENGTH)}…` : text;
}

/**
 * Compact descriptor summary returned by alps_search
 */
function summarize(desc: AlpsDescriptor) {
  const tags = descriptorTags(desc);
  const doc = docPreview(desc);
  return {
    id: desc.id,
    type: desc.type || 'semantic',
    title: desc.title,
    ...(desc.rt ? { rt: desc.rt } : {}),
    ...(tags.length ? { tags } : {}),
    ...(doc ? { doc } : {}),
  };
}

/**
 * Collect all descriptors (top-level and nested) in document order
 */
function allDescriptors(document: AlpsDocument): AlpsDescriptor[] {
  const result: AlpsDescriptor[] = [];
  walkDescriptors(document.alps.descriptor || [], desc => result.push(desc));
  return result;
}

/**
 * MCP tool result with pretty-printed JSON content
 */
function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * MCP tool result with plain text content
 */
function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

/**
 * MCP tool error result
 */
function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

const fileParam = z.string().describe('Path to the ALPS profile file (JSON or XML)');

/**
 * Create the MCP server with all ALPS tools registered
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'alps-asd', version: SERVER_VERSION });

  server.registerTool(
    'alps_overview',
    {
      title: 'ALPS profile overview',
      description:
        'Summarize an ALPS profile: title, application states, transitions ' +
        '(with from/to states), and tags. Use this first to understand the ' +
        'application state model.',
      inputSchema: { file: fileParam },
    },
    async ({ file }) => {
      try {
        const { document } = await loadProfile(file);
        const descriptors = allDescriptors(document);
        const graph = extractGraph(document);
        const tags = new Set<string>();
        for (const desc of descriptors) {
          descriptorTags(desc).forEach(tag => tags.add(tag));
        }
        return jsonResult({
          title: document.alps.title,
          doc: docText(document.alps.doc) || undefined,
          counts: {
            descriptors: descriptors.length,
            states: graph.states.length,
            transitions: graph.transitions.length,
          },
          states: graph.states.map(s => ({ id: s.id, title: s.title })),
          transitions: graph.transitions.map(t => ({
            id: t.id,
            type: t.type,
            from: t.from,
            to: t.to,
          })),
          tags: [...tags].sort(),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'alps_validate',
    {
      title: 'Validate ALPS profile',
      description:
        'Validate an ALPS profile. Reports errors (broken references, duplicate ' +
        'ids, missing rt) and warnings (naming conventions, orphan descriptors).',
      inputSchema: { file: fileParam },
    },
    async ({ file }) => {
      try {
        const absPath = path.resolve(file);
        if (!fs.existsSync(absPath)) {
          throw new Error(`Profile file not found: ${file}`);
        }
        const document = parseAlpsAuto(fs.readFileSync(absPath, 'utf-8'));
        return jsonResult(validateAlps(document));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'alps_search',
    {
      title: 'Search descriptors',
      description:
        'Filter descriptors in an ALPS profile by type, tag, and/or free text ' +
        '(matched against id, title, and doc). Returns compact summaries.',
      inputSchema: {
        file: fileParam,
        type: z
          .enum(['semantic', 'safe', 'unsafe', 'idempotent'])
          .optional()
          .describe('Filter by descriptor type'),
        tag: z.string().optional().describe('Filter by tag'),
        text: z
          .string()
          .optional()
          .describe('Case-insensitive text search in id, title, and doc'),
      },
    },
    async ({ file, type, tag, text }) => {
      try {
        const { document } = await loadProfile(file);
        const descriptors = allDescriptors(document);
        const needle = text?.toLowerCase();
        const matches = descriptors.filter(desc => {
          if (!desc.id) {
            return false;
          }
          if (type && (desc.type || 'semantic') !== type) {
            return false;
          }
          if (tag && !descriptorTags(desc).includes(tag)) {
            return false;
          }
          if (needle) {
            const haystack = `${desc.id} ${desc.title || ''} ${docText(desc.doc)}`.toLowerCase();
            if (!haystack.includes(needle)) {
              return false;
            }
          }
          return true;
        });
        return jsonResult({ count: matches.length, descriptors: matches.map(summarize) });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'alps_descriptor',
    {
      title: 'Get descriptor details',
      description:
        'Get full details of one descriptor: definition, resolved documentation ' +
        '(external alps-doc files are read and inlined), containing states, and ' +
        'incoming/outgoing transitions.',
      inputSchema: {
        file: fileParam,
        id: z.string().describe('Descriptor id'),
      },
    },
    async ({ file, id }) => {
      try {
        const { document, baseDir } = await loadProfile(file);
        const descriptors = document.alps.descriptor || [];
        const descriptor = findDescriptorById(descriptors, id);
        if (!descriptor) {
          throw new Error(`Descriptor not found: ${id}`);
        }
        const graph = extractGraph(document);
        return jsonResult({
          descriptor,
          doc: resolveDoc(baseDir, descriptor.doc),
          containedBy: findContainers(id, descriptors),
          outgoingTransitions: graph.transitions
            .filter(t => t.from.includes(id))
            .map(t => ({ id: t.id, type: t.type, to: t.to })),
          incomingTransitions: graph.transitions
            .filter(t => t.to === id)
            .map(t => ({ id: t.id, type: t.type, from: t.from })),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'alps_paths',
    {
      title: 'Find paths between states',
      description:
        'Enumerate transition paths from one application state to another, ' +
        'e.g. all ways a user can get from Home to OrderConfirmation.',
      inputSchema: {
        file: fileParam,
        from: z.string().describe('Starting state id'),
        to: z.string().describe('Target state id'),
        maxPaths: z.number().int().min(1).max(50).optional().describe('Maximum paths (default 10)'),
      },
    },
    async ({ file, from, to, maxPaths }) => {
      try {
        const { document } = await loadProfile(file);
        const graph = extractGraph(document);
        const stateIds = new Set(graph.states.map(s => s.id));
        for (const state of [from, to]) {
          if (!stateIds.has(state)) {
            throw new Error(
              `Unknown state: ${state} (known states: ${[...stateIds].join(', ')})`
            );
          }
        }
        const paths = findPaths(graph, from, to, maxPaths ?? 10);
        return jsonResult({
          from,
          to,
          count: paths.length,
          paths: paths.map(p => formatPath(from, p)),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'alps_diagram',
    {
      title: 'Render state diagram',
      description: 'Render the application state diagram as Graphviz DOT or SVG.',
      inputSchema: {
        file: fileParam,
        format: z.enum(['dot', 'svg']).optional().describe('Output format (default: dot)'),
        label: z.enum(['id', 'title']).optional().describe('Node label mode (default: id)'),
      },
    },
    async ({ file, format, label }) => {
      try {
        const { document } = await loadProfile(file);
        const dot = generateDot(document, label === 'title' ? 'title' : 'id');
        if (format === 'svg') {
          return textResult(await dotToSvgHighQuality(dot));
        }
        return textResult(dot);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'alps_set_doc',
    {
      title: 'Set descriptor documentation',
      description:
        'Set or update the documentation of a descriptor in a JSON ALPS profile. ' +
        `Short single-line docs (<= ${INLINE_DOC_MAX_LENGTH} chars) are stored inline; ` +
        'longer or multi-line docs are automatically written to an external Markdown ' +
        'file (alps-doc/<id>.md) and linked from the profile via doc.href. This keeps ' +
        'the profile compact, so feel free to write rich, detailed Markdown ' +
        'documentation describing the meaning of the state and related information.',
      inputSchema: {
        file: fileParam,
        id: z.string().describe('Descriptor id'),
        doc: z.string().describe('Documentation text (Markdown welcome for external docs)'),
        placement: z
          .enum(['auto', 'inline', 'external'])
          .optional()
          .describe('Storage placement (default: auto - the server decides by size)'),
      },
    },
    async ({ file, id, doc, placement }) => {
      try {
        const result = setDescriptorDoc(file, id, doc, placement ?? 'auto');
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}

/**
 * Start the MCP server on stdio
 */
export async function runMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive; the transport closes stdin on client disconnect
  console.error('ALPS MCP server running on stdio');
}

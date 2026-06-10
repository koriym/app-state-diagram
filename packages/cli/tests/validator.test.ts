import { validateAlps } from '../src/mcp/validator';
import type { AlpsDocument } from '../src/parser/alps-parser';

const codes = (issues: { code: string }[]) => issues.map(i => i.code);

describe('validateAlps', () => {
  it('accepts a valid profile', () => {
    const doc: AlpsDocument = {
      alps: {
        descriptor: [
          { id: 'Home', type: 'semantic', descriptor: [{ href: '#goHome' }] },
          { id: 'goHome', type: 'safe', rt: '#Home' },
        ],
      },
    };
    const result = validateAlps(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports a missing alps property (E008)', () => {
    const result = validateAlps({} as AlpsDocument);
    expect(codes(result.errors)).toContain('E008');
  });

  it('reports a missing descriptor array (E009)', () => {
    const result = validateAlps({ alps: {} });
    expect(codes(result.errors)).toContain('E009');
  });

  it('reports descriptors without id or href (E001)', () => {
    const result = validateAlps({ alps: { descriptor: [{ type: 'semantic' }] } });
    expect(codes(result.errors)).toContain('E001');
  });

  it('reports a transition without rt (E002)', () => {
    const result = validateAlps({ alps: { descriptor: [{ id: 'goX', type: 'safe' }] } });
    expect(codes(result.errors)).toContain('E002');
  });

  it('reports invalid types (E003)', () => {
    const result = validateAlps({
      alps: { descriptor: [{ id: 'x', type: 'bogus' as never }] },
    });
    expect(codes(result.errors)).toContain('E003');
  });

  it('reports broken rt references (E004)', () => {
    const result = validateAlps({
      alps: { descriptor: [{ id: 'goX', type: 'safe', rt: '#Missing' }] },
    });
    expect(codes(result.errors)).toContain('E004');
  });

  it('reports broken local href references (E004)', () => {
    const result = validateAlps({
      alps: {
        descriptor: [{ id: 'Home', type: 'semantic', descriptor: [{ href: '#missing' }] }],
      },
    });
    expect(codes(result.errors)).toContain('E004');
  });

  it('ignores external file references', () => {
    const result = validateAlps({
      alps: {
        descriptor: [{ id: 'Home', type: 'semantic', descriptor: [{ href: 'common.json#id' }] }],
      },
    });
    expect(codes(result.errors)).not.toContain('E004');
  });

  it('reports duplicate ids (E005)', () => {
    const result = validateAlps({
      alps: { descriptor: [{ id: 'x', type: 'semantic' }, { id: 'x', type: 'semantic' }] },
    });
    expect(codes(result.errors)).toContain('E005');
  });

  it('warns on safe transitions not starting with go (W002)', () => {
    const result = validateAlps({
      alps: {
        descriptor: [
          { id: 'Home', type: 'semantic', descriptor: [{ href: '#listItems' }] },
          { id: 'listItems', type: 'safe', rt: '#Home' },
        ],
      },
    });
    expect(codes(result.warnings)).toContain('W002');
  });

  it('warns on unsafe transitions not starting with do (W003)', () => {
    const result = validateAlps({
      alps: {
        descriptor: [
          { id: 'Home', type: 'semantic', descriptor: [{ href: '#addItem' }] },
          { id: 'addItem', type: 'unsafe', rt: '#Home' },
        ],
      },
    });
    expect(codes(result.warnings)).toContain('W003');
  });

  it('warns on orphan descriptors (W004)', () => {
    const result = validateAlps({
      alps: {
        descriptor: [
          { id: 'Home', type: 'semantic', descriptor: [{ href: '#goHome' }] },
          { id: 'goHome', type: 'safe', rt: '#Home' },
          { id: 'lonely', type: 'semantic' },
        ],
      },
    });
    const orphans = result.warnings.filter(w => w.code === 'W004');
    expect(orphans.map(w => w.descriptorId)).toEqual(['lonely']);
  });
});

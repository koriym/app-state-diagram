import { parseAlpsAuto, docText } from '../src/parser/alps-parser';

describe('parseAlpsAuto', () => {
  it('parses JSON profiles', () => {
    const doc = parseAlpsAuto('{"alps": {"title": "T", "descriptor": [{"id": "x"}]}}');
    expect(doc.alps.title).toBe('T');
    expect(doc.alps.descriptor?.[0].id).toBe('x');
  });

  it('parses XML doc text content', () => {
    const doc = parseAlpsAuto(
      '<alps><descriptor id="x"><doc>hello</doc></descriptor></alps>'
    );
    expect(docText(doc.alps.descriptor?.[0].doc)).toBe('hello');
  });

  it('parses XML doc href and format attributes', () => {
    const doc = parseAlpsAuto(
      '<alps><descriptor id="x"><doc href="alps-doc/x.md" format="markdown"/></descriptor></alps>'
    );
    expect(doc.alps.descriptor?.[0].doc).toEqual({ href: 'alps-doc/x.md', format: 'markdown' });
  });
});

describe('docText', () => {
  it('handles string, object, and undefined forms', () => {
    expect(docText('plain')).toBe('plain');
    expect(docText({ value: 'v' })).toBe('v');
    expect(docText({ href: 'x.md' })).toBe('');
    expect(docText(undefined)).toBe('');
  });
});

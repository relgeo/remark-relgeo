import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import remarkRelgeo from '../dist/index.mjs';

const validSource = `version: 0.5
objects:
  panel:
    type: rect
    size: [80, 40]
    place:
      topLeft: [0, 0]
    meta:
      fill: "#e2e8f0"
      stroke: "#64748b"`;

const runtimeDiagnosticSource = readFileSync(
  new URL('../../fixtures/reference/14-v05-runtime-align-violation.yaml', import.meta.url),
  'utf8',
);
const sheetSource = readFileSync(
  new URL('../../fixtures/reference/03-sheet-title-block.yaml', import.meta.url),
  'utf8',
);
const presentationEscapingSource = readFileSync(
  new URL('../../renderer-svg/src/__tests__/fixtures/v05-presentation-escaping.yaml', import.meta.url),
  'utf8',
);

function runPlugin({ lang = 'relgeo', value = validSource, meta = null, options, position } = {}) {
  const tree = {
    type: 'root',
    children: [{ type: 'code', lang, meta, value, position }],
  };

  remarkRelgeo(options)(tree);
  return tree.children[0];
}

test('turns relgeo into a lightweight preview-only image', () => {
  const node = runPlugin();
  const props = node.data.hProperties;
  const image = node.data.hChildren[0];
  const svg = decodeURIComponent(image.properties.src.split(',', 2)[1]);

  assert.equal(node.lang, null);
  assert.equal(node.data.hName, 'div');
  assert.deepEqual(props.className, ['relgeo-preview__canvas']);
  assert.equal(props['data-relgeo-kind'], 'preview');
  assert.equal(props['data-relgeo-fence'], 'relgeo');
  assert.equal(props['data-relgeo-dsl-version'], '0.5');
  assert.equal(props['data-relgeo-package-line'], '0.5.x');
  assert.equal(props['data-relgeo-plugin'], 'remark-relgeo');
  assert.equal(image.tagName, 'img');
  assert.deepEqual(image.properties.className, ['relgeo-preview__image']);
  assert.match(image.properties.src, /^data:image\/svg\+xml/);
  assert.match(svg, /^<svg\s/);
  assert.doesNotMatch(svg, /<pre|<code/);
});

test('preserves fence metadata while applying render options through the pipeline', () => {
  const node = runPlugin({ meta: 'padding=4 unit=mm' });
  const props = node.data.hProperties;
  const svg = decodeURIComponent(node.data.hChildren[0].properties.src.split(',', 2)[1]);

  assert.equal(props['data-relgeo-meta'], 'padding=4 unit=mm');
  assert.match(svg, /viewBox="-4 -4 88 48"/);
});

test('supports explicit fence overrides without changing non-target blocks', () => {
  const target = runPlugin({ lang: 'rg', options: { fence: 'rg' } });
  const nonTarget = runPlugin({ lang: 'relgeo', options: { fence: 'rg' } });

  assert.equal(target.lang, null);
  assert.equal(target.data.hProperties['data-relgeo-fence'], 'rg');
  assert.equal(nonTarget.lang, 'relgeo');
  assert.equal(nonTarget.data, undefined);
});

test('preserves source, metadata, position, and surrounding node order', () => {
  const position = {
    start: { line: 3, column: 1, offset: 8 },
    end: { line: 5, column: 4, offset: 42 },
  };
  const tree = {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: 'before' }] },
      { type: 'code', lang: 'relgeo', meta: 'padding=4 unknown=kept', value: validSource, position },
      { type: 'paragraph', children: [{ type: 'text', value: 'after' }] },
    ],
  };

  remarkRelgeo()(tree);

  assert.equal(tree.children[0].children[0].value, 'before');
  assert.equal(tree.children[1].value, validSource);
  assert.equal(tree.children[1].meta, 'padding=4 unknown=kept');
  assert.deepEqual(tree.children[1].position, position);
  assert.equal(tree.children[2].children[0].value, 'after');
});

test('keeps mixed blocks deterministic across repeated transforms', () => {
  const makeTree = () => ({
    type: 'root',
    children: [
      { type: 'code', lang: 'yaml', meta: null, value: 'keep: me' },
      { type: 'code', lang: 'relgeo', meta: null, value: validSource },
      { type: 'code', lang: 'relgeo', meta: null, value: 'not valid' },
      { type: 'code', lang: 'relgeo', meta: null, value: validSource },
    ],
  });
  const first = makeTree();
  const second = makeTree();

  remarkRelgeo()(first);
  remarkRelgeo()(second);

  assert.deepEqual(first, second);
  assert.equal(first.children[0].lang, 'yaml');
  assert.equal(first.children[1].data.hProperties['data-relgeo-kind'], 'preview');
  assert.equal(first.children[2].data.hProperties['data-relgeo-kind'], 'preview-error');
  assert.equal(first.children[3].data.hProperties['data-relgeo-kind'], 'preview');
});

test('renders the canonical sheet when explicitly selected', () => {
  const node = runPlugin({ value: sheetSource, meta: 'sheet=drawing1 unit=mm' });
  const svg = decodeURIComponent(node.data.hChildren[0].properties.src.split(',', 2)[1]);

  assert.equal(node.data.hProperties['data-relgeo-kind'], 'preview');
  assert.match(svg, /SHEET: Assembly Sheet/);
  assert.match(svg, /viewBox="0 0 297 210"/);
});

test('preserves safe semantic escaping through the Markdown preview transport', () => {
  const node = runPlugin({ value: presentationEscapingSource });
  const image = node.data.hChildren[0];
  const svg = decodeURIComponent(image.properties.src.split(',', 2)[1]);

  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(svg, /&quot;&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('reports invalid presentation metadata through tolerant and strict policies', () => {
  const tolerant = runPlugin({ meta: 'unit=lightyears' });
  const diagnostic = JSON.parse(tolerant.data.hProperties['data-relgeo-diagnostic']);

  assert.equal(tolerant.data.hProperties['data-relgeo-kind'], 'preview-error');
  assert.equal(diagnostic.code, 'INVALID_PREVIEW_META');

  assert.throws(
    () => runPlugin({ meta: 'padding=-1', options: { failurePolicy: 'strict' } }),
    (error) => error.name === 'RemarkRelgeoError' && error.diagnostic.code === 'INVALID_PREVIEW_META',
  );
});

test('normalizes malformed core-like failures at the Markdown boundary', () => {
  const tolerant = runPlugin({
    options: {
      renderPreview: () => {
        throw Object.assign(new Error('INTERNAL_CODE: callback failed'), {
          code: 'INTERNAL_CODE',
          phase: 'host',
          severity: 'fatal',
        });
      },
    },
  });
  const diagnostic = JSON.parse(tolerant.data.hProperties['data-relgeo-diagnostic']);

  assert.equal(diagnostic.code, 'PREVIEW_RENDER_FAILED');
  assert.equal(diagnostic.severity, 'error');
  assert.equal(diagnostic.message, 'callback failed');
  assert.equal(diagnostic.phase, 'resolve');
});

test('validates preview options while ignoring unknown keys', () => {
  assert.doesNotThrow(() => runPlugin({ options: { unknownOption: true } }));
  assert.throws(
    () => remarkRelgeo({ fence: '  ' }),
    (error) => error instanceof TypeError
      && error.name === 'RemarkRelgeoConfigurationError'
      && error.code === 'INVALID_PREVIEW_OPTIONS'
      && error.phase === 'validate'
      && error.path === 'options.fence',
  );
  assert.throws(() => remarkRelgeo({ classPrefix: 'not valid' }), TypeError);
  assert.throws(() => remarkRelgeo({ failurePolicy: 'sometimes' }), TypeError);
  assert.throws(() => remarkRelgeo({ renderPreview: 'not a function' }), TypeError);
});

test('keeps a valid preview when the runtime reports a non-fatal constraint diagnostic', () => {
  const node = runPlugin({
    value: runtimeDiagnosticSource,
    position: {
      start: { line: 12, column: 1, offset: 120 },
      end: { line: 20, column: 20, offset: 260 },
    },
  });
  const props = node.data.hProperties;
  const image = node.data.hChildren[0];

  assert.equal(props['data-relgeo-kind'], 'preview');
  assert.deepEqual(props.className, [
    'relgeo-preview__canvas',
    'relgeo-preview__canvas--diagnostic',
  ]);
  assert.equal(props['data-relgeo-diagnostic-severity'], 'warning');
  assert.equal(image.tagName, 'img');
  assert.match(decodeURIComponent(image.properties.src.split(',', 2)[1]), /^<svg\s/);

  const diagnostic = JSON.parse(props['data-relgeo-diagnostic']);
  assert.deepEqual(diagnostic, {
    code: 'RUNTIME_CONSTRAINT_VIOLATION',
    severity: 'warning',
    message: 'Points are not aligned. Distance: 14.1421',
    phase: 'constraint',
    location: {
      fence: 'relgeo',
      range: {
        start: { line: 12, column: 1, offset: 120 },
        end: { line: 20, column: 20, offset: 260 },
      },
    },
  });
});

test('allows strict callers to fail on non-fatal runtime diagnostics', () => {
  assert.throws(
    () => runPlugin({
      value: runtimeDiagnosticSource,
      options: { failurePolicy: 'strict' },
    }),
    (error) => error.name === 'RemarkRelgeoError'
      && error.diagnostic.code === 'RUNTIME_CONSTRAINT_VIOLATION'
      && error.diagnostic.severity === 'warning',
  );
});

test('uses a custom render hook without exposing source code', () => {
  let receivedSource = '';
  const node = runPlugin({
    options: {
      renderPreview(source) {
        receivedSource = source;
        return '<svg viewBox="0 0 1 1"></svg>';
      },
    },
  });
  const image = node.data.hChildren[0];
  const svg = decodeURIComponent(image.properties.src.split(',', 2)[1]);

  assert.equal(receivedSource, validSource);
  assert.equal(svg, '<svg viewBox="0 0 1 1"></svg>');
  assert.equal(node.data.hProperties['data-relgeo-kind'], 'preview');
});

test('returns a safe placeholder when compilation fails', () => {
  const node = runPlugin({
    value: 'this is not a valid RelGeo document',
    position: {
      start: { line: 4, column: 1, offset: 40 },
      end: { line: 4, column: 35, offset: 74 },
    },
  });
  const props = node.data.hProperties;

  assert.equal(node.data.hName, 'div');
  assert.deepEqual(props.className, ['relgeo-preview__placeholder']);
  assert.equal(props['data-relgeo-kind'], 'preview-error');
  assert.equal(node.data.hChildren[0].tagName, 'strong');
  assert.equal(node.data.hChildren[0].children[0].value, 'Preview unavailable.');
  const diagnostic = JSON.parse(node.data.hProperties['data-relgeo-diagnostic']);
  assert.equal(diagnostic.code, 'PREVIEW_RENDER_FAILED');
  assert.equal(diagnostic.severity, 'error');
  assert.equal(diagnostic.location.fence, 'relgeo');
  assert.equal(diagnostic.location.range.start.line, 4);
});

test('keeps failures block-scoped and supports strict policy', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'code', lang: 'relgeo', meta: null, value: 'not valid' },
      { type: 'code', lang: 'relgeo', meta: null, value: validSource },
    ],
  };

  remarkRelgeo()(tree);

  assert.equal(tree.children[0].data.hProperties['data-relgeo-kind'], 'preview-error');
  assert.equal(tree.children[1].data.hProperties['data-relgeo-kind'], 'preview');

  assert.throws(
    () => runPlugin({ value: 'not valid', options: { failurePolicy: 'strict' } }),
    (error) => error.name === 'RemarkRelgeoError' && error.diagnostic.code === 'PREVIEW_RENDER_FAILED',
  );
});

test('rejects unsafe custom SVG output and reports a structured diagnostic', () => {
  const unsafeSvgs = [
    '<svg><script>alert(1)</script></svg>',
    '<svg><rect onclick="alert(1)" /></svg>',
    '<svg><image href="javascript:alert(1)" /></svg>',
    '<svg><image href="data:text/html;base64,PHNjcmlwdD4=" /></svg>',
  ];

  for (const unsafeSvg of unsafeSvgs) {
    const node = runPlugin({
      options: { renderPreview: () => unsafeSvg },
    });

    const diagnostic = JSON.parse(node.data.hProperties['data-relgeo-diagnostic']);
    assert.equal(node.data.hProperties['data-relgeo-kind'], 'preview-error');
    assert.equal(diagnostic.code, 'UNSAFE_PREVIEW_OUTPUT');
    assert.throws(
      () => runPlugin({
        options: {
          failurePolicy: 'strict',
          renderPreview: () => unsafeSvg,
        },
      }),
      (error) => error.name === 'RemarkRelgeoError' && error.diagnostic.code === 'UNSAFE_PREVIEW_OUTPUT',
    );
  }
});

test('leaves non-relgeo fences untouched', () => {
  const node = runPlugin({ lang: 'rg' });

  assert.equal(node.lang, 'rg');
  assert.equal(node.data, undefined);
});

import assert from 'node:assert/strict';
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

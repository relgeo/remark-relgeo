# remark-relgeo

Remark plugin for RelGeo preview and embed inside fenced code blocks with the
language id `relgeo`.

## Versioning

The package metadata version (`0.5.0`) is independent from the active RelGeo DSL contract version (`v0.5`). This plugin consumes the DSL contract; matching numbers do not mean that package releases and language-contract revisions are the same release stream.

## Intent

This package is the markdown-facing adapter for RelGeo preview embedding.

It is responsible for:

1. detecting fenced code `relgeo`
2. preparing a preview container in markdown output
3. compiling and rendering the fenced source through the active RelGeo pipeline
4. keeping the default embed lightweight so it can blend into the host document

Detailed package plan:

1. `DEVELOPMENT-PLAN.md`

## Usage

Register the plugin in a remark-based Markdown pipeline:

```js
import remarkRelgeo from 'remark-relgeo';

remarkPlugins: [remarkRelgeo]
```

Then use the `relgeo` fence when the document should contain the rendered
artifact rather than another source block:

````md
```relgeo
version: 0.5
objects:
  panel:
    type: rect
    size: [80, 40]
    place:
      topLeft: [0, 0]
```
````

The plugin also accepts the current lightweight fence metadata options:

```md
```relgeo padding=4 unit=mm sheet=front
...
```
```

Without `padding`, embedded previews default to `0` so the result can blend
into the host document. Invalid source produces a safe placeholder instead of
throwing through the whole Markdown document.

## Output Contract

The successful default output is intentionally small:

```html
<div class="relgeo-preview__canvas">
  <img class="relgeo-preview__image" alt="Rendered RelGeo preview" />
</div>
```

The plugin does not display the RelGeo source. Use `remark-relgeo-hl` with the
`rg` fence when source readability is the intent.

## Current Status

The current implementation provides a preview-only integration:

1. detects `relgeo` blocks
2. emits a preview wrapper with stable classes
3. compiles source and renders preview-only SVG output
4. defaults embedded preview padding to `0` unless explicitly overridden via fence meta
5. shows a safe placeholder when preview rendering fails

## Contract Tests

Run the package test after changing the plugin or one of its runtime
dependencies:

```sh
pnpm test
```

The test covers the preview-only output shape, default padding, metadata
preservation, custom render hooks, safe fallback output, and non-`relgeo`
fence isolation.

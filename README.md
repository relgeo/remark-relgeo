# @relgeo/remark-relgeo

Remark plugin for RelGeo preview and embed inside fenced code blocks with the
language id `relgeo`.

## Versioning

The `@relgeo/remark-relgeo` package is currently `0.5.0`, on the RelGeo DSL `v0.5` compatibility line. Patch releases may move independently; a breaking language-contract change moves the coordinated package line to `0.6.x`.

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
import remarkRelgeo from '@relgeo/remark-relgeo';

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

The public plugin options are:

| Option | Default | Contract |
| --- | --- | --- |
| `fence` | `relgeo` | Non-empty language identifier; only matching fences are transformed. |
| `classPrefix` | `relgeo-preview` | Non-empty CSS class prefix without whitespace. |
| `failurePolicy` | `tolerant` | `tolerant` emits a safe placeholder/diagnostic; `strict` throws `RemarkRelgeoError`. |
| `renderPreview` | unset | Optional function returning a safe `<svg>` string; unsafe output is rejected. |

Unknown option keys are ignored and are never forwarded to core or the SVG
renderer. Invalid option values fail deterministically when the plugin is
created. Reusing one plugin instance is supported. `sheet=...` selects the
canonical renderer sheet; view selection remains defined by the RelGeo sheet
and view definitions rather than a separate plugin `view` option.
```

Without `padding`, embedded previews default to `0` so the result can blend
into the host document. Invalid source produces a safe placeholder instead of
throwing through the whole Markdown document. Runtime constraint diagnostics
that do not invalidate the resolved scene keep the valid preview and are
serialized on the preview canvas as a warning. Set `failurePolicy: 'strict'`
when a build must fail on the first preview error or runtime warning; the
default is `failurePolicy: 'tolerant'`.

## Output Contract

The successful default output is intentionally small:

```html
<div class="relgeo-preview__canvas">
  <img class="relgeo-preview__image" alt="Rendered RelGeo preview" />
</div>
```

Preview errors use `data-relgeo-kind="preview-error"` and carry a serialized
`data-relgeo-diagnostic` with a stable `code`, `severity`, `message`, `phase`,
and fenced-block source location. A non-fatal runtime warning keeps
`data-relgeo-kind="preview"`, the image child, and adds
`data-relgeo-diagnostic-severity="warning"` plus the same diagnostic payload.
Custom render-hook output must be a safe SVG; unsafe markup becomes a
diagnostic in tolerant mode and a thrown `RemarkRelgeoError` in strict mode.

The plugin does not display the RelGeo source. Use `@relgeo/remark-relgeo-hl` with the
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

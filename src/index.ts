import { compileRelGeo } from '@relgeo/core';
import { renderToSVG } from '@relgeo/renderer-svg';
import type { Code, Root } from 'mdast';
import { visit } from 'unist-util-visit';

export interface RemarkRelgeoOptions {
  classPrefix?: string;
  fence?: string;
  renderPreview?: (source: string, node: Code) => string | null | undefined;
}

type HastChild =
  | { type: 'text'; value: string }
  | {
      type: 'element';
      tagName: string;
      properties?: Record<string, unknown>;
      children?: HastChild[];
    };

type MetaOptions = {
  padding?: number;
  profile?: string;
  sheet?: string;
  unit?: string;
};

type AnnotatedCode = Code & {
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: HastChild[];
  };
  meta?: string | null;
};

function parseMetaOptions(rawMeta?: string | null): MetaOptions {
  if (!rawMeta) return {};

  const options: MetaOptions = {};

  for (const token of rawMeta.split(/\s+/).filter(Boolean)) {
    const [rawKey, ...rest] = token.split('=');
    if (!rawKey || rest.length === 0) continue;

    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!value) continue;

    if (key === 'sheet') {
      options.sheet = value;
      continue;
    }

    if (key === 'profile') {
      options.profile = value;
      continue;
    }

    if (key === 'unit') {
      options.unit = value;
      continue;
    }

    if (key === 'padding') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        options.padding = parsed;
      }
    }
  }

  return options;
}

function renderPreviewFromPipeline(source: string, meta: MetaOptions): string {
  const scene = compileRelGeo(source, {
    profile: meta.profile,
    targetUnit: (meta.unit as 'px' | 'mm' | 'cm' | 'm' | 'in' | undefined) ?? 'px',
  });

  return renderToSVG(scene, {
    padding: meta.padding ?? 0,
    sheetId: meta.sheet,
  });
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function remarkRelgeo(options: RemarkRelgeoOptions = {}) {
  const fence = options.fence ?? 'relgeo';
  const classPrefix = options.classPrefix ?? 'relgeo-preview';

  return function transformer(tree: Root) {
    visit(tree, 'code', (node) => {
      const code = node as AnnotatedCode;
      if (code.lang !== fence) return;

      const meta = parseMetaOptions(code.meta);
      let renderedPreview: string | null = null;
      let errorMessage: string | null = null;

      try {
        renderedPreview =
          options.renderPreview?.(code.value, code) ??
          renderPreviewFromPipeline(code.value, meta);
      } catch (error) {
        errorMessage =
          error instanceof Error ? error.message : 'Unknown preview render error.';
      }

      code.lang = null;
      code.data = {
        ...(code.data ?? {}),
        hName: 'div',
        hProperties: renderedPreview
          ? {
              className: [`${classPrefix}__canvas`],
              'data-relgeo-kind': 'preview',
              'data-relgeo-fence': fence,
              'data-relgeo-meta': code.meta ?? '',
            }
          : {
              className: [`${classPrefix}__placeholder`],
              'data-relgeo-kind': 'preview-error',
              'data-relgeo-fence': fence,
              'data-relgeo-meta': code.meta ?? '',
            },
        hChildren: renderedPreview
          ? [
              {
                type: 'element',
                tagName: 'img',
                properties: {
                  className: [`${classPrefix}__image`],
                  src: svgToDataUri(renderedPreview),
                  alt: 'Rendered RelGeo preview',
                  loading: 'lazy',
                  decoding: 'async',
                },
                children: [],
              },
            ]
          : [
              {
                type: 'element',
                tagName: 'strong',
                children: [{ type: 'text', value: 'Preview unavailable.' }],
              },
              {
                type: 'text',
                value: ` ${errorMessage ?? 'Preview renderer not connected yet.'}`,
              },
            ],
      };
    });
  };
}

export default remarkRelgeo;

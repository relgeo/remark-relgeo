import { compileRelGeo } from '@relgeo/core';
import { renderToSVG } from '@relgeo/renderer-svg';
import type { Code, Root } from 'mdast';
import { visit } from 'unist-util-visit';

export const RELGEO_DSL_VERSION = '0.5';
export const RELGEO_PACKAGE_LINE = '0.5.x';

export type RemarkRelgeoFailurePolicy = 'tolerant' | 'strict';

export interface RemarkRelgeoSourceLocation {
  fence: string;
  range?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

export interface RemarkRelgeoDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  phase: string;
  location: RemarkRelgeoSourceLocation;
}

export class RemarkRelgeoError extends Error {
  readonly diagnostic: RemarkRelgeoDiagnostic;

  constructor(diagnostic: RemarkRelgeoDiagnostic) {
    super(diagnostic.message);
    this.name = 'RemarkRelgeoError';
    this.diagnostic = diagnostic;
  }
}

export interface RemarkRelgeoOptions {
  classPrefix?: string;
  fence?: string;
  failurePolicy?: RemarkRelgeoFailurePolicy;
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

type PositionLike = {
  start: { line: number; column: number; offset?: number };
  end: { line: number; column: number; offset?: number };
};

const UNSAFE_SVG_PATTERN = /<\/?(?:script|iframe|object|embed|foreignObject)\b|\bon[a-z]+\s*=|(?:href|src|xlink:href)\s*=\s*["']\s*(?:javascript:|data:text\/html)|url\s*\(\s*javascript:/i;
const ERROR_CODE_PREFIX = /^([A-Z][A-Z0-9_]*):\s*/;

function inferDiagnosticPhase(code: string): string {
  if (code === 'INVALID_YAML' || code === 'UNSUPPORTED_SPEC_VERSION') return 'parse';
  if (
    code.startsWith('UNKNOWN_')
    || code.startsWith('INVALID_')
    || code.startsWith('MISSING_')
    || code === 'TYPE_MISMATCH'
    || code === 'DIVISION_BY_ZERO'
  ) return 'validate';
  if (
    code === 'BOOLEAN_EMPTY_RESULT'
    || code === 'BOOLEAN_FAILED'
    || code === 'BOOLEAN_MULTIPART_RESULT'
    || code === 'FRAME_RESOLUTION_FAILED'
    || code === 'INVALID_T_AT_LENGTH'
    || code === 'PATH_LENGTH_UNAVAILABLE'
    || code === 'INVALID_RESOLVED_SCENE'
  ) return 'runtime';
  return 'resolve';
}

function normalizePreviewError(error: unknown, fallbackCode: string) {
  const candidate = (error && typeof error === 'object' ? error : {}) as {
    code?: string;
    phase?: string;
    severity?: 'error' | 'warning' | 'info';
  };
  const rawMessage = error instanceof Error ? error.message : String(error);
  const prefixedCode = rawMessage.match(ERROR_CODE_PREFIX)?.[1];
  const code = candidate.code ?? prefixedCode ?? fallbackCode;
  const message = prefixedCode ? rawMessage.replace(ERROR_CODE_PREFIX, '') : rawMessage;
  return {
    code,
    severity: candidate.severity ?? 'error',
    message,
    phase: candidate.phase ?? inferDiagnosticPhase(code),
  };
}

function sourceLocation(code: AnnotatedCode, fence: string): RemarkRelgeoSourceLocation {
  const position = code.position as PositionLike | undefined;
  return {
    fence,
    ...(position ? { range: position } : {}),
  };
}

function createPreviewDiagnostic(
  error: unknown,
  code: AnnotatedCode,
  fence: string,
  fallbackCode = 'PREVIEW_RENDER_FAILED',
): RemarkRelgeoDiagnostic {
  const diagnostic = normalizePreviewError(error, fallbackCode);

  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    phase: diagnostic.phase,
    location: sourceLocation(code, fence),
  };
}

function serializeDiagnostic(diagnostic: RemarkRelgeoDiagnostic): string {
  return JSON.stringify(diagnostic);
}

function isSafeSvg(svg: string): boolean {
  const trimmed = svg.trim();
  return /^<svg\b/i.test(trimmed)
    && /<\/svg>\s*$/i.test(trimmed)
    && !UNSAFE_SVG_PATTERN.test(trimmed);
}

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
  const failurePolicy = options.failurePolicy ?? 'tolerant';

  return function transformer(tree: Root) {
    visit(tree, 'code', (node) => {
      const code = node as AnnotatedCode;
      if (code.lang !== fence) return;

      const meta = parseMetaOptions(code.meta);
      let renderedPreview: string | null = null;
      let diagnostic: RemarkRelgeoDiagnostic | null = null;

      try {
        const customPreview = options.renderPreview?.(code.value, code);
        renderedPreview = customPreview ?? renderPreviewFromPipeline(code.value, meta);
        if (!isSafeSvg(renderedPreview)) {
          diagnostic = createPreviewDiagnostic(
            new Error('Preview output is not a safe SVG document.'),
            code,
            fence,
            'UNSAFE_PREVIEW_OUTPUT',
          );
        }
      } catch (error) {
        diagnostic = createPreviewDiagnostic(error, code, fence);
      }

      if (diagnostic && failurePolicy === 'strict') {
        throw new RemarkRelgeoError(diagnostic);
      }

      code.lang = null;
      code.data = {
        ...(code.data ?? {}),
        hName: 'div',
        hProperties: renderedPreview && !diagnostic
          ? {
              className: [`${classPrefix}__canvas`],
              'data-relgeo-kind': 'preview',
              'data-relgeo-fence': fence,
              'data-relgeo-dsl-version': RELGEO_DSL_VERSION,
              'data-relgeo-package-line': RELGEO_PACKAGE_LINE,
              'data-relgeo-plugin': 'remark-relgeo',
              'data-relgeo-meta': code.meta ?? '',
            }
          : {
              className: [`${classPrefix}__placeholder`],
              'data-relgeo-kind': 'preview-error',
              'data-relgeo-fence': fence,
              'data-relgeo-dsl-version': RELGEO_DSL_VERSION,
              'data-relgeo-package-line': RELGEO_PACKAGE_LINE,
              'data-relgeo-plugin': 'remark-relgeo',
              'data-relgeo-meta': code.meta ?? '',
              'data-relgeo-diagnostic': serializeDiagnostic(
                diagnostic ?? createPreviewDiagnostic(
                  new Error('Preview renderer did not return output.'),
                  code,
                  fence,
                ),
              ),
              role: 'alert',
            },
        hChildren: renderedPreview && !diagnostic
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
                value: ` ${diagnostic?.message ?? 'Preview renderer not connected yet.'}`,
              },
            ],
      };
    });
  };
}

export default remarkRelgeo;

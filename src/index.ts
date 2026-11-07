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

/** Configuration failures are typed, actionable, and safe to cross the
 * plugin factory boundary without exposing an unclassified exception. */
export class RemarkRelgeoConfigurationError extends TypeError {
  readonly code = 'INVALID_PREVIEW_OPTIONS';
  readonly phase = 'validate' as const;
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'RemarkRelgeoConfigurationError';
    this.path = path;
  }
}

class PreviewBoundaryError extends Error {
  readonly phase: string;
  readonly code: string;

  constructor(code: string, message: string, phase: string) {
    super(`${code}: ${message}`);
    this.name = 'PreviewBoundaryError';
    this.code = code;
    this.phase = phase;
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

const VALID_TARGET_UNITS = new Set(['px', 'mm', 'cm', 'm', 'in']);
const VALID_FAILURE_POLICIES = new Set<RemarkRelgeoFailurePolicy>(['tolerant', 'strict']);
const VALID_DIAGNOSTIC_PHASES = new Set(['parse', 'validate', 'resolve', 'runtime', 'constraint']);
const VALID_DIAGNOSTIC_SEVERITIES = new Set(['error', 'warning', 'info']);

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
    phase?: string;
    severity?: string;
    message?: string;
  };
  const rawMessage = typeof candidate.message === 'string'
    ? candidate.message
    : error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  const message = rawMessage.replace(ERROR_CODE_PREFIX, '').trim() || 'Unknown error';
  // The preview plugin owns its public failure vocabulary. Core diagnostics
  // remain available through phase/message, but must not replace the
  // adapter-level code used by markdown consumers.
  const phase = typeof candidate.phase === 'string' && VALID_DIAGNOSTIC_PHASES.has(candidate.phase)
    ? candidate.phase
    : inferDiagnosticPhase(fallbackCode);
  return {
    code: fallbackCode,
    severity: VALID_DIAGNOSTIC_SEVERITIES.has(candidate.severity ?? '')
      ? candidate.severity as 'error' | 'warning' | 'info'
      : 'error',
    message,
    phase,
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

function validateClassPrefix(value: string, optionName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    throw new RemarkRelgeoConfigurationError(
      `${optionName} must be a non-empty CSS class prefix without whitespace.`,
      `options.${optionName}`,
    );
  }

  return value;
}

function validateOptions(options: RemarkRelgeoOptions): {
  fence: string;
  classPrefix: string;
  failurePolicy: RemarkRelgeoFailurePolicy;
} {
  const fence = options.fence ?? 'relgeo';
  if (typeof fence !== 'string' || fence.trim() === '' || /\s/.test(fence)) {
    throw new RemarkRelgeoConfigurationError(
      'fence must be a non-empty language identifier without whitespace.',
      'options.fence',
    );
  }

  const classPrefix = validateClassPrefix(options.classPrefix ?? 'relgeo-preview', 'classPrefix');
  const failurePolicy = options.failurePolicy ?? 'tolerant';
  if (!VALID_FAILURE_POLICIES.has(failurePolicy)) {
    throw new RemarkRelgeoConfigurationError(
      "failurePolicy must be either 'tolerant' or 'strict'.",
      'options.failurePolicy',
    );
  }

  if (options.renderPreview !== undefined && typeof options.renderPreview !== 'function') {
    throw new RemarkRelgeoConfigurationError(
      'renderPreview must be a function when provided.',
      'options.renderPreview',
    );
  }

  return { fence, classPrefix, failurePolicy };
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
      if (!VALID_TARGET_UNITS.has(value)) {
        throw new PreviewBoundaryError(
          'INVALID_PREVIEW_META',
          `unit must be one of ${[...VALID_TARGET_UNITS].join(', ')}.`,
          'validate',
        );
      }
      options.unit = value;
      continue;
    }

    if (key === 'padding') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new PreviewBoundaryError(
          'INVALID_PREVIEW_META',
          'padding must be a non-negative number.',
          'validate',
        );
      }
      options.padding = parsed;
    }
  }

  return options;
}

type PreviewRenderResult = {
  svg: string;
  diagnostic?: RemarkRelgeoDiagnostic;
};

function renderPreviewFromPipeline(
  source: string,
  meta: MetaOptions,
  code: AnnotatedCode,
  fence: string,
): PreviewRenderResult {
  const scene = compileRelGeo(source, {
    profile: meta.profile,
    targetUnit: (meta.unit as 'px' | 'mm' | 'cm' | 'm' | 'in' | undefined) ?? 'px',
  }) as { violations?: Array<{ message: string }> };

  const violation = scene.violations?.[0];
  const diagnostic = violation
    ? {
        code: 'RUNTIME_CONSTRAINT_VIOLATION',
        severity: 'warning' as const,
        message: violation.message,
        phase: 'constraint',
        location: sourceLocation(code, fence),
      }
    : undefined;

  return {
    svg: renderToSVG(scene, {
      padding: meta.padding ?? 0,
      sheetId: meta.sheet,
    }),
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function remarkRelgeo(options: RemarkRelgeoOptions = {}) {
  const { fence, classPrefix, failurePolicy } = validateOptions(options);

  return function transformer(tree: Root) {
    visit(tree, 'code', (node) => {
      const code = node as AnnotatedCode;
      if (code.lang !== fence) return;

      let meta: MetaOptions = {};
      let renderedPreview: string | null = null;
      let diagnostic: RemarkRelgeoDiagnostic | null = null;

      try {
        meta = parseMetaOptions(code.meta);
        const customPreview = options.renderPreview?.(code.value, code);
        if (customPreview !== undefined && customPreview !== null) {
          renderedPreview = customPreview;
        } else {
          const pipelineResult = renderPreviewFromPipeline(code.value, meta, code, fence);
          renderedPreview = pipelineResult.svg;
          diagnostic = pipelineResult.diagnostic ?? null;
        }
        if (renderedPreview === null || !isSafeSvg(renderedPreview)) {
          diagnostic = createPreviewDiagnostic(
            new PreviewBoundaryError(
              'UNSAFE_PREVIEW_OUTPUT',
              'Preview output is not a safe SVG document.',
              'runtime',
            ),
            code,
            fence,
            'UNSAFE_PREVIEW_OUTPUT',
          );
        }
      } catch (error) {
        const fallbackCode = error instanceof Error && error.message.startsWith('INVALID_PREVIEW_META:')
          ? 'INVALID_PREVIEW_META'
          : 'PREVIEW_RENDER_FAILED';
        diagnostic = createPreviewDiagnostic(error, code, fence, fallbackCode);
      }

      if (diagnostic && failurePolicy === 'strict') {
        throw new RemarkRelgeoError(diagnostic);
      }

      const previewAvailable = Boolean(renderedPreview)
        && (!diagnostic || diagnostic.severity !== 'error');
      const fallbackDiagnostic = diagnostic ?? createPreviewDiagnostic(
        new PreviewBoundaryError(
          'PREVIEW_RENDER_FAILED',
          'Preview renderer did not return output.',
          'runtime',
        ),
        code,
        fence,
      );

      code.lang = null;
      code.data = {
        ...(code.data ?? {}),
        hName: 'div',
        hProperties: previewAvailable
          ? {
              className: [
                `${classPrefix}__canvas`,
                ...(diagnostic ? [`${classPrefix}__canvas--diagnostic`] : []),
              ],
              'data-relgeo-kind': 'preview',
              'data-relgeo-fence': fence,
              'data-relgeo-dsl-version': RELGEO_DSL_VERSION,
              'data-relgeo-package-line': RELGEO_PACKAGE_LINE,
              'data-relgeo-plugin': 'remark-relgeo',
              'data-relgeo-meta': code.meta ?? '',
              ...(diagnostic
                ? {
                    'data-relgeo-diagnostic': serializeDiagnostic(diagnostic),
                    'data-relgeo-diagnostic-severity': diagnostic.severity,
                  }
                : {}),
            }
          : {
              className: [`${classPrefix}__placeholder`],
              'data-relgeo-kind': 'preview-error',
              'data-relgeo-fence': fence,
              'data-relgeo-dsl-version': RELGEO_DSL_VERSION,
              'data-relgeo-package-line': RELGEO_PACKAGE_LINE,
              'data-relgeo-plugin': 'remark-relgeo',
              'data-relgeo-meta': code.meta ?? '',
              'data-relgeo-diagnostic': serializeDiagnostic(fallbackDiagnostic),
              role: 'alert',
            },
        hChildren: previewAvailable
          ? [
              {
                type: 'element',
                tagName: 'img',
                properties: {
                  className: [`${classPrefix}__image`],
                  src: svgToDataUri(renderedPreview!),
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

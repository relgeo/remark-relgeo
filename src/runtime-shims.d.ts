declare module 'relgeo-core' {
  export function compileRelGeo(
    yaml: string,
    options?: {
      profile?: string;
      targetUnit?: 'px' | 'mm' | 'cm' | 'm' | 'in';
    }
  ): unknown;
}

declare module 'relgeo-renderer-svg' {
  export function renderToSVG(
    scene: unknown,
    options?: {
      padding?: number;
      sheetId?: string;
    }
  ): string;
}

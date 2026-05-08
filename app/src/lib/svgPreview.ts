const SVG_XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

export function normalizeSvgForBrowserImage(svg: string): string {
  const trimmed = stripUnsafeSvgContent(svg.trim());
  if (!trimmed.toLowerCase().startsWith("<svg")) {
    return "";
  }

  return trimmed.replace(/^<svg\b([^>]*)>/i, (match, attrs: string) => {
    if (/\sxmlns\s*=/i.test(attrs)) {
      return match;
    }
    return `<svg ${SVG_XMLNS}${attrs}>`;
  });
}

export function svgToDataUri(svg: string): string {
  const normalized = normalizeSvgForBrowserImage(svg);
  if (!normalized) {
    return "";
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
}

function stripUnsafeSvgContent(svg: string): string {
  return svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<image\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*javascript:[^\s>]+/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])(?!\s*#)[\s\S]*?\1/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(?!#)(?!["'])[^\s>]+/gi, "")
    .replace(
      /\s+[a-zA-Z_:][\w:.-]*\s*=\s*(["'])([^"']*url\([^"']*\)[^"']*)\1/gi,
      (attribute: string, _quote: string, value: string) =>
        hasUnsafeCssUrl(value) ? "" : attribute,
    )
    .replace(
      /\s+[a-zA-Z_:][\w:.-]*\s*=\s*([^\s>]*url\([^\s>]*\)[^\s>]*)/gi,
      (attribute: string, value: string) => (hasUnsafeCssUrl(value) ? "" : attribute),
    );
}

function hasUnsafeCssUrl(value: string): boolean {
  const matches = value.matchAll(/url\(([^)]*)\)/gi);
  for (const match of matches) {
    const target = (match[1] ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
    if (!target.startsWith("#")) {
      return true;
    }
  }
  return false;
}

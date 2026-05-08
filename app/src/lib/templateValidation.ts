export const MAX_TEMPLATE_BYTES = 2 * 1024;

export type TemplateValidation = {
  sizeOk: boolean;
  startsWithSvg: boolean;
  parseableXml: boolean;
  externalRefsOk: boolean;
  isValid: boolean;
};

export type TemplateDomParser = {
  parseFromString: DOMParser["parseFromString"];
};

export type TemplateDomParserConstructor = new () => TemplateDomParser;

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function validateTemplateSvg(
  template: string,
  ParserConstructor?: TemplateDomParserConstructor,
): TemplateValidation {
  const sizeOk = byteLength(template) <= MAX_TEMPLATE_BYTES;
  const startsWithSvg = template.startsWith("<svg");
  const externalRefsOk = !containsForbiddenTemplateReference(template);
  const BrowserDomParser = globalThis.DOMParser;
  let parseableXml = typeof BrowserDomParser === "undefined";

  try {
    const Parser = ParserConstructor ?? BrowserDomParser;
    if (Parser) {
      const parsed = new Parser().parseFromString(template, "image/svg+xml");
      parseableXml = parsed.getElementsByTagName("parsererror").length === 0;
    }
  } catch {
    parseableXml = false;
  }

  return {
    sizeOk,
    startsWithSvg,
    parseableXml,
    externalRefsOk,
    isValid: sizeOk && startsWithSvg && parseableXml && externalRefsOk,
  };
}

function containsForbiddenTemplateReference(template: string) {
  const externalScheme = /(?:https?|ipfs|ar|data):/i;
  return (
    /<\s*\/?\s*(?:script|image|iframe|embed|object|foreignObject|animate|set)\b/i.test(template) ||
    /(?:^|[\s<])on[a-zA-Z][\w-]*\s*=/i.test(template) ||
    /(?:^|[\s<])(?:href|xlink:href)\s*=/i.test(template) ||
    externalScheme.test(template) ||
    /url\(\s*['"]?\s*(?:(?:https?|ipfs|ar|data):|\/\/)/i.test(template)
  );
}

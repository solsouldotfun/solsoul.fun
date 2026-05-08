import { Router, type Request, type Response } from "express";

export const svgRendererRouter = Router();

const THEMES = [
  { id: "neonpuff", label: "NeonPuff Soul", family: "legacy" },
  { id: "soulpuff", label: "SoulPuff", family: "legacy" },
  { id: "monochrome", label: "Monochrome Soul", family: "legacy" },
  { id: "hexagram", label: "Hexagram Oracle", family: "legacy" },
  { id: "signal", label: "Signal Field", family: "legacy" },
  { id: "fractal", label: "Fractal Structure", family: "mathematical" },
  { id: "field", label: "Vector Field", family: "mathematical" },
  { id: "lattice", label: "Crystal Lattice", family: "mathematical" },
  { id: "chaos", label: "Strange Attractor", family: "mathematical" },
  { id: "harmonic", label: "Harmonic Wave", family: "mathematical" },
  { id: "custom", label: "Custom Template", family: "custom" },
];

interface RenderRequest {
  theme?: string;
  seed?: string;
  blueprint?: {
    family: number;
    generation: number;
    baseParams: {
      dimensionality: number;
      projection: number;
      depth: number;
      fundamental: number;
      overtones: number;
      decay: number;
      entropy: number;
    };
    evolutionState?: {
      xp: number;
      level: number;
      tradeCount: number;
      totalHoldDays: number;
      milestoneFlags: number;
    };
  };
  width?: number;
  height?: number;
}

svgRendererRouter.get("/themes", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    themes: THEMES,
  });
});

svgRendererRouter.post("/render", (req: Request, res: Response) => {
  const body = req.body as RenderRequest;

  if (!body.theme && !body.blueprint) {
    res.status(400).json({
      ok: false,
      error: "missing_theme_or_blueprint",
      message: "Provide either 'theme' or 'blueprint'",
    });
    return;
  }

  const theme = body.theme || "fractal";
  const seed = body.seed || "default-seed";

  if (!THEMES.some((t) => t.id === theme)) {
    res.status(400).json({
      ok: false,
      error: "invalid_theme",
      message: `Theme '${theme}' not found. Use GET /api/v1/svg/themes to list available themes.`,
    });
    return;
  }

  const seedBytes = new TextEncoder().encode(seed);
  const seedHash = hashSeed(seedBytes);

  const dimensions = parseDimensions(body);
  if (!dimensions.ok) {
    res.status(400).json(dimensions.error);
    return;
  }

  const svg = generatePlaceholderSvg(theme, seedHash, dimensions.width, dimensions.height);

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(svg);
});

svgRendererRouter.post("/render/json", (req: Request, res: Response) => {
  const body = req.body as RenderRequest;

  if (!body.theme && !body.blueprint) {
    res.status(400).json({
      ok: false,
      error: "missing_theme_or_blueprint",
      message: "Provide either 'theme' or 'blueprint'",
    });
    return;
  }

  const theme = body.theme || "fractal";
  const seed = body.seed || "default-seed";

  if (!THEMES.some((t) => t.id === theme)) {
    res.status(400).json({
      ok: false,
      error: "invalid_theme",
      message: `Theme '${theme}' not found`,
    });
    return;
  }

  const seedBytes = new TextEncoder().encode(seed);
  const seedHash = hashSeed(seedBytes);

  const dimensions = parseDimensions(body);
  if (!dimensions.ok) {
    res.status(400).json(dimensions.error);
    return;
  }

  const svg = generatePlaceholderSvg(theme, seedHash, dimensions.width, dimensions.height);
  const base64 = btoa(svg);
  const dataUri = `data:image/svg+xml;base64,${base64}`;

  res.json({
    ok: true,
    theme,
    seed,
    seedHash: Array.from(seedHash),
    svg,
    dataUri,
    metadata: {
      width: dimensions.width,
      height: dimensions.height,
      family: THEMES.find((t) => t.id === theme)?.family,
    },
  });
});

function hashSeed(seed: Uint8Array): Uint8Array {
  const hash = new Uint8Array(8);
  let h = 0xcbf2_9ce4_8422_2325n;
  for (let i = 0; i < seed.length; i++) {
    h ^= BigInt(seed[i]);
    h = h * 0x0000_0100_0000_01b3n;
    h ^= BigInt(i) << BigInt(i % 31);
  }
  const bytes = h.toString(16).padStart(16, "0");
  for (let i = 0; i < 8; i++) {
    hash[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
  }
  return hash;
}

function parseDimensions(body: RenderRequest):
  | { ok: true; width: number; height: number }
  | { ok: false; error: { ok: false; error: string; message: string } } {
  const width = parseDimension(body.width, "width");
  if (!width.ok) {
    return { ok: false, error: width.error };
  }
  const height = parseDimension(body.height, "height");
  if (!height.ok) {
    return { ok: false, error: height.error };
  }
  return { ok: true, width: width.value, height: height.value };
}

function parseDimension(value: unknown, field: "width" | "height"):
  | { ok: true; value: number }
  | { ok: false; error: { ok: false; error: string; message: string } } {
  if (value === undefined) {
    return { ok: true, value: 256 };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 4096) {
    return {
      ok: false,
      error: {
        ok: false,
        error: "invalid_dimension",
        message: `${field} must be an integer between 1 and 4096`,
      },
    };
  }
  return { ok: true, value };
}

function generatePlaceholderSvg(theme: string, seedHash: Uint8Array, width: number, height: number): string {
  const hue = (seedHash[0] * 360) / 256;
  const saturation = 50 + (seedHash[1] % 50);
  const lightness = 40 + (seedHash[2] % 40);
  const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const fgColor = `hsl(${(hue + 180) % 360}, ${saturation}%, ${lightness + 20}%)`;

  const shapes: string[] = [];
  const shapeCount = 3 + (seedHash[3] % 5);

  for (let i = 0; i < shapeCount; i++) {
    const x = (seedHash[i * 2] / 256) * width;
    const y = (seedHash[i * 2 + 1] / 256) * height;
    const size = 10 + (seedHash[i + 4] % 30);
    const opacity = 0.3 + (seedHash[i + 5] % 70) / 100;

    if (theme === "fractal" || theme === "chaos") {
      shapes.push(`<circle cx="${x}" cy="${y}" r="${size}" fill="${fgColor}" opacity="${opacity}"/>`);
    } else if (theme === "field" || theme === "harmonic") {
      shapes.push(`<rect x="${x}" y="${y}" width="${size}" height="${size / 2}" fill="${fgColor}" opacity="${opacity}"/>`);
    } else if (theme === "lattice") {
      shapes.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fgColor}" opacity="${opacity}"/>`);
    } else {
      shapes.push(`<circle cx="${x}" cy="${y}" r="${size}" fill="${fgColor}" opacity="${opacity}"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <g>${shapes.join("")}</g>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="14" opacity="0.5">${theme}</text>
</svg>`;
}
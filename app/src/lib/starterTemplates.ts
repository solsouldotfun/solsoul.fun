export type StarterTemplate = {
  id: "fractal-structure" | "vector-field" | "crystal-lattice";
  path: `/templates/${string}.svg`;
};

export type BuiltInLaunchArtThemeId =
  | "fractal"
  | "field"
  | "lattice"
  | "chaos"
  | "harmonic"
  | "pixel_fractal"
  | "pixel_art"
  | "symphony";

export type LaunchArtThemeId = BuiltInLaunchArtThemeId | "custom";

export type LaunchArtTheme = {
  id: LaunchArtThemeId;
  styleParams: string;
  renderer: "built-in" | "custom-template";
  previewSvg: string;
};

export const CUSTOM_TEMPLATE_STYLE_PARAMS = "theme=custom;mode=hsl;evolution=3";

const fractalPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Fractal Structure preview">
  <rect width="160" height="160" rx="24" fill="#0a0a0a"/>
  <g stroke="#e8d5b7" stroke-width="1.5" fill="none" opacity="0.8">
    <path d="M80 140 L80 20"/>
    <path d="M80 120 L55 95"/>
    <path d="M80 120 L105 95"/>
    <path d="M55 95 L40 70"/>
    <path d="M55 95 L70 70"/>
    <path d="M105 95 L90 70"/>
    <path d="M105 95 L120 70"/>
    <path d="M80 100 L65 75"/>
    <path d="M80 100 L95 75"/>
  </g>
  <circle cx="80" cy="20" r="4" fill="#e8d5b7"/>
</svg>`;

const fieldPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Vector Field preview">
  <rect width="160" height="160" rx="24" fill="#0a0a0a"/>
  <defs>
    <linearGradient id="fieldGrad" x1="0" y1="0" x2="160" y2="160">
      <stop offset="0%" stop-color="#38d5ff" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#14f195" stop-opacity="0.3"/>
    </linearGradient>
  </defs>
  <g stroke="url(#fieldGrad)" stroke-width="1.5" fill="none">
    <path d="M20 80 Q40 40 80 40 Q120 40 140 80"/>
    <path d="M20 100 Q40 60 80 60 Q120 60 140 100"/>
    <path d="M20 120 Q40 80 80 80 Q120 80 140 120"/>
    <path d="M30 40 L50 50 M110 50 L130 40"/>
    <path d="M30 140 L50 130 M110 130 L130 140"/>
  </g>
</svg>`;

const latticePreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Crystal Lattice preview">
  <rect width="160" height="160" rx="24" fill="#0a0a0a"/>
  <g stroke="#bda7ff" stroke-width="1" fill="none" opacity="0.7">
    <path d="M40 40 L80 20 L120 40 L120 80 L80 100 L40 80 Z"/>
    <path d="M40 40 L40 80 M80 20 L80 100 M120 40 L120 80"/>
    <path d="M40 80 L80 100 L120 80"/>
    <path d="M60 30 L60 90 M100 30 L100 90"/>
    <path d="M50 60 L110 60"/>
  </g>
  <circle cx="80" cy="60" r="3" fill="#bda7ff"/>
</svg>`;

const chaosPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Strange Attractor preview">
  <rect width="160" height="160" rx="24" fill="#0a0a0a"/>
  <g fill="#ff4f64" opacity="0.6">
    <circle cx="60" cy="50" r="2"/>
    <circle cx="70" cy="55" r="1.5"/>
    <circle cx="80" cy="48" r="2.5"/>
    <circle cx="90" cy="58" r="1.5"/>
    <circle cx="100" cy="52" r="2"/>
    <circle cx="65" cy="65" r="1.5"/>
    <circle cx="75" cy="70" r="2"/>
    <circle cx="85" cy="62" r="1.5"/>
    <circle cx="95" cy="72" r="2"/>
    <circle cx="105" cy="66" r="1.5"/>
    <circle cx="70" cy="80" r="2"/>
    <circle cx="80" cy="85" r="1.5"/>
    <circle cx="90" cy="78" r="2.5"/>
    <circle cx="100" cy="88" r="1.5"/>
    <circle cx="110" cy="82" r="2"/>
  </g>
  <g fill="#14f195" opacity="0.4">
    <circle cx="55" cy="75" r="1.5"/>
    <circle cx="68" cy="88" r="2"/>
    <circle cx="78" cy="95" r="1.5"/>
    <circle cx="92" cy="90" r="2"/>
    <circle cx="105" cy="98" r="1.5"/>
  </g>
</svg>`;

const harmonicPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Harmonic Wave preview">
  <rect width="160" height="160" rx="24" fill="#0a0a0a"/>
  <g fill="none" stroke-width="2" opacity="0.7">
    <path d="M10 80 Q30 40 50 80 T90 80 T130 80 T170 80" stroke="#38d5ff"/>
    <path d="M10 90 Q30 50 50 90 T90 90 T130 90" stroke="#9945ff" opacity="0.5"/>
    <path d="M10 70 Q30 30 50 70 T90 70 T130 70" stroke="#14f195" opacity="0.5"/>
  </g>
</svg>`;

const pixelFractalPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Pixel Fractal preview">
  <rect width="160" height="160" rx="24" fill="#0a0a0a"/>
  <g>
    <rect x="40" y="40" width="20" height="20" fill="#e8d5b7" opacity="0.8"/>
    <rect x="60" y="40" width="20" height="20" fill="#bda7ff" opacity="0.6"/>
    <rect x="80" y="40" width="20" height="20" fill="#e8d5b7" opacity="0.8"/>
    <rect x="100" y="40" width="20" height="20" fill="#38d5ff" opacity="0.5"/>
    <rect x="40" y="60" width="20" height="20" fill="#bda7ff" opacity="0.6"/>
    <rect x="60" y="60" width="20" height="20" fill="#ff4f64" opacity="0.7"/>
    <rect x="80" y="60" width="20" height="20" fill="#14f195" opacity="0.6"/>
    <rect x="100" y="60" width="20" height="20" fill="#e8d5b7" opacity="0.5"/>
    <rect x="40" y="80" width="20" height="20" fill="#e8d5b7" opacity="0.8"/>
    <rect x="60" y="80" width="20" height="20" fill="#38d5ff" opacity="0.5"/>
    <rect x="80" y="80" width="20" height="20" fill="#bda7ff" opacity="0.7"/>
    <rect x="100" y="80" width="20" height="20" fill="#ff4f64" opacity="0.5"/>
    <rect x="60" y="100" width="20" height="20" fill="#14f195" opacity="0.6"/>
    <rect x="80" y="100" width="20" height="20" fill="#e8d5b7" opacity="0.7"/>
  </g>
</svg>`;

const pixelArtPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Pixel Art preview">
  <rect width="160" height="160" rx="24" fill="#87CEEB"/>
  <rect x="0" y="100" width="160" height="60" fill="#4a90d9"/>
  <rect x="40" y="60" width="40" height="40" fill="#8B4513"/>
  <rect x="50" y="70" width="8" height="8" fill="#FFE4B5"/>
  <rect x="70" y="70" width="8" height="8" fill="#FFE4B5"/>
  <rect x="50" y="85" width="28" height="4" fill="#654321"/>
  <rect x="20" y="80" width="15" height="20" fill="#228B22"/>
  <rect x="100" y="75" width="12" height="25" fill="#228B22"/>
  <circle cx="130" cy="30" r="8" fill="#FFD700"/>
</svg>`;

const symphonyPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Symphony preview">
  <rect width="160" height="160" rx="24" fill="#1a1a2e"/>
  <rect x="0" y="100" width="160" height="60" fill="#16213e"/>
  <rect x="0" y="95" width="160" height="8" fill="#0f3460"/>
  <circle cx="120" cy="40" r="12" fill="#e94560" opacity="0.9"/>
  <circle cx="116" cy="36" r="3" fill="#1a1a2e"/>
  <path d="M20 120 L50 80 L80 100 L110 60 L140 90" fill="none" stroke="#0f3460" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 130 L40 95 L70 110 L100 75 L130 100 L150 85" fill="none" stroke="#e94560" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <circle cx="30" cy="25" r="1.5" fill="#f4f4f4" opacity="0.8"/>
  <circle cx="60" cy="15" r="1" fill="#f4f4f4" opacity="0.6"/>
  <circle cx="90" cy="30" r="1.5" fill="#f4f4f4" opacity="0.7"/>
  <circle cx="45" cy="45" r="1" fill="#f4f4f4" opacity="0.5"/>
  <circle cx="140" cy="20" r="1" fill="#f4f4f4" opacity="0.6"/>
</svg>`;

const customPreview = `<svg viewBox="0 0 160 160" role="img" aria-label="Custom Template preview">
  <rect width="160" height="160" rx="24" fill="#111"/>
  <rect x="28" y="28" width="104" height="104" rx="16" fill="none" stroke="#d8ff73" stroke-width="4" stroke-dasharray="10 8"/>
  <path d="M48 104 C62 72 68 58 80 48 C92 58 98 72 112 104" fill="none" stroke="#f8f8f2" stroke-width="6" stroke-linecap="round"/>
  <text x="80" y="124" text-anchor="middle" fill="#d8ff73" font-size="10">SVG</text>
</svg>`;

export const LAUNCH_ART_THEMES: LaunchArtTheme[] = [
  {
    id: "fractal",
    styleParams: "theme=fractal",
    renderer: "built-in",
    previewSvg: fractalPreview,
  },
  {
    id: "field",
    styleParams: "theme=field",
    renderer: "built-in",
    previewSvg: fieldPreview,
  },
  {
    id: "lattice",
    styleParams: "theme=lattice",
    renderer: "built-in",
    previewSvg: latticePreview,
  },
  {
    id: "chaos",
    styleParams: "theme=chaos",
    renderer: "built-in",
    previewSvg: chaosPreview,
  },
  {
    id: "harmonic",
    styleParams: "theme=harmonic",
    renderer: "built-in",
    previewSvg: harmonicPreview,
  },
  {
    id: "pixel_fractal",
    styleParams: "theme=pixelfractal",
    renderer: "built-in",
    previewSvg: pixelFractalPreview,
  },
  {
    id: "pixel_art",
    styleParams: "theme=pixelart",
    renderer: "built-in",
    previewSvg: pixelArtPreview,
  },
  {
    id: "symphony",
    styleParams: "theme=symphony",
    renderer: "built-in",
    previewSvg: symphonyPreview,
  },
  {
    id: "custom",
    styleParams: CUSTOM_TEMPLATE_STYLE_PARAMS,
    renderer: "custom-template",
    previewSvg: customPreview,
  },
];

export const DEFAULT_LAUNCH_ART_THEME_ID: BuiltInLaunchArtThemeId = "symphony";

export function getLaunchArtTheme(id: LaunchArtThemeId): LaunchArtTheme {
  const theme = LAUNCH_ART_THEMES.find((item) => item.id === id);
  if (theme) {
    return theme;
  }
  return LAUNCH_ART_THEMES[0] as LaunchArtTheme;
}

export function isCustomLaunchArtTheme(id: LaunchArtThemeId): boolean {
  return getLaunchArtTheme(id).renderer === "custom-template";
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "fractal-structure",
    path: "/templates/fractal-structure.svg",
  },
  {
    id: "vector-field",
    path: "/templates/vector-field.svg",
  },
  {
    id: "crystal-lattice",
    path: "/templates/crystal-lattice.svg",
  },
];

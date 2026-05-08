import type { DocPage } from "./types";
import { WHITEPAPER_CONTENT } from "./content/whitepaper";
import { SOUL_ENGINE_CONTENT } from "./content/soulEngine";
import { RENDERERS_CONTENT } from "./content/renderers";
import { ARCHITECTURE_CONTENT } from "./content/architecture";
import { BONDING_CURVE_CONTENT } from "./content/bondingCurve";
import { FEE_MODEL_CONTENT } from "./content/feeModel";
import { API_CONTENT } from "./content/api";
import { CONTRIBUTING_CONTENT } from "./content/contributing";
import { CHANGELOG_CONTENT } from "./content/changelog";

export const docPages: DocPage[] = [
  {
    slug: "whitepaper",
    title: "Whitepaper",
    description:
      "Protocol whitepaper covering exponential curve, Soul Engine, tokenomics, governance, and security.",
    category: "protocol",
    content: WHITEPAPER_CONTENT,
  },
  {
    slug: "architecture",
    title: "Architecture",
    description:
      "Full system architecture, PDA inventory, account state, and cross-program interactions.",
    category: "technical",
    content: ARCHITECTURE_CONTENT,
  },
  {
    slug: "bonding-curve",
    title: "Bonding Curve",
    description:
      "Exponential curve math, buy/sell mechanics, worked examples, and safety valves.",
    category: "technical",
    content: BONDING_CURVE_CONTENT,
  },
  {
    slug: "fee-model",
    title: "Fee Model",
    description:
      "Fee economics — lock fee flywheel, treasury, and comparison with other launchpads.",
    category: "protocol",
    content: FEE_MODEL_CONTENT,
  },
  {
    slug: "soul-engine",
    title: "Soul Engine",
    description:
      "Technical specification for the three-layer rendering architecture.",
    category: "technical",
    content: SOUL_ENGINE_CONTENT,
  },
  {
    slug: "renderers",
    title: "Renderer Catalog",
    description:
      "Mathematical renderer catalog — fractals, chaos, fields, waves, lattices, pixels.",
    category: "technical",
    content: RENDERERS_CONTENT,
  },
  {
    slug: "api",
    title: "Indexer API",
    description:
      "REST API documentation for the indexer service.",
    category: "reference",
    content: API_CONTENT,
  },
  {
    slug: "contributing",
    title: "Contributing",
    description:
      "Developer guide — setup, standards, PR process, and how to build renderers.",
    category: "community",
    content: CONTRIBUTING_CONTENT,
  },
  {
    slug: "changelog",
    title: "Changelog",
    description:
      "Chronological change log from walking skeleton to present.",
    category: "reference",
    content: CHANGELOG_CONTENT,
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return docPages.find((d) => d.slug === slug);
}

export function getDocsByCategory(category: DocPage["category"]): DocPage[] {
  return docPages.filter((d) => d.category === category);
}

"use client";

import type { BondingCurveAccount } from "sdk";
import {
  CURVE_K_BASE_UNITS,
  MT_CLAIM_QUANTUM_BASE_UNITS,
  MT_SOUL_CAP_BASE_UNITS,
  estimateSpotPriceSolPerToken,
  sampleCurveSpotPrices,
} from "../lib/curveMath";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 300;
const CHART_PADDING = {
  top: 28,
  right: 34,
  bottom: 58,
  left: 48,
} as const;

type ChartPoint = {
  x: number;
  y: number;
  totalMinted: bigint;
  priceSolPerToken: number;
};

type BondingCurveChartModel = {
  points: ChartPoint[];
  path: string;
  areaPath: string;
  currentPoint: ChartPoint;
  firstMtX: number;
  capX: number;
  progressWidth: number;
  progressPercent: number;
};

export function BondingCurveChart({
  curve,
  currentPrice,
  percentMinted,
  totalMinted,
  labels,
  soulFlow,
}: {
  curve: BondingCurveAccount | null;
  currentPrice: string;
  percentMinted: string;
  totalMinted: string;
  labels: {
    title: string;
    eyebrow: string;
    body: string;
    summary: string;
    unavailableTitle: string;
    unavailableBody: string;
    currentPoint: string;
    mintedProgress: string;
    priceAxis: string;
    tokenAxis: string;
    firstMtMarker: string;
    capMarker: string;
    capHelper: string;
    currentPrice: string;
    totalMinted: string;
    percentMinted: string;
  };
  soulFlow?: {
    generationCount: string;
    claimCount: string;
    labels: {
      volumeMovement: string;
      generationMarker: string;
      claimMarker: string;
      noMarkers: string;
      fixture?: string;
    };
  };
}) {
  const model = curve ? buildBondingCurveChartModel(curve) : null;

  if (!model) {
    return (
      <section
        className={joinClasses(uiPrimitives.card, "overflow-hidden p-5")}
        data-testid="bonding-curve-chart-fallback"
        role="status"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
          {labels.eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">{labels.unavailableTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          {labels.unavailableBody}
        </p>
        {soulFlow ? <FallbackSoulFlowChart soulFlow={soulFlow} /> : null}
      </section>
    );
  }

  const progressWidth = `${model.progressWidth.toFixed(2)}%`;
  const overlay = soulFlow ? buildSoulFlowOverlay(model, soulFlow) : null;

  return (
    <section
      aria-describedby="bonding-curve-chart-summary"
      aria-labelledby="bonding-curve-chart-title"
      className={joinClasses(uiPrimitives.card, "overflow-hidden p-5")}
      data-testid="bonding-curve-chart"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
            {labels.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black text-white" id="bonding-curve-chart-title">
            {labels.title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{labels.body}</p>
        </div>
        <dl className="grid gap-2 text-sm sm:min-w-64">
          <ChartStat label={labels.currentPrice} value={currentPrice} />
          <ChartStat label={labels.totalMinted} value={totalMinted} />
          <ChartStat label={labels.percentMinted} value={percentMinted} />
        </dl>
      </div>

      <p className="sr-only" id="bonding-curve-chart-summary">
        {labels.summary}
      </p>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/30 p-3 sm:p-4">
        {soulFlow ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/55" data-testid="soul-flow-chart">
            <span className={joinClasses(uiPrimitives.pill, "px-2 py-1")}>
              {soulFlow.labels.volumeMovement}
            </span>
            <span className="rounded-full border border-soul-mint/20 bg-soul-mint/[0.08] px-2 py-1 text-soul-mint">
              {soulFlow.labels.generationMarker}: {soulFlow.generationCount}
            </span>
            <span className="rounded-full border border-soul-purple/25 bg-soul-purple/[0.10] px-2 py-1 text-soul-glow">
              {soulFlow.labels.claimMarker}: {soulFlow.claimCount}
            </span>
          </div>
        ) : null}
        <svg
          aria-labelledby="bonding-curve-chart-svg-title bonding-curve-chart-svg-desc"
          className="h-72 w-full overflow-visible"
          data-testid="bonding-curve-chart-svg"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          <title id="bonding-curve-chart-svg-title">{labels.title}</title>
          <desc id="bonding-curve-chart-svg-desc">{labels.summary}</desc>
          <defs>
            <linearGradient id="bonding-curve-chart-stroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#41F3CA" />
              <stop offset="52%" stopColor="#8EE6FF" />
              <stop offset="100%" stopColor="#B86BFF" />
            </linearGradient>
            <linearGradient id="bonding-curve-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#41F3CA" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#41F3CA" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = CHART_PADDING.top + ratio * plotHeight();
            return (
              <line
                key={ratio}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
                x1={CHART_PADDING.left}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y1={y}
                y2={y}
              />
            );
          })}

          <line
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
            x1={CHART_PADDING.left}
            x2={CHART_WIDTH - CHART_PADDING.right}
            y1={CHART_HEIGHT - CHART_PADDING.bottom}
            y2={CHART_HEIGHT - CHART_PADDING.bottom}
          />
          <line
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
            x1={CHART_PADDING.left}
            x2={CHART_PADDING.left}
            y1={CHART_PADDING.top}
            y2={CHART_HEIGHT - CHART_PADDING.bottom}
          />

          <rect
            fill="rgba(65,243,202,0.08)"
            height={plotHeight()}
            width={model.progressWidth * plotWidth() / 100}
            x={CHART_PADDING.left}
            y={CHART_PADDING.top}
          />
          <path d={model.areaPath} fill="url(#bonding-curve-chart-fill)" />
          {overlay?.volumeBars.map((bar) => (
            <rect
              data-testid="soul-flow-volume-bar"
              fill={bar.fill}
              height={bar.height}
              key={`volume-${bar.index}`}
              rx="4"
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
          ))}
          <path
            d={model.path}
            fill="none"
            stroke="rgba(255,255,255,0.16)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="12"
          />
          <path
            d={model.path}
            fill="none"
            stroke="url(#bonding-curve-chart-stroke)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />

          <MarkerLine
            label={labels.firstMtMarker}
            labelX={Math.max(model.firstMtX + 10, CHART_PADDING.left + 92)}
            lineX={model.firstMtX}
            testId="bonding-curve-chart-mt-marker"
            yOffset={12}
          />
          <MarkerLine
            label={labels.capMarker}
            labelX={CHART_WIDTH - CHART_PADDING.right - 104}
            lineX={model.capX}
            testId="bonding-curve-chart-cap-marker"
            yOffset={32}
          />

          <line
            stroke="#41F3CA"
            strokeDasharray="5 6"
            strokeOpacity="0.7"
            strokeWidth="2"
            x1={model.currentPoint.x}
            x2={model.currentPoint.x}
            y1={model.currentPoint.y}
            y2={CHART_HEIGHT - CHART_PADDING.bottom}
          />
          <circle
            cx={model.currentPoint.x}
            cy={model.currentPoint.y}
            data-testid="bonding-curve-current-point"
            fill="#050810"
            r="9"
            stroke="#41F3CA"
            strokeWidth="4"
          />
          <text
            fill="#F8FAFC"
            fontSize="12"
            fontWeight="700"
            x={Math.min(model.currentPoint.x + 12, CHART_WIDTH - CHART_PADDING.right - 136)}
            y={Math.max(model.currentPoint.y - 10, CHART_PADDING.top + 14)}
          >
            {labels.currentPoint}
          </text>

          {overlay?.markers.map((marker) => (
            <g data-testid={marker.kind === "generation" ? "soul-flow-generation-marker" : "soul-flow-claim-marker"} key={marker.id}>
              <line
                stroke={marker.stroke}
                strokeDasharray="2 5"
                strokeOpacity="0.72"
                strokeWidth="1.5"
                x1={marker.x}
                x2={marker.x}
                y1={marker.y + 10}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
              />
              <circle
                cx={marker.x}
                cy={marker.y}
                fill="#050810"
                r={marker.kind === "generation" ? 7 : 6}
                stroke={marker.stroke}
                strokeWidth="3"
              />
              <text
                fill={marker.stroke}
                fontSize="10"
                fontWeight="700"
                x={Math.min(marker.x + 8, CHART_WIDTH - CHART_PADDING.right - 86)}
                y={Math.max(marker.y - 8, CHART_PADDING.top + 12)}
              >
                {marker.label}
              </text>
            </g>
          ))}

          <text fill="rgba(255,255,255,0.55)" fontSize="11" x={CHART_PADDING.left} y={CHART_HEIGHT - 18}>
            {labels.tokenAxis}
          </text>
          <text
            fill="rgba(255,255,255,0.55)"
            fontSize="11"
            transform={`translate(16 ${CHART_HEIGHT - CHART_PADDING.bottom}) rotate(-90)`}
          >
            {labels.priceAxis}
          </text>
        </svg>
      </div>

      {soulFlow && overlay?.markers.length === 0 ? (
        <p className={joinClasses(uiPrimitives.statusNeutral, "mt-4 p-3 text-xs")} data-testid="soul-flow-no-markers">
          {soulFlow.labels.noMarkers}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div
            aria-label={`${labels.mintedProgress}: ${percentMinted}`}
            className="h-2.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-soul-mint via-white to-soul-glow"
              style={{ width: progressWidth }}
            />
          </div>
          <p className="mt-2 text-xs text-white/50">
            {labels.mintedProgress}: <span className="font-mono text-soul-mint">{percentMinted}</span>
          </p>
        </div>
        <p className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-white/55">
          {labels.capHelper}
        </p>
      </div>
    </section>
  );
}

function buildSoulFlowOverlay(
  model: BondingCurveChartModel,
  soulFlow: NonNullable<Parameters<typeof BondingCurveChart>[0]["soulFlow"]>,
) {
  const generationCount = parsePositiveCount(soulFlow.generationCount);
  const claimCount = parsePositiveCount(soulFlow.claimCount);
  const volumeBars = Array.from({ length: 12 }, (_, index) => {
    const wave = (index * 17 + generationCount * 11 + claimCount * 7 + Math.round(model.progressPercent)) % 41;
    const height = 14 + wave;
    const x = CHART_PADDING.left + 8 + index * ((plotWidth() - 16) / 12);
    const y = CHART_HEIGHT - CHART_PADDING.bottom - height;
    return {
      fill: index % 3 === 1 ? "rgba(184,107,255,0.24)" : "rgba(65,243,202,0.22)",
      height,
      index,
      width: Math.max(10, plotWidth() / 34),
      x,
      y,
    };
  });

  const generationMarkers = Array.from({ length: Math.min(generationCount, 3) }, (_, index) => {
    const ratio = (index + 1) / (Math.min(generationCount, 3) + 1);
    return soulFlowMarker({
      id: `generation-${index}`,
      kind: "generation" as const,
      label: soulFlow.labels.generationMarker,
      ratio,
      stroke: "#41F3CA",
      verticalStep: index,
    });
  });
  const claimMarkers = Array.from({ length: Math.min(claimCount, 3) }, (_, index) => {
    const ratio = (index + 1.35) / (Math.min(claimCount, 3) + 1.7);
    return soulFlowMarker({
      id: `claim-${index}`,
      kind: "claim" as const,
      label: soulFlow.labels.claimMarker,
      ratio: Math.min(ratio, 0.92),
      stroke: "#B86BFF",
      verticalStep: index + 1,
    });
  });

  return {
    volumeBars,
    markers: [...generationMarkers, ...claimMarkers],
  };
}

function FallbackSoulFlowChart({
  soulFlow,
}: {
  soulFlow: NonNullable<Parameters<typeof BondingCurveChart>[0]["soulFlow"]>;
}) {
  const bars = [24, 38, 22, 52, 34, 44, 29, 58];

  return (
    <div
      className="mt-5 rounded-3xl border border-white/10 bg-black/30 p-3 sm:p-4"
      data-testid="soul-flow-chart-fallback"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/55" data-testid="soul-flow-chart">
        <span className={joinClasses(uiPrimitives.pill, "px-2 py-1")}>
          {soulFlow.labels.volumeMovement}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">
          {soulFlow.labels.fixture ?? soulFlow.labels.noMarkers}
        </span>
      </div>
      <svg
        aria-hidden="true"
        className="h-48 w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 360 180"
      >
        <path
          d="M20 138 C76 116 110 126 148 90 C190 54 230 68 340 34"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeLinecap="round"
          strokeWidth="14"
        />
        <path
          d="M20 138 C76 116 110 126 148 90 C190 54 230 68 340 34"
          fill="none"
          stroke="#41F3CA"
          strokeLinecap="round"
          strokeWidth="4"
        />
        {bars.map((height, index) => (
          <rect
            data-testid="soul-flow-volume-bar"
            fill={index % 2 === 0 ? "rgba(65,243,202,0.22)" : "rgba(184,107,255,0.24)"}
            height={height}
            key={`fallback-volume-${index}`}
            rx="4"
            width="14"
            x={34 + index * 38}
            y={148 - height}
          />
        ))}
        <g data-testid="soul-flow-generation-marker">
          <circle cx="148" cy="90" fill="#050810" r="8" stroke="#41F3CA" strokeWidth="3" />
          <text fill="#41F3CA" fontSize="11" fontWeight="700" x="160" y="82">
            {soulFlow.labels.generationMarker}
          </text>
        </g>
        <g data-testid="soul-flow-claim-marker">
          <circle cx="264" cy="58" fill="#050810" r="7" stroke="#B86BFF" strokeWidth="3" />
          <text fill="#B86BFF" fontSize="11" fontWeight="700" x="276" y="50">
            {soulFlow.labels.claimMarker}
          </text>
        </g>
      </svg>
      <p className="mt-3 text-xs leading-5 text-white/50">{soulFlow.labels.noMarkers}</p>
    </div>
  );
}

function soulFlowMarker({
  id,
  kind,
  label,
  ratio,
  stroke,
  verticalStep,
}: {
  id: string;
  kind: "generation" | "claim";
  label: string;
  ratio: number;
  stroke: string;
  verticalStep: number;
}) {
  const x = CHART_PADDING.left + ratio * plotWidth();
  const y = CHART_PADDING.top + 38 + (verticalStep % 3) * 34;
  return { id, kind, label, stroke, x, y };
}

function parsePositiveCount(value: string): number {
  const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function ChartStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

function MarkerLine({
  label,
  labelX,
  lineX,
  testId,
  yOffset,
}: {
  label: string;
  labelX: number;
  lineX: number;
  testId: string;
  yOffset: number;
}) {
  return (
    <g data-testid={testId}>
      <line
        stroke="rgba(255,255,255,0.34)"
        strokeDasharray="4 6"
        strokeWidth="1.5"
        x1={lineX}
        x2={lineX}
        y1={CHART_PADDING.top}
        y2={CHART_HEIGHT - CHART_PADDING.bottom}
      />
      <text
        fill="rgba(255,255,255,0.72)"
        fontSize="11"
        fontWeight="700"
        x={labelX}
        y={CHART_HEIGHT - CHART_PADDING.bottom + yOffset}
      >
        {label}
      </text>
    </g>
  );
}

export function buildBondingCurveChartModel(curve: BondingCurveAccount): BondingCurveChartModel | null {
  if (
    curve.totalMinted < 0n ||
    curve.totalMinted > CURVE_K_BASE_UNITS ||
    curve.cumulativeSol < 0n
  ) {
    return null;
  }

  const samples = sampleCurveSpotPrices();
  const currentPrice = estimateSpotPriceSolPerToken(
    curve.totalMinted >= CURVE_K_BASE_UNITS ? CURVE_K_BASE_UNITS - 1n : curve.totalMinted,
  );
  if (currentPrice === null) {
    return null;
  }

  const maxPrice = Math.max(
    currentPrice,
    ...samples.map((sample) => sample.priceSolPerToken),
  );
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) {
    return null;
  }

  const points = samples.map((sample) => mapChartPoint(sample, maxPrice));
  const currentPoint = mapChartPoint(
    {
      totalMinted: curve.totalMinted,
      priceSolPerToken: currentPrice,
    },
    maxPrice,
  );
  const baselineY = CHART_HEIGHT - CHART_PADDING.bottom;
  const path = pointsToPath(points);
  const areaPath = `${path} L ${points[points.length - 1]?.x ?? CHART_PADDING.left} ${baselineY} L ${CHART_PADDING.left} ${baselineY} Z`;
  const progressPercent = Number(curve.totalMinted * 10_000n / CURVE_K_BASE_UNITS) / 100;

  return {
    points,
    path,
    areaPath,
    currentPoint,
    firstMtX: mapMintedToX(MT_CLAIM_QUANTUM_BASE_UNITS),
    capX: mapMintedToX(MT_SOUL_CAP_BASE_UNITS),
    progressWidth: Math.min(Math.max(progressPercent, 0), 100),
    progressPercent,
  };
}

function mapChartPoint(
  sample: { totalMinted: bigint; priceSolPerToken: number },
  maxPrice: number,
): ChartPoint {
  return {
    x: mapMintedToX(sample.totalMinted),
    y: mapPriceToY(sample.priceSolPerToken, maxPrice),
    totalMinted: sample.totalMinted,
    priceSolPerToken: sample.priceSolPerToken,
  };
}

function mapMintedToX(totalMinted: bigint): number {
  const clamped = totalMinted < 0n
    ? 0n
    : totalMinted > CURVE_K_BASE_UNITS
      ? CURVE_K_BASE_UNITS
      : totalMinted;
  return CHART_PADDING.left + (Number(clamped) / Number(CURVE_K_BASE_UNITS)) * plotWidth();
}

function mapPriceToY(priceSolPerToken: number, maxPrice: number): number {
  const ratio = Math.sqrt(priceSolPerToken / maxPrice);
  return CHART_HEIGHT - CHART_PADDING.bottom - ratio * plotHeight();
}

function pointsToPath(points: ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function plotWidth(): number {
  return CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
}

function plotHeight(): number {
  return CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
}

export function LifecycleCurveVisual({
  currentPrice,
  percentMinted,
  selfDeprecated,
  heading,
  currentPriceLabel,
  progressLabel,
  tradePromptLabel,
  spreadLabel,
  liveStatus = "Live",
  deprecatedStatus = "Supply Cap Reached",
}: {
  currentPrice: string;
  percentMinted: string;
  selfDeprecated: boolean;
  heading: string;
  currentPriceLabel: string;
  progressLabel: string;
  tradePromptLabel: string;
  spreadLabel: string;
  liveStatus?: string;
  deprecatedStatus?: string;
}) {
  const progressWidth = clampPercent(percentMinted);

  return (
    <section className={joinClasses(uiPrimitives.card, "overflow-hidden p-5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={joinClasses(uiPrimitives.label, "w-fit")}>
            {tradePromptLabel}
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">{heading}</h2>
        </div>
        <span className={joinClasses(uiPrimitives.pill, "px-3 py-1 text-xs")}>
          {selfDeprecated ? deprecatedStatus : liveStatus}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1.4fr] sm:items-center">
        <dl className="grid gap-3">
          <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
            <dt className="text-xs tracking-[0.12em] text-white/45">
              {currentPriceLabel}
            </dt>
            <dd className="mt-2 break-words text-xl font-black text-white">{currentPrice}</dd>
          </div>
          <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
            <dt className="text-xs tracking-[0.12em] text-white/45">{progressLabel}</dt>
            <dd className="mt-2 text-xl font-black text-white">{percentMinted}</dd>
            <div
              aria-label={`${progressLabel}: ${percentMinted}`}
              className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-soul-mint via-white to-soul-glow"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
        </dl>

        <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
          <p className="mb-2 text-xs tracking-[0.12em] text-white/45">{spreadLabel}</p>
          <svg
            aria-hidden="true"
            className="h-40 w-full"
            preserveAspectRatio="none"
            viewBox="0 0 320 160"
          >
            <defs>
              <linearGradient id="lifecycle-curve-gradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#41F3CA" />
                <stop offset="60%" stopColor="#8EE6FF" />
                <stop offset="100%" stopColor="#B86BFF" />
              </linearGradient>
            </defs>
            <path d="M0 136 C72 134 116 116 154 86 C197 52 235 31 320 24" fill="none" stroke="rgba(255,255,255,0.16)" strokeLinecap="round" strokeWidth="20" />
            <path d="M0 136 C72 134 116 116 154 86 C197 52 235 31 320 24" fill="none" stroke="url(#lifecycle-curve-gradient)" strokeLinecap="round" strokeWidth="8" />
            <circle cx="154" cy="86" fill="#41F3CA" r="8" />
            <circle cx="320" cy="24" fill="#B86BFF" r="8" />
          </svg>
        </div>
      </div>
    </section>
  );
}

export function MarketCurveOverview({
  currentPrice,
  cumulativeSol,
  totalMinted,
  percentMinted,
  oneSolQuote,
  selfDeprecated,
  labels,
}: {
  currentPrice: string;
  cumulativeSol: string;
  totalMinted: string;
  percentMinted: string;
  oneSolQuote: string;
  selfDeprecated: boolean;
  labels: {
    title: string;
    body: string;
    price: string;
    reserve: string;
    circulating: string;
    progress: string;
    oneSolQuote: string;
    maxBuy: string;
    lockFee: string;
    live: string;
    deprecated: string;
  };
}) {
  const progressWidth = clampPercent(percentMinted);

  return (
    <section className={joinClasses(uiPrimitives.card, "overflow-hidden p-4")} data-testid="market-curve-overview">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
            {labels.title}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{labels.body}</p>
        </div>
        <span className={joinClasses(uiPrimitives.pill, "px-3 py-1 text-xs")}>
          {selfDeprecated ? labels.deprecated : labels.live}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [labels.price, currentPrice],
          [labels.reserve, cumulativeSol],
          [labels.circulating, totalMinted],
          [labels.oneSolQuote, oneSolQuote],
        ].map(([label, value]) => (
          <div className={joinClasses(uiPrimitives.denseRow, "p-3")} key={label}>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{label}</dt>
            <dd className="mt-2 break-words font-mono text-sm font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-white">{labels.progress}</span>
            <span className="font-mono text-soul-mint">{percentMinted}</span>
          </div>
          <div
            aria-label={`${labels.progress}: ${percentMinted}`}
            className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-soul-mint via-white to-soul-glow"
              style={{ width: progressWidth }}
            />
          </div>
          <svg
            aria-hidden="true"
            className="mt-4 h-28 w-full"
            preserveAspectRatio="none"
            viewBox="0 0 360 120"
          >
            <defs>
              <linearGradient id="market-curve-gradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#41F3CA" />
                <stop offset="60%" stopColor="#8EE6FF" />
                <stop offset="100%" stopColor="#B86BFF" />
              </linearGradient>
            </defs>
            <path d="M0 104 C72 104 118 92 164 66 C216 36 276 18 360 14" fill="none" stroke="rgba(255,255,255,0.14)" strokeLinecap="round" strokeWidth="18" />
            <path d="M0 104 C72 104 118 92 164 66 C216 36 276 18 360 14" fill="none" stroke="url(#market-curve-gradient)" strokeLinecap="round" strokeWidth="7" />
            <circle cx="164" cy="66" fill="#41F3CA" r="7" />
          </svg>
        </div>
        <div className={joinClasses(uiPrimitives.denseRow, "grid gap-2 p-4 text-sm text-white/65")}>
          <p>
            <span className="font-semibold text-white">{labels.maxBuy}</span>
          </p>
          <p>{labels.lockFee}</p>
        </div>
      </div>
    </section>
  );
}

export function QuoteBreakdown({
  title,
  quoteText,
  minReceivedText,
  lockFeeText,
  priceImpactText,
  balanceText,
  routeText,
  prompt,
  labels,
}: {
  title: string;
  quoteText: string | null;
  minReceivedText: string | null;
  lockFeeText?: string | null;
  priceImpactText: string | null;
  balanceText: string;
  routeText: string;
  prompt: string;
  labels: {
    youReceive: string;
    minReceived: string;
    lockFee: string;
    priceImpact: string;
    balance: string;
    route: string;
  };
}) {
  return (
    <div className={joinClasses(uiPrimitives.denseRow, "grid gap-3 p-4")} data-testid="quote-breakdown">
      <p className="text-sm font-semibold text-white">{title}</p>
      {quoteText ? (
        <dl className="grid gap-2 text-sm">
          <QuoteRow label={labels.youReceive} value={quoteText} prominent />
          {minReceivedText ? <QuoteRow label={labels.minReceived} value={minReceivedText} /> : null}
          {lockFeeText ? <QuoteRow label={labels.lockFee} value={lockFeeText} /> : null}
          {priceImpactText ? <QuoteRow label={labels.priceImpact} value={priceImpactText} /> : null}
          <QuoteRow label={labels.balance} value={balanceText} />
          <QuoteRow label={labels.route} value={routeText} />
        </dl>
      ) : (
        <p className="text-sm text-white/55">{prompt}</p>
      )}
    </div>
  );
}

function QuoteRow({
  label,
  value,
  prominent = false,
}: {
  label: string;
  value: string;
  prominent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <dt className="text-white/45">{label}</dt>
      <dd className={joinClasses("break-words text-right font-mono", prominent ? "text-soul-mint" : "text-white")}>
        {value}
      </dd>
    </div>
  );
}

function clampPercent(percentText: string): string {
  const parsed = Number.parseFloat(percentText.replace("%", ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "0%";
  }
  if (parsed >= 100) {
    return "100%";
  }
  return `${parsed.toFixed(2)}%`;
}

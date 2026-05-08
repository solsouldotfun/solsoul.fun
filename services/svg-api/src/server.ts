import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { svgRendererRouter } from "./routes/svg.js";
import { healthRouter } from "./routes/health.js";

const app = express();
const PORT = process.env.PORT || "3001";

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use("/api/v1/svg", svgRendererRouter);
app.use("/health", healthRouter);

app.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "solsoul-svg-api",
    version: "0.1.0",
    endpoints: {
      "POST /api/v1/svg/render": "Render SVG from blueprint or theme",
      "GET /api/v1/svg/themes": "List available themes",
      "GET /health": "Health check",
    },
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[svg-api] error:", err);
  res.status(500).json({ ok: false, error: "internal_server_error" });
});

const server = createServer(app);

server.listen(Number(PORT), () => {
  console.log(`[svg-api] listening on :${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[svg-api] shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[svg-api] shutting down...");
  server.close(() => process.exit(0));
});
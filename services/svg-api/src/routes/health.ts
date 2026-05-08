import { Router, type Request, type Response } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "solsoul-svg-api",
    timestamp: new Date().toISOString(),
  });
});
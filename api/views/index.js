/**
 * Vercel Serverless Function — GET /api/views?ids=id1,id2,id3
 * Ported 1:1 from server.js's GET /views bulk route.
 *
 * NOTE: this lives at /api/views on Vercel (file-based routing always
 * nests under /api), whereas on Railway server.js exposes it at /views.
 * The frontend (src/hooks/useViewCount.ts) already targets whichever
 * base the deployment needs via VITE_API_BASE — see vercel.json for the
 * rewrite that maps the bare /views path Vercel-side too, so no frontend
 * changes are needed.
 */
import { getBulkViews } from "../_lib/views.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const ids = (req.query.ids || "").split(",").filter(Boolean).slice(0, 50);
    const counts = await getBulkViews(ids);
    return res.status(200).json(counts);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

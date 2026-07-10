/**
 * Vercel Serverless Function — GET/POST /api/views/:id
 * Ported 1:1 from server.js's GET/POST /views/:id routes.
 * POST increments the count (user started watching), GET just reads it.
 *
 * This is a catch-all route ([...id].js) rather than a single [id].js.
 * IDs (esp. daddy_ ones) can contain an encoded "/" (%2F) — Vercel's
 * rewrite/route matcher decodes %2F before matching, so a single-segment
 * :id pattern silently fails to match and falls through to the SPA
 * catch-all (a static file, GET-only) — producing a 405 on POST. The
 * catch-all here receives each decoded segment separately in req.query.id
 * as an array; rejoining with "/" restores the original id exactly.
 */
import { incrementView, getView } from "../_lib/views.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw.join("/") : raw;

  if (req.method === "POST") {
    try {
      const count = await incrementView(id);
      return res.status(200).json({ id, count });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "GET") {
    try {
      const count = await getView(id);
      return res.status(200).json({ id, count });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
}

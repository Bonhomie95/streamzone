/**
 * Vercel Serverless Function — GET/POST /api/views/:id
 * Ported 1:1 from server.js's GET/POST /views/:id routes.
 * POST increments the count (user started watching), GET just reads it.
 */
import { incrementView, getView } from "../_lib/views.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query;

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

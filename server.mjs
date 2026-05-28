import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { members: new Map(), streams: new Set() });
  return rooms.get(roomId);
}

function publicMembers(room) {
  return [...room.members.values()].map((member) => ({
    id: member.id,
    name: member.name,
    color: member.color,
    location: member.location || null,
    updatedAt: member.updatedAt || null
  }));
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function broadcast(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = `data: ${JSON.stringify(publicMembers(room))}\n\n`;
  for (const res of room.streams) res.write(data);
}

function sanitizeRoom(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 18);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(PUBLIC_DIR, decodeURIComponent(requestPath)));

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stream") {
      const roomId = sanitizeRoom(url.searchParams.get("room"));
      if (!roomId) {
        sendJson(res, 400, { error: "room_required" });
        return;
      }

      const room = getRoom(roomId);
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });
      res.write(`data: ${JSON.stringify(publicMembers(room))}\n\n`);
      room.streams.add(res);
      req.on("close", () => room.streams.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/join") {
      const body = await readJson(req);
      const roomId = sanitizeRoom(body.roomId);
      if (!roomId || !body.id) {
        sendJson(res, 400, { error: "room_and_id_required" });
        return;
      }

      const room = getRoom(roomId);
      room.members.set(String(body.id), {
        id: String(body.id).slice(0, 64),
        name: String(body.name || "Arac").trim().slice(0, 28),
        color: String(body.color || "#2563eb").slice(0, 24),
        location: room.members.get(String(body.id))?.location || null,
        updatedAt: room.members.get(String(body.id))?.updatedAt || null
      });
      broadcast(roomId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/location") {
      const body = await readJson(req);
      const roomId = sanitizeRoom(body.roomId);
      const room = rooms.get(roomId);
      const member = room?.members.get(String(body.id));
      if (!room || !member) {
        sendJson(res, 404, { error: "member_not_found" });
        return;
      }

      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        sendJson(res, 400, { error: "invalid_location" });
        return;
      }

      member.location = {
        lat,
        lng,
        accuracy: Number(body.accuracy) || null,
        heading: Number.isFinite(Number(body.heading)) ? Number(body.heading) : null,
        speed: Number.isFinite(Number(body.speed)) ? Number(body.speed) : null
      };
      member.updatedAt = Date.now();
      broadcast(roomId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/leave") {
      const body = await readJson(req);
      const roomId = sanitizeRoom(body.roomId);
      const room = rooms.get(roomId);
      room?.members.delete(String(body.id));
      broadcast(roomId);
      sendJson(res, 200, { ok: true });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: "server_error", detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Road Tracker running on http://localhost:${PORT}`);
});

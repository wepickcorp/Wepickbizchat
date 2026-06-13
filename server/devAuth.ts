import type { Express, RequestHandler } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "./storage";

const isLocalDevAuth = process.env.NODE_ENV === "development" && process.env.REPL_ID === "local-dev";

const localAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
});

function getLocalAuthPayload(body: unknown) {
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

  return {
    email: typeof input.email === "string" && input.email ? input.email : "local@wepick.test",
    password: typeof input.password === "string" && input.password ? input.password : "local-password",
    name: typeof input.name === "string" && input.name ? input.name : "로컬 사용자",
  };
}

function getLocalUserId(email: string) {
  return `local-${crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24)}`;
}

function getSessionUserId(req: Parameters<RequestHandler>[0]) {
  return (req.session as (typeof req.session & { localDevUserId?: string }) | undefined)?.localDevUserId;
}

function setSessionUserId(req: Parameters<RequestHandler>[0], userId: string) {
  (req.session as typeof req.session & { localDevUserId?: string }).localDevUserId = userId;
}

function clearSessionUserId(req: Parameters<RequestHandler>[0]) {
  delete (req.session as typeof req.session & { localDevUserId?: string }).localDevUserId;
}

export function getLocalDevSessionUserId(req: Parameters<RequestHandler>[0]) {
  if (!isLocalDevAuth) return null;
  return getSessionUserId(req) || null;
}

export function registerDevAuthRoutes(app: Express) {
  app.post("/api/dev/auth/signup", async (req, res) => {
    if (!isLocalDevAuth) {
      return res.status(404).json({ error: "Not found" });
    }

    const data = localAuthSchema.parse(getLocalAuthPayload(req.body));
    const userId = getLocalUserId(data.email);
    const [firstName, ...restName] = (data.name || "로컬 사용자").trim().split(/\s+/);
    const user = await storage.upsertUser({
      id: userId,
      email: data.email.toLowerCase(),
      firstName,
      lastName: restName.join(" "),
    });

    await storage.updateUserBalance(userId, "16000");
    setSessionUserId(req, userId);

    res.status(201).json({ user: { ...user, balance: "16000" } });
  });

  app.post("/api/dev/auth/login", async (req, res) => {
    if (!isLocalDevAuth) {
      return res.status(404).json({ error: "Not found" });
    }

    const data = localAuthSchema.parse(getLocalAuthPayload(req.body));
    const userId = getLocalUserId(data.email);
    let user = await storage.getUser(userId);

    if (!user) {
      user = await storage.upsertUser({
        id: userId,
        email: data.email.toLowerCase(),
        firstName: "로컬",
        lastName: "사용자",
      });
      await storage.updateUserBalance(userId, "16000");
      user = { ...user, balance: "16000" };
    }

    setSessionUserId(req, userId);
    res.json({ user });
  });

  app.post("/api/dev/auth/logout", (req, res) => {
    if (!isLocalDevAuth) {
      return res.status(404).json({ error: "Not found" });
    }

    clearSessionUserId(req);
    res.json({ success: true });
  });
}

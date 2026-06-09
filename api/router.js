import { createRequire as __cr } from 'module';
import { fileURLToPath as __fu } from 'url';
import { dirname as __dn } from 'path';
const require = __cr(import.meta.url);
const __filename = __fu(import.meta.url);
const __dirname = __dn(__filename);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/handlers/admin/refunds/[id]/process.ts
var process_exports = {};
__export(process_exports, {
  default: () => handler
});
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, eq } from "drizzle-orm";
import { pgTable, varchar, timestamp, boolean, decimal, text, jsonb } from "drizzle-orm/pg-core";
import crypto2 from "crypto";
var admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  transactionId: varchar("transaction_id"),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  adminId: varchar("admin_id"),
  adminNote: text("admin_note"),
  bankName: varchar("bank_name", { length: 50 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountHolder: varchar("account_holder", { length: 50 }),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }),
  description: text("description"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow()
});
var adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow()
});
function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle(neon(databaseUrl));
}
function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto2.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken(token);
  if (!verified) return null;
  try {
    const db = getDb();
    const admin = await db.select().from(admins).where(eq(admins.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
}
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (admin.role !== "super" && admin.role !== "finance") {
    return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
  }
  const { id } = req.query;
  const { action, adminNote } = req.body;
  if (!action || !["approve", "reject", "complete"].includes(action)) {
    return res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC791\uC5C5\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694" });
  }
  try {
    const db = getDb();
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    if (!refund) {
      return res.status(404).json({ error: "\uD658\uBD88 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (refund.status === "completed") {
      return res.status(400).json({ error: "\uC774\uBBF8 \uCC98\uB9AC \uC644\uB8CC\uB41C \uD658\uBD88\uC785\uB2C8\uB2E4" });
    }
    let newStatus = refund.status;
    if (action === "approve") {
      newStatus = "approved";
    } else if (action === "reject") {
      newStatus = "rejected";
    } else if (action === "complete") {
      if (refund.status !== "approved") {
        return res.status(400).json({ error: "\uC2B9\uC778\uB41C \uD658\uBD88\uB9CC \uC644\uB8CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4" });
      }
      newStatus = "completed";
      const [user] = await db.select().from(users).where(eq(users.id, refund.userId)).limit(1);
      if (user) {
        const currentBalance = Number(user.balance || 0);
        const refundAmount = Number(refund.amount);
        const newBalance = currentBalance - refundAmount;
        await db.update(users).set({ balance: String(Math.max(0, newBalance)), updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, refund.userId));
        await db.insert(transactions).values({
          userId: refund.userId,
          type: "refund",
          amount: String(-refundAmount),
          balanceAfter: String(Math.max(0, newBalance)),
          description: `\uD658\uBD88 \uC644\uB8CC (${refund.reason})`,
          paymentMethod: "bank_transfer"
        });
      }
    }
    await db.update(refunds).set({
      status: newStatus,
      adminId: admin.id,
      adminNote: adminNote || refund.adminNote,
      processedAt: ["approved", "rejected", "completed"].includes(newStatus) ? /* @__PURE__ */ new Date() : refund.processedAt,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(refunds.id, id));
    await db.insert(adminLogs).values({
      adminId: admin.id,
      action: `refund_${action}`,
      targetType: "refund",
      targetId: id,
      details: {
        amount: refund.amount,
        previousStatus: refund.status,
        newStatus,
        adminNote
      },
      ipAddress: getClientIp(req)
    });
    return res.status(200).json({ success: true, status: newStatus });
  } catch (error) {
    console.error("[Admin Refund Process] Error:", error);
    return res.status(500).json({ error: "\uD658\uBD88 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/users/[userId]/agency.ts
var agency_exports = {};
__export(agency_exports, {
  default: () => handler2
});
import { neon as neon2 } from "@neondatabase/serverless";
import { drizzle as drizzle2 } from "drizzle-orm/neon-http";
import { eq as eq2, sql as sql2 } from "drizzle-orm";
import { pgTable as pgTable2, varchar as varchar2, timestamp as timestamp2, boolean as boolean2 } from "drizzle-orm/pg-core";
import crypto3 from "crypto";
var admins2 = pgTable2("admins", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  email: varchar2("email").unique().notNull(),
  passwordHash: varchar2("password_hash").notNull(),
  name: varchar2("name", { length: 100 }).notNull(),
  role: varchar2("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean2("is_active").default(true),
  lastLoginAt: timestamp2("last_login_at"),
  createdAt: timestamp2("created_at").defaultNow(),
  updatedAt: timestamp2("updated_at").defaultNow()
});
var agencies = pgTable2("agencies", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  userId: varchar2("user_id").notNull(),
  name: varchar2("name", { length: 200 }).notNull(),
  contactName: varchar2("contact_name", { length: 100 }),
  contactPhone: varchar2("contact_phone", { length: 20 }),
  contactEmail: varchar2("contact_email", { length: 200 }),
  isActive: boolean2("is_active").default(true),
  createdAt: timestamp2("created_at").defaultNow(),
  updatedAt: timestamp2("updated_at").defaultNow()
});
var users2 = pgTable2("users", {
  id: varchar2("id").primaryKey().default(sql2`gen_random_uuid()`),
  email: varchar2("email").unique(),
  companyName: varchar2("company_name"),
  isAgency: boolean2("is_agency").default(false),
  agencyId: varchar2("agency_id"),
  createdAt: timestamp2("created_at").defaultNow(),
  updatedAt: timestamp2("updated_at").defaultNow()
});
function getDb2() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon2(databaseUrl);
  return drizzle2(sqlClient);
}
function verifyToken2(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto3.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken2(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken2(token);
  if (!verified) return null;
  try {
    const db = getDb2();
    const admin = await db.select().from(admins2).where(eq2(admins2.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler2(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken2(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "\uC0AC\uC6A9\uC790 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" });
  }
  const db = getDb2();
  try {
    const [user] = await db.select().from(users2).where(eq2(users2.id, userId));
    if (!user) {
      return res.status(404).json({ error: "\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (req.method === "POST") {
      const { name, contactName, contactPhone, contactEmail } = req.body || {};
      if (!name) {
        return res.status(400).json({ error: "\uB300\uD589\uC0AC\uBA85\uC740 \uD544\uC218\uC785\uB2C8\uB2E4" });
      }
      const [existingAgency] = await db.select().from(agencies).where(eq2(agencies.userId, userId));
      if (existingAgency) {
        return res.status(400).json({ error: "\uC774\uBBF8 \uB300\uD589\uC0AC\uB85C \uB4F1\uB85D\uB41C \uACC4\uC815\uC785\uB2C8\uB2E4" });
      }
      const [newAgency] = await db.insert(agencies).values({
        userId,
        name,
        contactName,
        contactPhone,
        contactEmail
      }).returning();
      await db.update(users2).set({ isAgency: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(users2.id, userId));
      return res.status(201).json({
        success: true,
        agency: newAgency,
        message: "\uB300\uD589\uC0AC\uB85C \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4"
      });
    }
    if (req.method === "DELETE") {
      const [existingAgency] = await db.select().from(agencies).where(eq2(agencies.userId, userId));
      if (!existingAgency) {
        return res.status(400).json({ error: "\uB300\uD589\uC0AC \uACC4\uC815\uC774 \uC544\uB2D9\uB2C8\uB2E4" });
      }
      const subAccounts = await db.select().from(users2).where(eq2(users2.agencyId, existingAgency.id));
      for (const subAccount of subAccounts) {
        await db.update(users2).set({ agencyId: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(users2.id, subAccount.id));
      }
      await db.delete(agencies).where(eq2(agencies.userId, userId));
      await db.update(users2).set({ isAgency: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(users2.id, userId));
      return res.status(200).json({
        success: true,
        message: "\uB300\uD589\uC0AC \uB4F1\uB85D\uC774 \uD574\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4"
      });
    }
  } catch (error) {
    console.error("[Admin User Agency] Error:", error);
    return res.status(500).json({ error: "\uB300\uD589\uC0AC \uC124\uC815 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/users/[userId]/balance.ts
var balance_exports = {};
__export(balance_exports, {
  default: () => handler3
});
import { neon as neon3 } from "@neondatabase/serverless";
import { drizzle as drizzle3 } from "drizzle-orm/neon-http";
import { eq as eq3, sql as sql3 } from "drizzle-orm";
import { pgTable as pgTable3, varchar as varchar3, timestamp as timestamp3, decimal as decimal2, boolean as boolean3, text as text2, jsonb as jsonb2 } from "drizzle-orm/pg-core";
import crypto4 from "crypto";
var admins3 = pgTable3("admins", {
  id: varchar3("id").primaryKey().default(sql3`gen_random_uuid()`),
  email: varchar3("email").unique().notNull(),
  passwordHash: varchar3("password_hash").notNull(),
  name: varchar3("name", { length: 100 }).notNull(),
  role: varchar3("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean3("is_active").default(true),
  lastLoginAt: timestamp3("last_login_at"),
  createdAt: timestamp3("created_at").defaultNow(),
  updatedAt: timestamp3("updated_at").defaultNow()
});
var users3 = pgTable3("users", {
  id: varchar3("id").primaryKey().default(sql3`gen_random_uuid()`),
  email: varchar3("email").unique(),
  balance: decimal2("balance", { precision: 12, scale: 0 }).default("0"),
  updatedAt: timestamp3("updated_at").defaultNow()
});
var transactions2 = pgTable3("transactions", {
  id: varchar3("id").primaryKey().default(sql3`gen_random_uuid()`),
  userId: varchar3("user_id").notNull(),
  type: varchar3("type", { length: 20 }).notNull(),
  amount: decimal2("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal2("balance_after", { precision: 12, scale: 0 }).notNull(),
  description: text2("description"),
  paymentMethod: varchar3("payment_method", { length: 50 }),
  stripeSessionId: varchar3("stripe_session_id", { length: 255 }),
  createdAt: timestamp3("created_at").defaultNow()
});
var adminLogs2 = pgTable3("admin_logs", {
  id: varchar3("id").primaryKey().default(sql3`gen_random_uuid()`),
  adminId: varchar3("admin_id").notNull(),
  action: varchar3("action", { length: 50 }).notNull(),
  targetType: varchar3("target_type", { length: 50 }),
  targetId: varchar3("target_id"),
  details: jsonb2("details"),
  ipAddress: varchar3("ip_address", { length: 45 }),
  createdAt: timestamp3("created_at").defaultNow()
});
function getDb3() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon3(databaseUrl);
  return drizzle3(sqlClient);
}
function verifyToken3(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto4.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken3(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken3(token);
  if (!verified) return null;
  try {
    const db = getDb3();
    const admin = await db.select().from(admins3).where(eq3(admins3.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
function getClientIp2(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
}
async function handler3(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken3(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { userId } = req.query;
  const { amount, reason } = req.body || {};
  const numAmount = Number(amount);
  if (!userId || isNaN(numAmount) || !reason) {
    return res.status(400).json({ error: "\uD544\uC218 \uAC12\uC774 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4 (userId, amount, reason \uD544\uC694)" });
  }
  try {
    const db = getDb3();
    const [user] = await db.select().from(users3).where(eq3(users3.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    const currentBalance = Number(user.balance || 0);
    const newBalance = currentBalance + numAmount;
    if (newBalance < 0) {
      return res.status(400).json({ error: "\uC794\uC561\uC774 \uB9C8\uC774\uB108\uC2A4\uAC00 \uB420 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    await db.update(users3).set({ balance: String(newBalance), updatedAt: /* @__PURE__ */ new Date() }).where(eq3(users3.id, userId));
    try {
      await db.insert(transactions2).values({
        userId,
        type: "admin_adjustment",
        amount: String(numAmount),
        balanceAfter: String(newBalance),
        description: `[\uAD00\uB9AC\uC790 \uC870\uC815] ${reason}`,
        paymentMethod: "admin"
      });
    } catch (txError) {
      console.error("[Admin Balance Adjust] Failed to insert transaction record:", txError);
    }
    try {
      await db.insert(adminLogs2).values({
        adminId: admin.id,
        action: "balance_adjust",
        targetType: "user",
        targetId: userId,
        details: {
          previousBalance: currentBalance,
          newBalance,
          amount: numAmount,
          reason,
          userEmail: user.email
        },
        ipAddress: getClientIp2(req)
      });
    } catch (logError) {
      console.error("[Admin Balance Adjust] Failed to insert admin log:", logError);
    }
    return res.status(200).json({
      success: true,
      previousBalance: currentBalance,
      newBalance
    });
  } catch (error) {
    console.error("[Admin Balance Adjust] Error:", error);
    return res.status(500).json({ error: "\uC794\uC561 \uC870\uC815 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/users/[userId]/impersonate.ts
var impersonate_exports = {};
__export(impersonate_exports, {
  default: () => handler4
});
import { neon as neon4 } from "@neondatabase/serverless";
import { drizzle as drizzle4 } from "drizzle-orm/neon-http";
import { eq as eq4, sql as sql4 } from "drizzle-orm";
import { pgTable as pgTable4, varchar as varchar4, timestamp as timestamp4, boolean as boolean4, decimal as decimal3, jsonb as jsonb3 } from "drizzle-orm/pg-core";
import crypto5 from "crypto";
var admins4 = pgTable4("admins", {
  id: varchar4("id").primaryKey().default(sql4`gen_random_uuid()`),
  email: varchar4("email").unique().notNull(),
  passwordHash: varchar4("password_hash").notNull(),
  name: varchar4("name", { length: 100 }).notNull(),
  role: varchar4("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean4("is_active").default(true),
  lastLoginAt: timestamp4("last_login_at"),
  createdAt: timestamp4("created_at").defaultNow(),
  updatedAt: timestamp4("updated_at").defaultNow()
});
var users4 = pgTable4("users", {
  id: varchar4("id").primaryKey().default(sql4`gen_random_uuid()`),
  email: varchar4("email").unique(),
  firstName: varchar4("first_name"),
  lastName: varchar4("last_name"),
  companyName: varchar4("company_name"),
  balance: decimal3("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp4("created_at").defaultNow()
});
var adminLogs3 = pgTable4("admin_logs", {
  id: varchar4("id").primaryKey().default(sql4`gen_random_uuid()`),
  adminId: varchar4("admin_id").notNull(),
  action: varchar4("action", { length: 50 }).notNull(),
  targetType: varchar4("target_type", { length: 50 }),
  targetId: varchar4("target_id"),
  details: jsonb3("details"),
  ipAddress: varchar4("ip_address", { length: 45 }),
  createdAt: timestamp4("created_at").defaultNow()
});
function getDb4() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle4(neon4(databaseUrl));
}
function verifyToken4(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto5.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken4(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken4(token);
  if (!verified) return null;
  try {
    const db = getDb4();
    const admin = await db.select().from(admins4).where(eq4(admins4.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
function getClientIp3(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
}
function generateImpersonateToken(userId, adminId) {
  const payload = {
    userId,
    adminId,
    type: "impersonate",
    exp: Date.now() + 30 * 60 * 1e3
  };
  const data = JSON.stringify(payload);
  const signature = crypto5.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}
async function handler4(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken4(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (admin.role !== "super" && admin.role !== "cs") {
    return res.status(403).json({ error: "\uB300\uB9AC \uB85C\uADF8\uC778 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
  }
  const { userId } = req.query;
  try {
    const db = getDb4();
    const [user] = await db.select().from(users4).where(eq4(users4.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    const impersonateToken = generateImpersonateToken(user.id, admin.id);
    await db.insert(adminLogs3).values({
      adminId: admin.id,
      action: "impersonate",
      targetType: "user",
      targetId: userId,
      details: {
        userEmail: user.email,
        adminName: admin.name
      },
      ipAddress: getClientIp3(req)
    });
    return res.status(200).json({
      success: true,
      impersonateToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.companyName,
        balance: user.balance
      }
    });
  } catch (error) {
    console.error("[Admin Impersonate] Error:", error);
    return res.status(500).json({ error: "\uB300\uB9AC \uB85C\uADF8\uC778 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/users/[userId]/master.ts
var master_exports = {};
__export(master_exports, {
  default: () => handler5
});
import { neon as neon5 } from "@neondatabase/serverless";
import { drizzle as drizzle5 } from "drizzle-orm/neon-http";
import { eq as eq5, sql as sql5 } from "drizzle-orm";
import { pgTable as pgTable5, varchar as varchar5, timestamp as timestamp5, boolean as boolean5, jsonb as jsonb4 } from "drizzle-orm/pg-core";
import crypto6 from "crypto";
var admins5 = pgTable5("admins", {
  id: varchar5("id").primaryKey().default(sql5`gen_random_uuid()`),
  email: varchar5("email").unique().notNull(),
  passwordHash: varchar5("password_hash").notNull(),
  name: varchar5("name", { length: 100 }).notNull(),
  role: varchar5("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean5("is_active").default(true),
  lastLoginAt: timestamp5("last_login_at"),
  createdAt: timestamp5("created_at").defaultNow(),
  updatedAt: timestamp5("updated_at").defaultNow()
});
var users5 = pgTable5("users", {
  id: varchar5("id").primaryKey().default(sql5`gen_random_uuid()`),
  email: varchar5("email").unique(),
  isMaster: boolean5("is_master").default(false),
  updatedAt: timestamp5("updated_at").defaultNow()
});
var adminLogs4 = pgTable5("admin_logs", {
  id: varchar5("id").primaryKey().default(sql5`gen_random_uuid()`),
  adminId: varchar5("admin_id").notNull(),
  action: varchar5("action", { length: 50 }).notNull(),
  targetType: varchar5("target_type", { length: 50 }),
  targetId: varchar5("target_id"),
  details: jsonb4("details"),
  ipAddress: varchar5("ip_address", { length: 45 }),
  createdAt: timestamp5("created_at").defaultNow()
});
function getDb5() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon5(databaseUrl);
  return drizzle5(sqlClient);
}
function verifyToken5(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto6.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken5(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken5(token);
  if (!verified) return null;
  try {
    const db = getDb5();
    const admin = await db.select().from(admins5).where(eq5(admins5.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
function getClientIp4(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
}
async function handler5(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken5(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (admin.role !== "super") {
    return res.status(403).json({ error: "\uC288\uD37C \uC5B4\uB4DC\uBBFC\uB9CC \uB9C8\uC2A4\uD130 \uAD8C\uD55C\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4" });
  }
  const { userId } = req.query;
  const { isMaster } = req.body;
  if (!userId || typeof isMaster !== "boolean") {
    return res.status(400).json({ error: "\uD544\uC218 \uAC12\uC774 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4" });
  }
  try {
    const db = getDb5();
    const [user] = await db.select().from(users5).where(eq5(users5.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    await db.update(users5).set({ isMaster, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users5.id, userId));
    await db.insert(adminLogs4).values({
      adminId: admin.id,
      action: "master_toggle",
      targetType: "user",
      targetId: userId,
      details: {
        previousValue: user.isMaster,
        newValue: isMaster,
        userEmail: user.email
      },
      ipAddress: getClientIp4(req)
    });
    return res.status(200).json({ success: true, isMaster });
  } catch (error) {
    console.error("[Admin Master Toggle] Error:", error);
    return res.status(500).json({ error: "\uB9C8\uC2A4\uD130 \uC0C1\uD0DC \uBCC0\uACBD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/users/[userId]/reset-password.ts
var reset_password_exports = {};
__export(reset_password_exports, {
  default: () => handler6
});
import { neon as neon6 } from "@neondatabase/serverless";
import { drizzle as drizzle6 } from "drizzle-orm/neon-http";
import { eq as eq6, sql as sql6 } from "drizzle-orm";
import { pgTable as pgTable6, varchar as varchar6, timestamp as timestamp6, boolean as boolean6, jsonb as jsonb5 } from "drizzle-orm/pg-core";
import { createClient } from "@supabase/supabase-js";
import crypto7 from "crypto";
var admins6 = pgTable6("admins", {
  id: varchar6("id").primaryKey().default(sql6`gen_random_uuid()`),
  email: varchar6("email").unique().notNull(),
  passwordHash: varchar6("password_hash").notNull(),
  name: varchar6("name", { length: 100 }).notNull(),
  role: varchar6("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean6("is_active").default(true),
  lastLoginAt: timestamp6("last_login_at"),
  createdAt: timestamp6("created_at").defaultNow(),
  updatedAt: timestamp6("updated_at").defaultNow()
});
var users6 = pgTable6("users", {
  id: varchar6("id").primaryKey().default(sql6`gen_random_uuid()`),
  email: varchar6("email").unique(),
  updatedAt: timestamp6("updated_at").defaultNow()
});
var adminLogs5 = pgTable6("admin_logs", {
  id: varchar6("id").primaryKey().default(sql6`gen_random_uuid()`),
  adminId: varchar6("admin_id").notNull(),
  action: varchar6("action", { length: 50 }).notNull(),
  targetType: varchar6("target_type", { length: 50 }),
  targetId: varchar6("target_id"),
  details: jsonb5("details"),
  ipAddress: varchar6("ip_address", { length: 45 }),
  createdAt: timestamp6("created_at").defaultNow()
});
function getDb6() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon6(databaseUrl);
  return drizzle6(sqlClient);
}
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
function verifyToken6(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto7.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken6(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken6(token);
  if (!verified) return null;
  try {
    const db = getDb6();
    const admin = await db.select().from(admins6).where(eq6(admins6.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
function getClientIp5(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
}
async function handler6(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken6(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (admin.role !== "super" && admin.role !== "cs") {
    return res.status(403).json({ error: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
  }
  const { userId } = req.query;
  const { newPassword } = req.body;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "\uC0AC\uC6A9\uC790 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" });
  }
  if (!newPassword || typeof newPassword !== "string") {
    return res.status(400).json({ error: "\uC0C8 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "\uBE44\uBC00\uBC88\uD638\uB294 \uCD5C\uC18C 8\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" });
  }
  try {
    const db = getDb6();
    const [user] = await db.select().from(users6).where(eq6(users6.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    const supabaseAdmin = getSupabaseAdmin();
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    if (updateError) {
      console.error("[Admin Reset Password] Supabase error:", updateError);
      return res.status(500).json({ error: "\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: " + updateError.message });
    }
    await db.insert(adminLogs5).values({
      adminId: admin.id,
      action: "password_reset",
      targetType: "user",
      targetId: userId,
      details: {
        userEmail: user.email,
        resetBy: admin.email
      },
      ipAddress: getClientIp5(req)
    });
    return res.status(200).json({
      success: true,
      message: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC131\uACF5\uC801\uC73C\uB85C \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
      userEmail: user.email
    });
  } catch (error) {
    console.error("[Admin Reset Password] Error:", error);
    return res.status(500).json({ error: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/announcements/[id].ts
var id_exports = {};
__export(id_exports, {
  default: () => handler7
});
import { neon as neon7 } from "@neondatabase/serverless";
import { drizzle as drizzle7 } from "drizzle-orm/neon-http";
import { sql as sql7, eq as eq7 } from "drizzle-orm";
import { pgTable as pgTable7, varchar as varchar7, timestamp as timestamp7, boolean as boolean7, integer, text as text3, jsonb as jsonb6 } from "drizzle-orm/pg-core";
import crypto8 from "crypto";
var admins7 = pgTable7("admins", {
  id: varchar7("id").primaryKey().default(sql7`gen_random_uuid()`),
  email: varchar7("email").unique().notNull(),
  passwordHash: varchar7("password_hash").notNull(),
  name: varchar7("name", { length: 100 }).notNull(),
  role: varchar7("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean7("is_active").default(true),
  lastLoginAt: timestamp7("last_login_at"),
  createdAt: timestamp7("created_at").defaultNow(),
  updatedAt: timestamp7("updated_at").defaultNow()
});
var announcements = pgTable7("announcements", {
  id: varchar7("id").primaryKey().default(sql7`gen_random_uuid()`),
  title: varchar7("title", { length: 200 }).notNull(),
  content: text3("content").notNull(),
  category: varchar7("category", { length: 50 }).default("general").notNull(),
  priority: integer("priority").default(0),
  isPublished: boolean7("is_published").default(false),
  isPinned: boolean7("is_pinned").default(false),
  authorId: varchar7("author_id").notNull(),
  publishedAt: timestamp7("published_at"),
  expiresAt: timestamp7("expires_at"),
  createdAt: timestamp7("created_at").defaultNow(),
  updatedAt: timestamp7("updated_at").defaultNow()
});
var adminLogs6 = pgTable7("admin_logs", {
  id: varchar7("id").primaryKey().default(sql7`gen_random_uuid()`),
  adminId: varchar7("admin_id").notNull(),
  action: varchar7("action", { length: 50 }).notNull(),
  targetType: varchar7("target_type", { length: 50 }),
  targetId: varchar7("target_id"),
  details: jsonb6("details"),
  ipAddress: varchar7("ip_address", { length: 45 }),
  createdAt: timestamp7("created_at").defaultNow()
});
function getDb7() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle7(neon7(databaseUrl));
}
function verifyToken7(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto8.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken7(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken7(token);
  if (!verified) return null;
  try {
    const db = getDb7();
    const admin = await db.select().from(admins7).where(eq7(admins7.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
function getClientIp6(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
}
async function handler7(req, res) {
  const admin = await verifyAdminToken7(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id } = req.query;
  const db = getDb7();
  if (req.method === "GET") {
    try {
      const [announcement] = await db.select().from(announcements).where(eq7(announcements.id, id)).limit(1);
      if (!announcement) {
        return res.status(404).json({ error: "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
      }
      return res.status(200).json(announcement);
    } catch (error) {
      console.error("[Admin Announcement GET] Error:", error);
      return res.status(500).json({ error: "Failed to fetch announcement" });
    }
  }
  if (req.method === "PUT") {
    try {
      const { title, content, category, priority, isPublished, isPinned, expiresAt } = req.body;
      const [existing] = await db.select().from(announcements).where(eq7(announcements.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
      }
      const wasPublished = existing.isPublished;
      const [updated] = await db.update(announcements).set({
        title: title || existing.title,
        content: content || existing.content,
        category: category || existing.category,
        priority: priority !== void 0 ? priority : existing.priority,
        isPublished: isPublished !== void 0 ? isPublished : existing.isPublished,
        isPinned: isPinned !== void 0 ? isPinned : existing.isPinned,
        publishedAt: !wasPublished && isPublished ? /* @__PURE__ */ new Date() : existing.publishedAt,
        expiresAt: expiresAt ? new Date(expiresAt) : existing.expiresAt,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq7(announcements.id, id)).returning();
      await db.insert(adminLogs6).values({
        adminId: admin.id,
        action: "announcement_update",
        targetType: "announcement",
        targetId: id,
        details: { title: updated.title },
        ipAddress: getClientIp6(req)
      });
      return res.status(200).json({ success: true, announcement: updated });
    } catch (error) {
      console.error("[Admin Announcement PUT] Error:", error);
      return res.status(500).json({ error: "Failed to update announcement" });
    }
  }
  if (req.method === "DELETE") {
    try {
      const [existing] = await db.select().from(announcements).where(eq7(announcements.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
      }
      await db.delete(announcements).where(eq7(announcements.id, id));
      await db.insert(adminLogs6).values({
        adminId: admin.id,
        action: "announcement_delete",
        targetType: "announcement",
        targetId: id,
        details: { title: existing.title },
        ipAddress: getClientIp6(req)
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[Admin Announcement DELETE] Error:", error);
      return res.status(500).json({ error: "Failed to delete announcement" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/admin/reports/analytics.ts
var analytics_exports = {};
__export(analytics_exports, {
  default: () => handler8
});
import { neon as neon8 } from "@neondatabase/serverless";
import { drizzle as drizzle8 } from "drizzle-orm/neon-http";
import { sql as sql8, eq as eq8, gte, desc } from "drizzle-orm";
import { pgTable as pgTable8, varchar as varchar8, timestamp as timestamp8, boolean as boolean8, decimal as decimal4, integer as integer2 } from "drizzle-orm/pg-core";
import crypto9 from "crypto";
var admins8 = pgTable8("admins", {
  id: varchar8("id").primaryKey().default(sql8`gen_random_uuid()`),
  email: varchar8("email").unique().notNull(),
  passwordHash: varchar8("password_hash").notNull(),
  name: varchar8("name", { length: 100 }).notNull(),
  role: varchar8("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean8("is_active").default(true),
  lastLoginAt: timestamp8("last_login_at"),
  createdAt: timestamp8("created_at").defaultNow(),
  updatedAt: timestamp8("updated_at").defaultNow()
});
var users7 = pgTable8("users", {
  id: varchar8("id").primaryKey().default(sql8`gen_random_uuid()`),
  email: varchar8("email").unique(),
  balance: decimal4("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp8("created_at").defaultNow()
});
var campaigns = pgTable8("campaigns", {
  id: varchar8("id").primaryKey().default(sql8`gen_random_uuid()`),
  userId: varchar8("user_id").notNull(),
  status: varchar8("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar8("message_type", { length: 10 }).notNull(),
  targetCount: integer2("target_count").default(0).notNull(),
  sentCount: integer2("sent_count").default(0),
  successCount: integer2("success_count").default(0),
  clickCount: integer2("click_count").default(0),
  budget: decimal4("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp8("created_at").defaultNow(),
  completedAt: timestamp8("completed_at")
});
function getDb8() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle8(neon8(databaseUrl));
}
function verifyToken8(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto9.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken8(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken8(token);
  if (!verified) return null;
  try {
    const db = getDb8();
    const admin = await db.select().from(admins8).where(eq8(admins8.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler8(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken8(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb8();
    const { period = "30" } = req.query;
    const days = parseInt(period);
    const startDate = /* @__PURE__ */ new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const [totalUsersResult] = await db.select({ count: sql8`count(*)` }).from(users7);
    const [activeUsersResult] = await db.select({ count: sql8`count(DISTINCT user_id)` }).from(campaigns).where(gte(campaigns.createdAt, startDate));
    const [campaignStatsResult] = await db.select({
      total: sql8`count(*)`,
      completed: sql8`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      running: sql8`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
      pending: sql8`SUM(CASE WHEN status IN ('approval_requested', 'approved') THEN 1 ELSE 0 END)`,
      totalSent: sql8`COALESCE(SUM(sent_count), 0)`,
      totalSuccess: sql8`COALESCE(SUM(success_count), 0)`,
      totalClicks: sql8`COALESCE(SUM(click_count), 0)`,
      totalBudget: sql8`COALESCE(SUM(CAST(budget AS DECIMAL)), 0)`
    }).from(campaigns).where(gte(campaigns.createdAt, startDate));
    const userGrowth = await db.select({
      date: sql8`DATE(created_at)`,
      count: sql8`count(*)`
    }).from(users7).where(gte(users7.createdAt, startDate)).groupBy(sql8`DATE(created_at)`).orderBy(sql8`DATE(created_at)`);
    const campaignsByStatus = await db.select({
      status: campaigns.status,
      count: sql8`count(*)`
    }).from(campaigns).where(gte(campaigns.createdAt, startDate)).groupBy(campaigns.status);
    const campaignsByMessageType = await db.select({
      messageType: campaigns.messageType,
      count: sql8`count(*)`,
      totalSent: sql8`COALESCE(SUM(sent_count), 0)`
    }).from(campaigns).where(gte(campaigns.createdAt, startDate)).groupBy(campaigns.messageType);
    const dailyCampaigns = await db.select({
      date: sql8`DATE(created_at)`,
      count: sql8`count(*)`,
      totalBudget: sql8`COALESCE(SUM(CAST(budget AS DECIMAL)), 0)`
    }).from(campaigns).where(gte(campaigns.createdAt, startDate)).groupBy(sql8`DATE(created_at)`).orderBy(sql8`DATE(created_at)`);
    const topAdvertisers = await db.select({
      userId: campaigns.userId,
      userEmail: users7.email,
      campaignCount: sql8`count(*)`,
      totalBudget: sql8`COALESCE(SUM(CAST(${campaigns.budget} AS DECIMAL)), 0)`,
      totalSent: sql8`COALESCE(SUM(${campaigns.sentCount}), 0)`
    }).from(campaigns).leftJoin(users7, eq8(campaigns.userId, users7.id)).where(gte(campaigns.createdAt, startDate)).groupBy(campaigns.userId, users7.email).orderBy(desc(sql8`COALESCE(SUM(CAST(${campaigns.budget} AS DECIMAL)), 0)`)).limit(10);
    const totalSent = Number(campaignStatsResult?.totalSent || 0);
    const totalSuccess = Number(campaignStatsResult?.totalSuccess || 0);
    const totalClicks = Number(campaignStatsResult?.totalClicks || 0);
    return res.status(200).json({
      period: { days, startDate },
      overview: {
        totalUsers: Number(totalUsersResult?.count || 0),
        activeUsers: Number(activeUsersResult?.count || 0),
        totalCampaigns: Number(campaignStatsResult?.total || 0),
        completedCampaigns: Number(campaignStatsResult?.completed || 0),
        runningCampaigns: Number(campaignStatsResult?.running || 0),
        pendingCampaigns: Number(campaignStatsResult?.pending || 0),
        totalSent,
        totalSuccess,
        totalClicks,
        totalBudget: Number(campaignStatsResult?.totalBudget || 0),
        deliveryRate: totalSent > 0 ? (totalSuccess / totalSent * 100).toFixed(2) : "0",
        clickRate: totalSent > 0 ? (totalClicks / totalSent * 100).toFixed(2) : "0"
      },
      trends: {
        userGrowth,
        dailyCampaigns
      },
      breakdown: {
        byStatus: campaignsByStatus,
        byMessageType: campaignsByMessageType
      },
      topAdvertisers
    });
  } catch (error) {
    console.error("[Admin Analytics] Error:", error);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
}

// src/handlers/admin/reports/settlements.ts
var settlements_exports = {};
__export(settlements_exports, {
  default: () => handler9
});
import { neon as neon9 } from "@neondatabase/serverless";
import { drizzle as drizzle9 } from "drizzle-orm/neon-http";
import { sql as sql9, eq as eq9, gte as gte2, lte as lte2, and as and2, desc as desc2 } from "drizzle-orm";
import { pgTable as pgTable9, varchar as varchar9, timestamp as timestamp9, boolean as boolean9, decimal as decimal5, integer as integer3, text as text4 } from "drizzle-orm/pg-core";
import crypto10 from "crypto";
var admins9 = pgTable9("admins", {
  id: varchar9("id").primaryKey().default(sql9`gen_random_uuid()`),
  email: varchar9("email").unique().notNull(),
  passwordHash: varchar9("password_hash").notNull(),
  name: varchar9("name", { length: 100 }).notNull(),
  role: varchar9("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean9("is_active").default(true),
  lastLoginAt: timestamp9("last_login_at"),
  createdAt: timestamp9("created_at").defaultNow(),
  updatedAt: timestamp9("updated_at").defaultNow()
});
var transactions3 = pgTable9("transactions", {
  id: varchar9("id").primaryKey().default(sql9`gen_random_uuid()`),
  userId: varchar9("user_id").notNull(),
  type: varchar9("type", { length: 20 }).notNull(),
  amount: decimal5("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal5("balance_after", { precision: 12, scale: 0 }),
  description: text4("description"),
  paymentMethod: varchar9("payment_method", { length: 50 }),
  createdAt: timestamp9("created_at").defaultNow()
});
var campaigns2 = pgTable9("campaigns", {
  id: varchar9("id").primaryKey().default(sql9`gen_random_uuid()`),
  status: varchar9("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar9("message_type", { length: 10 }).notNull(),
  sentCount: integer3("sent_count").default(0),
  budget: decimal5("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp9("created_at").defaultNow(),
  completedAt: timestamp9("completed_at")
});
function getDb9() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle9(neon9(databaseUrl));
}
function verifyToken9(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto10.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken9(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken9(token);
  if (!verified) return null;
  try {
    const db = getDb9();
    const admin = await db.select().from(admins9).where(eq9(admins9.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler9(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken9(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (admin.role !== "super" && admin.role !== "finance") {
    return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
  }
  try {
    const db = getDb9();
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date((/* @__PURE__ */ new Date()).setMonth((/* @__PURE__ */ new Date()).getMonth() - 1));
    const end = endDate ? new Date(endDate) : /* @__PURE__ */ new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const [chargeResult] = await db.select({ sum: sql9`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(transactions3).where(and2(eq9(transactions3.type, "charge"), gte2(transactions3.createdAt, start), lte2(transactions3.createdAt, end)));
    const [usageResult] = await db.select({ sum: sql9`COALESCE(ABS(SUM(CAST(amount AS DECIMAL))), 0)` }).from(transactions3).where(and2(eq9(transactions3.type, "usage"), gte2(transactions3.createdAt, start), lte2(transactions3.createdAt, end)));
    const [refundResult] = await db.select({ sum: sql9`COALESCE(ABS(SUM(CAST(amount AS DECIMAL))), 0)` }).from(transactions3).where(and2(eq9(transactions3.type, "refund"), gte2(transactions3.createdAt, start), lte2(transactions3.createdAt, end)));
    const [completedCampaignsResult] = await db.select({
      count: sql9`count(*)`,
      totalSent: sql9`COALESCE(SUM(sent_count), 0)`,
      totalBudget: sql9`COALESCE(SUM(CAST(budget AS DECIMAL)), 0)`
    }).from(campaigns2).where(and2(eq9(campaigns2.status, "completed"), gte2(campaigns2.completedAt, start), lte2(campaigns2.completedAt, end)));
    const dailyStats = await db.select({
      date: sql9`DATE(created_at)`,
      chargeAmount: sql9`COALESCE(SUM(CASE WHEN type = 'charge' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
      usageAmount: sql9`COALESCE(ABS(SUM(CASE WHEN type = 'usage' THEN CAST(amount AS DECIMAL) ELSE 0 END)), 0)`,
      refundAmount: sql9`COALESCE(ABS(SUM(CASE WHEN type = 'refund' THEN CAST(amount AS DECIMAL) ELSE 0 END)), 0)`,
      transactionCount: sql9`count(*)`
    }).from(transactions3).where(and2(gte2(transactions3.createdAt, start), lte2(transactions3.createdAt, end))).groupBy(sql9`DATE(created_at)`).orderBy(desc2(sql9`DATE(created_at)`));
    const messageTypeStats = await db.select({
      messageType: campaigns2.messageType,
      count: sql9`count(*)`,
      totalSent: sql9`COALESCE(SUM(sent_count), 0)`
    }).from(campaigns2).where(and2(eq9(campaigns2.status, "completed"), gte2(campaigns2.completedAt, start), lte2(campaigns2.completedAt, end))).groupBy(campaigns2.messageType);
    return res.status(200).json({
      period: { start, end },
      summary: {
        totalCharge: Number(chargeResult?.sum || 0),
        totalUsage: Number(usageResult?.sum || 0),
        totalRefund: Number(refundResult?.sum || 0),
        netRevenue: Number(chargeResult?.sum || 0) - Number(refundResult?.sum || 0),
        completedCampaigns: Number(completedCampaignsResult?.count || 0),
        totalSentMessages: Number(completedCampaignsResult?.totalSent || 0),
        totalCampaignBudget: Number(completedCampaignsResult?.totalBudget || 0)
      },
      dailyStats,
      messageTypeStats
    });
  } catch (error) {
    console.error("[Admin Settlements] Error:", error);
    return res.status(500).json({ error: "Failed to fetch settlement report" });
  }
}

// src/handlers/ats/meta/[metaType].ts
var metaType_exports = {};
__export(metaType_exports, {
  default: () => handler10
});
var BIZCHAT_DEV_URL = "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL = "https://gw.bizchat1.co.kr";
function getBizChatUrl() {
  return process.env.BIZCHAT_USE_PROD === "true" ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
}
function getBizChatApiKey() {
  return process.env.BIZCHAT_USE_PROD === "true" ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
}
async function fetch11stCategories(cateid) {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const url = `${getBizChatUrl()}/api/v1/ats/meta/11st?tid=${tid}`;
  const body = {};
  if (cateid) {
    body.cateid = cateid;
  }
  console.log("[ATS Meta 11st] Fetching categories:", { cateid, url });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }
  const data = await response.json();
  console.log("[ATS Meta 11st] Response:", JSON.stringify(data).substring(0, 500));
  if (data.code !== "S000001") {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }
  return {
    metaType: data.data?.metaType || "STREET",
    dataType: data.data?.dataType || "cate",
    list: (data.data?.list || []).map((item) => ({
      id: item.id,
      name: item.name,
      cateid: item.cateid ?? item.id
      // cateid 우선, 없으면 id 사용 (하위 호환)
    }))
  };
}
async function fetchCallCategories(cateid) {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const url = `${getBizChatUrl()}/api/v1/ats/meta/call?tid=${tid}`;
  const body = {};
  if (cateid) {
    body.cateid = cateid;
  }
  console.log("[ATS Meta call] Fetching categories:", { cateid, url });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }
  const data = await response.json();
  console.log("[ATS Meta call] Response:", JSON.stringify(data).substring(0, 500));
  if (data.code !== "S000001") {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }
  return {
    metaType: data.data?.metaType || "CALL",
    dataType: data.data?.dataType || "cate",
    list: (data.data?.list || []).map((item) => ({
      id: item.id,
      name: item.name,
      cateid: item.cateid ?? item.id
      // cateid 우선, 없으면 id 사용 (하위 호환)
    }))
  };
}
async function fetchWebappCategories(cateid) {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const url = `${getBizChatUrl()}/api/v1/ats/meta/webapp?tid=${tid}`;
  const body = {};
  if (cateid) {
    body.cateid = cateid;
  }
  console.log("[ATS Meta webapp] Fetching categories:", { cateid, url });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }
  const data = await response.json();
  console.log("[ATS Meta webapp] Response:", JSON.stringify(data).substring(0, 500));
  if (data.code !== "S000001") {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }
  return {
    metaType: data.data?.metaType || "APP",
    dataType: data.data?.dataType || "cate",
    list: (data.data?.list || []).map((item) => ({
      id: item.id,
      name: item.name,
      cateid: item.cateid ?? item.id
      // cateid 우선, 없으면 id 사용 (하위 호환)
    }))
  };
}
async function fetchLocationCodes(addr) {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const url = `${getBizChatUrl()}/api/v1/ats/meta/loc?tid=${tid}`;
  const body = { addr };
  console.log("[ATS Meta loc] Searching location:", { addr, url });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }
  const data = await response.json();
  console.log("[ATS Meta loc] Response:", JSON.stringify(data).substring(0, 500));
  if (data.code !== "S000001") {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }
  return {
    list: data.data?.list || [],
    listR: data.data?.listR || []
  };
}
async function fetchFilterMeta(filterType) {
  const tid = Date.now().toString();
  const apiKey = getBizChatApiKey();
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const url = `${getBizChatUrl()}/api/v1/ats/meta/filter?tid=${tid}&type=${filterType}`;
  const body = { type: filterType };
  console.log("[ATS Meta filter] Fetching filter meta:", { filterType, url });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status}`);
  }
  const data = await response.json();
  console.log("[ATS Meta filter] Response:", JSON.stringify(data).substring(0, 500));
  if (data.code !== "S000001") {
    throw new Error(`BizChat API error: ${data.code} - ${data.msg}`);
  }
  return {
    metaType: data.data?.metaType || filterType,
    list: data.data?.list || []
  };
}
async function handler10(req, res) {
  const { metaType, cateid, addr, filterType } = req.query;
  if (typeof metaType !== "string") {
    return res.status(400).json({ error: "Invalid meta type" });
  }
  try {
    switch (metaType) {
      case "11st": {
        const cateIdStr = typeof cateid === "string" ? cateid : void 0;
        const result = await fetch11stCategories(cateIdStr);
        return res.status(200).json(result);
      }
      case "webapp": {
        const cateIdStr = typeof cateid === "string" ? cateid : void 0;
        const result = await fetchWebappCategories(cateIdStr);
        return res.status(200).json(result);
      }
      case "call": {
        const cateIdStr = typeof cateid === "string" ? cateid : void 0;
        const result = await fetchCallCategories(cateIdStr);
        return res.status(200).json(result);
      }
      case "loc": {
        if (req.method === "POST") {
          const addrStr = req.body?.addr || "";
          if (!addrStr) {
            return res.status(400).json({ error: "addr is required" });
          }
          const result = await fetchLocationCodes(addrStr);
          return res.status(200).json(result);
        } else {
          return res.status(200).json({
            list: [
              { hcode: "11", name: "\uC11C\uC6B8" },
              { hcode: "26", name: "\uBD80\uC0B0" },
              { hcode: "27", name: "\uB300\uAD6C" },
              { hcode: "28", name: "\uC778\uCC9C" },
              { hcode: "29", name: "\uAD11\uC8FC" },
              { hcode: "30", name: "\uB300\uC804" },
              { hcode: "31", name: "\uC6B8\uC0B0" },
              { hcode: "36", name: "\uC138\uC885" },
              { hcode: "41", name: "\uACBD\uAE30" },
              { hcode: "42", name: "\uAC15\uC6D0" },
              { hcode: "43", name: "\uCDA9\uBD81" },
              { hcode: "44", name: "\uCDA9\uB0A8" },
              { hcode: "45", name: "\uC804\uBD81" },
              { hcode: "46", name: "\uC804\uB0A8" },
              { hcode: "47", name: "\uACBD\uBD81" },
              { hcode: "48", name: "\uACBD\uB0A8" },
              { hcode: "50", name: "\uC81C\uC8FC" }
            ]
          });
        }
      }
      case "filter": {
        const fType = typeof filterType === "string" ? filterType : "svc";
        const validTypes = ["svc", "loc", "pro"];
        if (!validTypes.includes(fType)) {
          return res.status(400).json({ error: "Invalid filter type. Use svc, loc, or pro" });
        }
        const result = await fetchFilterMeta(fType);
        return res.status(200).json(result);
      }
      default:
        return res.status(400).json({ error: `Unknown meta type: ${metaType}` });
    }
  } catch (error) {
    console.error(`[ATS Meta ${metaType}] Error:`, error);
    return res.status(500).json({ error: error.message || "Failed to fetch meta data" });
  }
}

// src/handlers/bizchat/callback/state.ts
var state_exports = {};
__export(state_exports, {
  default: () => handler11
});
import { neon as neon10, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzle10 } from "drizzle-orm/neon-http";
import { eq as eq10 } from "drizzle-orm";
import { pgTable as pgTable10, text as text5, integer as integer4, timestamp as timestamp10, decimal as decimal6, serial, varchar as varchar10 } from "drizzle-orm/pg-core";
neonConfig.fetchConnectionCache = true;
var campaigns3 = pgTable10("campaigns", {
  id: text5("id").primaryKey(),
  userId: text5("user_id").notNull(),
  name: text5("name").notNull(),
  messageType: varchar10("message_type", { length: 10 }),
  bizchatCampaignId: text5("bizchat_campaign_id"),
  statusCode: integer4("status_code").default(0),
  status: text5("status").default("temp_registered"),
  stateReason: text5("state_reason"),
  sentCount: integer4("sent_count").default(0),
  successCount: integer4("success_count").default(0),
  costPerMessage: decimal6("cost_per_message", { precision: 10, scale: 0 }).default("100"),
  updatedAt: timestamp10("updated_at").defaultNow()
});
var users8 = pgTable10("users", {
  id: varchar10("id").primaryKey(),
  balance: decimal6("balance", { precision: 12, scale: 0 }).default("0"),
  updatedAt: timestamp10("updated_at").defaultNow()
});
var transactions4 = pgTable10("transactions", {
  id: serial("id").primaryKey(),
  userId: text5("user_id").notNull(),
  type: text5("type").notNull(),
  amount: decimal6("amount", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal6("balance_after", { precision: 12, scale: 2 }).notNull(),
  description: text5("description"),
  referenceId: text5("reference_id"),
  createdAt: timestamp10("created_at").defaultNow()
});
var MESSAGE_PRICES = { LMS: 100, MMS: 120, RCS: 100 };
function getDb10() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle10(neon10(dbUrl));
}
var STATUS_CODE_MAP = {
  0: { status: "temp_registered", label: "\uC784\uC2DC \uB4F1\uB85D" },
  1: { status: "inspection_requested", label: "\uAC80\uC218 \uC694\uCCAD" },
  2: { status: "inspection_completed", label: "\uAC80\uC218 \uC644\uB8CC" },
  10: { status: "approval_requested", label: "\uC2B9\uC778 \uC694\uCCAD" },
  11: { status: "approved", label: "\uC2B9\uC778 \uC644\uB8CC" },
  17: { status: "rejected", label: "\uBC18\uB824" },
  20: { status: "send_ready", label: "\uBC1C\uC1A1 \uC900\uBE44" },
  25: { status: "cancelled", label: "\uCDE8\uC18C" },
  30: { status: "running", label: "\uC9C4\uD589\uC911" },
  35: { status: "stopped", label: "\uC911\uB2E8" },
  40: { status: "completed", label: "\uC885\uB8CC" }
};
function verifyCallbackAuth(req) {
  const authKey = process.env.BIZCHAT_CALLBACK_AUTH_KEY;
  if (!authKey) {
    console.warn("[Callback] BIZCHAT_CALLBACK_AUTH_KEY not configured - skipping auth");
    return true;
  }
  const providedKey = req.headers["bizchat-callback-auth-key"] || req.headers["x-auth-key"] || req.headers["authorization"];
  if (providedKey === authKey) {
    return true;
  }
  console.warn("[Callback] Auth key mismatch");
  return false;
}
async function handler11(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, bizchat-callback-auth-key, X-Auth-Key");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyCallbackAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = req.body;
    console.log("[Callback] Received state change:", JSON.stringify(payload));
    if (!payload.id || payload.state === void 0) {
      return res.status(400).json({
        error: "Invalid payload",
        required: ["id", "state"],
        received: payload
      });
    }
    const db = getDb10();
    const campaignResult = await db.select().from(campaigns3).where(eq10(campaigns3.bizchatCampaignId, payload.id));
    if (campaignResult.length === 0) {
      console.warn(`[Callback] Campaign not found for bizchat ID: ${payload.id}`);
      return res.status(200).json({
        success: false,
        message: "Campaign not found in local database",
        bizchatCampaignId: payload.id
      });
    }
    const campaign = campaignResult[0];
    const statusInfo = STATUS_CODE_MAP[payload.state] || {
      status: "unknown",
      label: `\uC0C1\uD0DC\uCF54\uB4DC: ${payload.state}`
    };
    const updateData = {
      statusCode: payload.state,
      status: statusInfo.status,
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (payload.stateReason) {
      updateData.stateReason = payload.stateReason;
    }
    await db.update(campaigns3).set(updateData).where(eq10(campaigns3.id, campaign.id));
    console.log(`[Callback] Updated campaign ${campaign.id}: ${statusInfo.status} (state=${payload.state})`);
    if (payload.state === 40 || payload.state === 35) {
      try {
        const existingSpend = await db.select().from(transactions4).where(eq10(transactions4.referenceId, campaign.id));
        const alreadyCharged = existingSpend.some((t) => t.type === "spend");
        if (alreadyCharged) {
          console.log(`[Callback] Skipping duplicate charge for campaign ${campaign.id} (already charged)`);
        } else {
          const userResult = await db.select().from(users8).where(eq10(users8.id, campaign.userId));
          if (userResult.length > 0) {
            const user = userResult[0];
            const currentBalance = parseFloat(user.balance || "0");
            const sentCount = campaign.successCount || campaign.sentCount || 0;
            const messageType = campaign.messageType || "LMS";
            const costPerMessage = MESSAGE_PRICES[messageType] || MESSAGE_PRICES.LMS;
            const totalCost = sentCount * costPerMessage;
            if (totalCost > 0 && currentBalance > 0) {
              const actualDeduction = Math.min(totalCost, currentBalance);
              const newBalance = currentBalance - actualDeduction;
              await db.insert(transactions4).values({
                userId: campaign.userId,
                type: "spend",
                amount: (-actualDeduction).toString(),
                balanceAfter: newBalance.toString(),
                description: `\uCEA0\uD398\uC778 \uBC1C\uC1A1 \uBE44\uC6A9 (${campaign.name})`,
                referenceId: campaign.id
              });
              await db.update(users8).set({
                balance: newBalance.toString(),
                updatedAt: /* @__PURE__ */ new Date()
              }).where(eq10(users8.id, campaign.userId));
              console.log(`[Callback] Deducted ${actualDeduction} KRW from user ${campaign.userId} for campaign ${campaign.id} (${sentCount} messages \xD7 ${costPerMessage} KRW)`);
              if (actualDeduction < totalCost) {
                console.warn(`[Callback] Insufficient balance: charged ${actualDeduction} of ${totalCost} KRW`);
              }
            } else if (totalCost === 0) {
              console.log(`[Callback] No charge needed for campaign ${campaign.id} (0 messages sent)`);
            }
          }
        }
      } catch (deductError) {
        console.error("[Callback] Error deducting balance:", deductError);
      }
    }
    return res.status(200).json({
      success: true,
      campaignId: campaign.id,
      bizchatCampaignId: payload.id,
      state: payload.state,
      status: statusInfo.status,
      label: statusInfo.label
    });
  } catch (error) {
    console.error("[Callback] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/bizchat/reports/area.ts
var area_exports = {};
__export(area_exports, {
  default: () => handler12
});
import { createClient as createClient2 } from "@supabase/supabase-js";
import { neon as neon11, neonConfig as neonConfig2 } from "@neondatabase/serverless";
import { createHmac } from "crypto";
import { drizzle as drizzle11 } from "drizzle-orm/neon-http";
import { eq as eq11 } from "drizzle-orm";
import { pgTable as pgTable11, text as text6, integer as integer5 } from "drizzle-orm/pg-core";
neonConfig2.fetchConnectionCache = true;
var campaigns4 = pgTable11("campaigns", {
  id: text6("id").primaryKey(),
  userId: text6("user_id").notNull(),
  bizchatCampaignId: text6("bizchat_campaign_id"),
  rcvType: integer5("rcv_type").default(0),
  statusCode: integer5("status_code").default(0)
});
function getDb11() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle11(neon11(dbUrl));
}
function getSupabaseAdmin2() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient2(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin2().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler12(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ error: "campaignId is required" });
  }
  const db = getDb11();
  try {
    const campaignResult = await db.select().from(campaigns4).where(eq11(campaigns4.id, campaignId));
    const campaign = campaignResult[0];
    if (!campaign) {
      return res.status(404).json({ error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (!campaign.bizchatCampaignId) {
      return res.status(400).json({ error: "BizChat\uC5D0 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uCEA0\uD398\uC778\uC785\uB2C8\uB2E4" });
    }
    if (campaign.rcvType !== 0) {
      return res.status(400).json({ error: "ATS \uD0C0\uAC9F\uD305 \uCEA0\uD398\uC778\uB9CC \uC9C0\uC5ED\uBCC4 \uBD84\uC11D\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4" });
    }
    const BIZCHAT_DEV_URL18 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
    const BIZCHAT_PROD_URL18 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
    const useProduction = process.env.BIZCHAT_USE_PROD === "true";
    const baseUrl = useProduction ? BIZCHAT_PROD_URL18 : BIZCHAT_DEV_URL18;
    const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "BizChat API key not configured" });
    }
    const tid = Date.now().toString();
    const url = `${baseUrl}/api/v1/ats/rpt/area?tid=${tid}`;
    console.log(`[AreaReport] POST ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify({ id: campaign.bizchatCampaignId })
    });
    const responseText = await response.text();
    console.log(`[AreaReport] Response: ${response.status} - ${responseText.substring(0, 500)}`);
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "BizChat \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328", raw: responseText });
    }
    if (data.code !== "S000001") {
      return res.status(400).json({
        error: `BizChat API \uC624\uB958: ${data.msg}`,
        code: data.code
      });
    }
    const sortedList = [...data.data?.list || []].sort((a, b) => b.totSuccessCnt - a.totSuccessCnt);
    return res.status(200).json({
      success: true,
      data: {
        list: sortedList
      }
    });
  } catch (error) {
    console.error("[AreaReport] Error:", error);
    return res.status(500).json({
      error: "\uC9C0\uC5ED\uBCC4 \uBD84\uC11D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/bizchat/reports/gender-age.ts
var gender_age_exports = {};
__export(gender_age_exports, {
  default: () => handler13
});
import { createClient as createClient3 } from "@supabase/supabase-js";
import { neon as neon12, neonConfig as neonConfig3 } from "@neondatabase/serverless";
import { createHmac as createHmac2 } from "crypto";
import { drizzle as drizzle12 } from "drizzle-orm/neon-http";
import { eq as eq12 } from "drizzle-orm";
import { pgTable as pgTable12, text as text7, integer as integer6 } from "drizzle-orm/pg-core";
neonConfig3.fetchConnectionCache = true;
var campaigns5 = pgTable12("campaigns", {
  id: text7("id").primaryKey(),
  userId: text7("user_id").notNull(),
  bizchatCampaignId: text7("bizchat_campaign_id"),
  rcvType: integer6("rcv_type").default(0),
  statusCode: integer6("status_code").default(0)
});
function getDb12() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle12(neon12(dbUrl));
}
function getSupabaseAdmin3() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient3(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken2(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac2("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth2(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken2(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin3().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler13(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth2(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ error: "campaignId is required" });
  }
  const db = getDb12();
  try {
    const campaignResult = await db.select().from(campaigns5).where(eq12(campaigns5.id, campaignId));
    const campaign = campaignResult[0];
    if (!campaign) {
      return res.status(404).json({ error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (!campaign.bizchatCampaignId) {
      return res.status(400).json({ error: "BizChat\uC5D0 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uCEA0\uD398\uC778\uC785\uB2C8\uB2E4" });
    }
    if (campaign.rcvType !== 0) {
      return res.status(400).json({ error: "ATS \uD0C0\uAC9F\uD305 \uCEA0\uD398\uC778\uB9CC \uC131\uBCC4/\uC5F0\uB839\uB300\uBCC4 \uBD84\uC11D\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4" });
    }
    const BIZCHAT_DEV_URL18 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
    const BIZCHAT_PROD_URL18 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
    const useProduction = process.env.BIZCHAT_USE_PROD === "true";
    const baseUrl = useProduction ? BIZCHAT_PROD_URL18 : BIZCHAT_DEV_URL18;
    const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "BizChat API key not configured" });
    }
    const tid = Date.now().toString();
    const url = `${baseUrl}/api/v1/ats/rpt/gender/age?tid=${tid}`;
    console.log(`[GenderAgeReport] POST ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify({ id: campaign.bizchatCampaignId })
    });
    const responseText = await response.text();
    console.log(`[GenderAgeReport] Response: ${response.status} - ${responseText.substring(0, 500)}`);
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "BizChat \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328", raw: responseText });
    }
    if (data.code !== "S000001") {
      return res.status(400).json({
        error: `BizChat API \uC624\uB958: ${data.msg}`,
        code: data.code
      });
    }
    const maleData = data.data?.list.filter((item) => item.sexCd === "1") || [];
    const femaleData = data.data?.list.filter((item) => item.sexCd === "2") || [];
    return res.status(200).json({
      success: true,
      data: {
        list: data.data?.list || [],
        male: maleData,
        female: femaleData
      }
    });
  } catch (error) {
    console.error("[GenderAgeReport] Error:", error);
    return res.status(500).json({
      error: "\uC131\uBCC4/\uC5F0\uB839\uB300\uBCC4 \uBD84\uC11D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/bizchat/reports/period.ts
var period_exports = {};
__export(period_exports, {
  default: () => handler14
});
import { createClient as createClient4 } from "@supabase/supabase-js";
import { neon as neon13, neonConfig as neonConfig4 } from "@neondatabase/serverless";
import { createHmac as createHmac3 } from "crypto";
import { drizzle as drizzle13 } from "drizzle-orm/neon-http";
import { eq as eq13 } from "drizzle-orm";
import { pgTable as pgTable13, text as text8, integer as integer7 } from "drizzle-orm/pg-core";
neonConfig4.fetchConnectionCache = true;
var campaigns6 = pgTable13("campaigns", {
  id: text8("id").primaryKey(),
  userId: text8("user_id").notNull(),
  bizchatCampaignId: text8("bizchat_campaign_id"),
  rcvType: integer7("rcv_type").default(0),
  statusCode: integer7("status_code").default(0)
});
function getDb13() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle13(neon13(dbUrl));
}
function getSupabaseAdmin4() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient4(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken3(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac3("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth3(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken3(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin4().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler14(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth3(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ error: "campaignId is required" });
  }
  const db = getDb13();
  try {
    const campaignResult = await db.select().from(campaigns6).where(eq13(campaigns6.id, campaignId));
    const campaign = campaignResult[0];
    if (!campaign) {
      return res.status(404).json({ error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (!campaign.bizchatCampaignId) {
      return res.status(400).json({ error: "BizChat\uC5D0 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uCEA0\uD398\uC778\uC785\uB2C8\uB2E4" });
    }
    if (campaign.rcvType !== 0) {
      return res.status(400).json({ error: "ATS \uD0C0\uAC9F\uD305 \uCEA0\uD398\uC778\uB9CC \uC77C\uC790\uBCC4 \uBD84\uC11D\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4" });
    }
    const BIZCHAT_DEV_URL18 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
    const BIZCHAT_PROD_URL18 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
    const useProduction = process.env.BIZCHAT_USE_PROD === "true";
    const baseUrl = useProduction ? BIZCHAT_PROD_URL18 : BIZCHAT_DEV_URL18;
    const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "BizChat API key not configured" });
    }
    const tid = Date.now().toString();
    const url = `${baseUrl}/api/v1/ats/rpt/period?tid=${tid}`;
    console.log(`[PeriodReport] POST ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify({ id: campaign.bizchatCampaignId })
    });
    const responseText = await response.text();
    console.log(`[PeriodReport] Response: ${response.status} - ${responseText.substring(0, 500)}`);
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "BizChat \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328", raw: responseText });
    }
    if (data.code !== "S000001") {
      return res.status(400).json({
        error: `BizChat API \uC624\uB958: ${data.msg}`,
        code: data.code
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        list: data.data?.list || []
      }
    });
  } catch (error) {
    console.error("[PeriodReport] Error:", error);
    return res.status(500).json({
      error: "\uC77C\uC790\uBCC4 \uBD84\uC11D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/campaigns/[id]/cancel.ts
var cancel_exports = {};
__export(cancel_exports, {
  default: () => handler15
});
import { createClient as createClient5 } from "@supabase/supabase-js";
import { neon as neon14, neonConfig as neonConfig5 } from "@neondatabase/serverless";
import { createHmac as createHmac4 } from "crypto";
import { drizzle as drizzle14 } from "drizzle-orm/neon-http";
import { eq as eq14 } from "drizzle-orm";
import { pgTable as pgTable14, text as text9, integer as integer8, timestamp as timestamp12 } from "drizzle-orm/pg-core";
neonConfig5.fetchConnectionCache = true;
var campaigns7 = pgTable14("campaigns", {
  id: text9("id").primaryKey(),
  userId: text9("user_id").notNull(),
  name: text9("name").notNull(),
  statusCode: integer8("status_code").default(0),
  status: text9("status").default("temp_registered"),
  bizchatCampaignId: text9("bizchat_campaign_id"),
  updatedAt: timestamp12("updated_at").defaultNow()
});
function getDb14() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle14(neon14(dbUrl));
}
function getSupabaseAdmin5() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient5(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken4(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac4("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth4(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken4(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin5().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
var BIZCHAT_DEV_URL2 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL2 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
var CANCELLABLE_STATUS_CODES = [1, 2, 10, 11, 17, 20];
var STATUS_NAMES = {
  0: "\uC784\uC2DC\uB4F1\uB85D",
  1: "\uAC80\uC218\uC694\uCCAD",
  2: "\uAC80\uC218\uC644\uB8CC",
  5: "\uC784\uC2DC\uC800\uC7A5",
  10: "\uC2B9\uC778\uC694\uCCAD",
  11: "\uC2B9\uC778\uC644\uB8CC",
  17: "\uBC18\uB824",
  20: "\uBC1C\uC1A1\uC900\uBE44",
  30: "\uBC1C\uC1A1\uC911",
  40: "\uBC1C\uC1A1\uC644\uB8CC",
  90: "\uCDE8\uC18C"
};
async function callBizChatCancelAPI(bizchatCampaignId, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL2 : BIZCHAT_DEV_URL2;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    console.error("[BizChat Cancel] API key not configured");
    throw new Error("BizChat API key not configured");
  }
  const tid = Date.now().toString();
  const url = `${baseUrl}/api/v1/cmpn/cancel?tid=${encodeURIComponent(tid)}&id=${encodeURIComponent(bizchatCampaignId)}`;
  console.log(`[BizChat Cancel] Request URL: ${url}`);
  console.log(`[BizChat Cancel] Campaign ID: ${bizchatCampaignId}`);
  console.log(`[BizChat Cancel] Transaction ID: ${tid}`);
  console.log(`[BizChat Cancel] Using ${useProduction ? "PRODUCTION" : "DEVELOPMENT"} environment`);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      }
    });
    const responseText = await response.text();
    console.log(`[BizChat Cancel] Response Status: ${response.status}`);
    console.log(`[BizChat Cancel] Response Body: ${responseText}`);
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[BizChat Cancel] Failed to parse response as JSON");
      data = {
        tid,
        code: `HTTP_${response.status}`,
        msg: responseText || "Empty response"
      };
    }
    const result = {
      tid: data.tid || tid,
      code: data.code || `HTTP_${response.status}`,
      msg: data.msg || data.message || "Unknown response",
      httpStatus: response.status,
      raw: data
    };
    console.log(`[BizChat Cancel] Parsed Result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("[BizChat Cancel] Network error:", error);
    throw error;
  }
}
async function handler15(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth4(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid campaign ID" });
  }
  console.log(`[Cancel] User ${auth.userId} requested to cancel campaign ${id}`);
  const db = getDb14();
  try {
    const campaignResult = await db.select().from(campaigns7).where(eq14(campaigns7.id, id));
    const campaign = campaignResult[0];
    if (!campaign) {
      console.log(`[Cancel] Campaign ${id} not found`);
      return res.status(404).json({ error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (campaign.userId !== auth.userId) {
      console.log(`[Cancel] User ${auth.userId} is not the owner of campaign ${id}`);
      return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    const currentStatusCode = campaign.statusCode ?? 0;
    console.log(`[Cancel] Campaign ${id} current status: ${currentStatusCode} (${STATUS_NAMES[currentStatusCode] || "Unknown"})`);
    if (!CANCELLABLE_STATUS_CODES.includes(currentStatusCode)) {
      const statusName = STATUS_NAMES[currentStatusCode] || `\uC0C1\uD0DC\uCF54\uB4DC ${currentStatusCode}`;
      console.log(`[Cancel] Campaign ${id} cannot be cancelled from status ${statusName}`);
      return res.status(400).json({
        error: `\uD604\uC7AC \uC0C1\uD0DC(${statusName})\uC5D0\uC11C\uB294 \uCDE8\uC18C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
        detail: "\uCDE8\uC18C \uAC00\uB2A5 \uC0C1\uD0DC: \uAC80\uC218\uC694\uCCAD(1), \uAC80\uC218\uC644\uB8CC(2), \uC2B9\uC778\uC694\uCCAD(10), \uC2B9\uC778\uC644\uB8CC(11), \uBC18\uB824(17), \uBC1C\uC1A1\uC900\uBE44(20)",
        currentStatusCode,
        cancellableStatusCodes: CANCELLABLE_STATUS_CODES
      });
    }
    if (campaign.bizchatCampaignId) {
      console.log(`[Cancel] Calling BizChat cancel API for bizchatCampaignId: ${campaign.bizchatCampaignId}`);
      const useProduction = process.env.BIZCHAT_USE_PROD === "true";
      try {
        const bizchatResult = await callBizChatCancelAPI(campaign.bizchatCampaignId, useProduction);
        if (bizchatResult.code !== "S000001") {
          console.error(`[Cancel] BizChat API returned error: ${bizchatResult.code} - ${bizchatResult.msg}`);
          return res.status(400).json({
            error: `BizChat \uCDE8\uC18C \uC2E4\uD328: ${bizchatResult.msg}`,
            bizchatError: {
              tid: bizchatResult.tid,
              code: bizchatResult.code,
              msg: bizchatResult.msg
            }
          });
        }
        console.log(`[Cancel] BizChat cancel API succeeded for campaign ${campaign.bizchatCampaignId}`);
      } catch (bizchatError) {
        console.error("[Cancel] BizChat API call failed:", bizchatError);
        return res.status(500).json({
          error: "BizChat \uC11C\uBC84 \uC5F0\uACB0 \uC2E4\uD328",
          detail: bizchatError instanceof Error ? bizchatError.message : "Network error"
        });
      }
    } else {
      console.log(`[Cancel] Campaign ${id} has no bizchatCampaignId, skipping BizChat API call`);
    }
    const updatedResult = await db.update(campaigns7).set({
      statusCode: 90,
      status: "cancelled",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq14(campaigns7.id, id)).returning();
    console.log(`[Cancel] Campaign ${id} cancelled successfully in local DB`);
    return res.status(200).json({
      success: true,
      message: "\uCEA0\uD398\uC778\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
      campaign: updatedResult[0]
    });
  } catch (error) {
    console.error("[Cancel] Unexpected error:", error);
    return res.status(500).json({
      error: "\uCEA0\uD398\uC778 \uCDE8\uC18C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/campaigns/[id]/stop.ts
var stop_exports = {};
__export(stop_exports, {
  default: () => handler16
});
import { createClient as createClient6 } from "@supabase/supabase-js";
import { neon as neon15, neonConfig as neonConfig6 } from "@neondatabase/serverless";
import { createHmac as createHmac5 } from "crypto";
import { drizzle as drizzle15 } from "drizzle-orm/neon-http";
import { eq as eq15 } from "drizzle-orm";
import { pgTable as pgTable15, text as text10, integer as integer9, timestamp as timestamp13 } from "drizzle-orm/pg-core";
neonConfig6.fetchConnectionCache = true;
var campaigns8 = pgTable15("campaigns", {
  id: text10("id").primaryKey(),
  userId: text10("user_id").notNull(),
  name: text10("name").notNull(),
  statusCode: integer9("status_code").default(0),
  status: text10("status").default("temp_registered"),
  bizchatCampaignId: text10("bizchat_campaign_id"),
  updatedAt: timestamp13("updated_at").defaultNow()
});
function getDb15() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle15(neon15(dbUrl));
}
function getSupabaseAdmin6() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient6(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken5(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac5("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth5(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken5(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin6().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
var STOPPABLE_STATUS_CODES = [30];
var STATUS_NAMES2 = {
  0: "\uC784\uC2DC\uB4F1\uB85D",
  1: "\uAC80\uC218\uC694\uCCAD",
  2: "\uAC80\uC218\uC644\uB8CC",
  5: "\uC784\uC2DC\uC800\uC7A5",
  10: "\uC2B9\uC778\uC694\uCCAD",
  11: "\uC2B9\uC778\uC644\uB8CC",
  17: "\uBC18\uB824",
  20: "\uBC1C\uC1A1\uC900\uBE44",
  30: "\uBC1C\uC1A1\uC911",
  40: "\uBC1C\uC1A1\uC644\uB8CC",
  90: "\uCDE8\uC18C",
  91: "\uC911\uB2E8"
};
async function callBizChatStopAPI(bizchatCampaignId, useProduction = false) {
  const BIZCHAT_DEV_URL18 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
  const BIZCHAT_PROD_URL18 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
  const baseUrl = useProduction ? BIZCHAT_PROD_URL18 : BIZCHAT_DEV_URL18;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const tid = Date.now().toString();
  const url = `${baseUrl}/api/v1/cmpn/stop?tid=${tid}&id=${bizchatCampaignId}`;
  console.log(`[BizChat Stop] POST ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  });
  const responseText = await response.text();
  console.log(`[BizChat Stop] Response: ${response.status} - ${responseText}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function handler16(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth5(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid campaign ID" });
  }
  const db = getDb15();
  try {
    const campaignResult = await db.select().from(campaigns8).where(eq15(campaigns8.id, id));
    const campaign = campaignResult[0];
    if (!campaign) {
      return res.status(404).json({ error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: "\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    const currentStatusCode = campaign.statusCode || 0;
    if (!STOPPABLE_STATUS_CODES.includes(currentStatusCode)) {
      const statusName = STATUS_NAMES2[currentStatusCode] || `\uC0C1\uD0DC\uCF54\uB4DC ${currentStatusCode}`;
      return res.status(400).json({
        error: `\uD604\uC7AC \uC0C1\uD0DC(${statusName})\uC5D0\uC11C\uB294 \uC911\uB2E8\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC911\uB2E8\uC740 \uBC1C\uC1A1 \uC911\uC778 \uCEA0\uD398\uC778\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.`
      });
    }
    if (campaign.bizchatCampaignId) {
      const useProduction = process.env.BIZCHAT_USE_PROD === "true";
      console.log(`[Stop] Calling BizChat stop API for campaign: ${campaign.bizchatCampaignId}`);
      const bizchatResult = await callBizChatStopAPI(campaign.bizchatCampaignId, useProduction);
      if (bizchatResult.data.code !== "S000001") {
        console.error("[Stop] BizChat API error:", bizchatResult.data);
        return res.status(400).json({
          error: `BizChat \uC911\uB2E8 \uC2E4\uD328: ${bizchatResult.data.msg || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`,
          bizchatError: bizchatResult.data
        });
      }
    }
    const updatedResult = await db.update(campaigns8).set({
      statusCode: 35,
      status: "stopped",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq15(campaigns8.id, id)).returning();
    console.log(`[Stop] Campaign ${id} stopped successfully`);
    return res.status(200).json({
      success: true,
      message: "\uCEA0\uD398\uC778 \uBC1C\uC1A1\uC774 \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
      campaign: updatedResult[0]
    });
  } catch (error) {
    console.error("[Stop] Error:", error);
    return res.status(500).json({
      error: "\uCEA0\uD398\uC778 \uC911\uB2E8 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/campaigns/[id]/submit.ts
var submit_exports = {};
__export(submit_exports, {
  default: () => handler17
});
import { createClient as createClient7 } from "@supabase/supabase-js";
import { neon as neon16, neonConfig as neonConfig7 } from "@neondatabase/serverless";
import { createHmac as createHmac6 } from "crypto";
import { drizzle as drizzle16 } from "drizzle-orm/neon-http";
import { eq as eq16 } from "drizzle-orm";
import { pgTable as pgTable16, text as text11, integer as integer10, timestamp as timestamp14, jsonb as jsonb7 } from "drizzle-orm/pg-core";
neonConfig7.fetchConnectionCache = true;
var BIZCHAT_DEV_URL3 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL3 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
var CALLBACK_BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://wepickbizchat-new.vercel.app";
var REGION_HCODE_MAP = {
  "\uC11C\uC6B8": "11",
  "\uACBD\uAE30": "41",
  "\uC778\uCC9C": "28",
  "\uBD80\uC0B0": "26",
  "\uB300\uAD6C": "27",
  "\uAD11\uC8FC": "29",
  "\uB300\uC804": "30",
  "\uC6B8\uC0B0": "31",
  "\uC138\uC885": "36",
  "\uAC15\uC6D0": "51",
  "\uCDA9\uBD81": "43",
  "\uCDA9\uB0A8": "44",
  "\uC804\uBD81": "52",
  "\uC804\uB0A8": "46",
  "\uACBD\uBD81": "47",
  "\uACBD\uB0A8": "48",
  "\uC81C\uC8FC": "50"
};
function convertLegacySndMosuQuery(queryStr) {
  const trimmed = queryStr.trim();
  if (trimmed.startsWith("(") || trimmed.startsWith("SELECT") || trimmed.includes("cust_age_cd")) {
    console.log("[Submit] Detected legacy SQL format in sndMosuQuery, returning as-is");
    return { query: trimmed, desc: "\uB808\uAC70\uC2DC SQL \uD615\uC2DD", isLegacySql: true };
  }
  try {
    const parsed = JSON.parse(queryStr);
    if (parsed["$and"] || parsed["$or"]) {
      console.log("[Submit] sndMosuQuery has $and/$or container, validating conditions...");
      const container = parsed["$and"] || parsed["$or"];
      const operator = parsed["$and"] ? "$and" : "$or";
      const validatedConditions = [];
      const descParts2 = [];
      for (const cond of container) {
        const validated = validateAndConvertCondition(cond);
        if (validated) {
          validatedConditions.push(validated);
          if (validated.desc) descParts2.push(validated.desc);
        }
      }
      const newQuery2 = { [operator]: validatedConditions };
      console.log("[Submit] Validated sndMosuQuery:", JSON.stringify(newQuery2));
      return { query: JSON.stringify(newQuery2), desc: descParts2.join(", ") };
    }
    if (parsed.metaType && parsed.dataType) {
      console.log("[Submit] sndMosuQuery is single condition, validating and wrapping in $and");
      const validated = validateAndConvertCondition(parsed);
      if (validated) {
        const wrapped = { "$and": [validated] };
        return { query: JSON.stringify(wrapped), desc: validated.desc || "" };
      }
      return { query: JSON.stringify({ "$and": [] }), desc: "" };
    }
    const conditions = [];
    const descParts = [];
    if (parsed.age && (parsed.age.min !== void 0 || parsed.age.max !== void 0)) {
      const min = parsed.age.min ?? 0;
      const max = parsed.age.max ?? 100;
      conditions.push({
        data: { gt: min, lt: max },
        dataType: "number",
        metaType: "svc",
        code: "cust_age_cd",
        desc: `\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`,
        not: false
      });
      descParts.push(`\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`);
    }
    if (parsed.gender && parsed.gender !== "all") {
      const genderValue = parsed.gender === "male" || parsed.gender === "M" ? "1" : "2";
      const genderName = genderValue === "1" ? "\uB0A8\uC790" : "\uC5EC\uC790";
      conditions.push({
        data: [genderValue],
        dataType: "code",
        metaType: "svc",
        code: "sex_cd",
        desc: `\uC131\uBCC4: ${genderName}`,
        not: false
      });
      descParts.push(`\uC131\uBCC4: ${genderName}`);
    }
    const regions = parsed.region || parsed.regions;
    if (regions && Array.isArray(regions) && regions.length > 0) {
      const hcodes = [];
      const regionNames = [];
      for (const region of regions) {
        const hcode = REGION_HCODE_MAP[region];
        if (hcode) {
          hcodes.push(hcode);
          regionNames.push(region);
        }
      }
      if (hcodes.length > 0) {
        conditions.push({
          data: hcodes,
          dataType: "code",
          metaType: "loc",
          code: "home_location",
          desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${regionNames.join(", ")}`,
          not: false
        });
        descParts.push(`\uC9C0\uC5ED: ${regionNames.join(", ")}`);
      }
    }
    const interests = parsed.interest || parsed.interests;
    if (interests && Array.isArray(interests) && interests.length > 0) {
      console.log("[Submit] Skipping app filter until proper category mapping is implemented:", interests);
    }
    const behaviors = parsed.behavior || parsed.behaviors;
    if (behaviors && Array.isArray(behaviors) && behaviors.length > 0) {
      console.log("[Submit] Skipping pro filter until proper code mapping is verified:", behaviors);
    }
    const carrier = parsed.carrier || parsed.carrierTypes;
    if (carrier && Array.isArray(carrier) && carrier.length > 0) {
      console.log("[Submit] Skipping carrier filter (not in BizChat spec):", carrier);
    }
    const device = parsed.device || parsed.deviceTypes;
    if (device && Array.isArray(device) && device.length > 0) {
      console.log("[Submit] Skipping device filter (not in BizChat spec):", device);
    }
    const newQuery = { "$and": conditions };
    const result = JSON.stringify(newQuery);
    console.log("[Submit] Converted legacy sndMosuQuery:", result);
    return { query: result, desc: descParts.join(", ") };
  } catch (e) {
    console.error("[Submit] Failed to convert sndMosuQuery:", e);
    return { query: JSON.stringify({ "$and": [] }), desc: "" };
  }
}
function validateAndConvertCondition(cond) {
  if (!cond.metaType || !cond.dataType) {
    console.log("[Submit] Invalid condition (missing metaType/dataType):", cond);
    return null;
  }
  const metaType = cond.metaType;
  const dataType = cond.dataType;
  const code = cond.code || "";
  const desc21 = cond.desc || "";
  const not = cond.not || false;
  let data = cond.data;
  if (metaType === "svc") {
    const validSvcCodes = ["cust_age_cd", "sex_cd", "ad_agr_yn", "sms_rejt_yn", "smile_yn", "prod_scrb", "mbr_card_gr_cd"];
    if (!validSvcCodes.includes(code)) {
      console.log(`[Submit] Invalid svc code "${code}", skipping`);
      return null;
    }
  }
  if (metaType === "app" || metaType === "tel") {
    console.log(`[Submit] Skipping ${metaType} filter until proper category mapping is implemented`);
    return null;
  }
  if (metaType === "pro") {
    console.log(`[Submit] Skipping pro filter until proper code mapping is verified`);
    return null;
  }
  if (metaType === "loc") {
    const validLocCodes = ["home_location", "work_location"];
    if (!validLocCodes.includes(code)) {
      console.log(`[Submit] Invalid loc code "${code}", skipping`);
      return null;
    }
  }
  return {
    data,
    dataType,
    metaType,
    code,
    desc: desc21,
    not
  };
}
var campaigns9 = pgTable16("campaigns", {
  id: text11("id").primaryKey(),
  userId: text11("user_id").notNull(),
  name: text11("name").notNull(),
  templateId: text11("template_id"),
  messageType: text11("message_type"),
  sndNum: text11("snd_num"),
  tgtCompanyName: text11("tgt_company_name"),
  bizchatCampaignId: text11("bizchat_campaign_id"),
  rcvType: integer10("rcv_type").default(0),
  billingType: integer10("billing_type").default(0),
  rcsType: integer10("rcs_type"),
  sndGoalCnt: integer10("snd_goal_cnt"),
  sndMosu: integer10("snd_mosu"),
  sndMosuQuery: text11("snd_mosu_query"),
  sndMosuDesc: text11("snd_mosu_desc"),
  settleCnt: integer10("settle_cnt").default(0),
  statusCode: integer10("status_code").default(0),
  status: text11("status").default("temp_registered"),
  targetCount: integer10("target_count"),
  budget: text11("budget"),
  // Maptics 지오펜스 발송 관련 필드
  atsSndStartDate: timestamp14("ats_snd_start_date"),
  collStartDate: timestamp14("coll_start_date"),
  collEndDate: timestamp14("coll_end_date"),
  collSndDate: timestamp14("coll_snd_date"),
  sndGeofenceId: integer10("snd_geofence_id"),
  rtStartHhmm: text11("rt_start_hhmm"),
  rtEndHhmm: text11("rt_end_hhmm"),
  sndDayDiv: integer10("snd_day_div"),
  scheduledAt: timestamp14("scheduled_at"),
  createdAt: timestamp14("created_at").defaultNow(),
  updatedAt: timestamp14("updated_at").defaultNow()
});
var messages = pgTable16("messages", {
  id: text11("id").primaryKey(),
  campaignId: text11("campaign_id").notNull(),
  title: text11("title"),
  lmsTitle: text11("lms_title"),
  content: text11("content").notNull(),
  imageUrl: text11("image_url"),
  imageFileId: text11("image_file_id"),
  urlLinks: jsonb7("url_links"),
  // { list: string[], reward?: number }
  buttons: jsonb7("buttons"),
  // { list: [{ type, name, val1, val2? }] }
  // LMS fallback 전용 필드 (RCS 메시지 타입에서만 사용)
  lmsContent: text11("lms_content"),
  lmsImageUrl: text11("lms_image_url"),
  lmsImageFileId: text11("lms_image_file_id"),
  lmsUrlLinks: jsonb7("lms_url_links")
  // { list: string[], reward?: number }
});
var templates = pgTable16("templates", {
  id: text11("id").primaryKey(),
  userId: text11("user_id").notNull(),
  name: text11("name").notNull(),
  messageType: text11("message_type"),
  title: text11("title"),
  lmsTitle: text11("lms_title"),
  content: text11("content").notNull(),
  imageUrl: text11("image_url"),
  imageFileId: text11("image_file_id"),
  urlLinks: jsonb7("url_links"),
  // { list: string[], reward?: number }
  buttons: jsonb7("buttons"),
  // { list: [{ type, name, val1, val2? }] }
  status: text11("status").default("draft"),
  // LMS fallback 전용 필드 (RCS 메시지 타입에서만 사용)
  lmsContent: text11("lms_content"),
  lmsImageUrl: text11("lms_image_url"),
  lmsImageFileId: text11("lms_image_file_id"),
  lmsUrlLinks: jsonb7("lms_url_links")
  // { list: string[], reward?: number }
});
var targeting = pgTable16("targeting", {
  id: text11("id").primaryKey(),
  campaignId: text11("campaign_id").notNull(),
  geofenceIds: text11("geofence_ids").array(),
  // ATS 타겟팅 조건
  gender: text11("gender"),
  ageMin: integer10("age_min"),
  ageMax: integer10("age_max"),
  regions: text11("regions").array(),
  districts: text11("districts").array(),
  // 고급 타겟팅 조건 (JSON) - 캠페인 생성 시 저장된 전체 ATS 필터 조건
  atsQuery: text11("ats_query"),
  estimatedCount: integer10("estimated_count")
});
var geofences = pgTable16("geofences", {
  id: text11("id").primaryKey(),
  userId: text11("user_id").notNull(),
  name: text11("name").notNull(),
  latitude: text11("latitude").notNull(),
  longitude: text11("longitude").notNull(),
  radius: integer10("radius").default(500),
  bizchatGeofenceId: text11("bizchat_geofence_id")
});
function getDb16() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle16(neon16(dbUrl));
}
function getSupabaseAdmin7() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient7(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken6(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac6("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth6(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken6(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin7().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid() {
  return Date.now().toString();
}
function ensureAdPrefix(title) {
  if (title.startsWith("(\uAD11\uACE0)")) return title;
  return `(\uAD11\uACE0)${title}`;
}
function truncateTitle(title, maxLen = 30) {
  if (!title) return title;
  if (title.length <= maxLen) return title;
  return title.substring(0, maxLen);
}
async function createBizChatGeofence(name, targets, useProduction) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL3 : BIZCHAT_DEV_URL3;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    return { success: false, error: "BizChat API key not configured" };
  }
  const tid = generateTid();
  try {
    console.log(`[Submit] Creating BizChat geofence: ${name}`);
    console.log(`[Submit] Geofence targets:`, JSON.stringify(targets, null, 2));
    const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/save?tid=${tid}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify({ name, target: targets })
    });
    const result = await response.json();
    console.log(`[Submit] BizChat geofence create response:`, JSON.stringify(result));
    if (result.code === "S000001" && result.data?.id) {
      console.log(`[Submit] BizChat geofence created successfully: ${result.data.id}`);
      return { success: true, geofenceId: result.data.id };
    }
    return { success: false, error: result.msg || "Geofence creation failed" };
  } catch (error) {
    console.error("[Submit] BizChat geofence create error:", error);
    return { success: false, error: String(error) };
  }
}
function toUnixTimestamp(date) {
  if (!date) return void 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor(d.getTime() / 1e3);
}
function getKSTTimeComponents(date) {
  let hours = date.getUTCHours() + 9;
  if (hours >= 24) hours -= 24;
  const minutes = date.getUTCMinutes();
  const kstTime = new Date(date.getTime() + 9 * 60 * 60 * 1e3);
  return {
    hours,
    minutes,
    date: kstTime
  };
}
function clampToKSTWindow(dateUTC, minTime) {
  const KST_OFFSET_HOURS = 9;
  const roundUpTo10Min = (date) => {
    const result2 = new Date(date);
    result2.setSeconds(0);
    result2.setMilliseconds(0);
    const mins = result2.getMinutes();
    const rem = mins % 10;
    if (rem > 0) {
      result2.setMinutes(mins + (10 - rem));
    }
    return result2;
  };
  const utcHours = dateUTC.getUTCHours();
  const kstHours = utcHours + KST_OFFSET_HOURS;
  const kstHoursNormalized = kstHours % 24;
  const isNextDayKST = kstHours >= 24;
  const isInWindow = kstHoursNormalized >= 9 && kstHoursNormalized < 19;
  if (isInWindow) {
    const effectiveDate = dateUTC > minTime ? dateUTC : minTime;
    const resultKstHours2 = (effectiveDate.getUTCHours() + KST_OFFSET_HOURS) % 24;
    if (resultKstHours2 >= 9 && resultKstHours2 < 19) {
      return roundUpTo10Min(effectiveDate);
    }
  }
  const adjusted = new Date(dateUTC);
  if (kstHoursNormalized >= 19) {
    adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    adjusted.setUTCHours(0, 0, 0, 0);
  } else if (kstHoursNormalized < 9) {
    if (isNextDayKST) {
      adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    }
    adjusted.setUTCHours(0, 0, 0, 0);
  }
  let result = adjusted > minTime ? adjusted : minTime;
  const resultKstHours = (result.getUTCHours() + KST_OFFSET_HOURS) % 24;
  if (resultKstHours >= 19 || resultKstHours < 9) {
    result = new Date(result);
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(0, 0, 0, 0);
  }
  const finalKstHours = (result.getUTCHours() + KST_OFFSET_HOURS) % 24;
  console.log(`[Submit] KST window clamp: ${dateUTC.toISOString()} \u2192 ${result.toISOString()} (KST ${String(finalKstHours).padStart(2, "0")}:${String(result.getUTCMinutes()).padStart(2, "0")})`);
  return roundUpTo10Min(result);
}
function validateSendTime(sendDate) {
  if (!sendDate) return { valid: true };
  const targetDate = typeof sendDate === "string" ? new Date(sendDate) : new Date(sendDate);
  const now = /* @__PURE__ */ new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1e3);
  const kstTarget = getKSTTimeComponents(targetDate);
  if (kstTarget.hours < 9 || kstTarget.hours >= 19) {
    console.log(`[Submit] Send time ${kstTarget.hours}:${kstTarget.minutes.toString().padStart(2, "0")} KST is outside 09:00~19:00, auto-adjusting...`);
    const adjustedDate2 = clampToKSTWindow(targetDate, oneHourFromNow);
    const kstAdjusted2 = getKSTTimeComponents(adjustedDate2);
    console.log(`[Submit] Adjusted to ${kstAdjusted2.hours}:${kstAdjusted2.minutes.toString().padStart(2, "0")} KST (${adjustedDate2.toISOString()})`);
    return { valid: true, adjustedDate: adjustedDate2 };
  }
  if (targetDate < oneHourFromNow) {
    const adjustedDate2 = clampToKSTWindow(oneHourFromNow, oneHourFromNow);
    console.log(`[Submit] Send time is less than 1 hour from now, adjusted to ${adjustedDate2.toISOString()}`);
    return { valid: true, adjustedDate: adjustedDate2 };
  }
  const adjustedDate = new Date(targetDate);
  adjustedDate.setSeconds(0);
  adjustedDate.setMilliseconds(0);
  const minutes = adjustedDate.getMinutes();
  const remainder = minutes % 10;
  if (remainder !== 0) {
    adjustedDate.setMinutes(minutes + (10 - remainder));
  }
  const kstAdjusted = getKSTTimeComponents(adjustedDate);
  if (kstAdjusted.hours >= 19) {
    const finalAdjusted = clampToKSTWindow(adjustedDate, oneHourFromNow);
    return { valid: true, adjustedDate: finalAdjusted };
  }
  return { valid: true, adjustedDate };
}
function validateStringLengths(data) {
  if (data.name && data.name.length > 40) {
    return { valid: false, error: `\uCEA0\uD398\uC778\uBA85\uC740 \uCD5C\uB300 40\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.name.length}\uC790)` };
  }
  if (data.tgtCompanyName && data.tgtCompanyName.length > 100) {
    return { valid: false, error: `\uACE0\uAC1D\uC0AC\uBA85\uC740 \uCD5C\uB300 100\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.tgtCompanyName.length}\uC790)` };
  }
  if (data.title && data.title.length > 30) {
    return { valid: false, error: `\uBA54\uC2DC\uC9C0 \uC81C\uBAA9\uC740 \uCD5C\uB300 30\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.title.length}\uC790)` };
  }
  if (data.msg && data.msg.length > 1e3) {
    return { valid: false, error: `\uBA54\uC2DC\uC9C0 \uBCF8\uBB38\uC740 \uCD5C\uB300 1000\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.msg.length}\uC790)` };
  }
  return { valid: true };
}
function validateATSMosu(data) {
  if (data.rcvType !== 0) {
    return { valid: true };
  }
  const sndGoalCnt = data.sndGoalCnt || 0;
  const sndMosu = data.sndMosu || 0;
  const sndMosuFlag = data.sndMosuFlag ?? 0;
  if (sndMosu === 0) {
    return {
      valid: false,
      error: "\uBC1C\uC1A1 \uB300\uC0C1 \uBAA8\uC218\uAC00 0\uBA85\uC785\uB2C8\uB2E4. \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uBCC0\uACBD\uD574\uC8FC\uC138\uC694."
    };
  }
  if (sndMosu > 4e5) {
    return {
      valid: false,
      error: `\uBC1C\uC1A1 \uBAA8\uC218(${sndMosu.toLocaleString()}\uBA85)\uAC00 \uCD5C\uB300\uAC12(400,000\uBA85)\uC744 \uCD08\uACFC\uD569\uB2C8\uB2E4. \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uC881\uD600\uC8FC\uC138\uC694.`
    };
  }
  if (sndMosuFlag === 0) {
    const minMosu = Math.ceil(sndGoalCnt * 1.5);
    if (sndMosu < minMosu) {
      return {
        valid: false,
        error: `\uBC1C\uC1A1 \uBAA8\uC218(${sndMosu.toLocaleString()}\uBA85)\uAC00 \uBC1C\uC1A1 \uBAA9\uD45C(${sndGoalCnt.toLocaleString()}\uAC74)\uC758 150%(${minMosu.toLocaleString()}\uBA85) \uBBF8\uB9CC\uC785\uB2C8\uB2E4. \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uBCC0\uACBD\uD558\uAC70\uB098 \uBC1C\uC1A1 \uBAA9\uD45C\uB97C \uC904\uC5EC\uC8FC\uC138\uC694.`,
        warning: `\uBC1C\uC1A1 \uBAA8\uC218\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4. \uCD5C\uC18C ${minMosu.toLocaleString()}\uBA85 \uC774\uC0C1\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
      };
    }
  }
  return { valid: true };
}
function validateMapticsCollStartDate(data) {
  if (data.rcvType !== 1 && data.rcvType !== 2) {
    return { valid: true };
  }
  if (!data.collStartDate) {
    return {
      valid: false,
      error: "Maptics \uCEA0\uD398\uC778\uC740 \uC218\uC9D1 \uC2DC\uC791\uC77C(collStartDate)\uC774 \uD544\uC218\uC785\uB2C8\uB2E4."
    };
  }
  const collStartDate = typeof data.collStartDate === "string" ? new Date(data.collStartDate) : data.collStartDate;
  const now = /* @__PURE__ */ new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1e3);
  if (collStartDate < oneHourFromNow) {
    return {
      valid: false,
      error: "\uC218\uC9D1 \uC2DC\uC791\uC77C\uC740 \uD604\uC7AC \uC2DC\uAC04\uC73C\uB85C\uBD80\uD130 \uCD5C\uC18C 1\uC2DC\uAC04 \uC774\uD6C4\uC5EC\uC57C \uD569\uB2C8\uB2E4."
    };
  }
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1e3);
  if (collStartDate < oneDayFromNow) {
    return {
      valid: true,
      warning: "\u26A0\uFE0F Maptics \uCEA0\uD398\uC778\uC740 \uC218\uC9D1 \uC2DC\uC791\uC77C \uCD5C\uC18C 24\uC2DC\uAC04 \uC804\uC5D0 \uC0DD\uC131\uD558\uC2DC\uB294 \uAC83\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4. \uC2B9\uC778 \uC808\uCC28\uB97C \uACE0\uB824\uD574\uC8FC\uC138\uC694."
    };
  }
  return { valid: true };
}
async function callATSMosuAPI(filterPayload, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL3 : BIZCHAT_DEV_URL3;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    return { success: false, query: "", filterStr: "", count: 0, error: "API key not configured" };
  }
  const tid = generateTid();
  const url = `${baseUrl}/api/v1/ats/mosu?tid=${tid}`;
  console.log(`[ATS Mosu] POST ${url}`);
  console.log(`[ATS Mosu] Payload:`, JSON.stringify(filterPayload, null, 2));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify(filterPayload)
    });
    const responseText = await response.text();
    console.log(`[ATS Mosu] Response: ${response.status} - ${responseText.substring(0, 1e3)}`);
    const data = JSON.parse(responseText);
    if (data.code === "S000001" && data.data?.query) {
      console.log(`[ATS Mosu] Success - query: ${data.data.query.substring(0, 200)}...`);
      return {
        success: true,
        query: data.data.query,
        // SQL 형식의 query 문자열
        filterStr: data.data.filterStr || "",
        count: data.data.cnt || 0
      };
    }
    console.error(`[ATS Mosu] Failed - code: ${data.code}, msg: ${data.msg}`);
    return {
      success: false,
      query: "",
      filterStr: "",
      count: 0,
      error: `ATS API failed: ${data.code} - ${data.msg}`
    };
  } catch (error) {
    console.error(`[ATS Mosu] Error:`, error);
    return {
      success: false,
      query: "",
      filterStr: "",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function buildATSFilterFromTargeting(targetingData) {
  if (targetingData.atsQuery) {
    try {
      const atsQueryParsed = JSON.parse(targetingData.atsQuery);
      if (atsQueryParsed["$and"] && Array.isArray(atsQueryParsed["$and"])) {
        const descParts2 = atsQueryParsed["$and"].filter((c) => c.desc).map((c) => c.desc);
        console.log("[Submit] Using stored atsQuery with", atsQueryParsed["$and"].length, "conditions");
        return {
          payload: { "$and": atsQueryParsed["$and"] },
          desc: descParts2.join(", ")
        };
      }
      if (atsQueryParsed["$or"] && Array.isArray(atsQueryParsed["$or"])) {
        const descParts2 = atsQueryParsed["$or"].filter((c) => c.desc).map((c) => c.desc);
        console.log("[Submit] Using stored atsQuery with", atsQueryParsed["$or"].length, "conditions ($or)");
        return {
          payload: { "$and": atsQueryParsed["$or"] },
          // BizChat expects $and
          desc: descParts2.join(", ")
        };
      }
    } catch (e) {
      console.log("[Submit] Failed to parse atsQuery, falling back to basic fields:", e);
    }
  }
  const conditions = [];
  const descParts = [];
  if (targetingData.ageMin !== null && targetingData.ageMin !== void 0 || targetingData.ageMax !== null && targetingData.ageMax !== void 0) {
    const min = targetingData.ageMin ?? 0;
    const max = targetingData.ageMax ?? 100;
    conditions.push({
      data: { gt: min, lt: max },
      dataType: "number",
      metaType: "svc",
      code: "cust_age_cd",
      desc: `\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`,
      not: false
    });
    descParts.push(`\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`);
  }
  if (targetingData.gender && targetingData.gender !== "all") {
    const genderValue = targetingData.gender === "male" ? "1" : "2";
    const genderName = targetingData.gender === "male" ? "\uB0A8\uC790" : "\uC5EC\uC790";
    conditions.push({
      data: [genderValue],
      dataType: "code",
      metaType: "svc",
      code: "sex_cd",
      desc: `\uC131\uBCC4: ${genderName}`,
      not: false
    });
    descParts.push(`\uC131\uBCC4: ${genderName}`);
  }
  if (targetingData.regions && targetingData.regions.length > 0) {
    const hcodes = [];
    const regionNames = [];
    for (const region of targetingData.regions) {
      const hcode = REGION_HCODE_MAP[region];
      if (hcode) {
        hcodes.push(hcode);
        regionNames.push(region);
      }
    }
    if (hcodes.length > 0) {
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "home_location",
        desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${regionNames.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9C0\uC5ED: ${regionNames.join(", ")}`);
    }
  }
  return {
    payload: { "$and": conditions },
    desc: descParts.join(", ")
  };
}
async function callBizChatAPI(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL3 : BIZCHAT_DEV_URL3;
  const envKeyName = useProduction ? "BIZCHAT_PROD_API_KEY" : "BIZCHAT_DEV_API_KEY";
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  console.log(`[BizChat Submit] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`[BizChat Submit] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat Submit] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  console.log(`[BizChat Submit] VERCEL_ENV: ${process.env.VERCEL_ENV}, NODE_ENV: ${process.env.NODE_ENV}`);
  if (!apiKey) {
    console.error(`[BizChat Submit] \u274C API key not configured: ${envKeyName}`);
    console.error(`[BizChat Submit] Available keys - DEV: ${!!process.env.BIZCHAT_DEV_API_KEY}, PROD: ${!!process.env.BIZCHAT_PROD_API_KEY}`);
    throw new Error(`BizChat API \uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4 (${envKeyName}). Vercel \uD658\uACBD\uBCC0\uC218\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.`);
  }
  const tid = generateTid();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat] Request body:`, JSON.stringify(body, null, 2));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat] Response: ${response.status} - ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function handler17(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth6(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid campaign ID" });
  }
  const db = getDb16();
  const detectProductionEnvironment5 = () => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
    if (forceDevMode) {
      console.log('[BizChat Submit] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === "prod" || req.body?.env === "prod") return true;
    if (req.query.env === "dev" || req.body?.env === "dev") return false;
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === "production") return true;
    if (process.env.NODE_ENV === "production") return true;
    return false;
  };
  const useProduction = detectProductionEnvironment5();
  console.log(`[BizChat Submit] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"} (VERCEL_ENV=${process.env.VERCEL_ENV})`);
  try {
    const campaignResult = await db.select().from(campaigns9).where(eq16(campaigns9.id, id));
    const campaign = campaignResult[0];
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    const messageResult = await db.select().from(messages).where(eq16(messages.campaignId, id));
    let message = messageResult[0];
    if (!message && campaign.templateId) {
      const templateResult = await db.select().from(templates).where(eq16(templates.id, campaign.templateId));
      const template = templateResult[0];
      if (template) {
        message = {
          id: crypto.randomUUID(),
          campaignId: id,
          title: template.title || "",
          content: template.content,
          imageUrl: template.imageUrl || null,
          imageFileId: template.imageFileId || null,
          urlLinks: template.urlLinks || null,
          buttons: template.buttons || null,
          // LMS fallback 전용 필드 (RCS 메시지 타입에서 사용)
          lmsContent: template.lmsContent || null,
          lmsImageUrl: template.lmsImageUrl || null,
          lmsImageFileId: template.lmsImageFileId || null,
          lmsUrlLinks: template.lmsUrlLinks || null
        };
      }
    }
    if (!message) {
      return res.status(400).json({ error: "Campaign message not found" });
    }
    const { scheduledAt } = req.body || {};
    const lengthValidation = validateStringLengths({
      name: campaign.name,
      tgtCompanyName: campaign.tgtCompanyName || void 0,
      title: message?.title || void 0,
      msg: message?.content
    });
    if (!lengthValidation.valid) {
      return res.status(400).json({ error: lengthValidation.error });
    }
    const rcvType = campaign.rcvType ?? 0;
    let sendDateToValidate = scheduledAt || campaign.atsSndStartDate || campaign.scheduledAt;
    if (!sendDateToValidate && (rcvType === 0 || rcvType === 10)) {
      const now = /* @__PURE__ */ new Date();
      const offsetMinutes = rcvType === 10 ? 10 : 60;
      const defaultSendDate = new Date(now.getTime() + offsetMinutes * 60 * 1e3);
      defaultSendDate.setSeconds(0);
      defaultSendDate.setMilliseconds(0);
      const minutes = defaultSendDate.getMinutes();
      const remainder = minutes % 10;
      if (remainder > 0) {
        defaultSendDate.setMinutes(minutes + (10 - remainder));
      }
      sendDateToValidate = defaultSendDate;
      console.log(`[Submit] No scheduledAt provided, using default send date for rcvType ${rcvType}:`, defaultSendDate.toISOString());
    }
    let adjustedSendDate = sendDateToValidate;
    if (rcvType === 10) {
      if (sendDateToValidate) {
        const targetDate = typeof sendDateToValidate === "string" ? new Date(sendDateToValidate) : new Date(sendDateToValidate);
        targetDate.setSeconds(0);
        targetDate.setMilliseconds(0);
        const minutes = targetDate.getMinutes();
        const remainder = minutes % 10;
        if (remainder !== 0) {
          targetDate.setMinutes(minutes + (10 - remainder));
        }
        adjustedSendDate = targetDate;
      }
      console.log("[Submit] Test campaign (rcvType=10): Skipping strict time validation");
    } else {
      const timeValidation = validateSendTime(sendDateToValidate);
      if (!timeValidation.valid) {
        return res.status(400).json({ error: timeValidation.error });
      }
      adjustedSendDate = timeValidation.adjustedDate || sendDateToValidate;
    }
    const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1e3;
    const mosuValidation = validateATSMosu({
      rcvType,
      sndGoalCnt,
      sndMosu: campaign.sndMosu,
      sndMosuFlag: 0
      // 기본: 150% 체크 사용
    });
    if (!mosuValidation.valid) {
      console.error("[Submit] ATS mosu validation failed:", mosuValidation.error);
      return res.status(400).json({
        error: mosuValidation.error,
        hint: "\uBC1C\uC1A1 \uBAA9\uD45C \uAC74\uC218\uB97C \uC904\uC774\uAC70\uB098 \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uC870\uC815\uD558\uC5EC \uBC1C\uC1A1 \uB300\uC0C1 \uBAA8\uC218\uB97C \uB298\uB824\uC8FC\uC138\uC694."
      });
    }
    if (mosuValidation.warning) {
      console.warn("[Submit] ATS mosu warning:", mosuValidation.warning);
    }
    const mapticsValidation = validateMapticsCollStartDate({
      rcvType,
      collStartDate: campaign.collStartDate
    });
    if (!mapticsValidation.valid) {
      console.error("[Submit] Maptics collStartDate validation failed:", mapticsValidation.error);
      return res.status(400).json({
        error: mapticsValidation.error,
        hint: "Maptics \uCEA0\uD398\uC778\uC740 \uC218\uC9D1 \uC2DC\uC791\uC77C \uCD5C\uC18C 24\uC2DC\uAC04 \uC804\uC5D0 \uC0DD\uC131\uD558\uC2DC\uB294 \uAC83\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4."
      });
    }
    if (mapticsValidation.warning) {
      console.warn("[Submit] Maptics collStartDate warning:", mapticsValidation.warning);
    }
    if (!campaign.bizchatCampaignId) {
      let billingType = 0;
      const hasImage = !!message?.imageUrl;
      if (campaign.messageType === "RCS") {
        billingType = hasImage ? 1 : 3;
      } else if (campaign.messageType === "MMS" || hasImage) {
        billingType = 2;
      }
      const sndGoalCnt2 = campaign.sndGoalCnt || campaign.targetCount || 1e3;
      const sndMosu = campaign.sndMosu || Math.ceil(sndGoalCnt2 * 1.5);
      console.log(`[Submit Create] Using sndMosu: ${sndMosu.toLocaleString()} (from ${campaign.sndMosu ? "campaign" : "calculated"})`);
      const isRcs = billingType === 1 || billingType === 3;
      const needsFile = billingType === 1 || billingType === 2;
      let imageFileId = null;
      let lmsImageFileIdResolved = null;
      const uploadImageHelper = async (imgUrl, rcsFlag, label) => {
        if (imgUrl.startsWith("data:")) {
          console.log(`[Submit] ${label} image is base64, uploading to BizChat file API (rcs=${rcsFlag})...`);
          try {
            const host = req.headers.host || process.env.VERCEL_URL || "localhost:5000";
            const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
            const protocol = req.headers["x-forwarded-proto"] || (isLocalhost ? "http" : "https");
            const baseUrlForUpload = `${protocol}://${host}`;
            const mimeMatch = imgUrl.match(/^data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const extMatch = mimeType.match(/image\/(\w+)/);
            const ext = extMatch ? extMatch[1] : "jpg";
            const fileName = `campaign_${id}_${label}_${Date.now()}.${ext}`;
            const uploadResponse = await fetch(`${baseUrlForUpload}/api/bizchat/file`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...req.headers.authorization ? { "Authorization": req.headers.authorization } : {},
                ...req.headers["x-impersonate-token"] ? { "X-Impersonate-Token": req.headers["x-impersonate-token"] } : {},
                ...req.headers["x-impersonate-user-id"] ? { "X-Impersonate-User-Id": req.headers["x-impersonate-user-id"] } : {}
              },
              body: JSON.stringify({
                fileData: imgUrl,
                fileName,
                fileType: mimeType,
                type: 2,
                rcs: rcsFlag
              })
            });
            const uploadResult = await uploadResponse.json();
            if (uploadResult.success && uploadResult.fileId) {
              console.log(`[Submit] ${label} image uploaded successfully, fileId: ${uploadResult.fileId}`);
              return uploadResult.fileId;
            } else {
              console.error(`[Submit] ${label} image upload failed:`, uploadResult);
              return null;
            }
          } catch (uploadError) {
            console.error(`[Submit] ${label} image upload error:`, uploadError);
            return null;
          }
        } else {
          console.log(`[Submit] ${label} using existing image reference: ${imgUrl.substring(0, 50)}...`);
          return imgUrl;
        }
      };
      if (needsFile && message?.imageUrl) {
        const rcsFlag = isRcs ? 1 : 0;
        const result = await uploadImageHelper(message.imageUrl, rcsFlag, isRcs ? "RCS" : "MMS");
        if (result) {
          imageFileId = result;
        } else {
          return res.status(400).json({
            error: "\uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."
          });
        }
      }
      if (isRcs && needsFile) {
        const lmsImgUrl = message?.lmsImageUrl;
        const lmsImgFileId = message?.lmsImageFileId;
        if (lmsImgFileId) {
          lmsImageFileIdResolved = lmsImgFileId;
          console.log(`[Submit] Using existing LMS fallback imageFileId: ${lmsImageFileIdResolved}`);
        } else if (lmsImgUrl) {
          const result = await uploadImageHelper(lmsImgUrl, 0, "LMS_fallback");
          if (result) {
            lmsImageFileIdResolved = result;
          } else {
            console.warn("[Submit] LMS fallback image upload failed, MMS will have no image");
          }
        } else {
          console.log("[Submit] No LMS fallback image provided, MMS fallback will have no image");
        }
      }
      const rcsUrlLinksData = message?.urlLinks;
      const rcsUrlList = rcsUrlLinksData?.list || message?.urls || [];
      const rcsUrlReward = rcsUrlLinksData?.reward;
      const lmsUrlLinksData = message?.lmsUrlLinks;
      const lmsUrlList = lmsUrlLinksData?.list || [];
      const lmsUrlReward = lmsUrlLinksData?.reward;
      const buttonsData = message?.buttons;
      const rcsButtons = buttonsData?.list || message?.rcsButtons || [];
      const hasLmsContent = !!message?.lmsContent?.trim();
      const useLmsFallback = isRcs && hasLmsContent;
      const fallbackContent = isRcs ? message?.lmsContent || message?.content || "" : message?.content || "";
      const rawMmsTitle = isRcs ? message?.lmsTitle?.trim() || message?.title?.trim() || fallbackContent.split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0" : message?.title?.trim() || (message?.content || "").split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0";
      const mmsTitle = truncateTitle(ensureAdPrefix(rawMmsTitle));
      const mmsUrlList = isRcs ? useLmsFallback ? lmsUrlList : rcsUrlList : rcsUrlList;
      const mmsUrlReward = isRcs ? useLmsFallback ? lmsUrlReward : rcsUrlReward : rcsUrlReward;
      const mmsImageFileId = isRcs ? useLmsFallback ? lmsImageFileIdResolved : imageFileId : imageFileId;
      if (isRcs) {
        console.log(`[Submit] RCS campaign MMS fallback mode: ${useLmsFallback ? "SEPARATE (lms* fields)" : "UNIFIED (using RCS fields as fallback)"}`);
        console.log(`[Submit] MMS fallback details: lmsContent=${hasLmsContent}, fallbackContent length=${fallbackContent.length}, mmsImageFileId=${mmsImageFileId}, mmsUrlLinks=${mmsUrlList.length} urls`);
      }
      const mmsMsg = fallbackContent;
      console.log(`[Submit] MMS title: ${mmsTitle}`);
      console.log(`[Submit] MMS msg (first 200 chars): ${mmsMsg.substring(0, 200)}`);
      console.log(`[Submit] MMS msg (last 200 chars): ${mmsMsg.substring(mmsMsg.length - 200)}`);
      const mmsObject = {
        title: mmsTitle,
        msg: mmsMsg,
        ...needsFile && mmsImageFileId && { fileInfo: { list: [{ origId: mmsImageFileId }] } },
        ...message?.urlFile && { urlFile: message.urlFile },
        ...mmsUrlList.length > 0 && { urlLink: { list: mmsUrlList.slice(0, 3), ...mmsUrlReward !== void 0 && { reward: mmsUrlReward } } }
      };
      const effectiveRcsType = campaign.rcsType !== null && campaign.rcsType !== void 0 && campaign.rcsType >= 0 && campaign.rcsType <= 5 ? campaign.rcsType : billingType === 1 ? 4 : 1;
      console.log(`[Submit] effectiveRcsType: ${effectiveRcsType}, including slideNum: 1`);
      const shouldIncludeRcsArray = isRcs;
      console.log(`[Submit] shouldIncludeRcsArray: ${shouldIncludeRcsArray}, effectiveRcsType: ${effectiveRcsType}, isRcs: ${isRcs}`);
      const rcsTitle = truncateTitle(message?.title?.trim() || (message?.content || "").split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0");
      const rcsMsg = message?.content || "";
      const rcsSlide = shouldIncludeRcsArray ? {
        slideNum: 1,
        title: rcsTitle,
        msg: rcsMsg,
        ...needsFile && imageFileId && { imgOrigId: imageFileId },
        ...message?.rcsUrlFile && { urlFile: message.rcsUrlFile },
        ...rcsUrlList.length > 0 && { urlLink: { list: rcsUrlList.slice(0, 3), ...rcsUrlReward !== void 0 && { reward: rcsUrlReward } } },
        ...rcsButtons.length > 0 && {
          buttons: { list: rcsButtons.map((btn) => ({
            ...btn,
            type: String(btn.type),
            val2: btn.val2 ?? ""
          })) }
        },
        opts: message?.rcsOpts || {}
      } : null;
      const rcvTypeForPayload = campaign.rcvType ?? 0;
      const isMapticsCampaign = rcvTypeForPayload === 1 || rcvTypeForPayload === 2;
      const createPayload = {
        tgtCompanyName: campaign.tgtCompanyName || "\uC704\uD53D",
        name: campaign.name,
        sndNum: campaign.sndNum,
        rcvType: rcvTypeForPayload,
        sndGoalCnt: sndGoalCnt2,
        billingType,
        isTmp: 0,
        settleCnt: campaign.settleCnt ?? sndGoalCnt2,
        // ATS 전용 필드: Maptics 캠페인에서는 제외 (E000001 오류 방지)
        ...!isMapticsCampaign && { sndMosu },
        ...!isMapticsCampaign && { sndMosuFlag: 0 },
        // 150% 체크 사용
        adverDeny: "1504",
        cb: {
          state: `${CALLBACK_BASE_URL}/api/bizchat/callback/state`
        },
        mms: mmsObject,
        // RCS 타입일 때만 rcs 배열 포함 (빈 배열 생략 - E000002 방지)
        ...rcsSlide && { rcs: [rcsSlide] }
      };
      console.log(`[Submit] Final payload check - has rcs array: ${"rcs" in createPayload}, effectiveRcsType: ${effectiveRcsType}`);
      const rcvType2 = campaign.rcvType ?? 0;
      if (rcvType2 === 1 || rcvType2 === 2) {
        if (campaign.rtStartHhmm) {
          createPayload.rtStartHhmm = campaign.rtStartHhmm;
        }
        if (campaign.rtEndHhmm) {
          createPayload.rtEndHhmm = campaign.rtEndHhmm;
        }
        if (campaign.sndDayDiv !== null && campaign.sndDayDiv !== void 0) {
          createPayload.sndDayDiv = campaign.sndDayDiv;
        }
        let bizchatGeofenceId = campaign.sndGeofenceId || null;
        if (!bizchatGeofenceId) {
          console.log("[Submit] No sndGeofenceId found, looking up geofences from targeting table...");
          const targetingResult2 = await db.select().from(targeting).where(eq16(targeting.campaignId, id));
          const campaignTargeting = targetingResult2[0];
          if (campaignTargeting?.geofenceIds?.length) {
            console.log("[Submit] Found geofenceIds in targeting:", campaignTargeting.geofenceIds);
            const geofenceResult = await db.select().from(geofences).where(
              eq16(geofences.id, campaignTargeting.geofenceIds[0])
            );
            const geofence = geofenceResult[0];
            if (geofence) {
              console.log("[Submit] Found geofence in DB:", geofence.name, geofence.latitude, geofence.longitude);
              if (geofence.bizchatGeofenceId) {
                bizchatGeofenceId = parseInt(geofence.bizchatGeofenceId, 10);
                console.log("[Submit] Reusing existing bizchatGeofenceId:", bizchatGeofenceId);
                await db.update(campaigns9).set({ sndGeofenceId: bizchatGeofenceId, updatedAt: /* @__PURE__ */ new Date() }).where(eq16(campaigns9.id, id));
              } else {
                const geofenceTargets = [{
                  gender: 0,
                  // 전체
                  minAge: 0,
                  // 전체 연령
                  maxAge: 100,
                  stayMin: 30,
                  // 기본 30분 체류
                  radius: geofence.radius || 500,
                  address: geofence.name,
                  // 주소 대신 이름 사용
                  lat: geofence.latitude,
                  lon: geofence.longitude
                }];
                const geofenceCreateResult = await createBizChatGeofence(
                  `${campaign.name}_geofence_${Date.now()}`,
                  geofenceTargets,
                  useProduction
                );
                if (geofenceCreateResult.success && geofenceCreateResult.geofenceId) {
                  bizchatGeofenceId = geofenceCreateResult.geofenceId;
                  console.log("[Submit] BizChat geofence created, ID:", bizchatGeofenceId);
                  await Promise.all([
                    db.update(campaigns9).set({ sndGeofenceId: bizchatGeofenceId, updatedAt: /* @__PURE__ */ new Date() }).where(eq16(campaigns9.id, id)),
                    db.update(geofences).set({ bizchatGeofenceId: String(bizchatGeofenceId) }).where(eq16(geofences.id, geofence.id))
                  ]);
                } else {
                  console.error("[Submit] Failed to create BizChat geofence:", geofenceCreateResult.error);
                  return res.status(400).json({
                    error: `\uC9C0\uC624\uD39C\uC2A4 \uC0DD\uC131 \uC2E4\uD328: ${geofenceCreateResult.error}`,
                    code: "E100012",
                    hint: "\uC9C0\uC624\uD39C\uC2A4 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."
                  });
                }
              }
            } else {
              console.error("[Submit] Geofence not found in DB:", campaignTargeting.geofenceIds[0]);
              return res.status(400).json({
                error: "\uC9C0\uC624\uD39C\uC2A4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
                code: "E100012",
                hint: "\uCEA0\uD398\uC778 \uD0C0\uAC9F\uD305 \uC124\uC815\uC5D0\uC11C \uC9C0\uC624\uD39C\uC2A4\uB97C \uB2E4\uC2DC \uC120\uD0DD\uD574\uC8FC\uC138\uC694."
              });
            }
          } else {
            console.error("[Submit] No geofenceIds found in targeting for rcvType=1/2 campaign");
            return res.status(400).json({
              error: "\uC9C0\uC624\uD39C\uC2A4 \uCEA0\uD398\uC778\uC5D0 \uC9C0\uC624\uD39C\uC2A4 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
              code: "E100012",
              hint: "\uCEA0\uD398\uC778 \uD0C0\uAC9F\uD305 \uC124\uC815\uC5D0\uC11C \uC9C0\uC624\uD39C\uC2A4\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694."
            });
          }
        }
        createPayload.sndGeofenceId = bizchatGeofenceId;
        let scheduledSendTimestamp;
        if (adjustedSendDate) {
          scheduledSendTimestamp = toUnixTimestamp(typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate);
        } else if (campaign.scheduledAt) {
          scheduledSendTimestamp = toUnixTimestamp(new Date(campaign.scheduledAt));
        } else if (campaign.atsSndStartDate) {
          scheduledSendTimestamp = typeof campaign.atsSndStartDate === "number" ? campaign.atsSndStartDate : toUnixTimestamp(new Date(campaign.atsSndStartDate));
        } else {
          scheduledSendTimestamp = toUnixTimestamp(/* @__PURE__ */ new Date()) + 86400;
        }
        const nowTimestamp = toUnixTimestamp(/* @__PURE__ */ new Date());
        const scheduledDate = new Date(scheduledSendTimestamp * 1e3);
        const kstOffset = 9 * 60 * 60 * 1e3;
        const kstDate = new Date(scheduledDate.getTime() + kstOffset);
        const year = kstDate.getUTCFullYear();
        const month = kstDate.getUTCMonth();
        const day = kstDate.getUTCDate();
        console.log(`[Submit] Maptics coll* calculation - scheduledSendTimestamp: ${scheduledSendTimestamp} (${scheduledDate.toISOString()}), KST date: ${year}-${month + 1}-${day}`);
        let collStartTimestamp;
        let collEndTimestamp;
        if (rcvType2 === 1 && campaign.rtStartHhmm && campaign.rtEndHhmm) {
          const rtStartClean = String(campaign.rtStartHhmm).replace(/\D/g, "").padStart(4, "0");
          const rtEndClean = String(campaign.rtEndHhmm).replace(/\D/g, "").padStart(4, "0");
          if (rtStartClean.length < 4 || rtEndClean.length < 4) {
            console.error(`[Submit] Invalid rtHhmm format: rtStart=${campaign.rtStartHhmm}, rtEnd=${campaign.rtEndHhmm}`);
            return res.status(400).json({
              error: "\uBC1C\uC1A1 \uC2DC\uAC04 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
              code: "E100015",
              hint: "\uBC1C\uC1A1 \uC2DC\uAC04\uC740 HHMM \uD615\uC2DD(\uC608: 1500)\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694."
            });
          }
          const rtStartHour = parseInt(rtStartClean.substring(0, 2), 10);
          const rtStartMin = parseInt(rtStartClean.substring(2, 4), 10);
          const rtEndHour = parseInt(rtEndClean.substring(0, 2), 10);
          const rtEndMin = parseInt(rtEndClean.substring(2, 4), 10);
          if (isNaN(rtStartHour) || isNaN(rtStartMin) || isNaN(rtEndHour) || isNaN(rtEndMin)) {
            console.error(`[Submit] NaN in rtHhmm parsing: ${rtStartHour}:${rtStartMin} ~ ${rtEndHour}:${rtEndMin}`);
            return res.status(400).json({
              error: "\uBC1C\uC1A1 \uC2DC\uAC04 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
              code: "E100015",
              hint: "\uBC1C\uC1A1 \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694."
            });
          }
          const rtStartUtcMs = Date.UTC(year, month, day, rtStartHour - 9, rtStartMin, 0);
          const rtStartTimestamp = Math.floor(rtStartUtcMs / 1e3);
          let rtEndUtcMs = Date.UTC(year, month, day, rtEndHour - 9, rtEndMin, 0);
          let rtEndTimestamp = Math.floor(rtEndUtcMs / 1e3);
          if (rtEndTimestamp <= rtStartTimestamp) {
            rtEndTimestamp += 86400;
            console.log(`[Submit] Cross-midnight detected: rtEnd adjusted to next day`);
          }
          collStartTimestamp = rtStartTimestamp;
          collEndTimestamp = rtEndTimestamp + 1800;
          console.log(`[Submit] rcvType=1: rtStart=${rtStartHour}:${rtStartMin}, rtEnd=${rtEndHour}:${rtEndMin}`);
          console.log(`[Submit] rtStartTimestamp: ${rtStartTimestamp} (${new Date(rtStartTimestamp * 1e3).toISOString()})`);
          console.log(`[Submit] rtEndTimestamp: ${rtEndTimestamp} (${new Date(rtEndTimestamp * 1e3).toISOString()})`);
          console.log(`[Submit] Calculated collStart: ${new Date(collStartTimestamp * 1e3).toISOString()}, collEnd: ${new Date(collEndTimestamp * 1e3).toISOString()}`);
          if (nowTimestamp > rtStartTimestamp) {
            console.error(`[Submit] Cannot submit: rtStart (${new Date(rtStartTimestamp * 1e3).toISOString()}) already passed`);
            return res.status(400).json({
              error: "\uBC1C\uC1A1 \uC2DC\uC791 \uC2DC\uAC04\uC774 \uC774\uBBF8 \uC9C0\uB0AC\uC2B5\uB2C8\uB2E4",
              code: "E100015",
              hint: `\uBC1C\uC1A1 \uC2DC\uC791 \uC2DC\uAC04(${rtStartHour}:${String(rtStartMin).padStart(2, "0")})\uC774 \uD604\uC7AC \uC2DC\uAC04\uBCF4\uB2E4 \uC774\uD6C4\uC5EC\uC57C \uD569\uB2C8\uB2E4.`
            });
          }
          if (collStartTimestamp <= nowTimestamp) {
            collStartTimestamp = Math.min(nowTimestamp + 60, rtStartTimestamp);
            console.log("[Submit] collStartDate adjusted to future:", new Date(collStartTimestamp * 1e3).toISOString());
          }
        } else {
          if (campaign.collStartDate) {
            collStartTimestamp = toUnixTimestamp(new Date(campaign.collStartDate));
            if (collStartTimestamp <= nowTimestamp) {
              collStartTimestamp = nowTimestamp + 3600;
              console.log("[Submit] collStartDate adjusted to future:", new Date(collStartTimestamp * 1e3).toISOString());
            }
          } else {
            const sendMinus1Day = scheduledSendTimestamp - 86400;
            const nowPlus1Hour = nowTimestamp + 3600;
            collStartTimestamp = Math.max(nowPlus1Hour, sendMinus1Day);
            if (collStartTimestamp >= scheduledSendTimestamp) {
              collStartTimestamp = nowPlus1Hour;
            }
          }
          if (campaign.collEndDate) {
            collEndTimestamp = toUnixTimestamp(new Date(campaign.collEndDate));
            if (collEndTimestamp <= collStartTimestamp) {
              collEndTimestamp = scheduledSendTimestamp;
            }
          } else {
            collEndTimestamp = scheduledSendTimestamp;
          }
        }
        createPayload.collStartDate = collStartTimestamp;
        createPayload.collEndDate = collEndTimestamp;
        if (rcvType2 === 2) {
          let collSndTimestamp;
          if (campaign.collSndDate) {
            collSndTimestamp = toUnixTimestamp(new Date(campaign.collSndDate));
          } else {
            collSndTimestamp = scheduledSendTimestamp;
          }
          createPayload.collSndDate = collSndTimestamp;
        }
        console.log(`[Submit] Maptics campaign fields - rcvType: ${rcvType2}, sndGeofenceId: ${bizchatGeofenceId}, collStartDate: ${collStartTimestamp} (${new Date(collStartTimestamp * 1e3).toISOString()}), collEndDate: ${collEndTimestamp} (${new Date(collEndTimestamp * 1e3).toISOString()}), rtStartHhmm: ${campaign.rtStartHhmm}, rtEndHhmm: ${campaign.rtEndHhmm}, sndDayDiv: ${campaign.sndDayDiv}`);
      }
      let atsFilterStr = "";
      const targetingResult = await db.select().from(targeting).where(eq16(targeting.campaignId, id));
      const campaignTargetingForAts = targetingResult[0];
      console.log("[Submit] Querying targeting table for campaign:", id);
      console.log("[Submit] Found targeting data:", campaignTargetingForAts ? "yes" : "no");
      let filterPayload;
      if (campaignTargetingForAts && (campaignTargetingForAts.gender || campaignTargetingForAts.ageMin || campaignTargetingForAts.ageMax || campaignTargetingForAts.regions && campaignTargetingForAts.regions.length > 0 || campaignTargetingForAts.atsQuery)) {
        console.log("[Submit] Building ATS filter from targeting table...");
        const { payload, desc: desc21 } = buildATSFilterFromTargeting({
          gender: campaignTargetingForAts.gender,
          ageMin: campaignTargetingForAts.ageMin,
          ageMax: campaignTargetingForAts.ageMax,
          regions: campaignTargetingForAts.regions,
          atsQuery: campaignTargetingForAts.atsQuery
        });
        filterPayload = payload;
        console.log("[Submit] Built ATS filter from targeting:", JSON.stringify(filterPayload, null, 2));
      } else if (campaign.sndMosuQuery) {
        console.log("[Submit] Using campaign.sndMosuQuery as fallback...");
        const queryString = typeof campaign.sndMosuQuery === "string" ? campaign.sndMosuQuery : JSON.stringify(campaign.sndMosuQuery);
        const { query: convertedQuery, desc: desc21 } = convertLegacySndMosuQuery(queryString);
        try {
          filterPayload = JSON.parse(convertedQuery);
        } catch {
          filterPayload = { "$and": [] };
        }
      } else {
        filterPayload = { "$and": [] };
      }
      const hasFilterConditions = filterPayload["$and"] && filterPayload["$and"].length > 0;
      if (hasFilterConditions) {
        console.log("[Submit] Calling ATS mosu API to get SQL query...");
        console.log("[Submit] Filter payload:", JSON.stringify(filterPayload, null, 2));
        const atsResult = await callATSMosuAPI(filterPayload, useProduction);
        if (atsResult.success && atsResult.query) {
          createPayload.sndMosuQuery = atsResult.query;
          atsFilterStr = atsResult.filterStr;
          console.log("[Submit] sndMosuQuery (SQL from ATS):", atsResult.query.substring(0, 200) + "...");
          console.log("[Submit] ATS count:", atsResult.count);
        } else {
          console.error("[Submit] ATS mosu API failed:", atsResult.error);
          return res.status(400).json({
            error: `ATS \uD0C0\uAC9F\uD305 \uC870\uD68C \uC2E4\uD328: ${atsResult.error || "Unknown error"}`,
            hint: "ATS \uBC1C\uC1A1 \uBAA8\uC218 API \uD638\uCD9C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694."
          });
        }
      } else {
        console.log("[Submit] No ATS filter conditions, skipping ATS mosu API call");
      }
      if (atsFilterStr || campaign.sndMosuDesc) {
        const desc21 = atsFilterStr || campaign.sndMosuDesc || "";
        const isHtml = desc21.startsWith("<html>") || desc21.includes("<body>") || desc21.includes("<table>");
        createPayload.sndMosuDesc = isHtml ? desc21 : `<html><body><p>${desc21}</p></body></html>`;
        console.log("[Submit] sndMosuDesc:", createPayload.sndMosuDesc?.toString().substring(0, 200) + "...");
      }
      if (adjustedSendDate && !isMapticsCampaign) {
        const adjustedTimestamp = toUnixTimestamp(
          typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate
        );
        createPayload.atsSndStartDate = adjustedTimestamp;
        console.log("[Submit] atsSndStartDate (adjusted):", adjustedTimestamp, new Date((adjustedTimestamp || 0) * 1e3).toISOString());
      }
      if (isRcs) {
        const slideCount = rcsSlide ? 1 : 0;
        let validRcsType;
        if (campaign.rcsType !== null && campaign.rcsType !== void 0 && campaign.rcsType >= 0 && campaign.rcsType <= 5) {
          if (billingType === 3 && campaign.rcsType !== 1) {
            validRcsType = 1;
            console.log(`[Submit] rcsType ${campaign.rcsType} incompatible with billingType=3 (RCS LMS), overriding to 1 (LMS)`);
          } else if (billingType === 1 && campaign.rcsType === 1) {
            validRcsType = 4;
            console.log(`[Submit] rcsType 1 (LMS) incompatible with billingType=1 (RCS MMS), overriding to 4 (\uC774\uBBF8\uC9C0\uAC15\uC870B)`);
          } else {
            validRcsType = campaign.rcsType;
            console.log(`[Submit] Using campaign rcsType: ${validRcsType}`);
          }
        } else {
          validRcsType = billingType === 1 ? 4 : 1;
          console.log(`[Submit] Auto-determined rcsType from billingType=${billingType}: ${validRcsType} (4=\uC774\uBBF8\uC9C0\uAC15\uC870B, 1=LMS)`);
        }
        createPayload.rcsType = validRcsType;
        console.log(`[Submit] RCS type set to: ${validRcsType} (campaign.rcsType: ${campaign.rcsType}, billingType: ${billingType}, slides: ${slideCount})`);
        if (validRcsType === 2) {
          createPayload.slideCnt = slideCount || 1;
        }
      }
      console.log("[Submit] Creating campaign in BizChat...");
      console.log("[Submit] Full createPayload:", JSON.stringify(createPayload, null, 2));
      const createResult = await callBizChatAPI("/api/v1/cmpn/create", "POST", createPayload, useProduction);
      if (createResult.data.code !== "S000001") {
        console.error("[Submit] BizChat API error:", createResult.data);
        return res.status(400).json({
          error: `BizChat \uCEA0\uD398\uC778 \uC0DD\uC131 \uC2E4\uD328: ${createResult.data.msg || createResult.data.code}`,
          bizchatCode: createResult.data.code,
          bizchatMsg: createResult.data.msg,
          response: createResult.data
        });
      }
      const bizchatCampaignId = createResult.data.data?.id;
      if (!bizchatCampaignId) {
        return res.status(400).json({
          error: "BizChat did not return campaign ID",
          response: createResult.data
        });
      }
      const updateData = {
        bizchatCampaignId,
        statusCode: 0,
        status: "temp_registered",
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (adjustedSendDate) {
        updateData.atsSndStartDate = typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate;
        updateData.scheduledAt = updateData.atsSndStartDate;
      }
      await db.update(campaigns9).set(updateData).where(eq16(campaigns9.id, id));
      console.log(`[Submit] Created BizChat campaign: ${bizchatCampaignId}`);
      campaign.bizchatCampaignId = bizchatCampaignId;
    } else {
      let billingType = 0;
      const hasImage = !!message?.imageUrl;
      if (campaign.messageType === "RCS") {
        billingType = hasImage ? 1 : 3;
      } else if (campaign.messageType === "MMS" || hasImage) {
        billingType = 2;
      }
      const isRcs = billingType === 1 || billingType === 3;
      const needsFile = billingType === 1 || billingType === 2;
      let updateImageFileId = null;
      let updateLmsImageFileIdResolved = null;
      const updateUploadImageHelper = async (imgUrl, rcsFlag, label) => {
        if (imgUrl.startsWith("data:")) {
          console.log(`[Submit Update] ${label} image is base64, uploading to BizChat file API (rcs=${rcsFlag})...`);
          try {
            const host = req.headers.host || process.env.VERCEL_URL || "localhost:5000";
            const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
            const protocol = req.headers["x-forwarded-proto"] || (isLocalhost ? "http" : "https");
            const baseUrlForUpload = `${protocol}://${host}`;
            const mimeMatch = imgUrl.match(/^data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const extMatch = mimeType.match(/image\/(\w+)/);
            const ext = extMatch ? extMatch[1] : "jpg";
            const fileName = `campaign_${id}_${label}_${Date.now()}.${ext}`;
            const uploadResponse = await fetch(`${baseUrlForUpload}/api/bizchat/file`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...req.headers.authorization ? { "Authorization": req.headers.authorization } : {},
                ...req.headers["x-impersonate-token"] ? { "X-Impersonate-Token": req.headers["x-impersonate-token"] } : {},
                ...req.headers["x-impersonate-user-id"] ? { "X-Impersonate-User-Id": req.headers["x-impersonate-user-id"] } : {}
              },
              body: JSON.stringify({
                fileData: imgUrl,
                fileName,
                fileType: mimeType,
                type: 2,
                rcs: rcsFlag
              })
            });
            const uploadResult = await uploadResponse.json();
            if (uploadResult.success && uploadResult.fileId) {
              console.log(`[Submit Update] ${label} image uploaded successfully, fileId: ${uploadResult.fileId}`);
              return uploadResult.fileId;
            } else {
              console.error(`[Submit Update] ${label} image upload failed:`, uploadResult);
              return null;
            }
          } catch (uploadError) {
            console.error(`[Submit Update] ${label} image upload error:`, uploadError);
            return null;
          }
        } else {
          console.log(`[Submit Update] ${label} using existing image reference: ${imgUrl.substring(0, 50)}...`);
          return imgUrl;
        }
      };
      if (needsFile && message?.imageUrl) {
        const rcsFlag = isRcs ? 1 : 0;
        const result = await updateUploadImageHelper(message.imageUrl, rcsFlag, isRcs ? "RCS" : "MMS");
        if (result) {
          updateImageFileId = result;
        } else {
          return res.status(400).json({
            error: "\uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."
          });
        }
      }
      if (isRcs && needsFile) {
        const lmsImgUrl = message?.lmsImageUrl;
        const lmsImgFileId = message?.lmsImageFileId;
        if (lmsImgFileId) {
          updateLmsImageFileIdResolved = lmsImgFileId;
          console.log(`[Submit Update] Using existing LMS fallback imageFileId: ${updateLmsImageFileIdResolved}`);
        } else if (lmsImgUrl) {
          const result = await updateUploadImageHelper(lmsImgUrl, 0, "LMS_fallback");
          if (result) {
            updateLmsImageFileIdResolved = result;
          } else {
            console.warn("[Submit Update] LMS fallback image upload failed, MMS will have no image");
          }
        } else {
          console.log("[Submit Update] No LMS fallback image provided, MMS fallback will have no image");
        }
      }
      const sndGoalCnt2 = campaign.sndGoalCnt || campaign.targetCount || 1e3;
      const sndMosu = campaign.sndMosu || Math.ceil(sndGoalCnt2 * 1.5);
      console.log(`[Submit Update] Using sndMosu: ${sndMosu.toLocaleString()} (from ${campaign.sndMosu ? "campaign" : "calculated"})`);
      const updateParsedUrlLinks = typeof message?.urlLinks === "string" ? JSON.parse(message.urlLinks) : message?.urlLinks;
      const updateRcsUrlList = updateParsedUrlLinks?.list || message?.urls || [];
      const updateRcsUrlReward = updateParsedUrlLinks?.reward;
      const updateLmsUrlLinksData = typeof message?.lmsUrlLinks === "string" ? JSON.parse(message.lmsUrlLinks) : message?.lmsUrlLinks;
      const updateLmsUrlList = updateLmsUrlLinksData?.list || [];
      const updateLmsUrlReward = updateLmsUrlLinksData?.reward;
      const updateParsedButtons = typeof message?.buttons === "string" ? JSON.parse(message.buttons) : message?.buttons;
      const updateRcsButtons = updateParsedButtons?.list || message?.rcsButtons || [];
      const updateHasLmsContent = !!message?.lmsContent?.trim();
      const updateUseLmsFallback = isRcs && updateHasLmsContent;
      const updateFallbackContent = isRcs ? message?.lmsContent || message?.content || "" : message?.content || "";
      const updateMmsTitle = isRcs ? message?.lmsTitle?.trim() || message?.title?.trim() || updateFallbackContent.split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0" : message?.title?.trim() || (message?.content || "").split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0";
      const updateMmsUrlList = isRcs ? updateUseLmsFallback ? updateLmsUrlList : updateRcsUrlList : updateRcsUrlList;
      const updateMmsUrlReward = isRcs ? updateUseLmsFallback ? updateLmsUrlReward : updateRcsUrlReward : updateRcsUrlReward;
      const updateMmsImageFileId = isRcs ? updateUseLmsFallback ? updateLmsImageFileIdResolved : updateImageFileId : updateImageFileId;
      if (isRcs) {
        console.log(`[Submit Update] RCS campaign MMS fallback mode: ${updateUseLmsFallback ? "SEPARATE (lms* fields)" : "UNIFIED (using RCS fields as fallback)"}`);
        console.log(`[Submit Update] MMS fallback details: lmsContent=${updateHasLmsContent}, fallbackContent length=${updateFallbackContent.length}, mmsImageFileId=${updateMmsImageFileId}, mmsUrlLinks=${updateMmsUrlList.length} urls`);
      }
      const updateRawMmsTitle = updateMmsTitle;
      const updateMmsTitlePrefixed = truncateTitle(ensureAdPrefix(updateRawMmsTitle));
      const updateMmsMsg = updateFallbackContent;
      const updateMmsObject = {
        title: updateMmsTitlePrefixed,
        msg: updateMmsMsg,
        ...needsFile && updateMmsImageFileId && { fileInfo: { list: [{ origId: updateMmsImageFileId }] } },
        ...message?.urlFile && { urlFile: message.urlFile },
        ...updateMmsUrlList.length > 0 && { urlLink: { list: updateMmsUrlList.slice(0, 3), ...updateMmsUrlReward !== void 0 && { reward: updateMmsUrlReward } } }
      };
      const updateEffectiveRcsType = campaign.rcsType !== null && campaign.rcsType !== void 0 && campaign.rcsType >= 0 && campaign.rcsType <= 5 ? campaign.rcsType : billingType === 1 ? 4 : 1;
      console.log(`[Submit Update] effectiveRcsType for slideNum check: ${updateEffectiveRcsType}`);
      const shouldIncludeUpdateRcsArray = isRcs;
      console.log(`[Submit Update] shouldIncludeRcsArray: ${shouldIncludeUpdateRcsArray}, effectiveRcsType: ${updateEffectiveRcsType}`);
      const updateRcsTitle = truncateTitle(message?.title?.trim() || (message?.content || "").split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0");
      const updateRcsMsg = message?.content || "";
      const updateRcsSlide = shouldIncludeUpdateRcsArray ? {
        slideNum: 1,
        title: updateRcsTitle,
        msg: updateRcsMsg,
        ...needsFile && updateImageFileId && { imgOrigId: updateImageFileId },
        ...message?.rcsUrlFile && { urlFile: message.rcsUrlFile },
        ...updateRcsUrlList.length > 0 && { urlLink: { list: updateRcsUrlList.slice(0, 3), ...updateRcsUrlReward !== void 0 && { reward: updateRcsUrlReward } } },
        ...updateRcsButtons.length > 0 && {
          buttons: { list: updateRcsButtons.map((btn) => ({
            ...btn,
            type: String(btn.type),
            val2: btn.val2 ?? ""
          })) }
        },
        opts: message?.rcsOpts || {}
      } : null;
      const updateRcvTypeForPayload = campaign.rcvType ?? 0;
      const updateIsMapticsCampaign = updateRcvTypeForPayload === 1 || updateRcvTypeForPayload === 2;
      const updatePayload = {
        name: campaign.name,
        tgtCompanyName: campaign.tgtCompanyName || "\uC704\uD53D",
        sndNum: campaign.sndNum,
        rcvType: updateRcvTypeForPayload,
        sndGoalCnt: sndGoalCnt2,
        billingType,
        settleCnt: campaign.settleCnt ?? sndGoalCnt2,
        // ATS 전용 필드: Maptics 캠페인에서는 제외 (E000001 오류 방지)
        ...!updateIsMapticsCampaign && { sndMosu },
        ...!updateIsMapticsCampaign && { sndMosuFlag: 0 },
        isTmp: 0,
        // 필수 필드: 임시저장 여부 (0=아니오, 1=예) - BizChat API 규격: number 타입만 허용
        mms: updateMmsObject,
        // RCS 타입일 때만 rcs 배열 포함 (빈 배열 생략 - E000002 방지)
        ...updateRcsSlide && { rcs: [updateRcsSlide] }
      };
      console.log(`[Submit Update] Final payload check - has rcs array: ${"rcs" in updatePayload}, effectiveRcsType: ${updateEffectiveRcsType}`);
      const updateRcvType = campaign.rcvType ?? 0;
      if (updateRcvType === 1 || updateRcvType === 2) {
        if (campaign.rtStartHhmm) {
          updatePayload.rtStartHhmm = campaign.rtStartHhmm;
        }
        if (campaign.rtEndHhmm) {
          updatePayload.rtEndHhmm = campaign.rtEndHhmm;
        }
        if (campaign.sndDayDiv !== null && campaign.sndDayDiv !== void 0) {
          updatePayload.sndDayDiv = campaign.sndDayDiv;
        }
        let updateBizchatGeofenceId = campaign.sndGeofenceId || null;
        if (!updateBizchatGeofenceId) {
          console.log("[Submit Update] No sndGeofenceId found, looking up geofences from targeting table...");
          const targetingResult = await db.select().from(targeting).where(eq16(targeting.campaignId, id));
          const campaignTargeting = targetingResult[0];
          if (campaignTargeting?.geofenceIds?.length) {
            console.log("[Submit Update] Found geofenceIds in targeting:", campaignTargeting.geofenceIds);
            const geofenceResult = await db.select().from(geofences).where(
              eq16(geofences.id, campaignTargeting.geofenceIds[0])
            );
            const geofence = geofenceResult[0];
            if (geofence) {
              if (geofence.bizchatGeofenceId) {
                updateBizchatGeofenceId = parseInt(geofence.bizchatGeofenceId, 10);
                console.log("[Submit Update] Reusing existing bizchatGeofenceId:", updateBizchatGeofenceId);
              } else {
                const geofenceTargets = [{
                  gender: 0,
                  minAge: 0,
                  maxAge: 100,
                  stayMin: 30,
                  radius: geofence.radius || 500,
                  address: geofence.name,
                  lat: geofence.latitude,
                  lon: geofence.longitude
                }];
                const geofenceCreateResult = await createBizChatGeofence(
                  `${campaign.name}_geofence_${Date.now()}`,
                  geofenceTargets,
                  useProduction
                );
                if (geofenceCreateResult.success && geofenceCreateResult.geofenceId) {
                  updateBizchatGeofenceId = geofenceCreateResult.geofenceId;
                  console.log("[Submit Update] BizChat geofence created, ID:", updateBizchatGeofenceId);
                  await Promise.all([
                    db.update(campaigns9).set({ sndGeofenceId: updateBizchatGeofenceId, updatedAt: /* @__PURE__ */ new Date() }).where(eq16(campaigns9.id, id)),
                    db.update(geofences).set({ bizchatGeofenceId: String(updateBizchatGeofenceId) }).where(eq16(geofences.id, geofence.id))
                  ]);
                } else {
                  console.error("[Submit Update] Failed to create BizChat geofence:", geofenceCreateResult.error);
                  return res.status(400).json({
                    error: `\uC9C0\uC624\uD39C\uC2A4 \uC0DD\uC131 \uC2E4\uD328: ${geofenceCreateResult.error}`,
                    code: "E100012"
                  });
                }
              }
              await db.update(campaigns9).set({ sndGeofenceId: updateBizchatGeofenceId, updatedAt: /* @__PURE__ */ new Date() }).where(eq16(campaigns9.id, id));
            } else {
              console.error("[Submit Update] Geofence not found in DB");
              return res.status(400).json({
                error: "\uC9C0\uC624\uD39C\uC2A4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
                code: "E100012"
              });
            }
          } else {
            console.error("[Submit Update] No geofenceIds found in targeting");
            return res.status(400).json({
              error: "\uC9C0\uC624\uD39C\uC2A4 \uCEA0\uD398\uC778\uC5D0 \uC9C0\uC624\uD39C\uC2A4 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
              code: "E100012"
            });
          }
        }
        updatePayload.sndGeofenceId = updateBizchatGeofenceId;
        let updateScheduledSendTimestamp;
        if (adjustedSendDate) {
          updateScheduledSendTimestamp = toUnixTimestamp(typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate);
        } else if (campaign.scheduledAt) {
          updateScheduledSendTimestamp = toUnixTimestamp(new Date(campaign.scheduledAt));
        } else if (campaign.atsSndStartDate) {
          updateScheduledSendTimestamp = typeof campaign.atsSndStartDate === "number" ? campaign.atsSndStartDate : toUnixTimestamp(new Date(campaign.atsSndStartDate));
        } else {
          updateScheduledSendTimestamp = toUnixTimestamp(/* @__PURE__ */ new Date()) + 86400;
        }
        const updateNowTimestamp = toUnixTimestamp(/* @__PURE__ */ new Date());
        const updateScheduledDate = new Date(updateScheduledSendTimestamp * 1e3);
        const updateKstOffset = 9 * 60 * 60 * 1e3;
        const updateKstDate = new Date(updateScheduledDate.getTime() + updateKstOffset);
        const updateYear = updateKstDate.getUTCFullYear();
        const updateMonth = updateKstDate.getUTCMonth();
        const updateDay = updateKstDate.getUTCDate();
        console.log(`[Submit Update] Maptics coll* calculation - scheduledSendTimestamp: ${updateScheduledSendTimestamp} (${updateScheduledDate.toISOString()}), KST date: ${updateYear}-${updateMonth + 1}-${updateDay}`);
        let updateCollStartTimestamp;
        let updateCollEndTimestamp;
        if (updateRcvType === 1 && campaign.rtStartHhmm && campaign.rtEndHhmm) {
          const rtStartClean = String(campaign.rtStartHhmm).replace(/\D/g, "").padStart(4, "0");
          const rtEndClean = String(campaign.rtEndHhmm).replace(/\D/g, "").padStart(4, "0");
          if (rtStartClean.length < 4 || rtEndClean.length < 4) {
            console.error(`[Submit Update] Invalid rtHhmm format`);
            return res.status(400).json({
              error: "\uBC1C\uC1A1 \uC2DC\uAC04 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
              code: "E100015",
              hint: "\uBC1C\uC1A1 \uC2DC\uAC04\uC740 HHMM \uD615\uC2DD(\uC608: 1500)\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694."
            });
          }
          const rtStartHour = parseInt(rtStartClean.substring(0, 2), 10);
          const rtStartMin = parseInt(rtStartClean.substring(2, 4), 10);
          const rtEndHour = parseInt(rtEndClean.substring(0, 2), 10);
          const rtEndMin = parseInt(rtEndClean.substring(2, 4), 10);
          if (isNaN(rtStartHour) || isNaN(rtStartMin) || isNaN(rtEndHour) || isNaN(rtEndMin)) {
            console.error(`[Submit Update] NaN in rtHhmm parsing`);
            return res.status(400).json({
              error: "\uBC1C\uC1A1 \uC2DC\uAC04 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
              code: "E100015",
              hint: "\uBC1C\uC1A1 \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694."
            });
          }
          const updateRtStartUtcMs = Date.UTC(updateYear, updateMonth, updateDay, rtStartHour - 9, rtStartMin, 0);
          const updateRtStartTimestamp = Math.floor(updateRtStartUtcMs / 1e3);
          let updateRtEndUtcMs = Date.UTC(updateYear, updateMonth, updateDay, rtEndHour - 9, rtEndMin, 0);
          let updateRtEndTimestamp = Math.floor(updateRtEndUtcMs / 1e3);
          if (updateRtEndTimestamp <= updateRtStartTimestamp) {
            updateRtEndTimestamp += 86400;
            console.log(`[Submit Update] Cross-midnight detected: rtEnd adjusted to next day`);
          }
          updateCollStartTimestamp = updateRtStartTimestamp;
          updateCollEndTimestamp = updateRtEndTimestamp + 1800;
          console.log(`[Submit Update] rcvType=1: rtStart=${rtStartHour}:${rtStartMin}, rtEnd=${rtEndHour}:${rtEndMin}`);
          console.log(`[Submit Update] rtStartTimestamp: ${updateRtStartTimestamp} (${new Date(updateRtStartTimestamp * 1e3).toISOString()})`);
          console.log(`[Submit Update] rtEndTimestamp: ${updateRtEndTimestamp} (${new Date(updateRtEndTimestamp * 1e3).toISOString()})`);
          console.log(`[Submit Update] Calculated collStart: ${new Date(updateCollStartTimestamp * 1e3).toISOString()}, collEnd: ${new Date(updateCollEndTimestamp * 1e3).toISOString()}`);
          if (updateNowTimestamp > updateRtStartTimestamp) {
            console.error(`[Submit Update] Cannot submit: rtStart already passed`);
            return res.status(400).json({
              error: "\uBC1C\uC1A1 \uC2DC\uC791 \uC2DC\uAC04\uC774 \uC774\uBBF8 \uC9C0\uB0AC\uC2B5\uB2C8\uB2E4",
              code: "E100015",
              hint: `\uBC1C\uC1A1 \uC2DC\uC791 \uC2DC\uAC04(${rtStartHour}:${String(rtStartMin).padStart(2, "0")})\uC774 \uD604\uC7AC \uC2DC\uAC04\uBCF4\uB2E4 \uC774\uD6C4\uC5EC\uC57C \uD569\uB2C8\uB2E4.`
            });
          }
          if (updateCollStartTimestamp <= updateNowTimestamp) {
            updateCollStartTimestamp = Math.min(updateNowTimestamp + 60, updateRtStartTimestamp);
            console.log("[Submit Update] collStartDate adjusted to future:", new Date(updateCollStartTimestamp * 1e3).toISOString());
          }
        } else {
          if (campaign.collStartDate) {
            updateCollStartTimestamp = toUnixTimestamp(new Date(campaign.collStartDate));
            if (updateCollStartTimestamp <= updateNowTimestamp) {
              updateCollStartTimestamp = updateNowTimestamp + 3600;
              console.log("[Submit Update] collStartDate adjusted to future:", new Date(updateCollStartTimestamp * 1e3).toISOString());
            }
          } else {
            const sendMinus1Day = updateScheduledSendTimestamp - 86400;
            const nowPlus1Hour = updateNowTimestamp + 3600;
            updateCollStartTimestamp = Math.max(nowPlus1Hour, sendMinus1Day);
            if (updateCollStartTimestamp >= updateScheduledSendTimestamp) {
              updateCollStartTimestamp = nowPlus1Hour;
            }
          }
          if (campaign.collEndDate) {
            updateCollEndTimestamp = toUnixTimestamp(new Date(campaign.collEndDate));
            if (updateCollEndTimestamp <= updateCollStartTimestamp) {
              updateCollEndTimestamp = updateScheduledSendTimestamp;
            }
          } else {
            updateCollEndTimestamp = updateScheduledSendTimestamp;
          }
        }
        updatePayload.collStartDate = updateCollStartTimestamp;
        updatePayload.collEndDate = updateCollEndTimestamp;
        if (updateRcvType === 2) {
          let updateCollSndTimestamp;
          if (campaign.collSndDate) {
            updateCollSndTimestamp = toUnixTimestamp(new Date(campaign.collSndDate));
          } else {
            updateCollSndTimestamp = updateScheduledSendTimestamp;
          }
          updatePayload.collSndDate = updateCollSndTimestamp;
        }
        console.log(`[Submit Update] Maptics campaign fields - rcvType: ${updateRcvType}, sndGeofenceId: ${updateBizchatGeofenceId}, collStartDate: ${updateCollStartTimestamp} (${new Date(updateCollStartTimestamp * 1e3).toISOString()}), collEndDate: ${updateCollEndTimestamp} (${new Date(updateCollEndTimestamp * 1e3).toISOString()}), rtStartHhmm: ${campaign.rtStartHhmm}, rtEndHhmm: ${campaign.rtEndHhmm}, sndDayDiv: ${campaign.sndDayDiv}`);
      }
      if (adjustedSendDate && !updateIsMapticsCampaign) {
        updatePayload.atsSndStartDate = toUnixTimestamp(
          typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate
        );
      }
      if (isRcs) {
        const updateSlideCount = updateRcsSlide ? 1 : 0;
        let validRcsType;
        if (campaign.rcsType !== null && campaign.rcsType !== void 0 && campaign.rcsType >= 0 && campaign.rcsType <= 5) {
          if (billingType === 3 && campaign.rcsType !== 1) {
            validRcsType = 1;
            console.log(`[Submit Update] rcsType ${campaign.rcsType} incompatible with billingType=3 (RCS LMS), overriding to 1 (LMS)`);
          } else if (billingType === 1 && campaign.rcsType === 1) {
            validRcsType = 4;
            console.log(`[Submit Update] rcsType 1 (LMS) incompatible with billingType=1 (RCS MMS), overriding to 4 (\uC774\uBBF8\uC9C0\uAC15\uC870B)`);
          } else {
            validRcsType = campaign.rcsType;
            console.log(`[Submit Update] Using campaign rcsType: ${validRcsType}`);
          }
        } else {
          validRcsType = billingType === 1 ? 4 : 1;
          console.log(`[Submit Update] Auto-determined rcsType from billingType=${billingType}: ${validRcsType} (4=\uC774\uBBF8\uC9C0\uAC15\uC870B, 1=LMS)`);
        }
        updatePayload.rcsType = validRcsType;
        console.log(`[Submit Update] RCS type set to: ${validRcsType} (campaign.rcsType: ${campaign.rcsType}, billingType: ${billingType}, slides: ${updateSlideCount})`);
        if (validRcsType === 2) {
          updatePayload.slideCnt = updateSlideCount || 1;
        }
      }
      let updateAtsFilterStr = "";
      const updateTargetingResult = await db.select().from(targeting).where(eq16(targeting.campaignId, id));
      const updateCampaignTargeting = updateTargetingResult[0];
      console.log("[Submit Update] Querying targeting table for campaign:", id);
      console.log("[Submit Update] Found targeting data:", updateCampaignTargeting ? "yes" : "no");
      let updateFilterPayload;
      if (updateCampaignTargeting && (updateCampaignTargeting.gender || updateCampaignTargeting.ageMin || updateCampaignTargeting.ageMax || updateCampaignTargeting.regions && updateCampaignTargeting.regions.length > 0 || updateCampaignTargeting.atsQuery)) {
        console.log("[Submit Update] Building ATS filter from targeting table...");
        const { payload, desc: desc21 } = buildATSFilterFromTargeting({
          gender: updateCampaignTargeting.gender,
          ageMin: updateCampaignTargeting.ageMin,
          ageMax: updateCampaignTargeting.ageMax,
          regions: updateCampaignTargeting.regions,
          atsQuery: updateCampaignTargeting.atsQuery
        });
        updateFilterPayload = payload;
        console.log("[Submit Update] Built ATS filter from targeting:", JSON.stringify(updateFilterPayload, null, 2));
      } else if (campaign.sndMosuQuery) {
        console.log("[Submit Update] Using campaign.sndMosuQuery as fallback...");
        const queryString = typeof campaign.sndMosuQuery === "string" ? campaign.sndMosuQuery : JSON.stringify(campaign.sndMosuQuery);
        const convertResult = convertLegacySndMosuQuery(queryString);
        if (convertResult.isLegacySql) {
          console.log("[Submit Update] Using legacy SQL query directly (skipping ATS mosu API)");
          updatePayload.sndMosuQuery = convertResult.query;
          updateAtsFilterStr = campaign.sndMosuDesc || "";
          updateFilterPayload = { "$and": [] };
        } else {
          try {
            updateFilterPayload = JSON.parse(convertResult.query);
          } catch {
            updateFilterPayload = { "$and": [] };
          }
        }
      } else {
        updateFilterPayload = { "$and": [] };
      }
      const updateHasConditions = updateFilterPayload["$and"] && updateFilterPayload["$and"].length > 0;
      if (updateHasConditions) {
        console.log("[Submit Update] Calling ATS mosu API to get SQL query...");
        console.log("[Submit Update] Filter payload:", JSON.stringify(updateFilterPayload, null, 2));
        const atsResult = await callATSMosuAPI(updateFilterPayload, useProduction);
        if (atsResult.success && atsResult.query) {
          updatePayload.sndMosuQuery = atsResult.query;
          updateAtsFilterStr = atsResult.filterStr;
          console.log("[Submit Update] sndMosuQuery (SQL from ATS):", atsResult.query.substring(0, 200) + "...");
        } else {
          console.error("[Submit Update] ATS mosu API failed:", atsResult.error);
          return res.status(400).json({
            error: `ATS \uD0C0\uAC9F\uD305 \uC870\uD68C \uC2E4\uD328: ${atsResult.error || "Unknown error"}`,
            hint: "ATS \uBC1C\uC1A1 \uBAA8\uC218 API \uD638\uCD9C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694."
          });
        }
      } else {
        console.log("[Submit Update] No ATS filter conditions, skipping ATS mosu API call");
      }
      if (updateAtsFilterStr || campaign.sndMosuDesc) {
        const desc21 = updateAtsFilterStr || campaign.sndMosuDesc || "";
        const isHtml = desc21.startsWith("<html>") || desc21.includes("<body>") || desc21.includes("<table>");
        updatePayload.sndMosuDesc = isHtml ? desc21 : `<html><body><p>${desc21}</p></body></html>`;
      }
      console.log("[Submit] Updating existing BizChat campaign...");
      console.log("[Submit] Update payload:", JSON.stringify(updatePayload, null, 2));
      const updateResult = await callBizChatAPI(
        `/api/v1/cmpn/update?id=${campaign.bizchatCampaignId}`,
        "POST",
        updatePayload,
        useProduction
      );
      if (updateResult.data.code !== "S000001") {
        console.warn("[Submit] BizChat update warning:", updateResult.data);
      } else {
        console.log("[Submit] BizChat campaign updated successfully");
      }
      if (adjustedSendDate) {
        await db.update(campaigns9).set({
          atsSndStartDate: typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate,
          scheduledAt: typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq16(campaigns9.id, id));
      }
    }
    console.log("[Submit] Requesting approval...");
    const approvalResult = await callBizChatAPI(
      `/api/v1/cmpn/appr/req?id=${campaign.bizchatCampaignId}`,
      "POST",
      {},
      useProduction
    );
    if (approvalResult.data.code !== "S000001") {
      console.error("[Submit] Approval request failed:", approvalResult.data);
      return res.status(400).json({
        error: `\uC2B9\uC778 \uC694\uCCAD \uC2E4\uD328: ${approvalResult.data.msg || approvalResult.data.code}`,
        bizchatCode: approvalResult.data.code,
        bizchatMsg: approvalResult.data.msg,
        response: approvalResult.data
      });
    }
    const approvalUpdateData = {
      statusCode: 10,
      status: "approval_requested",
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (adjustedSendDate) {
      approvalUpdateData.scheduledAt = typeof adjustedSendDate === "string" ? new Date(adjustedSendDate) : adjustedSendDate;
      approvalUpdateData.atsSndStartDate = approvalUpdateData.scheduledAt;
    }
    await db.update(campaigns9).set(approvalUpdateData).where(eq16(campaigns9.id, id));
    console.log(`[Submit] Approval requested for campaign: ${id}`);
    return res.status(200).json({
      success: true,
      campaignId: id,
      bizchatCampaignId: campaign.bizchatCampaignId,
      statusCode: 10,
      status: "approval_requested",
      message: scheduledAt ? `\uCEA0\uD398\uC778\uC774 BizChat\uC5D0 \uB4F1\uB85D\uB418\uC5C8\uACE0, ${new Date(scheduledAt).toLocaleString("ko-KR")}\uC5D0 \uBC1C\uC1A1 \uC608\uC815\uC785\uB2C8\uB2E4.` : "\uCEA0\uD398\uC778\uC774 BizChat\uC5D0 \uB4F1\uB85D\uB418\uC5C8\uACE0, \uC2B9\uC778 \uC694\uCCAD\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
    });
  } catch (error) {
    console.error("[Submit] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/internal/master/reset-balance.ts
var reset_balance_exports = {};
__export(reset_balance_exports, {
  default: () => handler18
});
import { createClient as createClient8 } from "@supabase/supabase-js";
import { neon as neon17 } from "@neondatabase/serverless";
import { drizzle as drizzle17 } from "drizzle-orm/neon-http";
import { eq as eq17 } from "drizzle-orm";

// shared/schema.ts
import { sql as sql10, relations } from "drizzle-orm";
import {
  pgTable as pgTable17,
  text as text12,
  varchar as varchar11,
  timestamp as timestamp15,
  integer as integer11,
  decimal as decimal7,
  boolean as boolean10,
  index,
  jsonb as jsonb8
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var sessions = pgTable17(
  "sessions",
  {
    sid: varchar11("sid").primaryKey(),
    sess: jsonb8("sess").notNull(),
    expire: timestamp15("expire").notNull()
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);
var agencies2 = pgTable17("agencies", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").notNull(),
  // 대행사 계정의 user ID
  name: varchar11("name", { length: 200 }).notNull(),
  // 대행사명
  contactName: varchar11("contact_name", { length: 100 }),
  // 담당자명
  contactPhone: varchar11("contact_phone", { length: 20 }),
  // 담당자 연락처
  contactEmail: varchar11("contact_email", { length: 200 }),
  // 담당자 이메일
  isActive: boolean10("is_active").default(true),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var users9 = pgTable17("users", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  email: varchar11("email").unique(),
  firstName: varchar11("first_name"),
  lastName: varchar11("last_name"),
  profileImageUrl: varchar11("profile_image_url"),
  companyName: varchar11("company_name"),
  businessNumber: varchar11("business_number"),
  representativeName: varchar11("representative_name"),
  phone: varchar11("phone"),
  balance: decimal7("balance", { precision: 12, scale: 0 }).default("0"),
  stripeCustomerId: varchar11("stripe_customer_id"),
  isVerified: boolean10("is_verified").default(false),
  isMaster: boolean10("is_master").default(false),
  masterResetAt: timestamp15("master_reset_at"),
  isAgency: boolean10("is_agency").default(false),
  // 대행사 계정 여부
  agencyId: varchar11("agency_id"),
  // 소속 대행사 ID (하위 광고주 계정에 설정)
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var recommendedTemplates = pgTable17("recommended_templates", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  name: varchar11("name", { length: 200 }).notNull(),
  category: varchar11("category", { length: 50 }).notNull(),
  // 업종
  purpose: varchar11("purpose", { length: 50 }).notNull(),
  // 목적
  version: varchar11("version", { length: 20 }),
  // 버전 (v1, v1.1 등)
  // 메시지 내용 (변수 포함)
  titleTemplate: varchar11("title_template", { length: 60 }),
  lmsTitleTemplate: varchar11("lms_title_template", { length: 60 }),
  contentTemplate: text12("content_template").notNull(),
  lmsContentTemplate: text12("lms_content_template"),
  // RCS 메시지의 안드로이드용 LMS 대체 텍스트 템플릿
  variableSchema: jsonb8("variable_schema").$type(),
  // 이미지 및 메시지 타입
  defaultImageUrl: text12("default_image_url"),
  messageType: varchar11("message_type", { length: 10 }).default("RCS"),
  rcsType: integer11("rcs_type").default(4),
  // 이미지강조B가 기본
  // URL 및 버튼
  urlLinks: jsonb8("url_links").$type(),
  buttons: jsonb8("buttons").$type(),
  // 상태
  isActive: boolean10("is_active").default(true),
  sortOrder: integer11("sort_order").default(0),
  // 원본 템플릿 참조 (선택적)
  sourceTemplateId: varchar11("source_template_id"),
  // 타겟팅 설정 (추천 모드에서 자동 적용)
  targetingConfig: jsonb8("targeting_config").$type(),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var templates2 = pgTable17("templates", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  name: varchar11("name", { length: 200 }).notNull(),
  messageType: varchar11("message_type", { length: 10 }).notNull(),
  // LMS, MMS, RCS
  rcsType: integer11("rcs_type"),
  // 0=스탠다드, 1=LMS, 2=슬라이드, 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
  title: varchar11("title", { length: 60 }),
  lmsTitle: varchar11("lms_title", { length: 60 }),
  content: text12("content").notNull(),
  // RCS 메시지 내용
  lmsContent: text12("lms_content"),
  // LMS fallback 메시지 내용
  imageUrl: text12("image_url"),
  // RCS용 미리보기 이미지 URL
  imageFileId: varchar11("image_file_id", { length: 100 }),
  // RCS용 BizChat 파일 업로드 ID
  lmsImageUrl: text12("lms_image_url"),
  // LMS용 미리보기 이미지 URL
  lmsImageFileId: varchar11("lms_image_file_id", { length: 100 }),
  // LMS용 BizChat 파일 업로드 ID
  urlLinks: jsonb8("url_links").$type(),
  // RCS URL 링크 설정
  lmsUrlLinks: jsonb8("lms_url_links").$type(),
  // LMS URL 링크 설정
  buttons: jsonb8("buttons").$type(),
  // RCS 버튼 설정
  status: varchar11("status", { length: 20 }).default("draft").notNull(),
  // draft, pending, approved, rejected
  rejectionReason: text12("rejection_reason"),
  submittedAt: timestamp15("submitted_at"),
  reviewedAt: timestamp15("reviewed_at"),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var files = pgTable17("files", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  fileType: varchar11("file_type", { length: 20 }).notNull(),
  // image, mdn, coupon
  originalName: varchar11("original_name", { length: 255 }).notNull(),
  storagePath: text12("storage_path").notNull(),
  fileSize: integer11("file_size"),
  mimeType: varchar11("mime_type", { length: 100 }),
  createdAt: timestamp15("created_at").defaultNow()
});
var campaigns10 = pgTable17("campaigns", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  templateId: varchar11("template_id").references(() => templates2.id),
  // 기본 정보
  name: varchar11("name", { length: 200 }).notNull(),
  tgtCompanyName: varchar11("tgt_company_name", { length: 100 }),
  // 고객사명
  statusCode: integer11("status_code").default(0).notNull(),
  // 0=temp_registered, 10=approval_requested, etc
  status: varchar11("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar11("message_type", { length: 10 }).notNull(),
  // LMS, MMS, RCS
  // BizChat API 필수 필드
  rcvType: integer11("rcv_type").default(0),
  // 0=ATS, 1=Maptics실시간, 2=Maptics모아서, 10=직접지정
  billingType: integer11("billing_type").default(0),
  // 0=LMS, 1=RCS MMS, 2=MMS, 3=RCS LMS
  rcsType: integer11("rcs_type"),
  // 0=스탠다드, 1=LMS, 2=슬라이드, 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
  sndNum: varchar11("snd_num", { length: 20 }),
  // 발신번호 코드
  sndGoalCnt: integer11("snd_goal_cnt"),
  // 발송 목표 건수
  sndMosu: integer11("snd_mosu"),
  // ATS 발송 모수
  sndMosuQuery: text12("snd_mosu_query"),
  // ATS 발송 모수 쿼리
  sndMosuDesc: text12("snd_mosu_desc"),
  // ATS 발송 모수 설명
  settleCnt: integer11("settle_cnt").default(0),
  // 정산 건수
  mdnFileId: varchar11("mdn_file_id", { length: 50 }),
  // MDN 파일 ID
  // 발송 일정
  atsSndStartDate: timestamp15("ats_snd_start_date"),
  // ATS 발송 시작 일시 (rcvType=0,10)
  // Maptics 지오펜스 발송 일정 (rcvType=1,2)
  collStartDate: timestamp15("coll_start_date"),
  // 수집 시작 일시
  collEndDate: timestamp15("coll_end_date"),
  // 수집 종료 일시
  collSndDate: timestamp15("coll_snd_date"),
  // 발송 시작 일시 (rcvType=2 모아서 보내기)
  sndGeofenceId: integer11("snd_geofence_id"),
  // 지오펜스 ID
  // Maptics 실시간 보내기 전용 (rcvType=1)
  rtStartHhmm: varchar11("rt_start_hhmm", { length: 4 }),
  // 발송 시작 시간 (HHMM, 0900~1950)
  rtEndHhmm: varchar11("rt_end_hhmm", { length: 4 }),
  // 발송 종료 시간 (HHMM, 0910~2000)
  sndDayDiv: integer11("snd_day_div").default(0),
  // 일 균등 분할 (0: 미분할, 1: 분할)
  // 통계
  targetCount: integer11("target_count").default(0).notNull(),
  sentCount: integer11("sent_count").default(0),
  successCount: integer11("success_count").default(0),
  clickCount: integer11("click_count").default(0),
  // 예산
  budget: decimal7("budget", { precision: 12, scale: 0 }).notNull(),
  costPerMessage: decimal7("cost_per_message", { precision: 10, scale: 0 }).default("100"),
  // BizChat 연동
  bizchatCampaignId: varchar11("bizchat_campaign_id", { length: 100 }),
  // 추천 메시지 관련
  creationMode: varchar11("creation_mode", { length: 20 }),
  // 'recommended' | 'self'
  recommendedTemplateId: varchar11("recommended_template_id"),
  // 추천 템플릿 ID
  variableValues: jsonb8("variable_values"),
  // 변수 입력값 저장
  // 기타
  rejectionReason: text12("rejection_reason"),
  testSentAt: timestamp15("test_sent_at"),
  scheduledAt: timestamp15("scheduled_at"),
  completedAt: timestamp15("completed_at"),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var messages2 = pgTable17("messages", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  campaignId: varchar11("campaign_id").references(() => campaigns10.id).notNull(),
  title: varchar11("title", { length: 60 }),
  lmsTitle: varchar11("lms_title", { length: 60 }),
  content: text12("content").notNull(),
  // RCS 메시지 내용
  lmsContent: text12("lms_content"),
  // LMS fallback 메시지 내용
  imageUrl: text12("image_url"),
  // RCS용 이미지 URL
  imageFileId: varchar11("image_file_id", { length: 100 }),
  // RCS용 BizChat 파일 업로드 ID
  lmsImageUrl: text12("lms_image_url"),
  // LMS용 이미지 URL
  lmsImageFileId: varchar11("lms_image_file_id", { length: 100 }),
  // LMS용 BizChat 파일 업로드 ID
  // RCS URL 링크 및 버튼 (템플릿에서 복사)
  urlLinks: jsonb8("url_links"),
  // RCS용 { list: string[], reward?: number }
  lmsUrlLinks: jsonb8("lms_url_links"),
  // LMS용 { list: string[], reward?: number }
  buttons: jsonb8("buttons"),
  // RCS 버튼 { list: [{ type: '0'|'1'|'2', name: string, val1: string, val2?: string }] }
  createdAt: timestamp15("created_at").defaultNow()
});
var targeting2 = pgTable17("targeting", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  campaignId: varchar11("campaign_id").references(() => campaigns10.id).notNull(),
  // 기본 인구통계 필터 (/ats/meta/filter)
  gender: varchar11("gender", { length: 10 }).default("all"),
  // all, male, female
  ageMin: integer11("age_min"),
  ageMax: integer11("age_max"),
  regions: text12("regions").array(),
  // 시/도
  districts: text12("districts").array(),
  // 시/군/구
  // 회선 정보 필터 (/ats/meta/filter)
  carrierTypes: text12("carrier_types").array(),
  // 통신사 유형: lte, 5g 등
  deviceTypes: text12("device_types").array(),
  // 기기 유형: android, ios 등
  // 11번가 쇼핑 행동 (/ats/meta/11st)
  shopping11stCategories: text12("shopping_11st_categories").array(),
  // 11번가 카테고리 코드
  // 웹앱 사용 행동 (/ats/meta/webapp)
  webappCategories: text12("webapp_categories").array(),
  // 웹앱 카테고리 코드
  // 통화 Usage 패턴 (/ats/meta/call)
  callUsageTypes: text12("call_usage_types").array(),
  // 통화 사용 패턴 코드
  // 위치/이동 특성 (/ats/meta/loc)
  locationTypes: text12("location_types").array(),
  // 위치 특성 코드
  mobilityPatterns: text12("mobility_patterns").array(),
  // 이동 패턴 코드
  // Maptics 지오펜스 (/maptics/*)
  geofenceIds: text12("geofence_ids").array(),
  // 지오펜스 ID 목록
  // ATS 쿼리 결과 (발송 모수 조회 결과 저장)
  atsQuery: text12("ats_query"),
  // ATS 쿼리 JSON
  estimatedCount: integer11("estimated_count"),
  // 예상 타겟 수
  createdAt: timestamp15("created_at").defaultNow()
});
var geofences2 = pgTable17("geofences", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  name: varchar11("name", { length: 100 }).notNull(),
  description: text12("description"),
  // 지오펜스 좌표 정보
  latitude: decimal7("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal7("longitude", { precision: 10, scale: 7 }).notNull(),
  radius: integer11("radius").default(500),
  // 반경 (미터)
  // POI 정보
  poiId: varchar11("poi_id", { length: 100 }),
  // Maptics POI ID
  poiName: varchar11("poi_name", { length: 200 }),
  poiCategory: varchar11("poi_category", { length: 100 }),
  // BizChat 연동
  bizchatGeofenceId: varchar11("bizchat_geofence_id", { length: 100 }),
  isActive: boolean10("is_active").default(true),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var atsMetaCache = pgTable17("ats_meta_cache", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  metaType: varchar11("meta_type", { length: 50 }).notNull(),
  // 11st, webapp, call, loc, filter
  categoryCode: varchar11("category_code", { length: 50 }),
  categoryName: varchar11("category_name", { length: 200 }),
  parentCode: varchar11("parent_code", { length: 50 }),
  level: integer11("level").default(1),
  metadata: jsonb8("metadata"),
  // 추가 메타데이터
  isActive: boolean10("is_active").default(true),
  lastSyncAt: timestamp15("last_sync_at").defaultNow(),
  createdAt: timestamp15("created_at").defaultNow()
});
var transactions5 = pgTable17("transactions", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  type: varchar11("type", { length: 20 }).notNull(),
  // charge, usage, refund
  amount: decimal7("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal7("balance_after", { precision: 12, scale: 0 }).notNull(),
  description: text12("description"),
  paymentMethod: varchar11("payment_method", { length: 50 }),
  stripeSessionId: varchar11("stripe_session_id", { length: 255 }).unique(),
  createdAt: timestamp15("created_at").defaultNow()
});
var reports = pgTable17("reports", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  campaignId: varchar11("campaign_id").references(() => campaigns10.id).notNull(),
  sentCount: integer11("sent_count").default(0),
  deliveredCount: integer11("delivered_count").default(0),
  successCount: integer11("success_count").default(0),
  failedCount: integer11("failed_count").default(0),
  clickCount: integer11("click_count").default(0),
  optOutCount: integer11("opt_out_count").default(0),
  conversionRate: decimal7("conversion_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var usersRelations = relations(users9, ({ many }) => ({
  campaigns: many(campaigns10),
  templates: many(templates2),
  transactions: many(transactions5),
  files: many(files),
  geofences: many(geofences2)
}));
var filesRelations = relations(files, ({ one }) => ({
  user: one(users9, {
    fields: [files.userId],
    references: [users9.id]
  })
}));
var templatesRelations = relations(templates2, ({ one, many }) => ({
  user: one(users9, {
    fields: [templates2.userId],
    references: [users9.id]
  }),
  campaigns: many(campaigns10)
}));
var campaignsRelations = relations(campaigns10, ({ one, many }) => ({
  user: one(users9, {
    fields: [campaigns10.userId],
    references: [users9.id]
  }),
  template: one(templates2, {
    fields: [campaigns10.templateId],
    references: [templates2.id]
  }),
  messages: many(messages2),
  targeting: one(targeting2),
  reports: many(reports)
}));
var messagesRelations = relations(messages2, ({ one }) => ({
  campaign: one(campaigns10, {
    fields: [messages2.campaignId],
    references: [campaigns10.id]
  })
}));
var targetingRelations = relations(targeting2, ({ one }) => ({
  campaign: one(campaigns10, {
    fields: [targeting2.campaignId],
    references: [campaigns10.id]
  })
}));
var transactionsRelations = relations(transactions5, ({ one }) => ({
  user: one(users9, {
    fields: [transactions5.userId],
    references: [users9.id]
  })
}));
var reportsRelations = relations(reports, ({ one }) => ({
  campaign: one(campaigns10, {
    fields: [reports.campaignId],
    references: [campaigns10.id]
  })
}));
var geofencesRelations = relations(geofences2, ({ one }) => ({
  user: one(users9, {
    fields: [geofences2.userId],
    references: [users9.id]
  })
}));
var agenciesRelations = relations(agencies2, ({ one, many }) => ({
  user: one(users9, {
    fields: [agencies2.userId],
    references: [users9.id]
  })
}));
var monthlyAgencyStats = pgTable17("monthly_agency_stats", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  agencyId: varchar11("agency_id").notNull(),
  yearMonth: varchar11("year_month", { length: 7 }).notNull(),
  // YYYY-MM 형식
  totalSpend: decimal7("total_spend", { precision: 14, scale: 0 }).default("0"),
  // 하위 계정 총 소진액
  commissionRate: decimal7("commission_rate", { precision: 5, scale: 2 }),
  // 수수료율 (10%, 15%, 20%)
  commissionAmount: decimal7("commission_amount", { precision: 14, scale: 0 }).default("0"),
  // 대행 수수료
  settlementDate: timestamp15("settlement_date"),
  // 정산 예정일 (익월 30일)
  status: varchar11("status", { length: 20 }).default("pending"),
  // pending, settled
  settledAt: timestamp15("settled_at"),
  // 실제 정산일
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users9).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertTemplateSchema = createInsertSchema(templates2).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true
});
var insertRecommendedTemplateSchema = createInsertSchema(recommendedTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertCampaignSchema = createInsertSchema(campaigns10).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentCount: true,
  successCount: true,
  clickCount: true,
  settleCnt: true,
  completedAt: true,
  testSentAt: true
});
var insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true
});
var insertMessageSchema = createInsertSchema(messages2).omit({
  id: true,
  createdAt: true
});
var insertTargetingSchema = createInsertSchema(targeting2).omit({
  id: true,
  createdAt: true
});
var insertTransactionSchema = createInsertSchema(transactions5).omit({
  id: true,
  createdAt: true
});
var insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertGeofenceSchema = createInsertSchema(geofences2).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertAtsMetaCacheSchema = createInsertSchema(atsMetaCache).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true
});
var insertAgencySchema = createInsertSchema(agencies2).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertMonthlyAgencyStatsSchema = createInsertSchema(monthlyAgencyStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var admins10 = pgTable17("admins", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  email: varchar11("email").unique().notNull(),
  passwordHash: varchar11("password_hash").notNull(),
  name: varchar11("name", { length: 100 }).notNull(),
  role: varchar11("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean10("is_active").default(true),
  lastLoginAt: timestamp15("last_login_at"),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var adminLogs7 = pgTable17("admin_logs", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  adminId: varchar11("admin_id").references(() => admins10.id).notNull(),
  action: varchar11("action", { length: 50 }).notNull(),
  targetType: varchar11("target_type", { length: 50 }),
  targetId: varchar11("target_id"),
  details: jsonb8("details"),
  ipAddress: varchar11("ip_address", { length: 45 }),
  createdAt: timestamp15("created_at").defaultNow()
});
var adminsRelations = relations(admins10, ({ many }) => ({
  logs: many(adminLogs7)
}));
var adminLogsRelations = relations(adminLogs7, ({ one }) => ({
  admin: one(admins10, {
    fields: [adminLogs7.adminId],
    references: [admins10.id]
  })
}));
var insertAdminSchema = createInsertSchema(admins10).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true
});
var insertAdminLogSchema = createInsertSchema(adminLogs7).omit({
  id: true,
  createdAt: true
});
var announcements2 = pgTable17("announcements", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  title: varchar11("title", { length: 200 }).notNull(),
  content: text12("content").notNull(),
  category: varchar11("category", { length: 50 }).default("general").notNull(),
  // general, update, maintenance, event
  priority: integer11("priority").default(0),
  // 0=일반, 1=중요, 2=긴급
  isPublished: boolean10("is_published").default(false),
  isPinned: boolean10("is_pinned").default(false),
  authorId: varchar11("author_id").references(() => admins10.id).notNull(),
  publishedAt: timestamp15("published_at"),
  expiresAt: timestamp15("expires_at"),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var refunds2 = pgTable17("refunds", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  transactionId: varchar11("transaction_id").references(() => transactions5.id),
  amount: decimal7("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text12("reason").notNull(),
  status: varchar11("status", { length: 20 }).default("pending").notNull(),
  // pending, approved, rejected, completed
  adminId: varchar11("admin_id").references(() => admins10.id),
  adminNote: text12("admin_note"),
  bankName: varchar11("bank_name", { length: 50 }),
  accountNumber: varchar11("account_number", { length: 50 }),
  accountHolder: varchar11("account_holder", { length: 50 }),
  processedAt: timestamp15("processed_at"),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var taxInvoices = pgTable17("tax_invoices", {
  id: varchar11("id").primaryKey().default(sql10`gen_random_uuid()`),
  userId: varchar11("user_id").references(() => users9.id).notNull(),
  transactionId: varchar11("transaction_id").references(() => transactions5.id),
  invoiceNumber: varchar11("invoice_number", { length: 50 }).unique(),
  issueDate: timestamp15("issue_date").notNull(),
  amount: decimal7("amount", { precision: 12, scale: 0 }).notNull(),
  taxAmount: decimal7("tax_amount", { precision: 12, scale: 0 }).notNull(),
  totalAmount: decimal7("total_amount", { precision: 12, scale: 0 }).notNull(),
  buyerBusinessNumber: varchar11("buyer_business_number", { length: 20 }),
  buyerCompanyName: varchar11("buyer_company_name", { length: 100 }),
  buyerEmail: varchar11("buyer_email", { length: 100 }),
  status: varchar11("status", { length: 20 }).default("issued").notNull(),
  // issued, sent, cancelled
  pdfUrl: text12("pdf_url"),
  createdAt: timestamp15("created_at").defaultNow(),
  updatedAt: timestamp15("updated_at").defaultNow()
});
var announcementsRelations = relations(announcements2, ({ one }) => ({
  author: one(admins10, {
    fields: [announcements2.authorId],
    references: [admins10.id]
  })
}));
var refundsRelations = relations(refunds2, ({ one }) => ({
  user: one(users9, {
    fields: [refunds2.userId],
    references: [users9.id]
  }),
  transaction: one(transactions5, {
    fields: [refunds2.transactionId],
    references: [transactions5.id]
  }),
  admin: one(admins10, {
    fields: [refunds2.adminId],
    references: [admins10.id]
  })
}));
var taxInvoicesRelations = relations(taxInvoices, ({ one }) => ({
  user: one(users9, {
    fields: [taxInvoices.userId],
    references: [users9.id]
  }),
  transaction: one(transactions5, {
    fields: [taxInvoices.transactionId],
    references: [transactions5.id]
  })
}));
var insertAnnouncementSchema = createInsertSchema(announcements2).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertRefundSchema = createInsertSchema(refunds2).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  processedAt: true
});
var insertTaxInvoiceSchema = createInsertSchema(taxInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// src/handlers/internal/master/reset-balance.ts
var MASTER_BALANCE = "100000000";
function getDb17() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sql31 = neon17(databaseUrl);
  return drizzle17(sql31, { schema: { users: users9, transactions: transactions5 } });
}
async function handler18(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Master Reset] CRON_SECRET not configured");
    return res.status(500).json({ error: "Server configuration error" });
  }
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    console.error("[Master Reset] Unauthorized access attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb17();
    const masterUsers = await db.select().from(users9).where(eq17(users9.isMaster, true));
    if (masterUsers.length === 0) {
      console.log("[Master Reset] No master users found");
      return res.status(200).json({ message: "No master users to reset", count: 0 });
    }
    const now = /* @__PURE__ */ new Date();
    const resetResults = [];
    for (const masterUser of masterUsers) {
      const previousBalance = masterUser.balance || "0";
      await db.update(users9).set({
        balance: MASTER_BALANCE,
        masterResetAt: now,
        updatedAt: now
      }).where(eq17(users9.id, masterUser.id));
      await db.insert(transactions5).values({
        userId: masterUser.id,
        type: "master_reset",
        amount: MASTER_BALANCE,
        balanceAfter: MASTER_BALANCE,
        description: `\uB9C8\uC2A4\uD130 \uACC4\uC815 \uC77C\uC77C \uCE90\uC2DC \uB9AC\uC14B (\uC774\uC804 \uC794\uC561: ${Number(previousBalance).toLocaleString()}\uC6D0)`,
        paymentMethod: "system"
      });
      resetResults.push({
        email: masterUser.email,
        previousBalance,
        newBalance: MASTER_BALANCE
      });
      console.log(`[Master Reset] Reset balance for ${masterUser.email}: ${previousBalance} \u2192 ${MASTER_BALANCE}`);
    }
    return res.status(200).json({
      success: true,
      message: "Master account balances reset successfully",
      count: resetResults.length,
      results: resetResults,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error("[Master Reset] Error:", error);
    return res.status(500).json({
      error: "Failed to reset master balances",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/templates/[id]/approve.ts
var approve_exports = {};
__export(approve_exports, {
  default: () => handler19
});
import { createClient as createClient9 } from "@supabase/supabase-js";
import { neon as neon18, neonConfig as neonConfig8 } from "@neondatabase/serverless";
import { drizzle as drizzle18 } from "drizzle-orm/neon-http";
import { eq as eq18 } from "drizzle-orm";
import { pgTable as pgTable18, text as text13, timestamp as timestamp16 } from "drizzle-orm/pg-core";
neonConfig8.fetchConnectionCache = true;
var templates3 = pgTable18("templates", {
  id: text13("id").primaryKey(),
  userId: text13("user_id").notNull(),
  status: text13("status").default("draft"),
  reviewedAt: timestamp16("reviewed_at")
});
function getDb18() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle18(neon18(dbUrl));
}
function getSupabaseAdmin8() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient9(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth7(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin8().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler19(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth7(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid template ID" });
  try {
    const db = getDb18();
    const result = await db.select().from(templates3).where(eq18(templates3.id, id));
    const template = result[0];
    if (!template) return res.status(404).json({ error: "Template not found" });
    if (template.userId !== auth.userId) return res.status(403).json({ error: "Access denied" });
    if (template.status !== "pending") {
      return res.status(400).json({ error: "Only pending templates can be approved" });
    }
    const updated = await db.update(templates3).set({
      status: "approved",
      reviewedAt: /* @__PURE__ */ new Date()
    }).where(eq18(templates3.id, id)).returning();
    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error approving template:", error);
    return res.status(500).json({ error: "Failed to approve template" });
  }
}

// src/handlers/templates/[id]/reject.ts
var reject_exports = {};
__export(reject_exports, {
  default: () => handler20
});
import { createClient as createClient10 } from "@supabase/supabase-js";
import { neon as neon19, neonConfig as neonConfig9 } from "@neondatabase/serverless";
import { drizzle as drizzle19 } from "drizzle-orm/neon-http";
import { eq as eq19 } from "drizzle-orm";
import { pgTable as pgTable19, text as text14, timestamp as timestamp17 } from "drizzle-orm/pg-core";
neonConfig9.fetchConnectionCache = true;
var templates4 = pgTable19("templates", {
  id: text14("id").primaryKey(),
  userId: text14("user_id").notNull(),
  status: text14("status").default("draft"),
  reviewedAt: timestamp17("reviewed_at"),
  rejectionReason: text14("rejection_reason")
});
function getDb19() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle19(neon19(dbUrl));
}
function getSupabaseAdmin9() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient10(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth8(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin9().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler20(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth8(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid template ID" });
  try {
    const { reason } = req.body;
    const db = getDb19();
    const result = await db.select().from(templates4).where(eq19(templates4.id, id));
    const template = result[0];
    if (!template) return res.status(404).json({ error: "Template not found" });
    if (template.userId !== auth.userId) return res.status(403).json({ error: "Access denied" });
    if (template.status !== "pending") {
      return res.status(400).json({ error: "Only pending templates can be rejected" });
    }
    const updated = await db.update(templates4).set({
      status: "rejected",
      rejectionReason: reason || "\uAC80\uC218 \uAE30\uC900\uC5D0 \uBD80\uD569\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      reviewedAt: /* @__PURE__ */ new Date()
    }).where(eq19(templates4.id, id)).returning();
    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error rejecting template:", error);
    return res.status(500).json({ error: "Failed to reject template" });
  }
}

// src/handlers/templates/[id]/submit.ts
var submit_exports2 = {};
__export(submit_exports2, {
  default: () => handler21
});
import { createClient as createClient11 } from "@supabase/supabase-js";
import { neon as neon20, neonConfig as neonConfig10 } from "@neondatabase/serverless";
import { drizzle as drizzle20 } from "drizzle-orm/neon-http";
import { eq as eq20 } from "drizzle-orm";
import { pgTable as pgTable20, text as text15, timestamp as timestamp18 } from "drizzle-orm/pg-core";
neonConfig10.fetchConnectionCache = true;
var templates5 = pgTable20("templates", {
  id: text15("id").primaryKey(),
  userId: text15("user_id").notNull(),
  status: text15("status").default("draft"),
  submittedAt: timestamp18("submitted_at")
});
function getDb20() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle20(neon20(dbUrl));
}
function getSupabaseAdmin10() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient11(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth9(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin10().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler21(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth9(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid template ID" });
  try {
    const db = getDb20();
    const result = await db.select().from(templates5).where(eq20(templates5.id, id));
    const template = result[0];
    if (!template) return res.status(404).json({ error: "Template not found" });
    if (template.userId !== auth.userId) return res.status(403).json({ error: "Access denied" });
    if (template.status !== "draft" && template.status !== "rejected") {
      return res.status(400).json({ error: "Only draft or rejected templates can be submitted for review" });
    }
    const updated = await db.update(templates5).set({
      status: "pending",
      submittedAt: /* @__PURE__ */ new Date()
    }).where(eq20(templates5.id, id)).returning();
    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error submitting template:", error);
    return res.status(500).json({ error: "Failed to submit template for review" });
  }
}

// src/handlers/admin/agencies/index.ts
var agencies_exports = {};
__export(agencies_exports, {
  default: () => handler22
});
import { neon as neon21 } from "@neondatabase/serverless";
import { drizzle as drizzle21 } from "drizzle-orm/neon-http";
import { eq as eq21, sql as sql11, desc as desc3 } from "drizzle-orm";
import { pgTable as pgTable21, varchar as varchar12, timestamp as timestamp19, boolean as boolean11 } from "drizzle-orm/pg-core";
import crypto11 from "crypto";
var admins11 = pgTable21("admins", {
  id: varchar12("id").primaryKey().default(sql11`gen_random_uuid()`),
  email: varchar12("email").unique().notNull(),
  passwordHash: varchar12("password_hash").notNull(),
  name: varchar12("name", { length: 100 }).notNull(),
  role: varchar12("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean11("is_active").default(true),
  lastLoginAt: timestamp19("last_login_at"),
  createdAt: timestamp19("created_at").defaultNow(),
  updatedAt: timestamp19("updated_at").defaultNow()
});
var agencies3 = pgTable21("agencies", {
  id: varchar12("id").primaryKey().default(sql11`gen_random_uuid()`),
  userId: varchar12("user_id").notNull(),
  name: varchar12("name", { length: 200 }).notNull(),
  contactName: varchar12("contact_name", { length: 100 }),
  contactPhone: varchar12("contact_phone", { length: 20 }),
  contactEmail: varchar12("contact_email", { length: 200 }),
  isActive: boolean11("is_active").default(true),
  createdAt: timestamp19("created_at").defaultNow(),
  updatedAt: timestamp19("updated_at").defaultNow()
});
var users10 = pgTable21("users", {
  id: varchar12("id").primaryKey().default(sql11`gen_random_uuid()`),
  email: varchar12("email").unique(),
  companyName: varchar12("company_name"),
  isAgency: boolean11("is_agency").default(false),
  agencyId: varchar12("agency_id"),
  createdAt: timestamp19("created_at").defaultNow(),
  updatedAt: timestamp19("updated_at").defaultNow()
});
function getDb21() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon21(databaseUrl);
  return drizzle21(sqlClient);
}
function verifyToken10(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto11.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken10(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken10(token);
  if (!verified) return null;
  try {
    const db = getDb21();
    const admin = await db.select().from(admins11).where(eq21(admins11.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler22(req, res) {
  const admin = await verifyAdminToken10(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const db = getDb21();
  if (req.method === "GET") {
    try {
      const agencyList = await db.select().from(agencies3).orderBy(desc3(agencies3.createdAt));
      const agenciesWithUsers = await Promise.all(
        agencyList.map(async (agency) => {
          const [user] = await db.select().from(users10).where(eq21(users10.id, agency.userId));
          const subAccounts = await db.select().from(users10).where(eq21(users10.agencyId, agency.id));
          return {
            ...agency,
            user,
            subAccountCount: subAccounts.length
          };
        })
      );
      return res.status(200).json(agenciesWithUsers);
    } catch (error) {
      console.error("[Admin Agencies] Error:", error);
      return res.status(500).json({ error: "\uB300\uD589\uC0AC \uBAA9\uB85D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
    }
  }
  if (req.method === "POST") {
    try {
      const { userId, name, contactName, contactPhone, contactEmail } = req.body || {};
      if (!userId || !name) {
        return res.status(400).json({ error: "\uC0AC\uC6A9\uC790 ID\uC640 \uB300\uD589\uC0AC\uBA85\uC740 \uD544\uC218\uC785\uB2C8\uB2E4" });
      }
      const [existingAgency] = await db.select().from(agencies3).where(eq21(agencies3.userId, userId));
      if (existingAgency) {
        return res.status(400).json({ error: "\uC774\uBBF8 \uB300\uD589\uC0AC\uB85C \uB4F1\uB85D\uB41C \uACC4\uC815\uC785\uB2C8\uB2E4" });
      }
      const [newAgency] = await db.insert(agencies3).values({
        userId,
        name,
        contactName,
        contactPhone,
        contactEmail
      }).returning();
      await db.update(users10).set({ isAgency: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq21(users10.id, userId));
      return res.status(201).json(newAgency);
    } catch (error) {
      console.error("[Admin Agencies] Error:", error);
      return res.status(500).json({ error: "\uB300\uD589\uC0AC \uB4F1\uB85D \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/admin/announcements/index.ts
var announcements_exports = {};
__export(announcements_exports, {
  default: () => handler23
});
import { neon as neon22 } from "@neondatabase/serverless";
import { drizzle as drizzle22 } from "drizzle-orm/neon-http";
import { sql as sql12, desc as desc4, eq as eq22, ilike, or } from "drizzle-orm";
import { pgTable as pgTable22, varchar as varchar13, timestamp as timestamp20, boolean as boolean12, integer as integer12, text as text16 } from "drizzle-orm/pg-core";
import crypto12 from "crypto";
var admins12 = pgTable22("admins", {
  id: varchar13("id").primaryKey().default(sql12`gen_random_uuid()`),
  email: varchar13("email").unique().notNull(),
  passwordHash: varchar13("password_hash").notNull(),
  name: varchar13("name", { length: 100 }).notNull(),
  role: varchar13("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean12("is_active").default(true),
  lastLoginAt: timestamp20("last_login_at"),
  createdAt: timestamp20("created_at").defaultNow(),
  updatedAt: timestamp20("updated_at").defaultNow()
});
var announcements3 = pgTable22("announcements", {
  id: varchar13("id").primaryKey().default(sql12`gen_random_uuid()`),
  title: varchar13("title", { length: 200 }).notNull(),
  content: text16("content").notNull(),
  category: varchar13("category", { length: 50 }).default("general").notNull(),
  priority: integer12("priority").default(0),
  isPublished: boolean12("is_published").default(false),
  isPinned: boolean12("is_pinned").default(false),
  authorId: varchar13("author_id").notNull(),
  publishedAt: timestamp20("published_at"),
  expiresAt: timestamp20("expires_at"),
  createdAt: timestamp20("created_at").defaultNow(),
  updatedAt: timestamp20("updated_at").defaultNow()
});
function getDb22() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle22(neon22(databaseUrl));
}
function verifyToken11(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto12.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken11(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken11(token);
  if (!verified) return null;
  try {
    const db = getDb22();
    const admin = await db.select().from(admins12).where(eq22(admins12.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler23(req, res) {
  const admin = await verifyAdminToken11(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const db = getDb22();
  if (req.method === "GET") {
    try {
      const { search, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, parseInt(limit));
      const offset = (pageNum - 1) * limitNum;
      let whereClause;
      if (search) {
        whereClause = or(
          ilike(announcements3.title, `%${search}%`),
          ilike(announcements3.content, `%${search}%`)
        );
      }
      const [countResult] = await db.select({ count: sql12`count(*)` }).from(announcements3).where(whereClause);
      const list = await db.select({
        id: announcements3.id,
        title: announcements3.title,
        content: announcements3.content,
        category: announcements3.category,
        priority: announcements3.priority,
        isPublished: announcements3.isPublished,
        isPinned: announcements3.isPinned,
        authorId: announcements3.authorId,
        publishedAt: announcements3.publishedAt,
        expiresAt: announcements3.expiresAt,
        createdAt: announcements3.createdAt,
        authorName: admins12.name
      }).from(announcements3).leftJoin(admins12, eq22(announcements3.authorId, admins12.id)).where(whereClause).orderBy(desc4(announcements3.isPinned), desc4(announcements3.createdAt)).limit(limitNum).offset(offset);
      return res.status(200).json({
        announcements: list,
        total: Number(countResult?.count || 0),
        page: pageNum,
        limit: limitNum
      });
    } catch (error) {
      console.error("[Admin Announcements GET] Error:", error);
      return res.status(500).json({ error: "Failed to fetch announcements" });
    }
  }
  if (req.method === "POST") {
    try {
      const { title, content, category, priority, isPublished, isPinned, expiresAt } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: "\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694" });
      }
      const [newAnnouncement] = await db.insert(announcements3).values({
        title,
        content,
        category: category || "general",
        priority: priority || 0,
        isPublished: isPublished || false,
        isPinned: isPinned || false,
        authorId: admin.id,
        publishedAt: isPublished ? /* @__PURE__ */ new Date() : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }).returning();
      return res.status(201).json({ success: true, announcement: newAnnouncement });
    } catch (error) {
      console.error("[Admin Announcements POST] Error:", error);
      return res.status(500).json({ error: "Failed to create announcement" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/admin/campaigns.ts
var campaigns_exports = {};
__export(campaigns_exports, {
  default: () => handler24
});
import { neon as neon23 } from "@neondatabase/serverless";
import { drizzle as drizzle23 } from "drizzle-orm/neon-http";
import { sql as sql13, ilike as ilike2, eq as eq23, or as or2, desc as desc5, and as and3 } from "drizzle-orm";
import { pgTable as pgTable23, varchar as varchar14, timestamp as timestamp21, decimal as decimal8, boolean as boolean13, integer as integer13 } from "drizzle-orm/pg-core";
import crypto13 from "crypto";
var admins13 = pgTable23("admins", {
  id: varchar14("id").primaryKey().default(sql13`gen_random_uuid()`),
  email: varchar14("email").unique().notNull(),
  passwordHash: varchar14("password_hash").notNull(),
  name: varchar14("name", { length: 100 }).notNull(),
  role: varchar14("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean13("is_active").default(true),
  lastLoginAt: timestamp21("last_login_at"),
  createdAt: timestamp21("created_at").defaultNow(),
  updatedAt: timestamp21("updated_at").defaultNow()
});
var users11 = pgTable23("users", {
  id: varchar14("id").primaryKey().default(sql13`gen_random_uuid()`),
  email: varchar14("email").unique()
});
var campaigns11 = pgTable23("campaigns", {
  id: varchar14("id").primaryKey().default(sql13`gen_random_uuid()`),
  userId: varchar14("user_id").notNull(),
  name: varchar14("name", { length: 200 }).notNull(),
  messageType: varchar14("message_type", { length: 10 }).notNull(),
  status: varchar14("status", { length: 20 }).default("temp_registered").notNull(),
  statusCode: integer13("status_code").default(0).notNull(),
  targetCount: integer13("target_count").default(0).notNull(),
  sentCount: integer13("sent_count").default(0),
  budget: decimal8("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp21("created_at").defaultNow()
});
function getDb23() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon23(databaseUrl);
  return drizzle23(sqlClient);
}
function verifyToken12(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto13.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken12(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken12(token);
  if (!verified) return null;
  try {
    const db = getDb23();
    const admin = await db.select().from(admins13).where(eq23(admins13.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler24(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken12(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb23();
    const { search, status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    if (search) {
      conditions.push(or2(
        ilike2(campaigns11.name, `%${search}%`),
        ilike2(users11.email, `%${search}%`)
      ));
    }
    if (status && status !== "all") {
      conditions.push(eq23(campaigns11.status, status));
    }
    const whereClause = conditions.length > 0 ? and3(...conditions) : void 0;
    const [countResult] = await db.select({ count: sql13`count(*)` }).from(campaigns11).leftJoin(users11, eq23(campaigns11.userId, users11.id)).where(whereClause);
    const campaignsList = await db.select({
      id: campaigns11.id,
      name: campaigns11.name,
      messageType: campaigns11.messageType,
      status: campaigns11.status,
      statusCode: campaigns11.statusCode,
      targetCount: campaigns11.targetCount,
      sentCount: campaigns11.sentCount,
      budget: campaigns11.budget,
      createdAt: campaigns11.createdAt,
      userId: campaigns11.userId,
      userEmail: users11.email
    }).from(campaigns11).leftJoin(users11, eq23(campaigns11.userId, users11.id)).where(whereClause).orderBy(desc5(campaigns11.createdAt)).limit(limitNum).offset(offset);
    return res.status(200).json({
      campaigns: campaignsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error("[Admin Campaigns] Error:", error);
    return res.status(500).json({ error: "Failed to fetch campaigns" });
  }
}

// src/handlers/admin/login.ts
var login_exports = {};
__export(login_exports, {
  default: () => handler25
});
import { neon as neon24 } from "@neondatabase/serverless";
import { drizzle as drizzle24 } from "drizzle-orm/neon-http";
import { eq as eq24, sql as sql14 } from "drizzle-orm";
import { pgTable as pgTable24, varchar as varchar15, timestamp as timestamp22, boolean as boolean14, jsonb as jsonb10 } from "drizzle-orm/pg-core";
import crypto14 from "crypto";
var admins14 = pgTable24("admins", {
  id: varchar15("id").primaryKey().default(sql14`gen_random_uuid()`),
  email: varchar15("email").unique().notNull(),
  passwordHash: varchar15("password_hash").notNull(),
  name: varchar15("name", { length: 100 }).notNull(),
  role: varchar15("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean14("is_active").default(true),
  lastLoginAt: timestamp22("last_login_at"),
  createdAt: timestamp22("created_at").defaultNow(),
  updatedAt: timestamp22("updated_at").defaultNow()
});
var adminLogs8 = pgTable24("admin_logs", {
  id: varchar15("id").primaryKey().default(sql14`gen_random_uuid()`),
  adminId: varchar15("admin_id").notNull(),
  action: varchar15("action", { length: 50 }).notNull(),
  targetType: varchar15("target_type", { length: 50 }),
  targetId: varchar15("target_id"),
  details: jsonb10("details"),
  ipAddress: varchar15("ip_address", { length: 45 }),
  createdAt: timestamp22("created_at").defaultNow()
});
function getDb24() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon24(databaseUrl);
  return drizzle24(sqlClient, { schema: { admins: admins14, adminLogs: adminLogs8 } });
}
function hashPassword(password) {
  return crypto14.createHash("sha256").update(password + (process.env.ADMIN_SALT || "wepick-admin-salt")).digest("hex");
}
function generateToken(adminId) {
  const payload = {
    adminId,
    exp: Date.now() + 2 * 60 * 60 * 1e3
  };
  const data = JSON.stringify(payload);
  const signature = crypto14.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}
async function handler25(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "\uC774\uBA54\uC77C\uACFC \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694" });
  }
  try {
    const db = getDb24();
    const admin = await db.select().from(admins14).where(eq24(admins14.email, email)).limit(1);
    if (admin.length === 0) {
      return res.status(401).json({ error: "\uC774\uBA54\uC77C \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4" });
    }
    const adminUser = admin[0];
    if (!adminUser.isActive) {
      return res.status(401).json({ error: "\uBE44\uD65C\uC131\uD654\uB41C \uACC4\uC815\uC785\uB2C8\uB2E4" });
    }
    const hashedPassword = hashPassword(password);
    if (adminUser.passwordHash !== hashedPassword) {
      return res.status(401).json({ error: "\uC774\uBA54\uC77C \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4" });
    }
    await db.update(admins14).set({ lastLoginAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq24(admins14.id, adminUser.id));
    const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0] || req.headers["x-real-ip"] || "unknown";
    await db.insert(adminLogs8).values({
      adminId: adminUser.id,
      action: "login",
      targetType: "admin",
      targetId: adminUser.id,
      details: { email: adminUser.email },
      ipAddress
    });
    const token = generateToken(adminUser.id);
    return res.status(200).json({
      success: true,
      token,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error("[Admin Login] Error:", error);
    return res.status(500).json({ error: "\uB85C\uADF8\uC778 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/admin/logs.ts
var logs_exports = {};
__export(logs_exports, {
  default: () => handler26
});
import { neon as neon25 } from "@neondatabase/serverless";
import { drizzle as drizzle25 } from "drizzle-orm/neon-http";
import { sql as sql15, ilike as ilike3, or as or3, desc as desc6, eq as eq25 } from "drizzle-orm";
import { pgTable as pgTable25, varchar as varchar16, timestamp as timestamp23, boolean as boolean15, jsonb as jsonb11 } from "drizzle-orm/pg-core";
import crypto15 from "crypto";
var admins15 = pgTable25("admins", {
  id: varchar16("id").primaryKey().default(sql15`gen_random_uuid()`),
  email: varchar16("email").unique().notNull(),
  passwordHash: varchar16("password_hash").notNull(),
  name: varchar16("name", { length: 100 }).notNull(),
  role: varchar16("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean15("is_active").default(true),
  lastLoginAt: timestamp23("last_login_at"),
  createdAt: timestamp23("created_at").defaultNow(),
  updatedAt: timestamp23("updated_at").defaultNow()
});
var adminLogs9 = pgTable25("admin_logs", {
  id: varchar16("id").primaryKey().default(sql15`gen_random_uuid()`),
  adminId: varchar16("admin_id").notNull(),
  action: varchar16("action", { length: 50 }).notNull(),
  targetType: varchar16("target_type", { length: 50 }),
  targetId: varchar16("target_id"),
  details: jsonb11("details"),
  ipAddress: varchar16("ip_address", { length: 45 }),
  createdAt: timestamp23("created_at").defaultNow()
});
function getDb25() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon25(databaseUrl);
  return drizzle25(sqlClient);
}
function verifyToken13(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto15.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken13(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken13(token);
  if (!verified) return null;
  try {
    const db = getDb25();
    const admin = await db.select().from(admins15).where(eq25(admins15.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler26(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken13(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb25();
    const { search, page = "1", limit = "30" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;
    let whereClause;
    if (search) {
      whereClause = or3(
        ilike3(admins15.name, `%${search}%`),
        ilike3(adminLogs9.action, `%${search}%`)
      );
    }
    const [countResult] = await db.select({ count: sql15`count(*)` }).from(adminLogs9).leftJoin(admins15, eq25(adminLogs9.adminId, admins15.id)).where(whereClause);
    const logsList = await db.select({
      id: adminLogs9.id,
      action: adminLogs9.action,
      targetType: adminLogs9.targetType,
      targetId: adminLogs9.targetId,
      details: adminLogs9.details,
      ipAddress: adminLogs9.ipAddress,
      createdAt: adminLogs9.createdAt,
      adminId: adminLogs9.adminId,
      adminName: admins15.name,
      adminEmail: admins15.email
    }).from(adminLogs9).leftJoin(admins15, eq25(adminLogs9.adminId, admins15.id)).where(whereClause).orderBy(desc6(adminLogs9.createdAt)).limit(limitNum).offset(offset);
    return res.status(200).json({
      logs: logsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error("[Admin Logs] Error:", error);
    return res.status(500).json({ error: "Failed to fetch logs" });
  }
}

// src/handlers/admin/me.ts
var me_exports = {};
__export(me_exports, {
  default: () => handler27
});
import { neon as neon26 } from "@neondatabase/serverless";
import { drizzle as drizzle26 } from "drizzle-orm/neon-http";
import { eq as eq26 } from "drizzle-orm";
import crypto16 from "crypto";
function getDb26() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sql31 = neon26(databaseUrl);
  return drizzle26(sql31, { schema: { admins: admins10 } });
}
function verifyToken14(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto16.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) {
      return null;
    }
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) {
      return null;
    }
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function handler27(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken14(token);
  if (!verified) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    const db = getDb26();
    const admin = await db.select().from(admins10).where(eq26(admins10.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) {
      return res.status(401).json({ error: "Admin not found or inactive" });
    }
    const adminUser = admin[0];
    return res.status(200).json({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role
    });
  } catch (error) {
    console.error("[Admin Me] Error:", error);
    return res.status(500).json({ error: "Failed to fetch admin info" });
  }
}

// src/handlers/admin/refunds/index.ts
var refunds_exports = {};
__export(refunds_exports, {
  default: () => handler28
});
import { neon as neon27 } from "@neondatabase/serverless";
import { drizzle as drizzle27 } from "drizzle-orm/neon-http";
import { sql as sql16, desc as desc7, eq as eq27, ilike as ilike4, and as and4 } from "drizzle-orm";
import { pgTable as pgTable26, varchar as varchar17, timestamp as timestamp24, boolean as boolean16, decimal as decimal9, text as text18, jsonb as jsonb12 } from "drizzle-orm/pg-core";
import crypto17 from "crypto";
var admins16 = pgTable26("admins", {
  id: varchar17("id").primaryKey().default(sql16`gen_random_uuid()`),
  email: varchar17("email").unique().notNull(),
  passwordHash: varchar17("password_hash").notNull(),
  name: varchar17("name", { length: 100 }).notNull(),
  role: varchar17("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean16("is_active").default(true),
  lastLoginAt: timestamp24("last_login_at"),
  createdAt: timestamp24("created_at").defaultNow(),
  updatedAt: timestamp24("updated_at").defaultNow()
});
var users12 = pgTable26("users", {
  id: varchar17("id").primaryKey().default(sql16`gen_random_uuid()`),
  email: varchar17("email").unique(),
  balance: decimal9("balance", { precision: 12, scale: 0 }).default("0"),
  updatedAt: timestamp24("updated_at").defaultNow()
});
var refunds3 = pgTable26("refunds", {
  id: varchar17("id").primaryKey().default(sql16`gen_random_uuid()`),
  userId: varchar17("user_id").notNull(),
  transactionId: varchar17("transaction_id"),
  amount: decimal9("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text18("reason").notNull(),
  status: varchar17("status", { length: 20 }).default("pending").notNull(),
  adminId: varchar17("admin_id"),
  adminNote: text18("admin_note"),
  bankName: varchar17("bank_name", { length: 50 }),
  accountNumber: varchar17("account_number", { length: 50 }),
  accountHolder: varchar17("account_holder", { length: 50 }),
  processedAt: timestamp24("processed_at"),
  createdAt: timestamp24("created_at").defaultNow(),
  updatedAt: timestamp24("updated_at").defaultNow()
});
var transactions6 = pgTable26("transactions", {
  id: varchar17("id").primaryKey().default(sql16`gen_random_uuid()`),
  userId: varchar17("user_id").notNull(),
  type: varchar17("type", { length: 20 }).notNull(),
  amount: decimal9("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal9("balance_after", { precision: 12, scale: 0 }),
  description: text18("description"),
  paymentMethod: varchar17("payment_method", { length: 50 }),
  createdAt: timestamp24("created_at").defaultNow()
});
var adminLogs10 = pgTable26("admin_logs", {
  id: varchar17("id").primaryKey().default(sql16`gen_random_uuid()`),
  adminId: varchar17("admin_id").notNull(),
  action: varchar17("action", { length: 50 }).notNull(),
  targetType: varchar17("target_type", { length: 50 }),
  targetId: varchar17("target_id"),
  details: jsonb12("details"),
  ipAddress: varchar17("ip_address", { length: 45 }),
  createdAt: timestamp24("created_at").defaultNow()
});
function getDb27() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle27(neon27(databaseUrl));
}
function verifyToken15(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto17.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken14(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken15(token);
  if (!verified) return null;
  try {
    const db = getDb27();
    const admin = await db.select().from(admins16).where(eq27(admins16.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler28(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken14(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb27();
    const { search, status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    if (search) {
      conditions.push(ilike4(users12.email, `%${search}%`));
    }
    if (status && status !== "all") {
      conditions.push(eq27(refunds3.status, status));
    }
    const whereClause = conditions.length > 0 ? and4(...conditions) : void 0;
    const [pendingCount] = await db.select({ count: sql16`count(*)` }).from(refunds3).where(eq27(refunds3.status, "pending"));
    const [totalAmountResult] = await db.select({ sum: sql16`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(refunds3).where(eq27(refunds3.status, "completed"));
    const [countResult] = await db.select({ count: sql16`count(*)` }).from(refunds3).leftJoin(users12, eq27(refunds3.userId, users12.id)).where(whereClause);
    const list = await db.select({
      id: refunds3.id,
      userId: refunds3.userId,
      amount: refunds3.amount,
      reason: refunds3.reason,
      status: refunds3.status,
      adminNote: refunds3.adminNote,
      bankName: refunds3.bankName,
      accountNumber: refunds3.accountNumber,
      accountHolder: refunds3.accountHolder,
      processedAt: refunds3.processedAt,
      createdAt: refunds3.createdAt,
      userEmail: users12.email
    }).from(refunds3).leftJoin(users12, eq27(refunds3.userId, users12.id)).where(whereClause).orderBy(desc7(refunds3.createdAt)).limit(limitNum).offset(offset);
    return res.status(200).json({
      refunds: list,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
      pendingCount: Number(pendingCount?.count || 0),
      totalRefunded: Number(totalAmountResult?.sum || 0)
    });
  } catch (error) {
    console.error("[Admin Refunds] Error:", error);
    return res.status(500).json({ error: "Failed to fetch refunds" });
  }
}

// src/handlers/admin/stats.ts
var stats_exports = {};
__export(stats_exports, {
  default: () => handler29
});
import { neon as neon28 } from "@neondatabase/serverless";
import { drizzle as drizzle28 } from "drizzle-orm/neon-http";
import { sql as sql17, eq as eq28, gte as gte3, and as and5 } from "drizzle-orm";
import { pgTable as pgTable27, varchar as varchar18, timestamp as timestamp25, decimal as decimal10, boolean as boolean17, integer as integer14 } from "drizzle-orm/pg-core";
import crypto18 from "crypto";
var admins17 = pgTable27("admins", {
  id: varchar18("id").primaryKey().default(sql17`gen_random_uuid()`),
  email: varchar18("email").unique().notNull(),
  passwordHash: varchar18("password_hash").notNull(),
  name: varchar18("name", { length: 100 }).notNull(),
  role: varchar18("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean17("is_active").default(true),
  lastLoginAt: timestamp25("last_login_at"),
  createdAt: timestamp25("created_at").defaultNow(),
  updatedAt: timestamp25("updated_at").defaultNow()
});
var users13 = pgTable27("users", {
  id: varchar18("id").primaryKey().default(sql17`gen_random_uuid()`),
  email: varchar18("email").unique(),
  balance: decimal10("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp25("created_at").defaultNow()
});
var campaigns12 = pgTable27("campaigns", {
  id: varchar18("id").primaryKey().default(sql17`gen_random_uuid()`),
  status: varchar18("status", { length: 20 }).default("temp_registered").notNull(),
  sentCount: integer14("sent_count").default(0),
  createdAt: timestamp25("created_at").defaultNow()
});
var transactions7 = pgTable27("transactions", {
  id: varchar18("id").primaryKey().default(sql17`gen_random_uuid()`),
  userId: varchar18("user_id").notNull(),
  type: varchar18("type", { length: 20 }).notNull(),
  amount: decimal10("amount", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp25("created_at").defaultNow()
});
function getDb28() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon28(databaseUrl);
  return drizzle28(sqlClient);
}
function verifyToken16(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto18.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken15(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken16(token);
  if (!verified) return null;
  try {
    const db = getDb28();
    const admin = await db.select().from(admins17).where(eq28(admins17.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler29(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken15(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb28();
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const [totalUsersResult] = await db.select({ count: sql17`count(*)` }).from(users13);
    const totalUsers = Number(totalUsersResult?.count || 0);
    const [newUsersTodayResult] = await db.select({ count: sql17`count(*)` }).from(users13).where(gte3(users13.createdAt, today));
    const newUsersToday = Number(newUsersTodayResult?.count || 0);
    const [activeCampaignsResult] = await db.select({ count: sql17`count(*)` }).from(campaigns12).where(eq28(campaigns12.status, "running"));
    const activeCampaigns = Number(activeCampaignsResult?.count || 0);
    const [revenueTodayResult] = await db.select({ sum: sql17`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(transactions7).where(and5(eq28(transactions7.type, "charge"), gte3(transactions7.createdAt, today)));
    const revenueToday = Number(revenueTodayResult?.sum || 0);
    const [totalRevenueResult] = await db.select({ sum: sql17`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(transactions7).where(eq28(transactions7.type, "charge"));
    const totalRevenue = Number(totalRevenueResult?.sum || 0);
    const [totalSentResult] = await db.select({ sum: sql17`COALESCE(SUM(sent_count), 0)` }).from(campaigns12);
    const totalSent = Number(totalSentResult?.sum || 0);
    return res.status(200).json({
      totalUsers,
      newUsersToday,
      activeCampaigns,
      revenueToday,
      totalRevenue,
      totalSent
    });
  } catch (error) {
    console.error("[Admin Stats] Error:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
}

// src/handlers/admin/tax-invoices.ts
var tax_invoices_exports = {};
__export(tax_invoices_exports, {
  default: () => handler30
});
import { neon as neon29 } from "@neondatabase/serverless";
import { drizzle as drizzle29 } from "drizzle-orm/neon-http";
import { sql as sql18, desc as desc8, eq as eq29, ilike as ilike5, gte as gte4, and as and6 } from "drizzle-orm";
import { pgTable as pgTable28, varchar as varchar19, timestamp as timestamp26, boolean as boolean18, decimal as decimal11, text as text20 } from "drizzle-orm/pg-core";
import crypto19 from "crypto";
var admins18 = pgTable28("admins", {
  id: varchar19("id").primaryKey().default(sql18`gen_random_uuid()`),
  email: varchar19("email").unique().notNull(),
  passwordHash: varchar19("password_hash").notNull(),
  name: varchar19("name", { length: 100 }).notNull(),
  role: varchar19("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean18("is_active").default(true),
  lastLoginAt: timestamp26("last_login_at"),
  createdAt: timestamp26("created_at").defaultNow(),
  updatedAt: timestamp26("updated_at").defaultNow()
});
var users14 = pgTable28("users", {
  id: varchar19("id").primaryKey().default(sql18`gen_random_uuid()`),
  email: varchar19("email").unique(),
  companyName: varchar19("company_name")
});
var taxInvoices2 = pgTable28("tax_invoices", {
  id: varchar19("id").primaryKey().default(sql18`gen_random_uuid()`),
  userId: varchar19("user_id").notNull(),
  transactionId: varchar19("transaction_id"),
  invoiceNumber: varchar19("invoice_number", { length: 50 }).unique(),
  issueDate: timestamp26("issue_date").notNull(),
  amount: decimal11("amount", { precision: 12, scale: 0 }).notNull(),
  taxAmount: decimal11("tax_amount", { precision: 12, scale: 0 }).notNull(),
  totalAmount: decimal11("total_amount", { precision: 12, scale: 0 }).notNull(),
  buyerBusinessNumber: varchar19("buyer_business_number", { length: 20 }),
  buyerCompanyName: varchar19("buyer_company_name", { length: 100 }),
  buyerEmail: varchar19("buyer_email", { length: 100 }),
  status: varchar19("status", { length: 20 }).default("issued").notNull(),
  pdfUrl: text20("pdf_url"),
  createdAt: timestamp26("created_at").defaultNow(),
  updatedAt: timestamp26("updated_at").defaultNow()
});
function getDb29() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle29(neon29(databaseUrl));
}
function verifyToken17(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto19.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken16(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken17(token);
  if (!verified) return null;
  try {
    const db = getDb29();
    const admin = await db.select().from(admins18).where(eq29(admins18.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler30(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken16(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb29();
    const { search, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    if (search) {
      conditions.push(ilike5(users14.email, `%${search}%`));
    }
    const whereClause = conditions.length > 0 ? and6(...conditions) : void 0;
    const monthStart = /* @__PURE__ */ new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [monthlyCountResult] = await db.select({ count: sql18`count(*)` }).from(taxInvoices2).where(gte4(taxInvoices2.issueDate, monthStart));
    const [monthlyAmountResult] = await db.select({ sum: sql18`COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0)` }).from(taxInvoices2).where(gte4(taxInvoices2.issueDate, monthStart));
    const [countResult] = await db.select({ count: sql18`count(*)` }).from(taxInvoices2).leftJoin(users14, eq29(taxInvoices2.userId, users14.id)).where(whereClause);
    const list = await db.select({
      id: taxInvoices2.id,
      invoiceNumber: taxInvoices2.invoiceNumber,
      issueDate: taxInvoices2.issueDate,
      amount: taxInvoices2.amount,
      taxAmount: taxInvoices2.taxAmount,
      totalAmount: taxInvoices2.totalAmount,
      buyerBusinessNumber: taxInvoices2.buyerBusinessNumber,
      buyerCompanyName: taxInvoices2.buyerCompanyName,
      buyerEmail: taxInvoices2.buyerEmail,
      status: taxInvoices2.status,
      pdfUrl: taxInvoices2.pdfUrl,
      createdAt: taxInvoices2.createdAt,
      userId: taxInvoices2.userId,
      userEmail: users14.email
    }).from(taxInvoices2).leftJoin(users14, eq29(taxInvoices2.userId, users14.id)).where(whereClause).orderBy(desc8(taxInvoices2.issueDate)).limit(limitNum).offset(offset);
    return res.status(200).json({
      taxInvoices: list,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
      monthlyCount: Number(monthlyCountResult?.count || 0),
      monthlyAmount: Number(monthlyAmountResult?.sum || 0)
    });
  } catch (error) {
    console.error("[Admin Tax Invoices] Error:", error);
    return res.status(500).json({ error: "Failed to fetch tax invoices" });
  }
}

// src/handlers/admin/transactions.ts
var transactions_exports = {};
__export(transactions_exports, {
  default: () => handler31
});
import { neon as neon30 } from "@neondatabase/serverless";
import { drizzle as drizzle30 } from "drizzle-orm/neon-http";
import { sql as sql19, ilike as ilike6, eq as eq30, gte as gte5, and as and7, desc as desc9 } from "drizzle-orm";
import { pgTable as pgTable29, varchar as varchar20, timestamp as timestamp27, decimal as decimal12, boolean as boolean19, text as text21 } from "drizzle-orm/pg-core";
import crypto20 from "crypto";
var admins19 = pgTable29("admins", {
  id: varchar20("id").primaryKey().default(sql19`gen_random_uuid()`),
  email: varchar20("email").unique().notNull(),
  passwordHash: varchar20("password_hash").notNull(),
  name: varchar20("name", { length: 100 }).notNull(),
  role: varchar20("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean19("is_active").default(true),
  lastLoginAt: timestamp27("last_login_at"),
  createdAt: timestamp27("created_at").defaultNow(),
  updatedAt: timestamp27("updated_at").defaultNow()
});
var users15 = pgTable29("users", {
  id: varchar20("id").primaryKey().default(sql19`gen_random_uuid()`),
  email: varchar20("email").unique()
});
var transactions8 = pgTable29("transactions", {
  id: varchar20("id").primaryKey().default(sql19`gen_random_uuid()`),
  userId: varchar20("user_id").notNull(),
  type: varchar20("type", { length: 20 }).notNull(),
  amount: decimal12("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal12("balance_after", { precision: 12, scale: 0 }),
  description: text21("description"),
  paymentMethod: varchar20("payment_method", { length: 50 }),
  createdAt: timestamp27("created_at").defaultNow()
});
function getDb30() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon30(databaseUrl);
  return drizzle30(sqlClient);
}
function verifyToken18(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto20.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken17(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken18(token);
  if (!verified) return null;
  try {
    const db = getDb30();
    const admin = await db.select().from(admins19).where(eq30(admins19.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler31(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken17(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb30();
    const { search, type, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const [todayChargeResult] = await db.select({ sum: sql19`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(transactions8).where(and7(eq30(transactions8.type, "charge"), gte5(transactions8.createdAt, today)));
    const [todayUsageResult] = await db.select({ sum: sql19`COALESCE(ABS(SUM(CAST(amount AS DECIMAL))), 0)` }).from(transactions8).where(and7(eq30(transactions8.type, "usage"), gte5(transactions8.createdAt, today)));
    const [monthlyTotalResult] = await db.select({ sum: sql19`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(transactions8).where(and7(eq30(transactions8.type, "charge"), gte5(transactions8.createdAt, monthStart)));
    const conditions = [];
    if (search) {
      conditions.push(ilike6(users15.email, `%${search}%`));
    }
    if (type && type !== "all") {
      conditions.push(eq30(transactions8.type, type));
    }
    const whereClause = conditions.length > 0 ? and7(...conditions) : void 0;
    const [countResult] = await db.select({ count: sql19`count(*)` }).from(transactions8).leftJoin(users15, eq30(transactions8.userId, users15.id)).where(whereClause);
    const transactionsList = await db.select({
      id: transactions8.id,
      type: transactions8.type,
      amount: transactions8.amount,
      balanceAfter: transactions8.balanceAfter,
      description: transactions8.description,
      paymentMethod: transactions8.paymentMethod,
      createdAt: transactions8.createdAt,
      userId: transactions8.userId,
      userEmail: users15.email
    }).from(transactions8).leftJoin(users15, eq30(transactions8.userId, users15.id)).where(whereClause).orderBy(desc9(transactions8.createdAt)).limit(limitNum).offset(offset);
    return res.status(200).json({
      transactions: transactionsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
      todayCharge: Number(todayChargeResult?.sum || 0),
      todayUsage: Number(todayUsageResult?.sum || 0),
      monthlyTotal: Number(monthlyTotalResult?.sum || 0)
    });
  } catch (error) {
    console.error("[Admin Transactions] Error:", error);
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

// src/handlers/admin/users/index.ts
var users_exports = {};
__export(users_exports, {
  default: () => handler32
});
import { neon as neon31 } from "@neondatabase/serverless";
import { drizzle as drizzle31 } from "drizzle-orm/neon-http";
import { sql as sql20, ilike as ilike7, or as or5, desc as desc10, eq as eq31 } from "drizzle-orm";
import { pgTable as pgTable30, varchar as varchar21, timestamp as timestamp28, decimal as decimal13, boolean as boolean20 } from "drizzle-orm/pg-core";
import crypto21 from "crypto";
var admins20 = pgTable30("admins", {
  id: varchar21("id").primaryKey().default(sql20`gen_random_uuid()`),
  email: varchar21("email").unique().notNull(),
  passwordHash: varchar21("password_hash").notNull(),
  name: varchar21("name", { length: 100 }).notNull(),
  role: varchar21("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean20("is_active").default(true),
  lastLoginAt: timestamp28("last_login_at"),
  createdAt: timestamp28("created_at").defaultNow(),
  updatedAt: timestamp28("updated_at").defaultNow()
});
var users16 = pgTable30("users", {
  id: varchar21("id").primaryKey().default(sql20`gen_random_uuid()`),
  email: varchar21("email").unique(),
  firstName: varchar21("first_name"),
  lastName: varchar21("last_name"),
  profileImageUrl: varchar21("profile_image_url"),
  companyName: varchar21("company_name"),
  businessNumber: varchar21("business_number"),
  phone: varchar21("phone"),
  balance: decimal13("balance", { precision: 12, scale: 0 }).default("0"),
  stripeCustomerId: varchar21("stripe_customer_id"),
  isVerified: boolean20("is_verified").default(false),
  isMaster: boolean20("is_master").default(false),
  masterResetAt: timestamp28("master_reset_at"),
  createdAt: timestamp28("created_at").defaultNow(),
  updatedAt: timestamp28("updated_at").defaultNow()
});
function getDb31() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon31(databaseUrl);
  return drizzle31(sqlClient);
}
function verifyToken19(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto21.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAdminToken18(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyToken19(token);
  if (!verified) return null;
  try {
    const db = getDb31();
    const admin = await db.select().from(admins20).where(eq31(admins20.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}
async function handler32(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const admin = await verifyAdminToken18(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = getDb31();
    const { search, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;
    let whereClause;
    if (search) {
      whereClause = or5(
        ilike7(users16.email, `%${search}%`),
        ilike7(users16.companyName, `%${search}%`)
      );
    }
    const [countResult] = await db.select({ count: sql20`count(*)` }).from(users16).where(whereClause);
    const usersList = await db.select().from(users16).where(whereClause).orderBy(desc10(users16.createdAt)).limit(limitNum).offset(offset);
    return res.status(200).json({
      users: usersList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error("[Admin Users] Error:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
}

// src/handlers/agencies/list.ts
var list_exports = {};
__export(list_exports, {
  default: () => handler33
});
import { neon as neon32 } from "@neondatabase/serverless";
import { drizzle as drizzle32 } from "drizzle-orm/neon-http";
import { eq as eq32, sql as sql21 } from "drizzle-orm";
import { pgTable as pgTable31, varchar as varchar22, timestamp as timestamp29, boolean as boolean21 } from "drizzle-orm/pg-core";
var agencies4 = pgTable31("agencies", {
  id: varchar22("id").primaryKey().default(sql21`gen_random_uuid()`),
  userId: varchar22("user_id").notNull(),
  name: varchar22("name", { length: 200 }).notNull(),
  isActive: boolean21("is_active").default(true),
  createdAt: timestamp29("created_at").defaultNow()
});
function getDb32() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon32(databaseUrl);
  return drizzle32(sqlClient);
}
async function handler33(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const db = getDb32();
    const activeAgencies = await db.select({
      id: agencies4.id,
      name: agencies4.name
    }).from(agencies4).where(eq32(agencies4.isActive, true));
    return res.status(200).json({
      agencies: activeAgencies
    });
  } catch (error) {
    console.error("[Agencies List] Error:", error);
    return res.status(500).json({ error: "\uB300\uD589\uC0AC \uBAA9\uB85D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/agency/login.ts
var login_exports2 = {};
__export(login_exports2, {
  default: () => handler34
});
import { createClient as createClient12 } from "@supabase/supabase-js";
import { neon as neon33 } from "@neondatabase/serverless";
import { drizzle as drizzle33 } from "drizzle-orm/neon-http";
import { eq as eq33, sql as sql22 } from "drizzle-orm";
import { pgTable as pgTable32, varchar as varchar23, timestamp as timestamp30, boolean as boolean22 } from "drizzle-orm/pg-core";
import crypto22 from "crypto";
var users17 = pgTable32("users", {
  id: varchar23("id").primaryKey().default(sql22`gen_random_uuid()`),
  email: varchar23("email").unique(),
  companyName: varchar23("company_name"),
  isAgency: boolean22("is_agency").default(false),
  agencyId: varchar23("agency_id"),
  createdAt: timestamp30("created_at").defaultNow(),
  updatedAt: timestamp30("updated_at").defaultNow()
});
var agencies5 = pgTable32("agencies", {
  id: varchar23("id").primaryKey().default(sql22`gen_random_uuid()`),
  userId: varchar23("user_id").notNull(),
  name: varchar23("name", { length: 200 }).notNull(),
  contactName: varchar23("contact_name", { length: 100 }),
  contactPhone: varchar23("contact_phone", { length: 20 }),
  contactEmail: varchar23("contact_email", { length: 200 }),
  isActive: boolean22("is_active").default(true),
  createdAt: timestamp30("created_at").defaultNow(),
  updatedAt: timestamp30("updated_at").defaultNow()
});
function getDb33() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon33(databaseUrl);
  return drizzle33(sqlClient);
}
function getSupabaseAdmin11() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient12(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function createAgencyToken(agencyId, userId, email, agencyName) {
  const payload = {
    agencyId,
    userId,
    email,
    agencyName,
    exp: Date.now() + 24 * 60 * 60 * 1e3,
    // 24시간 유효
    iat: Date.now()
  };
  const data = JSON.stringify(payload);
  const signature = crypto22.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}
async function handler34(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "\uC774\uBA54\uC77C\uACFC \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694" });
  }
  try {
    const supabase = getSupabaseAdmin11();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (authError || !authData.user) {
      return res.status(401).json({ error: "\uC774\uBA54\uC77C \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4" });
    }
    const db = getDb33();
    const [user] = await db.select().from(users17).where(eq33(users17.id, authData.user.id));
    if (!user) {
      return res.status(401).json({ error: "\uB4F1\uB85D\uB41C \uC0AC\uC6A9\uC790\uAC00 \uC544\uB2D9\uB2C8\uB2E4" });
    }
    if (!user.isAgency) {
      return res.status(403).json({ error: "\uB300\uD589\uC0AC \uACC4\uC815\uC774 \uC544\uB2D9\uB2C8\uB2E4. \uC77C\uBC18 \uB85C\uADF8\uC778\uC744 \uC774\uC6A9\uD574\uC8FC\uC138\uC694." });
    }
    const [agency] = await db.select().from(agencies5).where(eq33(agencies5.userId, user.id));
    if (!agency || !agency.isActive) {
      return res.status(403).json({ error: "\uBE44\uD65C\uC131\uD654\uB41C \uB300\uD589\uC0AC \uACC4\uC815\uC785\uB2C8\uB2E4" });
    }
    const token = createAgencyToken(agency.id, user.id, user.email || "", agency.name);
    return res.status(200).json({
      success: true,
      token,
      agency: {
        id: agency.id,
        name: agency.name,
        contactName: agency.contactName,
        contactEmail: agency.contactEmail
      },
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName
      }
    });
  } catch (error) {
    console.error("[Agency Login] Error:", error);
    return res.status(500).json({ error: "\uB85C\uADF8\uC778 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/agency/stats.ts
var stats_exports2 = {};
__export(stats_exports2, {
  default: () => handler35
});
import { neon as neon34 } from "@neondatabase/serverless";
import { drizzle as drizzle34 } from "drizzle-orm/neon-http";
import { eq as eq34, and as and9, gte as gte6, lte as lte3, sql as sql23, inArray } from "drizzle-orm";
import { pgTable as pgTable33, varchar as varchar24, timestamp as timestamp31, boolean as boolean23, decimal as decimal14, integer as integer15, text as text22 } from "drizzle-orm/pg-core";
import crypto23 from "crypto";
var users18 = pgTable33("users", {
  id: varchar24("id").primaryKey().default(sql23`gen_random_uuid()`),
  email: varchar24("email").unique(),
  companyName: varchar24("company_name"),
  isAgency: boolean23("is_agency").default(false),
  agencyId: varchar24("agency_id"),
  balance: decimal14("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp31("created_at").defaultNow(),
  updatedAt: timestamp31("updated_at").defaultNow()
});
var agencies6 = pgTable33("agencies", {
  id: varchar24("id").primaryKey().default(sql23`gen_random_uuid()`),
  userId: varchar24("user_id").notNull(),
  name: varchar24("name", { length: 200 }).notNull(),
  isActive: boolean23("is_active").default(true),
  createdAt: timestamp31("created_at").defaultNow()
});
var campaigns13 = pgTable33("campaigns", {
  id: varchar24("id").primaryKey().default(sql23`gen_random_uuid()`),
  userId: varchar24("user_id").notNull(),
  name: varchar24("name", { length: 200 }).notNull(),
  status: varchar24("status", { length: 20 }).default("temp_registered").notNull(),
  statusCode: integer15("status_code").default(0).notNull(),
  budget: decimal14("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp31("created_at").defaultNow(),
  updatedAt: timestamp31("updated_at").defaultNow()
});
var transactions9 = pgTable33("transactions", {
  id: varchar24("id").primaryKey().default(sql23`gen_random_uuid()`),
  userId: varchar24("user_id").notNull(),
  type: varchar24("type", { length: 20 }).notNull(),
  amount: decimal14("amount", { precision: 12, scale: 0 }).notNull(),
  description: text22("description"),
  createdAt: timestamp31("created_at").defaultNow()
});
function getDb34() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon34(databaseUrl);
  return drizzle34(sqlClient);
}
function verifyAgencyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto23.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { agencyId: payload.agencyId, userId: payload.userId };
  } catch {
    return null;
  }
}
async function verifyAgency(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const verified = verifyAgencyToken(token);
  if (!verified) return null;
  try {
    const db = getDb34();
    const [agency] = await db.select().from(agencies6).where(eq34(agencies6.id, verified.agencyId));
    if (!agency || !agency.isActive) return null;
    return { agency, userId: verified.userId };
  } catch {
    return null;
  }
}
function calculateCommissionRate(totalSpend) {
  if (totalSpend >= 1e8) return 20;
  if (totalSpend >= 5e7) return 15;
  return 10;
}
async function handler35(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const verified = await verifyAgency(req);
  if (!verified) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { agency } = verified;
  const db = getDb34();
  try {
    const subAccounts = await db.select().from(users18).where(eq34(users18.agencyId, agency.id));
    const subAccountIds = subAccounts.map((u) => u.id);
    if (subAccountIds.length === 0) {
      return res.status(200).json({
        subAccountCount: 0,
        totalSpendThisMonth: 0,
        totalCampaigns: 0,
        activeCampaigns: 0,
        commissionRate: 10,
        estimatedCommission: 0
      });
    }
    const now = /* @__PURE__ */ new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const usageTransactions = await db.select().from(transactions9).where(
      and9(
        inArray(transactions9.userId, subAccountIds),
        eq34(transactions9.type, "usage"),
        gte6(transactions9.createdAt, startOfMonth),
        lte3(transactions9.createdAt, endOfMonth)
      )
    );
    const totalSpendThisMonth = usageTransactions.reduce((sum, t) => {
      return sum + Math.abs(Number(t.amount || 0));
    }, 0);
    const allCampaigns = await db.select().from(campaigns13).where(inArray(campaigns13.userId, subAccountIds));
    const activeCampaigns = allCampaigns.filter(
      (c) => c.statusCode === 30 || c.status === "running"
    );
    const commissionRate = calculateCommissionRate(totalSpendThisMonth);
    const estimatedCommission = Math.floor(totalSpendThisMonth * (commissionRate / 100));
    return res.status(200).json({
      subAccountCount: subAccounts.length,
      totalSpendThisMonth,
      totalCampaigns: allCampaigns.length,
      activeCampaigns: activeCampaigns.length,
      commissionRate,
      estimatedCommission
    });
  } catch (error) {
    console.error("[Agency Stats] Error:", error);
    return res.status(500).json({ error: "\uD1B5\uACC4 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/auth/user.ts
var user_exports = {};
__export(user_exports, {
  default: () => handler36
});
import { createClient as createClient13 } from "@supabase/supabase-js";
import { neon as neon35 } from "@neondatabase/serverless";
import { drizzle as drizzle35 } from "drizzle-orm/neon-http";
import { eq as eq35 } from "drizzle-orm";
import { pgTable as pgTable34, text as text23, timestamp as timestamp32 } from "drizzle-orm/pg-core";
import crypto24 from "crypto";
var users19 = pgTable34("users", {
  id: text23("id").primaryKey(),
  email: text23("email"),
  firstName: text23("first_name"),
  lastName: text23("last_name"),
  profileImageUrl: text23("profile_image_url"),
  balance: text23("balance").default("0").notNull(),
  stripeCustomerId: text23("stripe_customer_id"),
  createdAt: timestamp32("created_at").defaultNow(),
  updatedAt: timestamp32("updated_at").defaultNow()
});
function getDb35() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql31 = neon35(dbUrl);
  return drizzle35(sql31);
}
function getSupabaseAdmin12() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }
  return createClient13(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
function verifyImpersonateToken7(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto24.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth10(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken7(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "", isImpersonating: true };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No authorization header found");
    return null;
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const supabase = getSupabaseAdmin12();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
      console.error("Supabase auth error:", error.message);
      return null;
    }
    if (!user) {
      console.log("No user found for token");
      return null;
    }
    return {
      userId: user.id,
      email: user.email || ""
    };
  } catch (error) {
    console.error("Token verification error:", error);
    return null;
  }
}
async function handler36(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const auth = await verifyAuth10(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const db = getDb35();
    const result = await db.select().from(users19).where(eq35(users19.id, auth.userId));
    let user = result[0];
    if (!user) {
      console.log("User not found, creating new user:", auth.userId, auth.email);
      const insertResult = await db.insert(users19).values({
        id: auth.userId,
        email: auth.email,
        balance: "0"
      }).returning();
      user = insertResult[0];
    }
    console.log("User fetched successfully:", user.id);
    return res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({
      error: "Failed to fetch user",
      details: process.env.NODE_ENV === "development" ? errorMessage : void 0
    });
  }
}

// src/handlers/bizchat/ai.ts
var ai_exports = {};
__export(ai_exports, {
  default: () => handler37
});
import { createClient as createClient14 } from "@supabase/supabase-js";
import { createHmac as createHmac7 } from "crypto";
var BIZCHAT_DEV_URL4 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL4 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getSupabaseAdmin13() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient14(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken8(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac7("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth11(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken8(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin13().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid2() {
  return Date.now().toString();
}
async function callBizChatAPI2(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL4 : BIZCHAT_DEV_URL4;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }
  const tid = generateTid2();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat AI] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat AI] Request body:`, JSON.stringify(body).substring(0, 500));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat AI] Response: ${response.status} - ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function generateCampaignMessage(guideline, useProduction = false) {
  return callBizChatAPI2("/api/v1/ai/gen/msg", "POST", { guideline }, useProduction);
}
async function checkCampaignMessage(title, body, useProduction = false) {
  return callBizChatAPI2("/api/v1/ai/chk/msg", "POST", { title, body }, useProduction);
}
async function requestGounInspection(campaignId, useProduction = false) {
  return callBizChatAPI2("/api/v1/ai/goun/inspect", "POST", { cmpnId: campaignId }, useProduction);
}
async function getGounInspectionResult(campaignId, useProduction = false) {
  return callBizChatAPI2("/api/v1/ai/goun/inspect/result", "POST", { cmpnId: campaignId }, useProduction);
}
async function handler37(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth11(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const detectEnv = () => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
    if (forceDevMode) {
      console.log('[BizChat AI] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === "prod" || req.body?.env === "prod") return true;
    if (req.query.env === "dev" || req.body?.env === "dev") return false;
    if (process.env.VERCEL_ENV === "production") return true;
    if (process.env.NODE_ENV === "production") return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat AI] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  try {
    const { action } = req.body;
    switch (action) {
      case "generate": {
        const { guideline } = req.body;
        if (!guideline || guideline.length < 10) {
          return res.status(400).json({
            error: "\uAC00\uC774\uB4DC\uB77C\uC778\uC740 \uCD5C\uC18C 10\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4",
            example: "\uAD11\uACE0\uC8FC(\uB610\uB294 \uBE0C\uB79C\uB4DC\uBA85): \uC704\uD53D\n\uC774\uBCA4\uD2B8 \uB0B4\uC6A9: \uC2E0\uADDC \uAC00\uC785 \uC774\uBCA4\uD2B8\n\uC774\uBCA4\uD2B8 \uAE30\uAC04: 2024\uB144 12\uC6D4 1\uC77C~12\uC6D4 31\uC77C\nURL: https://example.com"
          });
        }
        const result = await generateCampaignMessage(guideline, useProduction);
        if (result.data.code !== "S000001") {
          return res.status(400).json({
            success: false,
            action: "generate",
            error: "AI \uBB38\uAD6C \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data
          });
        }
        return res.status(200).json({
          success: true,
          action: "generate",
          result: result.data
        });
      }
      case "check": {
        const { title, body } = req.body;
        if (!title || !body) {
          return res.status(400).json({
            error: "\uC81C\uBAA9(title)\uACFC \uBCF8\uBB38(body)\uC774 \uD544\uC694\uD569\uB2C8\uB2E4"
          });
        }
        const result = await checkCampaignMessage(title, body, useProduction);
        if (result.data.code !== "S000001") {
          return res.status(400).json({
            success: false,
            action: "check",
            error: "AI \uBB38\uAD6C \uAC80\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data
          });
        }
        return res.status(200).json({
          success: true,
          action: "check",
          result: result.data
        });
      }
      case "gounInspect": {
        const { campaignId } = req.body;
        if (!campaignId) {
          return res.status(400).json({ error: "campaignId is required" });
        }
        const result = await requestGounInspection(campaignId, useProduction);
        if (result.data.code !== "S000001") {
          return res.status(400).json({
            success: false,
            action: "gounInspect",
            error: "\uACE0\uC5B8\uC5F0 \uAC80\uC218 \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data
          });
        }
        return res.status(200).json({
          success: true,
          action: "gounInspect",
          result: result.data,
          note: "\uCEA0\uD398\uC778 \uC2DC\uC791 \uC2DC\uAC04\uC740 \uAC80\uC218 \uC694\uCCAD \uC2DC\uAC04\uBCF4\uB2E4 \uCD5C\uC18C 2.5\uC77C \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4"
        });
      }
      case "gounResult": {
        const { campaignId } = req.body;
        if (!campaignId) {
          return res.status(400).json({ error: "campaignId is required" });
        }
        const result = await getGounInspectionResult(campaignId, useProduction);
        if (result.data.code !== "S000001") {
          return res.status(400).json({
            success: false,
            action: "gounResult",
            error: "\uACE0\uC5B8\uC5F0 \uAC80\uC218 \uACB0\uACFC \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data
          });
        }
        return res.status(200).json({
          success: true,
          action: "gounResult",
          result: result.data
        });
      }
      default:
        return res.status(400).json({
          error: "Invalid action",
          validActions: ["generate", "check", "gounInspect", "gounResult"],
          description: {
            generate: "AI \uCEA0\uD398\uC778 \uBB38\uAD6C \uC0DD\uC131 (guideline \uD544\uC694)",
            check: "AI \uCEA0\uD398\uC778 \uBB38\uAD6C \uAC80\uC99D (title, body \uD544\uC694)",
            gounInspect: "\uACE0\uC5B8\uC5F0 \uCEA0\uD398\uC778 \uAC80\uC218 \uC694\uCCAD (campaignId \uD544\uC694)",
            gounResult: "\uACE0\uC5B8\uC5F0 \uCEA0\uD398\uC778 \uAC80\uC218 \uACB0\uACFC \uD655\uC778 (campaignId \uD544\uC694)"
          }
        });
    }
  } catch (error) {
    console.error("[BizChat AI] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/bizchat/ats.ts
var ats_exports = {};
__export(ats_exports, {
  default: () => handler38
});
import { createClient as createClient15 } from "@supabase/supabase-js";
import { createHmac as createHmac8 } from "crypto";
var BIZCHAT_DEV_URL5 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL5 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
var REGION_HCODE_MAP2 = {
  "\uC11C\uC6B8": "11",
  "\uACBD\uAE30": "41",
  "\uC778\uCC9C": "28",
  "\uBD80\uC0B0": "26",
  "\uB300\uAD6C": "27",
  "\uAD11\uC8FC": "29",
  "\uB300\uC804": "30",
  "\uC6B8\uC0B0": "31",
  "\uC138\uC885": "36",
  "\uAC15\uC6D0": "51",
  "\uCDA9\uBD81": "43",
  "\uCDA9\uB0A8": "44",
  "\uC804\uBD81": "52",
  "\uC804\uB0A8": "46",
  "\uACBD\uBD81": "47",
  "\uACBD\uB0A8": "48",
  "\uC81C\uC8FC": "50"
};
function getSupabaseAdmin14() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient15(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken9(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac8("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth12(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken9(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin14().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid3() {
  return Date.now().toString();
}
function buildATSMosuPayload(params) {
  const conditions = [];
  const descParts = [];
  if (params.ageMin !== void 0 || params.ageMax !== void 0) {
    const min = params.ageMin ?? 0;
    const max = params.ageMax ?? 100;
    conditions.push({
      data: { gt: min, lt: max },
      dataType: "number",
      metaType: "svc",
      code: "cust_age_cd",
      desc: `\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`,
      not: false
    });
    descParts.push(`\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`);
  }
  if (params.gender && params.gender !== "all") {
    const genderValue = params.gender === "male" ? "1" : "2";
    const genderName = params.gender === "male" ? "\uB0A8\uC790" : "\uC5EC\uC790";
    conditions.push({
      data: [genderValue],
      dataType: "code",
      metaType: "svc",
      code: "sex_cd",
      desc: `\uC131\uBCC4: ${genderName}`,
      not: false
    });
    descParts.push(`\uC131\uBCC4: ${genderName}`);
  }
  if (params.regions && Array.isArray(params.regions) && params.regions.length > 0) {
    const hcodes = [];
    const regionNames = [];
    for (const region of params.regions) {
      const hcode = REGION_HCODE_MAP2[region];
      if (hcode) {
        hcodes.push(hcode);
        regionNames.push(region);
      }
    }
    if (hcodes.length > 0) {
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "home_location",
        desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${regionNames.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9C0\uC5ED: ${regionNames.join(", ")}`);
    }
  }
  return {
    payload: { "$and": conditions },
    desc: descParts.join(", ")
  };
}
async function callBizChatAPI3(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL5 : BIZCHAT_DEV_URL5;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }
  const tid = generateTid3();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat ATS] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat ATS] Request body:`, JSON.stringify(body, null, 2));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat ATS] Response: ${response.status} - ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function handler38(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth12(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const detectEnv = () => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
    if (forceDevMode) {
      console.log('[BizChat ATS] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === "prod" || req.body?.env === "prod") return true;
    if (req.query.env === "dev" || req.body?.env === "dev") return false;
    if (process.env.VERCEL_ENV === "production") return true;
    if (process.env.NODE_ENV === "production") return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat ATS] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  const action = req.body?.action || "mosu";
  try {
    switch (action) {
      case "meta": {
        const result = await callBizChatAPI3("/api/v1/ats/meta/filter", "POST", {}, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "meta",
          data: result.data
        });
      }
      case "meta_loc": {
        const result = await callBizChatAPI3("/api/v1/ats/meta/loc/full", "POST", {}, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "meta_loc",
          data: result.data
        });
      }
      case "mosu":
      case "count": {
        const { gender, ageMin, ageMax, regions } = req.body;
        const { payload, desc: desc21 } = buildATSMosuPayload({
          gender,
          ageMin,
          ageMax,
          regions
        });
        const result = await callBizChatAPI3("/api/v1/ats/mosu", "POST", payload, useProduction);
        if (result.data.code === "S000001") {
          return res.status(200).json({
            success: true,
            action: "mosu",
            estimatedCount: result.data.data?.cnt || 0,
            filterStr: result.data.data?.filterStr || "",
            query: result.data.data?.query || "",
            sndMosuQuery: JSON.stringify(payload),
            filterDescription: desc21,
            rawResponse: result.data
          });
        } else {
          return res.status(200).json({
            success: false,
            action: "mosu",
            error: result.data.msg || "Failed to get count",
            code: result.data.code,
            sndMosuQuery: JSON.stringify(payload),
            filterDescription: desc21,
            rawResponse: result.data
          });
        }
      }
      case "filter": {
        const { gender, ageMin, ageMax, regions, pageNumber, pageSize } = req.body;
        const { payload } = buildATSMosuPayload({
          gender,
          ageMin,
          ageMax,
          regions
        });
        const filterPayload = {
          ...payload,
          pageNumber: pageNumber || 1,
          pageSize: pageSize || 100
        };
        const result = await callBizChatAPI3("/api/v1/ats/filter", "POST", filterPayload, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "filter",
          data: result.data.data,
          rawResponse: result.data
        });
      }
      default:
        return res.status(400).json({
          error: "Invalid action",
          validActions: ["meta", "meta_loc", "mosu", "count", "filter"]
        });
    }
  } catch (error) {
    console.error("[BizChat ATS] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/bizchat/campaigns.ts
var campaigns_exports2 = {};
__export(campaigns_exports2, {
  default: () => handler39
});
import { createClient as createClient16 } from "@supabase/supabase-js";
import { neon as neon36, neonConfig as neonConfig11 } from "@neondatabase/serverless";
import { createHmac as createHmac9 } from "crypto";
import { drizzle as drizzle36 } from "drizzle-orm/neon-http";
import { eq as eq36 } from "drizzle-orm";
import { pgTable as pgTable35, text as text24, integer as integer17, timestamp as timestamp33, jsonb as jsonb13 } from "drizzle-orm/pg-core";
neonConfig11.fetchConnectionCache = true;
var BIZCHAT_DEV_URL6 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL6 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
var CALLBACK_BASE_URL2 = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://wepickbizchat-new.vercel.app";
var campaigns14 = pgTable35("campaigns", {
  id: text24("id").primaryKey(),
  userId: text24("user_id").notNull(),
  name: text24("name").notNull(),
  tgtCompanyName: text24("tgt_company_name"),
  templateId: text24("template_id"),
  messageType: text24("message_type"),
  bizchatCampaignId: text24("bizchat_campaign_id"),
  statusCode: integer17("status_code").default(0),
  status: text24("status").default("temp_registered"),
  rcvType: integer17("rcv_type").default(0),
  billingType: integer17("billing_type").default(0),
  rcsType: integer17("rcs_type"),
  sndNum: text24("snd_num"),
  sndGoalCnt: integer17("snd_goal_cnt"),
  sndMosu: integer17("snd_mosu"),
  settleCnt: integer17("settle_cnt").default(0),
  targetCount: integer17("target_count").default(0),
  budget: text24("budget"),
  atsSndStartDate: timestamp33("ats_snd_start_date"),
  scheduledAt: timestamp33("scheduled_at"),
  updatedAt: timestamp33("updated_at").defaultNow()
});
var messages3 = pgTable35("messages", {
  id: text24("id").primaryKey(),
  campaignId: text24("campaign_id").notNull(),
  title: text24("title"),
  content: text24("content").notNull(),
  imageUrl: text24("image_url"),
  imageFileId: text24("image_file_id"),
  urlLinks: jsonb13("url_links"),
  buttons: jsonb13("buttons"),
  lmsContent: text24("lms_content"),
  lmsImageUrl: text24("lms_image_url"),
  lmsImageFileId: text24("lms_image_file_id"),
  lmsUrlLinks: jsonb13("lms_url_links")
});
function getDb36() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle36(neon36(dbUrl));
}
function getSupabaseAdmin15() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient16(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken10(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac9("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth13(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken10(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin15().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid4() {
  return Date.now().toString();
}
function toUnixTimestamp2(date) {
  if (!date) return void 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor(d.getTime() / 1e3);
}
function getKSTTimeComponents2(date) {
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1e3;
  const kstTime = new Date(utcTime + kstOffset * 60 * 1e3);
  return {
    hours: kstTime.getHours(),
    minutes: kstTime.getMinutes(),
    date: kstTime
  };
}
function validateSendTime2(sendDate) {
  if (!sendDate) {
    return { valid: true };
  }
  const targetDate = typeof sendDate === "string" ? new Date(sendDate) : sendDate;
  const now = /* @__PURE__ */ new Date();
  const kstTarget = getKSTTimeComponents2(targetDate);
  if (kstTarget.hours < 9 || kstTarget.hours >= 20) {
    return {
      valid: false,
      error: `\uBC1C\uC1A1 \uC2DC\uAC04\uC740 09:00~19:00 \uC0AC\uC774\uC5EC\uC57C \uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${kstTarget.hours}:${kstTarget.minutes.toString().padStart(2, "0")} KST)`
    };
  }
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1e3);
  if (targetDate < oneHourFromNow) {
    return {
      valid: false,
      error: "\uBC1C\uC1A1 \uC2DC\uAC04\uC740 \uD604\uC7AC \uC2DC\uAC04\uC73C\uB85C\uBD80\uD130 \uCD5C\uC18C 1\uC2DC\uAC04 \uC774\uD6C4\uC5EC\uC57C \uD569\uB2C8\uB2E4"
    };
  }
  const targetMinutes = kstTarget.minutes;
  if (targetMinutes % 10 !== 0) {
    const roundedUp = Math.ceil(targetMinutes / 10) * 10;
    const suggestedTime = new Date(targetDate);
    if (roundedUp >= 60) {
      suggestedTime.setHours(suggestedTime.getHours() + 1);
      suggestedTime.setMinutes(0);
    } else {
      suggestedTime.setMinutes(roundedUp);
    }
    return {
      valid: false,
      error: `\uBC1C\uC1A1 \uC2DC\uAC04\uC740 10\uBD84 \uB2E8\uC704\uC5EC\uC57C \uD569\uB2C8\uB2E4 (\uC608: ${suggestedTime.getHours()}:${String(suggestedTime.getMinutes()).padStart(2, "0")})`
    };
  }
  return { valid: true };
}
async function callBizChatAPI4(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL6 : BIZCHAT_DEV_URL6;
  const envKeyName = useProduction ? "BIZCHAT_PROD_API_KEY" : "BIZCHAT_DEV_API_KEY";
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  console.log(`[BizChat API] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`[BizChat API] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat API] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  if (!apiKey) {
    console.error(`[BizChat API] \u26A0\uFE0F Missing ${envKeyName}. Available: DEV=${!!process.env.BIZCHAT_DEV_API_KEY}, PROD=${!!process.env.BIZCHAT_PROD_API_KEY}`);
    throw new Error(`BizChat API key not configured (${envKeyName})`);
  }
  const tid = generateTid4();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat] Request body:`, JSON.stringify(body, null, 2));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat] Response: ${response.status} - ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
var RCS_TYPE_LIMITS = {
  0: {
    // 스탠다드
    name: "\uC2A4\uD0E0\uB2E4\uB4DC",
    maxMsgLength: 1100,
    maxButtonTextLength: 17,
    maxUrlCount: 3,
    requiresImage: false,
    imageMaxSize: "0.3MB",
    imageResolution: "400x240, 500x300"
  },
  1: {
    // LMS
    name: "LMS",
    maxMsgLength: 1100,
    maxButtonTextLength: 17,
    maxUrlCount: 3,
    requiresImage: false,
    imageMaxSize: "",
    imageResolution: ""
  },
  2: {
    // 슬라이드
    name: "\uC2AC\uB77C\uC774\uB4DC",
    maxMsgLength: 300,
    // 슬라이드당 300자, 모든 슬라이드 합산 1300자
    maxButtonTextLength: 13,
    maxUrlCount: 1,
    // 슬라이드당 1개
    requiresImage: true,
    imageMaxSize: "1MB (\uC7A5\uB2F9 300KB)",
    imageResolution: "464x336"
  },
  3: {
    // 이미지 강조 A (3:4)
    name: "\uC774\uBBF8\uC9C0 \uAC15\uC870 A (3:4)",
    maxMsgLength: 1100,
    maxButtonTextLength: 16,
    maxUrlCount: 3,
    requiresImage: true,
    imageMaxSize: "1MB",
    imageResolution: "900x1200"
  },
  4: {
    // 이미지 강조 B (1:1)
    name: "\uC774\uBBF8\uC9C0 \uAC15\uC870 B (1:1)",
    maxMsgLength: 1100,
    maxButtonTextLength: 16,
    maxUrlCount: 3,
    requiresImage: true,
    imageMaxSize: "1MB",
    imageResolution: "900x900"
  },
  5: {
    // 상품 소개 세로
    name: "\uC0C1\uD488 \uC18C\uAC1C \uC138\uB85C",
    maxMsgLength: 1100,
    maxButtonTextLength: 16,
    maxUrlCount: 3,
    requiresImage: true,
    imageMaxSize: "1MB",
    imageResolution: "900x560"
  }
};
function isBizChatFileId(id) {
  if (!id) return false;
  return /^[a-f0-9]{38}$/i.test(id);
}
function validateRcsMessage(rcsType, slides, slideCnt) {
  const result = { valid: true, errors: [], warnings: [] };
  const limits = RCS_TYPE_LIMITS[rcsType];
  if (!limits) {
    result.errors.push(`\uC9C0\uC6D0\uB418\uC9C0 \uC54A\uB294 RCS \uD0C0\uC785\uC785\uB2C8\uB2E4: ${rcsType}`);
    result.valid = false;
    return result;
  }
  if (rcsType === 2) {
    const actualSlideCnt = slideCnt || slides.length;
    if (actualSlideCnt < 1 || actualSlideCnt > 6) {
      result.errors.push(`\uC2AC\uB77C\uC774\uB4DC \uAC1C\uC218\uB294 1~6\uAC1C\uC5EC\uC57C \uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${actualSlideCnt}\uAC1C)`);
      result.valid = false;
    }
    const totalMsgLength = slides.reduce((sum, s) => sum + (s.msg?.length || 0), 0);
    if (totalMsgLength > 1300) {
      result.errors.push(`\uC2AC\uB77C\uC774\uB4DC \uC804\uCCB4 \uBA54\uC2DC\uC9C0 \uAE38\uC774\uAC00 1300\uC790\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${totalMsgLength}\uC790)`);
      result.valid = false;
    }
  }
  slides.forEach((slide, idx) => {
    const slidePrefix = slides.length > 1 ? `\uC2AC\uB77C\uC774\uB4DC ${idx + 1}: ` : "";
    const msgLength = slide.msg?.length || 0;
    if (msgLength > limits.maxMsgLength) {
      result.errors.push(
        `${slidePrefix}\uBA54\uC2DC\uC9C0 \uAE38\uC774\uAC00 ${limits.maxMsgLength}\uC790\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${msgLength}\uC790)`
      );
      result.valid = false;
    }
    if (limits.requiresImage && !slide.imgOrigId) {
      result.warnings.push(
        `${slidePrefix}${limits.name} \uD15C\uD50C\uB9BF\uC740 \uC774\uBBF8\uC9C0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4 (\uAD8C\uC7A5 \uD574\uC0C1\uB3C4: ${limits.imageResolution})`
      );
    }
    if (slide.imgOrigId && !isBizChatFileId(slide.imgOrigId)) {
      result.warnings.push(
        `${slidePrefix}\uC774\uBBF8\uC9C0\uB294 BizChat \uD30C\uC77C ID(38\uC790\uB9AC) \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. URL \uC9C1\uC811 \uC0AC\uC6A9 \uC2DC \uC624\uB958\uAC00 \uBC1C\uC0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`
      );
    }
    const urlCount = slide.urls?.length || 0;
    if (urlCount > limits.maxUrlCount) {
      result.errors.push(
        `${slidePrefix}URL \uAC1C\uC218\uAC00 ${limits.maxUrlCount}\uAC1C\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${urlCount}\uAC1C)`
      );
      result.valid = false;
    }
    slide.buttons?.forEach((btn, btnIdx) => {
      if (btn.name && btn.name.length > limits.maxButtonTextLength) {
        result.errors.push(
          `${slidePrefix}\uBC84\uD2BC ${btnIdx + 1} \uD14D\uC2A4\uD2B8\uAC00 ${limits.maxButtonTextLength}\uC790\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${btn.name.length}\uC790)`
        );
        result.valid = false;
      }
    });
  });
  return result;
}
async function createCampaignInBizChat(campaign, message, useProduction = false) {
  let billingType = 0;
  if (campaign.messageType === "RCS") {
    billingType = campaign.rcsType === 2 ? 1 : 3;
  } else if (campaign.messageType === "MMS") {
    billingType = 2;
  }
  const sndGoalCnt = campaign.sndGoalCnt || campaign.targetCount || 1e3;
  const sndMosu = campaign.sndMosu || Math.min(Math.ceil(sndGoalCnt * 1.5), 4e5);
  const isMaptics = campaign.rcvType === 1 || campaign.rcvType === 2;
  const payload = {
    // 필수 파라미터
    tgtCompanyName: campaign.tgtCompanyName || "\uC704\uD53D",
    name: campaign.name,
    sndNum: campaign.sndNum,
    rcvType: campaign.rcvType ?? 0,
    sndGoalCnt,
    billingType,
    isTmp: campaign.isTmp ?? 0,
    settleCnt: campaign.settleCnt ?? sndGoalCnt,
    // 무료 수신거부 번호
    adverDeny: campaign.adverDeny || "1504",
    // Callback URL 등록
    cb: {
      state: `${CALLBACK_BASE_URL2}/api/bizchat/callback/state`
    }
  };
  if (!isMaptics) {
    payload.sndMosu = sndMosu;
    payload.sndMosuFlag = campaign.sndMosuFlag ?? 0;
    if (campaign.atsSndStartDate || campaign.scheduledAt) {
      payload.atsSndStartDate = toUnixTimestamp2(campaign.atsSndStartDate || campaign.scheduledAt);
    }
    if (campaign.sndMosuDesc) {
      const desc21 = campaign.sndMosuDesc;
      const isHtml = typeof desc21 === "string" && (desc21.startsWith("<html>") || desc21.includes("<body>"));
      payload.sndMosuDesc = isHtml ? desc21 : `<html><body><p>${desc21}</p></body></html>`;
    }
    if (campaign.sndMosuQuery) {
      const query = campaign.sndMosuQuery;
      payload.sndMosuQuery = typeof query === "string" ? query : JSON.stringify(query);
    }
  }
  if (isMaptics) {
    if (campaign.sndGeofenceId) {
      payload.sndGeofenceId = campaign.sndGeofenceId;
    }
    if (campaign.collStartDate) {
      payload.collStartDate = toUnixTimestamp2(campaign.collStartDate);
    }
    if (campaign.collEndDate) {
      payload.collEndDate = toUnixTimestamp2(campaign.collEndDate);
    }
    if (campaign.collSndDate) {
      payload.collSndDate = toUnixTimestamp2(campaign.collSndDate);
    }
    if (campaign.rcvType === 1) {
      if (campaign.sndDayDiv !== void 0) payload.sndDayDiv = campaign.sndDayDiv;
      if (campaign.rtStartHhmm) payload.rtStartHhmm = campaign.rtStartHhmm;
      if (campaign.rtEndHhmm) payload.rtEndHhmm = campaign.rtEndHhmm;
    }
  }
  if (campaign.rcvType === 10 && campaign.mdnFileId) {
    payload.mdnFileId = campaign.mdnFileId;
  }
  if (campaign.messageType === "RCS" && campaign.rcsType !== void 0) {
    payload.rcsType = campaign.rcsType;
    if (campaign.rcsType === 2 && campaign.slideCnt) {
      payload.slideCnt = campaign.slideCnt;
    }
  }
  if (campaign.useCoupon) {
    payload.useCoupon = campaign.useCoupon;
    if (campaign.coupon) {
      payload.coupon = campaign.coupon;
    }
  }
  if (campaign.rewardEndDate) {
    payload.rewardEndDate = toUnixTimestamp2(campaign.rewardEndDate);
  }
  if (campaign.retarget && Array.isArray(campaign.retarget) && campaign.retarget.length > 0) {
    payload.retarget = campaign.retarget.slice(0, 10).map((r) => ({
      id: r.id,
      recv: r.recv ?? true,
      react: r.react ?? false
    }));
  }
  const needsFileForBilling = payload.billingType === 2;
  const isRcsMessage = campaign.messageType === "RCS";
  const normalizeUrlList = (urls) => {
    if (!urls) return [];
    if (Array.isArray(urls)) return urls;
    if (typeof urls === "object" && urls !== null && "list" in urls) {
      const list = urls.list;
      return Array.isArray(list) ? list : [];
    }
    return [];
  };
  const lmsUrlLinks = normalizeUrlList(message?.lmsUrlLinks);
  const rcsUrlLinks = normalizeUrlList(message?.urlLinks);
  const mmsUrlList = isRcsMessage && lmsUrlLinks.length > 0 ? lmsUrlLinks : rcsUrlLinks.length > 0 ? rcsUrlLinks : message?.urls || [];
  const mmsUrlLink = mmsUrlList.length > 0 ? { list: mmsUrlList.slice(0, 3), reward: message?.urlLinkReward } : {};
  const lmsImageUrl = message?.lmsImageUrl;
  const mmsImageUrl = isRcsMessage && lmsImageUrl ? lmsImageUrl : message?.imageUrl;
  const hasImage = !!mmsImageUrl;
  const fallbackMsg = message?.lmsContent || message?.content || "";
  const mmsObj = {
    title: message?.title || "",
    msg: fallbackMsg,
    ...message?.urlFile && { urlFile: message.urlFile },
    ...mmsUrlList.length > 0 && { urlLink: { list: mmsUrlList.slice(0, 3), reward: message?.urlLinkReward } },
    ...needsFileForBilling && hasImage && { fileInfo: { list: [{ origId: mmsImageUrl }] } }
  };
  payload.mms = mmsObj;
  if (message?.urlFile && message?.urlFileReward !== void 0) {
    payload.mms = {
      ...payload.mms,
      urlFileReward: message.urlFileReward
    };
  }
  const isRcsBilling = payload.billingType === 1 || payload.billingType === 3;
  if (campaign.messageType === "RCS" || isRcsBilling) {
    const rcsSlides = message?.rcsSlides || [{ slideNum: 1 }];
    const rcsUrlList = message?.rcsUrls || rcsUrlLinks;
    const rcsValidation = validateRcsMessage(
      campaign.rcsType ?? 0,
      rcsSlides.map((s) => ({
        msg: s.msg || s.content || message?.content,
        imgOrigId: s.imgOrigId || s.imageUrl,
        buttons: s.buttons || message?.rcsButtons,
        urls: s.urls || rcsUrlList
      })),
      campaign.slideCnt
    );
    if (rcsValidation.warnings.length > 0) {
      console.log("[BizChat RCS] Warnings:", rcsValidation.warnings.join(", "));
    }
    if (!rcsValidation.valid) {
      console.error("[BizChat RCS] Validation errors:", rcsValidation.errors.join(", "));
    }
    const rcsButtons = message?.rcsButtons || [];
    payload.rcs = rcsSlides.map((slide, idx) => {
      const slideUrls = slide.urls || rcsUrlList.slice(0, 3);
      const urlLink = slideUrls.length > 0 ? { list: slideUrls, reward: slide.urlLinkReward || message?.rcsUrlLinkReward } : {};
      const buttonList = (slide.buttons || rcsButtons.slice(0, 2)).map((btn) => ({
        ...btn,
        type: String(btn.type)
        // 숫자를 문자열로 변환
      }));
      const rcsSlideObj = {
        slideNum: slide.slideNum || idx + 1,
        title: slide.title || message?.title || "",
        msg: slide.msg || slide.content || message?.content || "",
        ...slide.imgOrigId || slide.imageUrl ? { imgOrigId: slide.imgOrigId || slide.imageUrl } : {},
        ...slide.urlFile ? { urlFile: slide.urlFile } : {},
        // 조건부: 빈 객체 생략
        ...slideUrls.length > 0 && { urlLink: { list: slideUrls, reward: slide.urlLinkReward || message?.rcsUrlLinkReward } },
        ...buttonList.length > 0 && { buttons: { list: buttonList } },
        ...slide.opts?.list?.length > 0 && { opts: slide.opts }
      };
      return rcsSlideObj;
    });
  }
  console.log("[BizChat Create] Payload keys:", Object.keys(payload));
  console.log("[BizChat Create] Has rcs field:", "rcs" in payload);
  console.log("[BizChat Create] Has fileInfo in mms:", "fileInfo" in (payload.mms || {}));
  return callBizChatAPI4("/api/v1/cmpn/create", "POST", payload, useProduction);
}
async function updateCampaignInBizChat(bizchatCampaignId, updateData, useProduction = false) {
  const cleanedData = { ...updateData };
  if (cleanedData.mms && typeof cleanedData.mms === "object") {
    const mms = { ...cleanedData.mms };
    if (mms.fileInfo && typeof mms.fileInfo === "object" && Object.keys(mms.fileInfo).length === 0) {
      delete mms.fileInfo;
    }
    if (mms.urlLink && typeof mms.urlLink === "object") {
      const urlLink = mms.urlLink;
      if (!urlLink.list || urlLink.list.length === 0) {
        delete mms.urlLink;
      }
    }
    if (mms.urlFile === "" || mms.urlFile === null || mms.urlFile === void 0) {
      delete mms.urlFile;
    }
    cleanedData.mms = mms;
  }
  if (Array.isArray(cleanedData.rcs)) {
    if (cleanedData.rcs.length === 0) {
      delete cleanedData.rcs;
    } else {
      cleanedData.rcs = cleanedData.rcs.map((slide) => {
        const cleanedSlide = { ...slide };
        if (cleanedSlide.urlLink && typeof cleanedSlide.urlLink === "object") {
          const urlLink = cleanedSlide.urlLink;
          if (!urlLink.list || urlLink.list.length === 0) {
            delete cleanedSlide.urlLink;
          }
        }
        if (cleanedSlide.buttons && typeof cleanedSlide.buttons === "object") {
          const buttons = cleanedSlide.buttons;
          if (!buttons.list || buttons.list.length === 0) {
            delete cleanedSlide.buttons;
          }
        }
        if (cleanedSlide.opts && typeof cleanedSlide.opts === "object") {
          const opts = cleanedSlide.opts;
          if (!opts.list || opts.list.length === 0) {
            delete cleanedSlide.opts;
          }
        }
        if (cleanedSlide.urlFile === "" || cleanedSlide.urlFile === null || cleanedSlide.urlFile === void 0) {
          delete cleanedSlide.urlFile;
        }
        if (cleanedSlide.imgOrigId === "" || cleanedSlide.imgOrigId === null || cleanedSlide.imgOrigId === void 0) {
          delete cleanedSlide.imgOrigId;
        }
        return cleanedSlide;
      });
    }
  }
  if (cleanedData.cb && typeof cleanedData.cb === "object" && Object.keys(cleanedData.cb).length === 0) {
    delete cleanedData.cb;
  }
  console.log("[BizChat Update] Payload keys:", Object.keys(cleanedData));
  console.log("[BizChat Update] MMS keys:", Object.keys(cleanedData.mms || {}));
  return callBizChatAPI4(`/api/v1/cmpn/update?id=${bizchatCampaignId}`, "POST", cleanedData, useProduction);
}
async function requestCampaignApproval(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/appr/req?id=${bizchatCampaignId}`, "POST", {}, useProduction);
}
async function getCampaignFromBizChat(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn?id=${bizchatCampaignId}`, "GET", void 0, useProduction);
}
async function testSendCampaign(bizchatCampaignId, mdnList, sendTime, useProduction = false) {
  const payload = {
    mdn: mdnList
  };
  if (sendTime) {
    payload.sendTime = sendTime;
  }
  return callBizChatAPI4(`/api/v1/cmpn/test/send?id=${bizchatCampaignId}`, "POST", payload, useProduction);
}
async function getCampaignStats(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/stat/read?id=${bizchatCampaignId}`, "GET", void 0, useProduction);
}
async function cancelCampaign(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/cancel?id=${bizchatCampaignId}`, "POST", {}, useProduction);
}
async function stopCampaign(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/stop?id=${bizchatCampaignId}`, "POST", {}, useProduction);
}
async function getCampaignMdnList(bizchatCampaignId, pageNumber = 1, pageSize = 100, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/mdn?id=${bizchatCampaignId}&pageNumber=${pageNumber}&pageSize=${pageSize}`, "GET", void 0, useProduction);
}
async function getCampaignResult(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/result?id=${bizchatCampaignId}`, "GET", void 0, useProduction);
}
async function deleteCampaignsInBizChat(campaignIds, useProduction = false) {
  return callBizChatAPI4("/api/v1/cmpn/delete", "POST", { ids: campaignIds }, useProduction);
}
async function cancelTestSend(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/test/send/cancel?id=${bizchatCampaignId}`, "POST", {}, useProduction);
}
async function getTestResults(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/test?id=${bizchatCampaignId}`, "GET", void 0, useProduction);
}
async function verifyMdn(bizchatCampaignId, useProduction = false) {
  return callBizChatAPI4(`/api/v1/cmpn/verify/mdn?id=${bizchatCampaignId}`, "POST", {}, useProduction);
}
async function getCampaignList(pageNumber = 0, pageSize = 10, filters = {}, useProduction = false) {
  return callBizChatAPI4("/api/v1/cmpn/list", "POST", {
    pageNumber,
    pageSize,
    ...filters
  }, useProduction);
}
function detectProductionEnvironment(req) {
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
  if (forceDevMode) {
    console.log('[BizChat] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
    return false;
  }
  if (req.query.env === "prod" || req.body?.env === "prod") return true;
  if (req.query.env === "dev" || req.body?.env === "dev") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}
async function handler39(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  const auth = await verifyAuth13(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const db = getDb36();
  const useProduction = detectProductionEnvironment(req);
  console.log(`[BizChat] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"} (VERCEL_ENV=${process.env.VERCEL_ENV}, NODE_ENV=${process.env.NODE_ENV})`);
  if (req.method === "POST") {
    try {
      const { campaignId, action, mdnList, sendTime } = req.body;
      if (action === "delete") {
        if (!req.body.campaignIds || !Array.isArray(req.body.campaignIds)) {
          return res.status(400).json({ error: "campaignIds array is required" });
        }
        const bizchatIds = req.body.campaignIds;
        for (const bizchatId of bizchatIds) {
          const campaignCheck = await db.select().from(campaigns14).where(eq36(campaigns14.bizchatCampaignId, bizchatId));
          if (campaignCheck.length === 0) {
            return res.status(404).json({
              error: `Campaign with BizChat ID ${bizchatId} not found`
            });
          }
          if (campaignCheck[0].userId !== auth.userId) {
            return res.status(403).json({
              error: "Access denied: You do not own this campaign"
            });
          }
        }
        const result = await deleteCampaignsInBizChat(bizchatIds, useProduction);
        if (result.data.code !== "S000001") {
          return res.status(400).json({
            success: false,
            action: "delete",
            error: "Failed to delete campaign in BizChat",
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data
          });
        }
        return res.status(200).json({
          success: true,
          action: "delete",
          result: result.data
        });
      }
      if (action === "list") {
        const pageNumber = typeof req.body.pageNumber === "number" ? req.body.pageNumber : 0;
        let pageSize = typeof req.body.pageSize === "number" ? req.body.pageSize : 10;
        if (pageSize <= 0 || pageSize >= 20) {
          console.warn(`[BizChat List] Invalid pageSize ${pageSize}, adjusting to 10`);
          pageSize = 10;
        }
        const filters = {};
        if (req.body.tgtCompanyName && typeof req.body.tgtCompanyName === "string") {
          filters.tgtCompanyName = req.body.tgtCompanyName;
        }
        if (req.body.name && typeof req.body.name === "string") {
          filters.name = req.body.name;
        }
        if (req.body.states && Array.isArray(req.body.states)) {
          filters.states = req.body.states.filter((s) => typeof s === "number");
        }
        if (typeof req.body.isTmp === "number" && (req.body.isTmp === 0 || req.body.isTmp === 1)) {
          filters.isTmp = req.body.isTmp;
        }
        console.log(`[BizChat List] pageNumber=${pageNumber}, pageSize=${pageSize}, filters=`, JSON.stringify(filters));
        const result = await getCampaignList(pageNumber, pageSize, filters, useProduction);
        if (result.data.code !== "S000001") {
          return res.status(400).json({
            success: false,
            action: "list",
            error: "Failed to get campaign list from BizChat",
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data
          });
        }
        return res.status(200).json({
          success: true,
          action: "list",
          tid: result.data.tid,
          pageNumber: result.data.data?.pageNumber ?? pageNumber,
          pageSize: result.data.data?.pageSize ?? pageSize,
          totalPage: result.data.data?.totalPage ?? 0,
          totalAmount: result.data.data?.totalAmount ?? 0,
          campaigns: result.data.data?.list ?? [],
          result: result.data
        });
      }
      if (!campaignId) {
        return res.status(400).json({ error: "campaignId is required" });
      }
      const campaignResult = await db.select().from(campaigns14).where(eq36(campaigns14.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const campaign = campaignResult[0];
      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const messageResult = await db.select().from(messages3).where(eq36(messages3.campaignId, campaignId));
      const message = messageResult[0];
      switch (action) {
        case "create": {
          if (campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign already registered to BizChat" });
          }
          const sendTimeValidation = validateSendTime2(campaign.atsSndStartDate || campaign.scheduledAt);
          if (!sendTimeValidation.valid) {
            return res.status(400).json({ error: sendTimeValidation.error });
          }
          const result = await createCampaignInBizChat(campaign, message, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              error: "Failed to create campaign in BizChat",
              bizchatError: result.data
            });
          }
          const bizchatCampaignId = result.data.data?.id;
          if (bizchatCampaignId) {
            await db.update(campaigns14).set({
              bizchatCampaignId,
              statusCode: 0,
              // 임시등록
              status: "temp_registered",
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq36(campaigns14.id, campaignId));
          }
          return res.status(200).json({
            success: true,
            action: "create",
            bizchatCampaignId,
            result: result.data
          });
        }
        case "update": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const editableStates = [0, 2, 17];
          if (!editableStates.includes(campaign.statusCode || 0)) {
            return res.status(400).json({
              error: "Campaign cannot be modified in current state",
              currentState: campaign.statusCode,
              editableStates
            });
          }
          const updateData = req.body.updateData || {};
          if (updateData.atsSndStartDate) {
            const newSendDate = typeof updateData.atsSndStartDate === "number" ? new Date(updateData.atsSndStartDate * 1e3) : new Date(updateData.atsSndStartDate);
            const updateTimeValidation = validateSendTime2(newSendDate);
            if (!updateTimeValidation.valid) {
              return res.status(400).json({ error: updateTimeValidation.error });
            }
          }
          const result = await updateCampaignInBizChat(campaign.bizchatCampaignId, updateData, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              error: "Failed to update campaign in BizChat",
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data
            });
          }
          await db.update(campaigns14).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq36(campaigns14.id, campaignId));
          return res.status(200).json({
            success: true,
            action: "update",
            result: result.data
          });
        }
        case "approve": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const approvalTimeValidation = validateSendTime2(campaign.atsSndStartDate || campaign.scheduledAt);
          if (!approvalTimeValidation.valid) {
            return res.status(400).json({ error: approvalTimeValidation.error });
          }
          const result = await requestCampaignApproval(campaign.bizchatCampaignId, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              error: "Failed to request approval",
              bizchatError: result.data
            });
          }
          await db.update(campaigns14).set({
            statusCode: 10,
            // 승인요청
            status: "approval_requested",
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq36(campaigns14.id, campaignId));
          return res.status(200).json({
            success: true,
            action: "approve",
            result: result.data
          });
        }
        case "test": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          if (campaign.bizchatCampaignId.startsWith("SIM_")) {
            return res.status(400).json({
              success: false,
              error: "\uC774 \uCEA0\uD398\uC778\uC740 \uC720\uD6A8\uD55C BizChat \uCEA0\uD398\uC778 ID\uAC00 \uC5C6\uC5B4\uC694. \uCEA0\uD398\uC778\uC744 \uB2E4\uC2DC \uC0DD\uC131\uD574\uC8FC\uC138\uC694.",
              bizchatCode: "INVALID_CAMPAIGN_ID"
            });
          }
          if (!mdnList || !Array.isArray(mdnList) || mdnList.length === 0) {
            return res.status(400).json({
              error: "mdn array is required for test send",
              example: { mdnList: ["01012345678", "01087654321"] }
            });
          }
          if (mdnList.length > 20) {
            return res.status(400).json({
              error: "Maximum 20 numbers for test send",
              maxMdnCount: 20,
              providedCount: mdnList.length
            });
          }
          const invalidMdns = mdnList.filter((mdn) => !/^\d{10,11}$/.test(mdn.replace(/[^0-9]/g, "")));
          if (invalidMdns.length > 0) {
            return res.status(400).json({
              error: "Invalid phone number format",
              invalidNumbers: invalidMdns,
              format: "10-11 digits without dashes (e.g., 01012345678)"
            });
          }
          if (sendTime) {
            const testTimeValidation = validateSendTime2(new Date(sendTime * 1e3));
            if (!testTimeValidation.valid) {
              return res.status(400).json({ error: testTimeValidation.error });
            }
          }
          const normalizedMdnList = mdnList.map((mdn) => mdn.replace(/[^0-9]/g, ""));
          const result = await testSendCampaign(campaign.bizchatCampaignId, normalizedMdnList, sendTime, useProduction);
          if (result.data.code !== "S000001") {
            if (result.data.code === "E000005") {
              return res.status(400).json({
                success: false,
                action: "test",
                error: "\uCEA0\uD398\uC778\uC774 BizChat \uC11C\uBC84\uC5D0 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC544\uC694. \uCEA0\uD398\uC778\uC744 \uB2E4\uC2DC \uC0DD\uC131\uD574\uC8FC\uC138\uC694.",
                bizchatCode: result.data.code,
                bizchatMessage: result.data.msg,
                hint: "\uAC1C\uBC1C \uD658\uACBD\uC5D0\uC11C \uC0DD\uC131\uB41C \uCEA0\uD398\uC778\uC740 \uC6B4\uC601 \uD658\uACBD\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC5B4\uC694.",
                environment: useProduction ? "production" : "development"
              });
            }
            return res.status(400).json({
              success: false,
              action: "test",
              error: "Failed to send test message",
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data
            });
          }
          return res.status(200).json({
            success: true,
            action: "test",
            message: `\uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC774 \uC694\uCCAD\uB418\uC5C8\uC2B5\uB2C8\uB2E4 (${normalizedMdnList.length}\uAC74)`,
            mdnCount: normalizedMdnList.length,
            result: result.data
          });
        }
        case "stats": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const result = await getCampaignStats(campaign.bizchatCampaignId, useProduction);
          return res.status(200).json({
            success: result.data.code === "S000001",
            action: "stats",
            result: result.data
          });
        }
        case "cancel": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const result = await cancelCampaign(campaign.bizchatCampaignId, useProduction);
          if (result.data.code === "S000001") {
            await db.update(campaigns14).set({
              statusCode: 25,
              status: "cancelled",
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq36(campaigns14.id, campaignId));
          }
          return res.status(200).json({
            success: result.data.code === "S000001",
            action: "cancel",
            result: result.data
          });
        }
        case "stop": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const result = await stopCampaign(campaign.bizchatCampaignId, useProduction);
          if (result.data.code === "S000001") {
            await db.update(campaigns14).set({
              statusCode: 35,
              status: "stopped",
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq36(campaigns14.id, campaignId));
          }
          return res.status(200).json({
            success: result.data.code === "S000001",
            action: "stop",
            result: result.data
          });
        }
        case "mdn": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const pageNumber = req.body.pageNumber || 1;
          const pageSize = req.body.pageSize || 100;
          const result = await getCampaignMdnList(campaign.bizchatCampaignId, pageNumber, pageSize, useProduction);
          return res.status(200).json({
            success: result.data.code === "S000001",
            action: "mdn",
            pageNumber,
            pageSize,
            result: result.data
          });
        }
        case "result": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const result = await getCampaignResult(campaign.bizchatCampaignId, useProduction);
          return res.status(200).json({
            success: result.data.code === "S000001",
            action: "result",
            result: result.data
          });
        }
        case "testCancel": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          if (campaign.bizchatCampaignId.startsWith("SIM_")) {
            return res.status(400).json({
              success: false,
              error: "\uC774 \uCEA0\uD398\uC778\uC740 \uC720\uD6A8\uD55C BizChat \uCEA0\uD398\uC778 ID\uAC00 \uC5C6\uC5B4\uC694. \uCEA0\uD398\uC778\uC744 \uB2E4\uC2DC \uC0DD\uC131\uD574\uC8FC\uC138\uC694.",
              bizchatCode: "INVALID_CAMPAIGN_ID"
            });
          }
          const result = await cancelTestSend(campaign.bizchatCampaignId, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              success: false,
              action: "testCancel",
              error: "Failed to cancel test send",
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data
            });
          }
          return res.status(200).json({
            success: true,
            action: "testCancel",
            result: result.data
          });
        }
        case "testResult": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          if (campaign.bizchatCampaignId.startsWith("SIM_")) {
            return res.status(400).json({
              success: false,
              error: "\uC774 \uCEA0\uD398\uC778\uC740 \uC720\uD6A8\uD55C BizChat \uCEA0\uD398\uC778 ID\uAC00 \uC5C6\uC5B4\uC694. \uCEA0\uD398\uC778\uC744 \uB2E4\uC2DC \uC0DD\uC131\uD574\uC8FC\uC138\uC694.",
              bizchatCode: "INVALID_CAMPAIGN_ID"
            });
          }
          const result = await getTestResults(campaign.bizchatCampaignId, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              success: false,
              action: "testResult",
              error: "Failed to get test results",
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data
            });
          }
          return res.status(200).json({
            success: true,
            action: "testResult",
            result: result.data
          });
        }
        case "verifyMdn": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          if (campaign.rcvType !== 10) {
            return res.status(400).json({
              error: "MDN verification is only available for rcvType=10 (direct MDN)",
              currentRcvType: campaign.rcvType
            });
          }
          const result = await verifyMdn(campaign.bizchatCampaignId, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              success: false,
              action: "verifyMdn",
              error: "Failed to verify MDN",
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data
            });
          }
          return res.status(200).json({
            success: true,
            action: "verifyMdn",
            result: result.data
          });
        }
        case "read": {
          if (!campaign.bizchatCampaignId) {
            return res.status(400).json({ error: "Campaign not registered to BizChat" });
          }
          const result = await getCampaignFromBizChat(campaign.bizchatCampaignId, useProduction);
          if (result.data.code !== "S000001") {
            return res.status(400).json({
              success: false,
              action: "read",
              error: "Failed to read campaign from BizChat",
              bizchatCode: result.data.code,
              bizchatMessage: result.data.msg,
              bizchatError: result.data
            });
          }
          return res.status(200).json({
            success: true,
            action: "read",
            bizchatCampaignId: campaign.bizchatCampaignId,
            campaign: result.data.data,
            result: result.data
          });
        }
        default:
          return res.status(400).json({
            error: "Invalid action",
            validActions: ["create", "read", "update", "approve", "test", "testCancel", "testResult", "stats", "cancel", "stop", "delete", "mdn", "result", "verifyMdn", "list"]
          });
      }
    } catch (error) {
      console.error("[BizChat Campaigns] Error:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  }
  if (req.method === "GET") {
    try {
      const { campaignId } = req.query;
      if (!campaignId || typeof campaignId !== "string") {
        return res.status(400).json({ error: "campaignId query parameter is required" });
      }
      const campaignResult = await db.select().from(campaigns14).where(eq36(campaigns14.id, campaignId));
      if (campaignResult.length === 0) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      const campaign = campaignResult[0];
      if (campaign.userId !== auth.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!campaign.bizchatCampaignId) {
        return res.status(200).json({
          registered: false,
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            statusCode: campaign.statusCode
          }
        });
      }
      const result = await getCampaignFromBizChat(campaign.bizchatCampaignId, useProduction);
      return res.status(200).json({
        registered: true,
        bizchatCampaignId: campaign.bizchatCampaignId,
        localStatus: {
          status: campaign.status,
          statusCode: campaign.statusCode
        },
        bizchatStatus: result.data
      });
    } catch (error) {
      console.error("[BizChat Campaigns] Error:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/bizchat/file.ts
var file_exports = {};
__export(file_exports, {
  default: () => handler40
});
import { createClient as createClient17 } from "@supabase/supabase-js";
import FormData from "form-data";
import { createHmac as createHmac10 } from "crypto";
var BIZCHAT_DEV_URL7 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL7 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getSupabaseAdmin16() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient17(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken11(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac10("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth14(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken11(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin16().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid5() {
  return Date.now().toString();
}
async function handler40(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth14(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const detectEnv = () => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
    if (forceDevMode) {
      console.log('[BizChat File] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === "prod" || req.body?.env === "prod") return true;
    if (req.query.env === "dev" || req.body?.env === "dev") return false;
    if (process.env.VERCEL_ENV === "production") return true;
    if (process.env.NODE_ENV === "production") return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat File] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  const baseUrl = useProduction ? BIZCHAT_PROD_URL7 : BIZCHAT_DEV_URL7;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "BizChat API key not configured" });
  }
  try {
    const { fileData, fileName, fileType, type, rcs } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "fileData is required (base64 encoded)" });
    }
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required" });
    }
    const tid = generateTid5();
    const fileTypeParam = type || 2;
    const rcsParam = rcs || 0;
    const url = `${baseUrl}/api/v1/file?tid=${tid}&type=${fileTypeParam}&rcs=${rcsParam}`;
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "jpg";
    const safeFileName = `bizchat_upload_${Date.now()}.${fileExt}`;
    console.log(`[BizChat File] Uploading file: ${fileName} -> ${safeFileName}`);
    const formData = new FormData();
    const base64Data = fileData.replace(/^data:[^;]+;base64,/, "");
    const binaryData = Buffer.from(base64Data, "base64");
    formData.append("file", binaryData, {
      filename: safeFileName,
      contentType: fileType || "image/jpeg"
    });
    const formBuffer = formData.getBuffer();
    const formHeaders = formData.getHeaders();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        ...formHeaders
        // multipart boundary 포함
      },
      body: new Uint8Array(formBuffer)
      // Buffer를 Uint8Array로 변환 (fetch body 호환)
    });
    const responseText = await response.text();
    console.log(`[BizChat File] Response: ${response.status} - ${responseText.substring(0, 300)}`);
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { code: response.status.toString(), msg: responseText };
    }
    if (data.code === "S000001") {
      return res.status(200).json({
        success: true,
        fileId: data.data?.origId || data.data?.id,
        fileName,
        rawResponse: data
      });
    } else {
      return res.status(400).json({
        success: false,
        error: data.msg || "File upload failed",
        rawResponse: data
      });
    }
  } catch (error) {
    console.error("[BizChat File] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/bizchat/mdn-upload.ts
var mdn_upload_exports = {};
__export(mdn_upload_exports, {
  default: () => handler41
});
import { createClient as createClient18 } from "@supabase/supabase-js";
import { createHmac as createHmac11 } from "crypto";
var BIZCHAT_DEV_URL8 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL8 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getSupabaseAdmin17() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient18(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken12(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac11("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth15(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken12(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin17().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid6() {
  return Date.now().toString();
}
function detectProductionEnvironment2(req) {
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
  if (forceDevMode) return false;
  if (req.query.env === "prod" || req.body?.env === "prod") return true;
  if (req.query.env === "dev" || req.body?.env === "dev") return false;
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}
async function handler41(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth15(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { mdnList, action } = req.body;
    if (action === "create-file") {
      if (!mdnList || !Array.isArray(mdnList) || mdnList.length === 0) {
        return res.status(400).json({ error: "mdnList is required (array of phone numbers)" });
      }
      if (mdnList.length > 2e5) {
        return res.status(400).json({ error: "Maximum 200,000 MDN allowed" });
      }
      const csvContent = mdnList.map((mdn) => {
        const cleanMdn = mdn.replace(/[-\s]/g, "");
        return cleanMdn.startsWith("010") ? cleanMdn : `010${cleanMdn}`;
      }).join("\n");
      const csvBuffer = Buffer.from(csvContent, "utf-8");
      const useProduction = detectProductionEnvironment2(req);
      const baseUrl = useProduction ? BIZCHAT_PROD_URL8 : BIZCHAT_DEV_URL8;
      const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "BizChat API key not configured" });
      }
      const tid = generateTid6();
      const url = `${baseUrl}/api/v1/file?tid=${tid}&type=4&rcs=0`;
      console.log(`[BizChat MDN Upload] POST ${url}`);
      console.log(`[BizChat MDN Upload] MDN count: ${mdnList.length}`);
      const boundary = `----FormBoundary${Date.now()}`;
      const fileName = `mdn_${tid}.csv`;
      const formDataParts = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
        "Content-Type: text/csv",
        "",
        csvContent,
        `--${boundary}--`,
        ""
      ];
      const formDataBody = formDataParts.join("\r\n");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": apiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: formDataBody
      });
      const responseText = await response.text();
      console.log(`[BizChat MDN Upload] Response: ${response.status} - ${responseText}`);
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { code: response.status.toString(), msg: responseText };
      }
      if (data.code === "S000001" && data.data?.id) {
        return res.status(200).json({
          success: true,
          mdnFileId: data.data.id,
          mdnCount: mdnList.length,
          message: "MDN \uD30C\uC77C\uC774 \uC131\uACF5\uC801\uC73C\uB85C \uC5C5\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4"
        });
      } else {
        return res.status(400).json({
          success: false,
          error: data.msg || "MDN \uD30C\uC77C \uC5C5\uB85C\uB4DC \uC2E4\uD328",
          code: data.code
        });
      }
    }
    return res.status(400).json({ error: 'Invalid action. Use "create-file"' });
  } catch (error) {
    console.error("[BizChat MDN Upload] Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/bizchat/sender.ts
var sender_exports = {};
__export(sender_exports, {
  default: () => handler42
});
import { createClient as createClient19 } from "@supabase/supabase-js";
import { createHmac as createHmac12 } from "crypto";
var BIZCHAT_DEV_URL9 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL9 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getSupabaseAdmin18() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient19(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken13(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac12("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth16(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken13(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin18().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid7() {
  return Date.now().toString();
}
async function callBizChatAPI5(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL9 : BIZCHAT_DEV_URL9;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }
  const tid = generateTid7();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat Sender] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Sender] Request body:`, JSON.stringify(body).substring(0, 500));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat Sender] Response: ${response.status} - ${responseText.substring(0, 300)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function handler42(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  const auth = await verifyAuth16(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const detectEnv = () => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
    if (forceDevMode) {
      console.log('[BizChat Sender] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === "prod" || req.body?.env === "prod") return true;
    if (req.query.env === "dev" || req.body?.env === "dev") return false;
    if (process.env.VERCEL_ENV === "production") return true;
    if (process.env.NODE_ENV === "production") return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat Sender] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  const action = req.body?.action || req.query.action || "list";
  try {
    switch (action) {
      case "list": {
        const result = await callBizChatAPI5("/api/v1/sndnum/list", "POST", {}, useProduction);
        const rawList = result.data.data?.list || [];
        const senderNumbers = rawList.map((item) => ({
          id: item.id,
          // 발신번호코드 (캠페인 생성 시 sndNum에 사용)
          code: item.id,
          // 발신번호코드 (별칭)
          num: item.num,
          // 실제 발신번호
          number: item.num,
          // 실제 발신번호 (별칭)
          name: item.name || "",
          // 발신번호 이름
          displayName: item.name ? `${item.name} (${item.num})` : item.num,
          comment: item.comment || "",
          state: item.state,
          // 상태
          regDate: item.regDate
          // 등록일
        }));
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "list",
          senderNumbers,
          // 캠페인 생성 시 사용법 안내
          usage: {
            note: "\uCEA0\uD398\uC778 \uC0DD\uC131 \uC2DC sndNum \uD544\uB4DC\uC5D0 \uBC1C\uC2E0\uBC88\uD638\uCF54\uB4DC(id/code)\uB97C \uC0AC\uC6A9\uD558\uC138\uC694",
            example: 'sndNum: "001001" (SK\uD154\uB808\uCF64 \uD61C\uD0DD \uC54C\uB9BC - 16700823)'
          },
          rawResponse: result.data
        });
      }
      case "create": {
        const { number, name, comment, certFiles } = req.body;
        if (!number) {
          return res.status(400).json({ error: "number is required" });
        }
        const payload = {
          num: number.replace(/[^0-9]/g, ""),
          name: name || "",
          comment: comment || ""
        };
        if (certFiles && Array.isArray(certFiles) && certFiles.length > 0) {
          payload.certFiles = certFiles;
        }
        const result = await callBizChatAPI5("/api/v1/sndnum/create", "POST", payload, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "create",
          senderNumberId: result.data.data?.id,
          rawResponse: result.data
        });
      }
      case "read": {
        const { senderId } = req.body;
        if (!senderId) {
          return res.status(400).json({ error: "senderId is required" });
        }
        const result = await callBizChatAPI5(`/api/v1/sndnum?id=${senderId}`, "GET", void 0, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "read",
          senderNumber: result.data.data,
          rawResponse: result.data
        });
      }
      case "update": {
        const { senderId, name, comment, certFiles } = req.body;
        if (!senderId) {
          return res.status(400).json({ error: "senderId is required" });
        }
        const payload = {};
        if (name !== void 0) payload.name = name;
        if (comment !== void 0) payload.comment = comment;
        if (certFiles) payload.certFiles = certFiles;
        const result = await callBizChatAPI5(`/api/v1/sndnum/update?id=${senderId}`, "POST", payload, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "update",
          rawResponse: result.data
        });
      }
      case "delete": {
        const { senderId } = req.body;
        if (!senderId) {
          return res.status(400).json({ error: "senderId is required" });
        }
        const result = await callBizChatAPI5(`/api/v1/sndnum/delete?id=${senderId}`, "POST", {}, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "delete",
          rawResponse: result.data
        });
      }
      default:
        return res.status(400).json({
          error: "Invalid action",
          validActions: ["list", "create", "read", "update", "delete"]
        });
    }
  } catch (error) {
    console.error("[BizChat Sender] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/bizchat/stats.ts
var stats_exports3 = {};
__export(stats_exports3, {
  default: () => handler43
});
import { createClient as createClient20 } from "@supabase/supabase-js";
import { neon as neon37, neonConfig as neonConfig12 } from "@neondatabase/serverless";
import { createHmac as createHmac13 } from "crypto";
import { drizzle as drizzle37 } from "drizzle-orm/neon-http";
import { eq as eq37 } from "drizzle-orm";
import { pgTable as pgTable36, text as text25, integer as integer18 } from "drizzle-orm/pg-core";
neonConfig12.fetchConnectionCache = true;
var BIZCHAT_DEV_URL10 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL10 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
var campaigns15 = pgTable36("campaigns", {
  id: text25("id").primaryKey(),
  userId: text25("user_id").notNull(),
  bizchatCampaignId: text25("bizchat_campaign_id"),
  statusCode: integer18("status_code").default(0)
});
function getDb37() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle37(neon37(dbUrl));
}
function getSupabaseAdmin19() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient20(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken14(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac13("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth17(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken14(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin19().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid8() {
  return Date.now().toString();
}
function getBizChatUrl2() {
  const useProd = process.env.BIZCHAT_USE_PROD === "true";
  return useProd ? BIZCHAT_PROD_URL10 : BIZCHAT_DEV_URL10;
}
function getBizChatApiKey2() {
  const useProd = process.env.BIZCHAT_USE_PROD === "true";
  const key = useProd ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!key) throw new Error("BizChat API key is not configured");
  return key;
}
async function fetchCampaignStats(bizchatCampaignId) {
  const tid = generateTid8();
  const baseUrl = getBizChatUrl2();
  const apiKey = getBizChatApiKey2();
  const queryParams = new URLSearchParams({
    tid,
    id: bizchatCampaignId
  });
  const response = await fetch(`${baseUrl}/api/v1/cmpn/stat/read?${queryParams.toString()}`, {
    method: "GET",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`BizChat API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function handler43(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  try {
    const user = await verifyAuth17(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "\uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4" });
    }
    const db = getDb37();
    if (req.method === "GET") {
      const { campaignId } = req.query;
      if (!campaignId || typeof campaignId !== "string") {
        return res.status(400).json({ success: false, error: "\uCEA0\uD398\uC778 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" });
      }
      const [campaign] = await db.select().from(campaigns15).where(eq37(campaigns15.id, campaignId)).limit(1);
      if (!campaign) {
        return res.status(404).json({ success: false, error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
      }
      if (campaign.userId !== user.userId) {
        return res.status(403).json({ success: false, error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
      }
      if (!campaign.bizchatCampaignId) {
        return res.status(400).json({
          success: false,
          error: "BizChat\uC5D0 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uCEA0\uD398\uC778\uC785\uB2C8\uB2E4"
        });
      }
      const statsResponse = await fetchCampaignStats(campaign.bizchatCampaignId);
      if (statsResponse.code !== "S000001") {
        return res.status(400).json({
          success: false,
          error: statsResponse.msg || "\uD1B5\uACC4 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
          bizChatCode: statsResponse.code
        });
      }
      return res.status(200).json({
        success: true,
        data: statsResponse.data,
        meta: {
          campaignId,
          bizchatCampaignId: campaign.bizchatCampaignId,
          refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    if (req.method === "POST") {
      const { action, campaignId } = req.body;
      if (action === "fetchStats") {
        if (!campaignId) {
          return res.status(400).json({ success: false, error: "\uCEA0\uD398\uC778 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" });
        }
        const [campaign] = await db.select().from(campaigns15).where(eq37(campaigns15.id, campaignId)).limit(1);
        if (!campaign) {
          return res.status(404).json({ success: false, error: "\uCEA0\uD398\uC778\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
        }
        if (campaign.userId !== user.userId) {
          return res.status(403).json({ success: false, error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" });
        }
        if (!campaign.bizchatCampaignId) {
          return res.status(400).json({
            success: false,
            error: "BizChat\uC5D0 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uCEA0\uD398\uC778\uC785\uB2C8\uB2E4"
          });
        }
        const statsResponse = await fetchCampaignStats(campaign.bizchatCampaignId);
        if (statsResponse.code !== "S000001") {
          return res.status(400).json({
            success: false,
            error: statsResponse.msg || "\uD1B5\uACC4 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
            bizChatCode: statsResponse.code
          });
        }
        return res.status(200).json({
          success: true,
          data: statsResponse.data,
          meta: {
            campaignId,
            bizchatCampaignId: campaign.bizchatCampaignId,
            refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
      }
      return res.status(400).json({ success: false, error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 action\uC785\uB2C8\uB2E4" });
    }
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (error) {
    console.error("Stats API error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4"
    });
  }
}

// src/handlers/bizchat/template.ts
var template_exports = {};
__export(template_exports, {
  default: () => handler44
});
import { createClient as createClient21 } from "@supabase/supabase-js";
import { createHmac as createHmac14 } from "crypto";
var BIZCHAT_DEV_URL11 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL11 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getSupabaseAdmin20() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient21(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken15(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac14("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth18(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken15(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin20().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid9() {
  return Date.now().toString();
}
async function callBizChatAPI6(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL11 : BIZCHAT_DEV_URL11;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }
  const tid = generateTid9();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat Template] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Template] Request body:`, JSON.stringify(body).substring(0, 500));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat Template] Response: ${response.status} - ${responseText.substring(0, 300)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function handler44(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth18(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const detectEnv = () => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
    if (forceDevMode) {
      console.log('[BizChat Template] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === "prod" || req.body?.env === "prod") return true;
    if (req.query.env === "dev" || req.body?.env === "dev") return false;
    if (process.env.VERCEL_ENV === "production") return true;
    if (process.env.NODE_ENV === "production") return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat Template] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  const action = req.body?.action || "list";
  try {
    switch (action) {
      case "list": {
        const { pageNumber = 1, pageSize = 20 } = req.body;
        const result = await callBizChatAPI6("/api/v1/cmpn/tpl/list", "POST", {
          pageNumber,
          pageSize
        }, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "list",
          templates: result.data.data?.list || [],
          total: result.data.data?.total || 0,
          rawResponse: result.data
        });
      }
      case "read": {
        const { templateId } = req.body;
        if (!templateId) {
          return res.status(400).json({ error: "templateId is required" });
        }
        const result = await callBizChatAPI6(`/api/v1/cmpn/tpl?id=${templateId}`, "GET", void 0, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "read",
          template: result.data.data,
          rawResponse: result.data
        });
      }
      case "create": {
        const {
          name,
          msgType,
          senderNumber,
          title,
          content,
          imageId,
          buttons
        } = req.body;
        if (!name || !msgType) {
          return res.status(400).json({ error: "name and msgType are required" });
        }
        const validMsgTypes = ["SMS", "LMS", "MMS", "RCS"];
        if (!validMsgTypes.includes(msgType)) {
          return res.status(400).json({
            error: "Invalid msgType",
            validTypes: validMsgTypes
          });
        }
        const payload = {
          name,
          msgType,
          title: title || "",
          msg: content || ""
        };
        if (senderNumber) {
          payload.sndNum = senderNumber.replace(/[^0-9]/g, "");
        }
        if (msgType === "MMS" && imageId) {
          payload.mms = [{
            origId: imageId
          }];
        }
        if (msgType === "RCS") {
          payload.rcs = [{
            slideNum: 1,
            title: title || "",
            msg: content || "",
            urlLink: { list: [] },
            buttons: buttons ? { list: buttons } : { list: [] }
          }];
        }
        const result = await callBizChatAPI6("/api/v1/cmpn/tpl/create", "POST", payload, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "create",
          templateId: result.data.data?.id,
          rawResponse: result.data
        });
      }
      case "update": {
        const { templateId, name, title, content, imageId, buttons } = req.body;
        if (!templateId) {
          return res.status(400).json({ error: "templateId is required" });
        }
        const payload = {};
        if (name !== void 0) payload.name = name;
        if (title !== void 0) payload.title = title;
        if (content !== void 0) payload.msg = content;
        if (imageId !== void 0) {
          payload.mms = [{ origId: imageId }];
        }
        if (buttons !== void 0) {
          payload.rcs = [{
            slideNum: 1,
            buttons: { list: buttons }
          }];
        }
        const result = await callBizChatAPI6(`/api/v1/cmpn/tpl/update?id=${templateId}`, "POST", payload, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "update",
          rawResponse: result.data
        });
      }
      case "delete": {
        const { templateId } = req.body;
        if (!templateId) {
          return res.status(400).json({ error: "templateId is required" });
        }
        const result = await callBizChatAPI6(`/api/v1/cmpn/tpl/delete?id=${templateId}`, "POST", {}, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "delete",
          rawResponse: result.data
        });
      }
      case "submit": {
        const { templateId } = req.body;
        if (!templateId) {
          return res.status(400).json({ error: "templateId is required" });
        }
        const result = await callBizChatAPI6(`/api/v1/cmpn/tpl/appr/req?id=${templateId}`, "POST", {}, useProduction);
        return res.status(200).json({
          success: result.data.code === "S000001",
          action: "submit",
          rawResponse: result.data
        });
      }
      default:
        return res.status(400).json({
          error: "Invalid action",
          validActions: ["list", "read", "create", "update", "delete", "submit"]
        });
    }
  } catch (error) {
    console.error("[BizChat Template] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

// src/handlers/bizchat/test.ts
var test_exports = {};
__export(test_exports, {
  default: () => handler45
});
var BIZCHAT_DEV_URL12 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL12 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function generateTid10() {
  return Date.now().toString();
}
async function callBizChatAPI7(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL12 : BIZCHAT_DEV_URL12;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error(`BizChat API key not configured for ${useProduction ? "production" : "development"}`);
  }
  const tid = generateTid10();
  const url = `${baseUrl}${endpoint}?tid=${tid}`;
  console.log(`[BizChat] Calling ${method} ${url}`);
  const headers = {
    "Content-Type": "application/json",
    "Authorization": apiKey
  };
  const options = {
    method,
    headers
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat] Request body:`, JSON.stringify(body).substring(0, 300));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat] Response status: ${response.status}`);
  console.log(`[BizChat] Response body: ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = {
      code: response.status.toString(),
      message: responseText || response.statusText
    };
  }
  return data;
}
async function getSenderNumbers(useProduction = false) {
  return callBizChatAPI7("/api/v1/sndnum/list", "POST", {}, useProduction);
}
async function getCampaignList2(useProduction = false) {
  return callBizChatAPI7("/api/v1/cmpn/list", "POST", {
    pageNumber: 1,
    pageSize: 10
  }, useProduction);
}
async function getAtsMetaFilter(useProduction = false) {
  return callBizChatAPI7("/api/v1/ats/meta/filter", "POST", {}, useProduction);
}
async function handler45(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const detectEnv = () => {
      const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
      if (forceDevMode) {
        console.log('[BizChat Test] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
        return false;
      }
      if (req.query.env === "prod" || req.body?.env === "prod") return true;
      if (req.query.env === "dev" || req.body?.env === "dev") return false;
      if (process.env.VERCEL_ENV === "production") return true;
      if (process.env.NODE_ENV === "production") return true;
      return false;
    };
    const useProduction = detectEnv();
    const testType = req.query.type || req.body?.type || "sndnum";
    console.log(`[BizChat Test] Environment: ${useProduction ? "Production" : "Development"}`);
    console.log(`[BizChat Test] Test type: ${testType}`);
    let result;
    let apiPath;
    switch (testType) {
      case "sndnum":
        apiPath = "/api/v1/sndnum/list";
        result = await getSenderNumbers(useProduction);
        break;
      case "campaign":
        apiPath = "/api/v1/cmpn/list";
        result = await getCampaignList2(useProduction);
        break;
      case "ats":
        apiPath = "/api/v1/ats/meta/filter";
        result = await getAtsMetaFilter(useProduction);
        break;
      default:
        apiPath = "/api/v1/sndnum/list";
        result = await getSenderNumbers(useProduction);
    }
    const isSuccess = result.code === "S000001";
    return res.status(200).json({
      success: isSuccess,
      environment: useProduction ? "production" : "development",
      testType,
      apiPath,
      baseUrl: useProduction ? BIZCHAT_PROD_URL12 : BIZCHAT_DEV_URL12,
      result
    });
  } catch (error) {
    console.error("[BizChat Test] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      environment: req.query.env === "prod" ? "production" : "development"
    });
  }
}

// src/handlers/campaigns/[id].ts
var id_exports2 = {};
__export(id_exports2, {
  default: () => handler46
});
import { createClient as createClient22 } from "@supabase/supabase-js";
import { neon as neon38, neonConfig as neonConfig13 } from "@neondatabase/serverless";
import { drizzle as drizzle38 } from "drizzle-orm/neon-http";
import { eq as eq38 } from "drizzle-orm";
import { pgTable as pgTable37, text as text26, integer as integer19, timestamp as timestamp34, numeric as numeric2, jsonb as jsonb14 } from "drizzle-orm/pg-core";
import { createHmac as createHmac15 } from "crypto";
neonConfig13.fetchConnectionCache = true;
var campaigns16 = pgTable37("campaigns", {
  id: text26("id").primaryKey(),
  userId: text26("user_id").notNull(),
  name: text26("name").notNull(),
  templateId: text26("template_id"),
  messageType: text26("message_type"),
  sndNum: text26("snd_num"),
  statusCode: integer19("status_code").default(0),
  status: text26("status").default("temp_registered"),
  targetCount: integer19("target_count"),
  sentCount: integer19("sent_count"),
  successCount: integer19("success_count"),
  clickCount: integer19("click_count"),
  budget: numeric2("budget"),
  costPerMessage: numeric2("cost_per_message"),
  scheduledAt: timestamp34("scheduled_at"),
  completedAt: timestamp34("completed_at"),
  rejectionReason: text26("rejection_reason"),
  bizchatCampaignId: text26("bizchat_campaign_id"),
  rcvType: integer19("rcv_type").default(0),
  billingType: integer19("billing_type").default(0),
  rcsType: integer19("rcs_type"),
  tgtCompanyName: text26("tgt_company_name"),
  sndGoalCnt: integer19("snd_goal_cnt"),
  sndMosu: integer19("snd_mosu"),
  sndMosuQuery: text26("snd_mosu_query"),
  sndMosuDesc: text26("snd_mosu_desc"),
  settleCnt: integer19("settle_cnt").default(0),
  mdnFileId: text26("mdn_file_id"),
  // Maptics 지오펜스 발송 관련 필드
  atsSndStartDate: timestamp34("ats_snd_start_date"),
  collStartDate: timestamp34("coll_start_date"),
  collEndDate: timestamp34("coll_end_date"),
  collSndDate: timestamp34("coll_snd_date"),
  sndGeofenceId: integer19("snd_geofence_id"),
  rtStartHhmm: text26("rt_start_hhmm"),
  rtEndHhmm: text26("rt_end_hhmm"),
  sndDayDiv: integer19("snd_day_div"),
  createdAt: timestamp34("created_at").defaultNow(),
  updatedAt: timestamp34("updated_at").defaultNow()
});
var messages4 = pgTable37("messages", {
  id: text26("id").primaryKey(),
  campaignId: text26("campaign_id").notNull(),
  title: text26("title"),
  lmsTitle: text26("lms_title"),
  content: text26("content").notNull(),
  imageUrl: text26("image_url"),
  imageFileId: text26("image_file_id"),
  urlLinks: jsonb14("url_links"),
  buttons: jsonb14("buttons"),
  lmsContent: text26("lms_content"),
  lmsImageUrl: text26("lms_image_url"),
  lmsImageFileId: text26("lms_image_file_id"),
  lmsUrlLinks: jsonb14("lms_url_links")
});
var targeting3 = pgTable37("targeting", {
  id: text26("id").primaryKey(),
  campaignId: text26("campaign_id").notNull(),
  gender: text26("gender"),
  ageMin: integer19("age_min"),
  ageMax: integer19("age_max"),
  regions: text26("regions").array(),
  districts: text26("districts").array(),
  carrierTypes: text26("carrier_types").array(),
  deviceTypes: text26("device_types").array(),
  shopping11stCategories: text26("shopping_11st_categories").array(),
  webappCategories: text26("webapp_categories").array(),
  callUsageTypes: text26("call_usage_types").array(),
  locationTypes: text26("location_types").array(),
  mobilityPatterns: text26("mobility_patterns").array(),
  geofenceIds: text26("geofence_ids").array(),
  atsQuery: text26("ats_query"),
  estimatedCount: integer19("estimated_count"),
  createdAt: timestamp34("created_at").defaultNow()
});
var reports2 = pgTable37("reports", {
  id: text26("id").primaryKey(),
  campaignId: text26("campaign_id").notNull(),
  sentCount: integer19("sent_count").default(0),
  deliveredCount: integer19("delivered_count").default(0),
  successCount: integer19("success_count").default(0),
  failedCount: integer19("failed_count").default(0),
  clickCount: integer19("click_count").default(0),
  optOutCount: integer19("opt_out_count").default(0),
  conversionRate: numeric2("conversion_rate"),
  createdAt: timestamp34("created_at").defaultNow(),
  updatedAt: timestamp34("updated_at").defaultNow()
});
function getDb38() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle38(neon38(dbUrl));
}
function getSupabaseAdmin21() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient22(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken16(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac15("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth19(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken16(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      console.log(`[Campaign API] Impersonate auth verified for user: ${verified.userId} by admin: ${verified.adminId}`);
      return { userId: verified.userId, email: "" };
    }
    console.log("[Campaign API] Impersonate token verification failed");
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin21().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler46(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  const auth = await verifyAuth19(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid campaign ID" });
  const db = getDb38();
  const userId = auth.userId;
  if (req.method === "GET") {
    try {
      const campaignResult = await db.select().from(campaigns16).where(eq38(campaigns16.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.userId !== userId) return res.status(403).json({ error: "Access denied" });
      const messageResult = await db.select().from(messages4).where(eq38(messages4.campaignId, id));
      const targetingResult = await db.select().from(targeting3).where(eq38(targeting3.campaignId, id));
      const reportResult = await db.select().from(reports2).where(eq38(reports2.campaignId, id));
      return res.status(200).json({
        ...campaign,
        message: messageResult[0],
        targeting: targetingResult[0],
        report: reportResult[0]
      });
    } catch (error) {
      console.error("Error fetching campaign:", error);
      return res.status(500).json({ error: "Failed to fetch campaign" });
    }
  }
  if (req.method === "PATCH") {
    try {
      const campaignResult = await db.select().from(campaigns16).where(eq38(campaigns16.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.userId !== userId) return res.status(403).json({ error: "Access denied" });
      const messageResult = await db.select().from(messages4).where(eq38(messages4.campaignId, id));
      const message = messageResult[0];
      const updateData = { ...req.body, updatedAt: /* @__PURE__ */ new Date() };
      const dateFields = ["scheduledAt", "atsSndStartDate", "completedAt", "collStartDate", "collEndDate", "collSndDate"];
      for (const field of dateFields) {
        if (updateData[field] && typeof updateData[field] === "string") {
          updateData[field] = new Date(updateData[field]);
        } else if (updateData[field] === "" || updateData[field] === null) {
          updateData[field] = null;
        }
      }
      const intFields = ["sndMosu", "sndGoalCnt", "targetCount", "rcvType", "billingType", "rcsType", "settleCnt", "statusCode", "sndGeofenceId", "sndDayDiv"];
      for (const field of intFields) {
        if (updateData[field] !== void 0 && updateData[field] !== null) {
          const value = updateData[field];
          if (typeof value === "string") {
            updateData[field] = parseInt(value, 10);
          }
        }
      }
      console.log("[Campaign PATCH] Updating campaign:", id, "Fields:", Object.keys(updateData).filter((k) => k !== "updatedAt"));
      if (updateData.sndMosu !== void 0) {
        console.log("[Campaign PATCH] sndMosu value:", updateData.sndMosu);
      }
      const updatedResult = await db.update(campaigns16).set(updateData).where(eq38(campaigns16.id, id)).returning();
      const updatedCampaign = updatedResult[0];
      const bizchatId = campaign.bizchatCampaignId;
      const isSimulation = bizchatId?.startsWith("SIM_");
      const editableStates = [0, 2, 17];
      const canUpdateBizChat = bizchatId && !isSimulation && editableStates.includes(campaign.statusCode || 0);
      if (canUpdateBizChat) {
        try {
          const host = req.headers.host || process.env.VERCEL_URL || "localhost:5000";
          const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
          const protocol = req.headers["x-forwarded-proto"] || (isLocalhost ? "http" : "https");
          const baseUrl = `${protocol}://${host}`;
          const messageUpdate = req.body.message;
          let currentMessage = message;
          if (messageUpdate) {
            const messageUpdateData = {};
            if (messageUpdate.title !== void 0) messageUpdateData.title = messageUpdate.title;
            if (messageUpdate.lmsTitle !== void 0) messageUpdateData.lmsTitle = messageUpdate.lmsTitle;
            if (messageUpdate.content !== void 0) messageUpdateData.content = messageUpdate.content;
            if (messageUpdate.imageUrl !== void 0) messageUpdateData.imageUrl = messageUpdate.imageUrl;
            if (messageUpdate.imageFileId !== void 0) messageUpdateData.imageFileId = messageUpdate.imageFileId;
            if (messageUpdate.urlLinks !== void 0) messageUpdateData.urlLinks = messageUpdate.urlLinks;
            if (messageUpdate.buttons !== void 0) messageUpdateData.buttons = messageUpdate.buttons;
            if (messageUpdate.lmsContent !== void 0) messageUpdateData.lmsContent = messageUpdate.lmsContent;
            if (messageUpdate.lmsImageUrl !== void 0) messageUpdateData.lmsImageUrl = messageUpdate.lmsImageUrl;
            if (messageUpdate.lmsImageFileId !== void 0) messageUpdateData.lmsImageFileId = messageUpdate.lmsImageFileId;
            if (messageUpdate.lmsUrlLinks !== void 0) messageUpdateData.lmsUrlLinks = messageUpdate.lmsUrlLinks;
            if (Object.keys(messageUpdateData).length > 0 && message) {
              await db.update(messages4).set(messageUpdateData).where(eq38(messages4.campaignId, id));
              currentMessage = { ...message, ...messageUpdateData };
            }
          }
          let existingBizchatData = null;
          try {
            const readResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...req.headers.authorization ? { "Authorization": req.headers.authorization } : {}
              },
              body: JSON.stringify({
                campaignId: id,
                action: "read"
              })
            });
            const readResult = await readResponse.json();
            if (readResult.success && readResult.campaign) {
              existingBizchatData = readResult.campaign;
              console.log("[Campaign PATCH] Retrieved existing BizChat data for campaign:", bizchatId);
            } else {
              console.error("[Campaign PATCH] Failed to read BizChat campaign:", readResult);
              return res.status(400).json({
                error: "BizChat\uC5D0\uC11C \uAE30\uC874 \uCEA0\uD398\uC778 \uC815\uBCF4\uB97C \uC870\uD68C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
                bizchatError: readResult.error || readResult.bizchatError,
                ...updatedCampaign
              });
            }
          } catch (readError) {
            console.error("[Campaign PATCH] Error reading BizChat campaign:", readError);
            return res.status(500).json({
              error: "BizChat \uCEA0\uD398\uC778 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
              ...updatedCampaign
            });
          }
          const rcvType = updatedCampaign.rcvType ?? campaign.rcvType ?? 0;
          const billingType = updatedCampaign.billingType ?? campaign.billingType ?? 0;
          const sndGoalCnt = updatedCampaign.sndGoalCnt || campaign.sndGoalCnt || 1;
          const now = /* @__PURE__ */ new Date();
          const roundUpTo10Minutes = (date) => {
            const ms = date.getTime();
            const tenMinutes = 10 * 60 * 1e3;
            const rounded = Math.ceil(ms / tenMinutes) * tenMinutes;
            return new Date(rounded);
          };
          const minSendTime = roundUpTo10Minutes(new Date(now.getTime() + 120 * 60 * 1e3));
          let effectiveAtsSndStartDate = updatedCampaign.atsSndStartDate || campaign.atsSndStartDate;
          if (effectiveAtsSndStartDate) {
            const existingSendTime = new Date(effectiveAtsSndStartDate);
            const roundedExistingTime = roundUpTo10Minutes(existingSendTime);
            if (roundedExistingTime <= minSendTime) {
              console.log(`[Campaign PATCH] \uBC1C\uC1A1\uC77C\uC2DC \uC790\uB3D9 \uC7AC\uC124\uC815: ${existingSendTime.toISOString()} \u2192 ${minSendTime.toISOString()} (10\uBD84 \uB2E8\uC704)`);
              effectiveAtsSndStartDate = minSendTime;
            } else {
              effectiveAtsSndStartDate = roundedExistingTime;
            }
          } else {
            effectiveAtsSndStartDate = minSendTime;
            console.log(`[Campaign PATCH] \uBC1C\uC1A1\uC77C\uC2DC \uAE30\uBCF8\uAC12 \uC124\uC815: ${minSendTime.toISOString()} (10\uBD84 \uB2E8\uC704)`);
          }
          const atsSndStartTimestamp = effectiveAtsSndStartDate ? Math.floor(new Date(effectiveAtsSndStartDate).getTime() / 1e3) : void 0;
          if (effectiveAtsSndStartDate && (!campaign.atsSndStartDate || new Date(campaign.atsSndStartDate).getTime() !== new Date(effectiveAtsSndStartDate).getTime())) {
            await db.update(campaigns16).set({
              atsSndStartDate: new Date(effectiveAtsSndStartDate),
              scheduledAt: new Date(effectiveAtsSndStartDate),
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq38(campaigns16.id, id));
          }
          const existingMms = existingBizchatData?.mms;
          const existingFileInfo = existingMms?.fileInfo;
          const existingUrlFile = existingMms?.urlFile;
          const existingUrlLink = existingMms?.urlLink;
          const newFileInfo = currentMessage?.imageUrl && currentMessage.imageUrl.trim() ? { list: [{ origId: currentMessage.imageUrl }] } : existingFileInfo;
          const isRcsCampaign = billingType === 1 || billingType === 3;
          const rawMmsTitle = isRcsCampaign ? currentMessage?.lmsTitle?.trim() || currentMessage?.title?.trim() || updatedCampaign.name || campaign.name || "" : currentMessage?.title?.trim() || updatedCampaign.name || campaign.name || "";
          const mmsTitle = rawMmsTitle.length > 30 ? rawMmsTitle.substring(0, 30) : rawMmsTitle;
          const mmsPayload = {
            title: mmsTitle,
            msg: currentMessage?.content || "",
            // 조건부 필드 포함 - 빈 객체/배열 생략
            ...newFileInfo && Object.keys(newFileInfo).length > 0 ? { fileInfo: newFileInfo } : {},
            ...existingUrlFile ? { urlFile: existingUrlFile } : {},
            ...existingUrlLink?.list && existingUrlLink.list.length > 0 ? { urlLink: existingUrlLink } : {}
          };
          const existingRcs = existingBizchatData?.rcs;
          const existingCb = existingBizchatData?.cb;
          const bizchatUpdatePayload = {
            tgtCompanyName: updatedCampaign.tgtCompanyName || campaign.tgtCompanyName || existingBizchatData?.tgtCompanyName || "wepick",
            name: updatedCampaign.name || campaign.name || existingBizchatData?.name,
            sndNum: updatedCampaign.sndNum || campaign.sndNum || existingBizchatData?.sndNum || "001001",
            rcvType,
            sndGoalCnt,
            billingType,
            isTmp: 0,
            settleCnt: updatedCampaign.settleCnt ?? campaign.settleCnt ?? existingBizchatData?.settleCnt ?? 0,
            mms: mmsPayload,
            // RCS/CB는 값이 있을 때만 포함 (빈 배열/객체 생략 - E000002 방지)
            ...existingRcs && existingRcs.length > 0 && { rcs: existingRcs },
            ...existingCb && Object.keys(existingCb).length > 0 && { cb: existingCb }
          };
          if (rcvType === 0) {
            if (atsSndStartTimestamp) {
              bizchatUpdatePayload.atsSndStartDate = atsSndStartTimestamp;
            } else if (existingBizchatData?.atsSndStartDate) {
              bizchatUpdatePayload.atsSndStartDate = existingBizchatData.atsSndStartDate;
            }
            const sndMosu = updatedCampaign.sndMosu || campaign.sndMosu || existingBizchatData?.sndMosu || 0;
            const minSndMosu = Math.ceil(sndGoalCnt * 1.5);
            const maxSndMosu = 4e5;
            if (sndMosu > maxSndMosu) {
              const { sndGoalCnt: _, ...restCampaign } = updatedCampaign;
              return res.status(400).json({
                ...restCampaign,
                error: `\uBC1C\uC1A1 \uBAA8\uC218(${sndMosu.toLocaleString()})\uAC00 \uCD5C\uB300\uAC12(${maxSndMosu.toLocaleString()})\uC744 \uCD08\uACFC\uD569\uB2C8\uB2E4. \uD0C0\uAC9F\uD305 \uC870\uAC74\uC744 \uC881\uD600\uC8FC\uC138\uC694.`,
                currentSndMosu: sndMosu,
                maxSndMosu,
                sndGoalCnt,
                hint: "\uC5F0\uB839\uB300 \uBC94\uC704 \uCD95\uC18C, \uC9C0\uC5ED \uC81C\uD55C \uB4F1\uC73C\uB85C \uD0C0\uAC9F\uD305\uC744 \uC881\uD788\uBA74 \uBAA8\uC218\uAC00 \uC904\uC5B4\uB4ED\uB2C8\uB2E4."
              });
            }
            if (sndMosu < minSndMosu) {
              const { sndGoalCnt: _, ...restCampaign2 } = updatedCampaign;
              return res.status(400).json({
                ...restCampaign2,
                error: `\uBC1C\uC1A1 \uBAA8\uC218(${sndMosu.toLocaleString()})\uAC00 \uCD5C\uC18C\uAC12(${minSndMosu.toLocaleString()})\uBCF4\uB2E4 \uC791\uC2B5\uB2C8\uB2E4. \uBC1C\uC1A1 \uBAA9\uD45C(${sndGoalCnt.toLocaleString()})\uC758 150% \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.`,
                currentSndMosu: sndMosu,
                minSndMosu,
                sndGoalCnt
              });
            }
            bizchatUpdatePayload.sndMosu = sndMosu;
            bizchatUpdatePayload.sndMosuQuery = updatedCampaign.sndMosuQuery || campaign.sndMosuQuery || existingBizchatData?.sndMosuQuery || "";
            bizchatUpdatePayload.sndMosuDesc = updatedCampaign.sndMosuDesc || campaign.sndMosuDesc || existingBizchatData?.sndMosuDesc || "";
            console.log(`[Campaign PATCH] Using sndMosu: ${sndMosu.toLocaleString()} (from ${updatedCampaign.sndMosu ? "request" : "stored"})`);
            if (!bizchatUpdatePayload.sndMosuQuery) {
              return res.status(400).json({
                error: "ATS \uD0C0\uAC9F\uD305 \uCEA0\uD398\uC778\uC740 sndMosuQuery\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
                ...updatedCampaign
              });
            }
          } else if (rcvType === 10) {
            if (atsSndStartTimestamp) {
              bizchatUpdatePayload.atsSndStartDate = atsSndStartTimestamp;
            } else if (existingBizchatData?.atsSndStartDate) {
              bizchatUpdatePayload.atsSndStartDate = existingBizchatData.atsSndStartDate;
            }
            const mdnFileId = updatedCampaign.mdnFileId || campaign.mdnFileId || existingBizchatData?.mdnFileId;
            if (!mdnFileId) {
              return res.status(400).json({
                error: "MDN \uC9C1\uC811 \uC9C0\uC815 \uCEA0\uD398\uC778\uC740 mdnFileId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
                ...updatedCampaign
              });
            }
            bizchatUpdatePayload.mdnFileId = mdnFileId;
          } else if (rcvType === 1 || rcvType === 2) {
            const collStartDate = existingBizchatData?.collStartDate;
            const collEndDate = existingBizchatData?.collEndDate;
            const sndGeofenceId = existingBizchatData?.sndGeofenceId;
            if (!collStartDate || !collEndDate || !sndGeofenceId) {
              return res.status(400).json({
                error: "Maptics \uD0C0\uAC9F\uD305 \uCEA0\uD398\uC778\uC5D0 \uD544\uC218 \uD544\uB4DC(collStartDate, collEndDate, sndGeofenceId)\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
                ...updatedCampaign
              });
            }
            bizchatUpdatePayload.collStartDate = collStartDate;
            bizchatUpdatePayload.collEndDate = collEndDate;
            bizchatUpdatePayload.sndGeofenceId = sndGeofenceId;
            if (rcvType === 1) {
              const rtStartHhmm = existingBizchatData?.rtStartHhmm;
              const rtEndHhmm = existingBizchatData?.rtEndHhmm;
              if (!rtStartHhmm || !rtEndHhmm) {
                return res.status(400).json({
                  error: "Maptics \uC2E4\uC2DC\uAC04 \uCEA0\uD398\uC778\uC5D0 \uBC1C\uC1A1 \uC2DC\uAC04(rtStartHhmm, rtEndHhmm)\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
                  ...updatedCampaign
                });
              }
              bizchatUpdatePayload.rtStartHhmm = rtStartHhmm;
              bizchatUpdatePayload.rtEndHhmm = rtEndHhmm;
              if (existingBizchatData?.sndDayDiv !== void 0) {
                bizchatUpdatePayload.sndDayDiv = existingBizchatData.sndDayDiv;
              }
            } else if (rcvType === 2) {
              const collSndDate = existingBizchatData?.collSndDate;
              if (!collSndDate) {
                return res.status(400).json({
                  error: "Maptics \uBAA8\uC544\uC11C \uBCF4\uB0B4\uAE30 \uCEA0\uD398\uC778\uC5D0 \uBC1C\uC1A1 \uC2DC\uC791 \uC77C\uC2DC(collSndDate)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
                  ...updatedCampaign
                });
              }
              bizchatUpdatePayload.collSndDate = collSndDate;
            }
          }
          if (billingType === 1 || billingType === 3) {
            bizchatUpdatePayload.rcsType = updatedCampaign.rcsType ?? campaign.rcsType ?? existingBizchatData?.rcsType ?? 0;
          }
          console.log("[Campaign PATCH] Calling BizChat update API for:", bizchatId);
          console.log("[Campaign PATCH] BizChat payload:", JSON.stringify(bizchatUpdatePayload, null, 2));
          const updateResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...req.headers.authorization ? { "Authorization": req.headers.authorization } : {}
            },
            body: JSON.stringify({
              campaignId: id,
              action: "update",
              updateData: bizchatUpdatePayload
            })
          });
          const updateResult = await updateResponse.json();
          if (!updateResponse.ok || !updateResult.success) {
            console.error("[Campaign PATCH] BizChat update failed:", updateResult);
            return res.status(400).json({
              ...updatedCampaign,
              bizchatUpdateFailed: true,
              bizchatError: updateResult.bizchatError || updateResult.error,
              bizchatCode: updateResult.bizchatCode,
              bizchatMessage: updateResult.bizchatMessage
            });
          }
          console.log("[Campaign PATCH] BizChat update successful:", updateResult);
          return res.status(200).json({
            ...updatedCampaign,
            bizchatUpdated: true
          });
        } catch (bizchatError) {
          console.error("[Campaign PATCH] Error calling BizChat update API:", bizchatError);
          return res.status(200).json({
            ...updatedCampaign,
            bizchatUpdateFailed: true,
            bizchatCommunicationError: bizchatError instanceof Error ? bizchatError.message : "Unknown error"
          });
        }
      } else if (bizchatId && !isSimulation && !editableStates.includes(campaign.statusCode || 0)) {
        console.log(`[Campaign PATCH] Skipping BizChat update - status ${campaign.statusCode} not editable`);
      } else if (isSimulation) {
        console.log(`[Campaign PATCH] Skipping BizChat update for simulation campaign: ${bizchatId}`);
      }
      return res.status(200).json(updatedCampaign);
    } catch (error) {
      console.error("Error updating campaign:", error);
      return res.status(500).json({ error: "Failed to update campaign" });
    }
  }
  if (req.method === "DELETE") {
    try {
      const campaignResult = await db.select().from(campaigns16).where(eq38(campaigns16.id, id));
      const campaign = campaignResult[0];
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.userId !== userId) return res.status(403).json({ error: "Access denied" });
      const DELETABLE_STATUS_CODES = [0];
      if (!DELETABLE_STATUS_CODES.includes(campaign.statusCode || 0)) {
        console.error(`Cannot delete campaign with status ${campaign.statusCode}`);
        return res.status(400).json({
          error: "\uC784\uC2DC\uB4F1\uB85D(0) \uC0C1\uD0DC\uC758 \uCEA0\uD398\uC778\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        });
      }
      const bizchatId = campaign.bizchatCampaignId;
      const isSimulation = bizchatId?.startsWith("SIM_");
      if (bizchatId && !isSimulation) {
        try {
          const host = req.headers.host || process.env.VERCEL_URL || "localhost:5000";
          const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
          const protocol = req.headers["x-forwarded-proto"] || (isLocalhost ? "http" : "https");
          const baseUrl = `${protocol}://${host}`;
          const deleteResponse = await fetch(`${baseUrl}/api/bizchat/campaigns`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...req.headers.authorization ? { "Authorization": req.headers.authorization } : {}
            },
            body: JSON.stringify({
              action: "delete",
              campaignIds: [bizchatId]
            })
          });
          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json();
            console.error("BizChat deletion failed:", errorData);
            console.warn(`[DELETE] BizChat deletion failed for ${bizchatId}, proceeding with local deletion`);
          }
        } catch (bizchatError) {
          console.error("Error calling BizChat delete API:", bizchatError);
          console.warn(`[DELETE] BizChat API communication failed, proceeding with local deletion`);
        }
      } else if (isSimulation) {
        console.log(`[DELETE] Skipping BizChat API call for simulation campaign: ${bizchatId}`);
      }
      await db.delete(messages4).where(eq38(messages4.campaignId, id));
      await db.delete(targeting3).where(eq38(targeting3.campaignId, id));
      await db.delete(reports2).where(eq38(reports2.campaignId, id));
      await db.delete(campaigns16).where(eq38(campaigns16.id, id));
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return res.status(500).json({ error: "Failed to delete campaign" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/campaigns/test-create.ts
var test_create_exports = {};
__export(test_create_exports, {
  default: () => handler47
});
import { createClient as createClient23 } from "@supabase/supabase-js";
import { neon as neon39, neonConfig as neonConfig14 } from "@neondatabase/serverless";
import { drizzle as drizzle39 } from "drizzle-orm/neon-http";
import { pgTable as pgTable38, text as text27, integer as integer20, timestamp as timestamp35, decimal as decimal15, varchar as varchar25 } from "drizzle-orm/pg-core";
import { sql as sql24 } from "drizzle-orm";
neonConfig14.fetchConnectionCache = true;
var BIZCHAT_DEV_URL13 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL13 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
var CALLBACK_BASE_URL3 = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://wepickbizchat-new.vercel.app";
var campaigns17 = pgTable38("campaigns", {
  id: varchar25("id").primaryKey().default(sql24`gen_random_uuid()`),
  userId: varchar25("user_id").notNull(),
  templateId: varchar25("template_id"),
  name: varchar25("name", { length: 200 }).notNull(),
  tgtCompanyName: varchar25("tgt_company_name", { length: 100 }),
  statusCode: integer20("status_code").default(0).notNull(),
  status: varchar25("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar25("message_type", { length: 10 }).notNull(),
  rcvType: integer20("rcv_type").default(0),
  billingType: integer20("billing_type").default(0),
  sndNum: varchar25("snd_num", { length: 20 }),
  sndGoalCnt: integer20("snd_goal_cnt"),
  sndMosu: integer20("snd_mosu"),
  settleCnt: integer20("settle_cnt").default(0),
  mdnFileId: varchar25("mdn_file_id", { length: 50 }),
  atsSndStartDate: timestamp35("ats_snd_start_date"),
  targetCount: integer20("target_count").default(0).notNull(),
  sentCount: integer20("sent_count").default(0),
  successCount: integer20("success_count").default(0),
  clickCount: integer20("click_count").default(0),
  budget: decimal15("budget", { precision: 12, scale: 0 }).notNull(),
  bizchatCampaignId: varchar25("bizchat_campaign_id", { length: 100 }),
  scheduledAt: timestamp35("scheduled_at"),
  updatedAt: timestamp35("updated_at").defaultNow()
});
var templates6 = pgTable38("templates", {
  id: varchar25("id").primaryKey(),
  userId: varchar25("user_id").notNull(),
  name: varchar25("name", { length: 200 }).notNull(),
  messageType: varchar25("message_type", { length: 10 }).notNull(),
  title: varchar25("title", { length: 60 }),
  content: text27("content").notNull(),
  imageUrl: text27("image_url"),
  imageFileId: varchar25("image_file_id", { length: 100 })
});
var messages5 = pgTable38("messages", {
  id: varchar25("id").primaryKey().default(sql24`gen_random_uuid()`),
  campaignId: varchar25("campaign_id").notNull(),
  title: varchar25("title", { length: 60 }),
  content: text27("content").notNull(),
  imageUrl: text27("image_url")
});
function getDb39() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle39(neon39(dbUrl));
}
function getSupabaseAdmin22() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient23(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth20(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin22().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid11() {
  return Date.now().toString();
}
function toUnixTimestamp3(date) {
  if (!date) return void 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor(d.getTime() / 1e3);
}
function detectProductionEnvironment3(req) {
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
  if (forceDevMode) return false;
  return false;
}
async function callBizChatAPI8(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL13 : BIZCHAT_DEV_URL13;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error("BizChat API key not configured");
  }
  const tid = generateTid11();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat Test] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Test] Request body:`, JSON.stringify(body, null, 2));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat Test] Response: ${response.status} - ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
async function handler47(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth20(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const {
      name,
      templateId,
      messageType,
      sndNum,
      mdnFileId,
      sndGoalCnt,
      targetCount,
      budget,
      scheduledAt
    } = req.body;
    if (!name || !templateId || !sndNum || !mdnFileId) {
      return res.status(400).json({
        error: "Missing required fields: name, templateId, sndNum, mdnFileId"
      });
    }
    const db = getDb39();
    const useProduction = detectProductionEnvironment3(req);
    const templateResult = await db.select().from(templates6).where(sql24`${templates6.id} = ${templateId}`);
    if (templateResult.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }
    const template = templateResult[0];
    let billingType = 0;
    if (messageType === "RCS") {
      billingType = 3;
    } else if (messageType === "MMS") {
      billingType = 2;
    }
    const campaignId = crypto.randomUUID();
    const atsSndStartDate = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 60 * 60 * 1e3);
    const bizChatPayload = {
      tgtCompanyName: "\uC704\uD53D",
      name,
      sndNum,
      rcvType: 10,
      sndGoalCnt: sndGoalCnt || targetCount,
      billingType,
      isTmp: 0,
      settleCnt: sndGoalCnt || targetCount,
      mdnFileId,
      adverDeny: "1504",
      cb: {
        state: `${CALLBACK_BASE_URL3}/api/bizchat/callback/state`
      },
      mms: {
        title: template.title || "",
        msg: template.content || "",
        fileInfo: template.imageFileId ? { list: [{ origId: template.imageFileId }] } : {},
        urlFile: "",
        // 필수 필드: 사용하지 않을 때 빈 문자열 (문서 규격)
        urlLink: {}
      },
      rcs: [],
      atsSndStartDate: toUnixTimestamp3(atsSndStartDate)
    };
    console.log("[Test Campaign] Creating BizChat campaign with rcvType: 10");
    const bizChatResult = await callBizChatAPI8("/api/v1/cmpn/create", "POST", bizChatPayload, useProduction);
    if (bizChatResult.data?.code !== "S000001") {
      return res.status(400).json({
        success: false,
        error: bizChatResult.data?.msg || "BizChat campaign creation failed",
        bizchatCode: bizChatResult.data?.code
      });
    }
    const bizchatCampaignId = bizChatResult.data?.data?.id;
    await db.insert(campaigns17).values({
      id: campaignId,
      userId: auth.userId,
      templateId,
      name,
      tgtCompanyName: "\uC704\uD53D",
      statusCode: 0,
      status: "temp_registered",
      messageType: messageType || "LMS",
      rcvType: 10,
      billingType,
      sndNum,
      sndGoalCnt: sndGoalCnt || targetCount,
      mdnFileId,
      atsSndStartDate,
      targetCount,
      budget: budget.toString(),
      bizchatCampaignId,
      scheduledAt: atsSndStartDate
    });
    await db.insert(messages5).values({
      id: crypto.randomUUID(),
      campaignId,
      title: template.title || "",
      content: template.content,
      imageUrl: template.imageUrl
    });
    return res.status(200).json({
      success: true,
      campaign: {
        id: campaignId,
        bizchatCampaignId,
        name,
        rcvType: 10,
        targetCount,
        scheduledAt: atsSndStartDate.toISOString()
      },
      message: "\uD14C\uC2A4\uD2B8 \uCEA0\uD398\uC778\uC774 \uC0DD\uC131\uB418\uC5C8\uC5B4\uC694. \uC2B9\uC778 \uC694\uCCAD \uD6C4 \uBC1C\uC1A1\uB429\uB2C8\uB2E4."
    });
  } catch (error) {
    console.error("[Test Campaign] Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// src/handlers/dashboard/stats.ts
var stats_exports4 = {};
__export(stats_exports4, {
  default: () => handler48
});
import { createClient as createClient24 } from "@supabase/supabase-js";
import { neon as neon40 } from "@neondatabase/serverless";
import { drizzle as drizzle40 } from "drizzle-orm/neon-http";
import { eq as eq39 } from "drizzle-orm";
import { pgTable as pgTable39, text as text28, integer as integer21, timestamp as timestamp36, numeric as numeric3 } from "drizzle-orm/pg-core";
import crypto25 from "crypto";
var campaigns18 = pgTable39("campaigns", {
  id: text28("id").primaryKey(),
  userId: text28("user_id").notNull(),
  name: text28("name").notNull(),
  messageType: text28("message_type"),
  statusCode: integer21("status_code").default(0),
  status: text28("status").default("temp_registered"),
  templateId: text28("template_id"),
  budget: numeric3("budget"),
  targetCount: integer21("target_count"),
  sentCount: integer21("sent_count"),
  successCount: integer21("success_count"),
  clickCount: integer21("click_count"),
  completedAt: timestamp36("completed_at"),
  createdAt: timestamp36("created_at").defaultNow(),
  updatedAt: timestamp36("updated_at").defaultNow()
});
var reports3 = pgTable39("reports", {
  id: text28("id").primaryKey(),
  campaignId: text28("campaign_id").notNull(),
  sentCount: integer21("sent_count").default(0),
  deliveredCount: integer21("delivered_count").default(0),
  successCount: integer21("success_count").default(0),
  failedCount: integer21("failed_count").default(0),
  clickCount: integer21("click_count").default(0),
  optOutCount: integer21("opt_out_count").default(0),
  createdAt: timestamp36("created_at").defaultNow()
});
function getDb40() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql31 = neon40(dbUrl);
  return drizzle40(sql31);
}
function getSupabaseAdmin23() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }
  return createClient24(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
function verifyImpersonateToken17(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto25.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth21(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken17(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const supabase = getSupabaseAdmin23();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email || ""
    };
  } catch (error) {
    console.error("Token verification error:", error);
    return null;
  }
}
async function handler48(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const auth = await verifyAuth21(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const db = getDb40();
    const userCampaigns = await db.select().from(campaigns18).where(eq39(campaigns18.userId, auth.userId));
    let totalSent = 0;
    let totalSuccess = 0;
    let totalClicks = 0;
    let activeCampaigns = 0;
    for (const campaign of userCampaigns) {
      if (campaign.statusCode === 20 || campaign.statusCode === 30) {
        activeCampaigns++;
      }
      totalSent += campaign.sentCount || 0;
      totalSuccess += campaign.successCount || 0;
      totalClicks += campaign.clickCount || 0;
      const reportResult = await db.select().from(reports3).where(eq39(reports3.campaignId, campaign.id));
      const report = reportResult[0];
      if (report) {
        totalSent += report.sentCount || 0;
        totalSuccess += report.deliveredCount || 0;
        totalClicks += report.clickCount || 0;
      }
    }
    const stats = {
      totalCampaigns: userCampaigns.length,
      activeCampaigns,
      totalSent,
      totalSuccess,
      totalClicks,
      successRate: totalSent > 0 ? Math.round(totalSuccess / totalSent * 100) : 0
    };
    return res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
}

// src/handlers/kispg/auth.ts
var auth_exports = {};
__export(auth_exports, {
  default: () => handler49
});
import { createClient as createClient25 } from "@supabase/supabase-js";
import { createHash } from "crypto";
function getSupabaseAdmin24() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient25(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth22(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin24().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateEncData(mid, ediDate, goodsAmt, merchantKey) {
  const data = mid + ediDate + goodsAmt + merchantKey;
  const hash = createHash("sha256").update(data).digest("hex");
  console.log("[KISPG] encData generated with SHA256");
  console.log("[KISPG] Input: mid=" + mid + ", ediDate=" + ediDate + ", goodsAmt=" + goodsAmt);
  return hash;
}
function getEdiDate() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function generateOrderNo(userId) {
  const timestamp53 = Date.now().toString().slice(-10);
  const shortUserId = userId.replace(/-/g, "").slice(0, 8);
  return `BC${timestamp53}_${shortUserId}`;
}
async function handler49(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await verifyAuth22(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const { amount } = req.body;
    if (!amount || amount < 1e4) {
      return res.status(400).json({ error: "\uCD5C\uC18C \uCDA9\uC804 \uAE08\uC561\uC740 10,000\uC6D0\uC785\uB2C8\uB2E4" });
    }
    const mid = (process.env.KISPG_MID || "").trim();
    const merchantKey = (process.env.KISPG_MERCHANT_KEY || "").trim();
    if (!mid || !merchantKey) {
      return res.status(500).json({ error: "KISPG configuration is missing" });
    }
    const ediDate = getEdiDate();
    const ordNo = generateOrderNo(auth.userId);
    const goodsAmt = amount.toString();
    const encData = generateEncData(mid, ediDate, goodsAmt, merchantKey);
    let returnUrl = process.env.KISPG_RETURN_URL;
    if (!returnUrl) {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.REPLIT_DOMAINS?.split(",")[0] ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000";
      returnUrl = `${baseUrl}/api/kispg/callback`;
    }
    console.log("[KISPG Auth] returnUrl:", returnUrl);
    const useProductionApi = process.env.KISPG_USE_PROD === "true";
    const kispgAuthUrl = useProductionApi ? "https://api.kispg.co.kr/v2/auth" : "https://testapi.kispg.co.kr/v2/auth";
    console.log("[KISPG Auth] Using API:", kispgAuthUrl);
    console.log("[KISPG Auth] MID:", mid);
    console.log("[KISPG Auth] ediDate:", ediDate);
    console.log("[KISPG Auth] goodsAmt:", goodsAmt);
    const userAgent = req.headers["user-agent"] || "";
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
    const mallNm = "(\uC8FC)\uC704\uD53D\uCF54\uD37C\uB808\uC774\uC158";
    const mchtNm = mallNm;
    const model = isMobile ? "MOB" : "WEB";
    const channel = isMobile ? "0002" : "0001";
    const authParams = {
      payMethod: "CARD",
      model,
      channel,
      trxCd: "0",
      mid,
      mallNm,
      mchtNm,
      goodsNm: "BizChat \uC794\uC561 \uCDA9\uC804",
      currencyType: "KRW",
      ordNo,
      goodsAmt,
      ordNm: auth.email?.split("@")[0] || "\uACE0\uAC1D",
      ordTel: "01000000000",
      userIp: req.headers["x-forwarded-for"]?.split(",")[0] || "127.0.0.1",
      ediDate,
      encData,
      returnUrl,
      payReqType: "1",
      charset: "UTF-8"
    };
    console.log("[KISPG Auth] model:", model, "channel:", channel);
    return res.status(200).json({
      success: true,
      kispgAuthUrl,
      params: authParams
    });
  } catch (error) {
    console.error("KISPG auth error:", error);
    return res.status(500).json({ error: "Failed to create payment request" });
  }
}

// src/handlers/kispg/callback.ts
var callback_exports = {};
__export(callback_exports, {
  default: () => handler50
});
import { neon as neon41, neonConfig as neonConfig15 } from "@neondatabase/serverless";
import { drizzle as drizzle41 } from "drizzle-orm/neon-http";
import { eq as eq40, sql as sql25 } from "drizzle-orm";
import { pgTable as pgTable40, text as text29, timestamp as timestamp37, numeric as numeric4 } from "drizzle-orm/pg-core";
import { createHash as createHash2 } from "crypto";
neonConfig15.fetchConnectionCache = true;
var users20 = pgTable40("users", {
  id: text29("id").primaryKey(),
  email: text29("email"),
  balance: numeric4("balance", { precision: 12, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp37("updated_at").defaultNow()
});
var transactions10 = pgTable40("transactions", {
  id: text29("id").primaryKey().default(sql25`gen_random_uuid()`),
  userId: text29("user_id").notNull(),
  type: text29("type").notNull(),
  amount: numeric4("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: numeric4("balance_after", { precision: 12, scale: 0 }).notNull(),
  description: text29("description"),
  paymentMethod: text29("payment_method"),
  stripeSessionId: text29("stripe_session_id"),
  createdAt: timestamp37("created_at").defaultNow()
});
function getDb41() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle41(neon41(dbUrl));
}
function generateEncData2(mid, ediDate, goodsAmt, merchantKey) {
  const data = mid + ediDate + goodsAmt + merchantKey;
  return createHash2("sha256").update(data).digest("hex");
}
function parseFormBody(body) {
  if (typeof body === "string") {
    const params = new URLSearchParams(body);
    const result = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body || {};
}
async function handler50(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    let params;
    if (req.method === "POST") {
      params = parseFormBody(req.body);
    } else {
      params = Object.fromEntries(
        Object.entries(req.query).map(([k, v]) => [k, String(v)])
      );
    }
    const {
      resultCd,
      resultMsg,
      tid,
      ordNo,
      amt
    } = params;
    const baseUrl = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || (process.env.REPLIT_DOMAINS?.split(",")[0] ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : null) || "http://localhost:5000";
    if (resultCd !== "0000") {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set("error", "true");
      errorUrl.searchParams.set("message", resultMsg || "\uACB0\uC81C\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4");
      return res.redirect(302, errorUrl.toString());
    }
    const mid = (process.env.KISPG_MID || "").trim();
    const merchantKey = (process.env.KISPG_MERCHANT_KEY || "").trim();
    if (!mid || !merchantKey) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set("error", "true");
      errorUrl.searchParams.set("message", "\uACB0\uC81C \uC124\uC815 \uC624\uB958");
      return res.redirect(302, errorUrl.toString());
    }
    console.log("[KISPG Callback] Auth callback received - tid:", tid, "amt:", amt);
    const useProductionApi = process.env.KISPG_USE_PROD === "true";
    const kispgPaymentUrl = useProductionApi ? "https://api.kispg.co.kr/v2/payment" : "https://testapi.kispg.co.kr/v2/payment";
    console.log("[KISPG Callback] Using payment API:", kispgPaymentUrl);
    console.log("[KISPG Callback] tid:", tid);
    console.log("[KISPG Callback] amt:", amt);
    const d = /* @__PURE__ */ new Date();
    const p = (n) => String(n).padStart(2, "0");
    const paymentEdiDate = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const paymentEncData = generateEncData2(mid, paymentEdiDate, amt, merchantKey);
    const paymentResponse = await fetch(kispgPaymentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mid,
        tid,
        goodsAmt: amt,
        ediDate: paymentEdiDate,
        encData: paymentEncData,
        charset: "UTF-8"
      })
    });
    const paymentResult = await paymentResponse.json();
    if (paymentResult.resultCd !== "0000") {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set("error", "true");
      errorUrl.searchParams.set("message", paymentResult.resultMsg || "\uC2B9\uC778 \uC2E4\uD328");
      return res.redirect(302, errorUrl.toString());
    }
    const shortUserId = ordNo.includes("_") ? ordNo.split("_")[1] : null;
    if (!shortUserId) {
      console.error("Could not extract userId from ordNo:", ordNo);
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set("error", "true");
      errorUrl.searchParams.set("message", "\uC0AC\uC6A9\uC790 \uC815\uBCF4 \uC624\uB958");
      return res.redirect(302, errorUrl.toString());
    }
    const db = getDb41();
    const amount = parseFloat(amt);
    const allUsers = await db.select().from(users20);
    const userResult = allUsers.filter((u) => u.id.replace(/-/g, "").startsWith(shortUserId));
    if (!userResult[0]) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set("error", "true");
      errorUrl.searchParams.set("message", "\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
      return res.redirect(302, errorUrl.toString());
    }
    const userId = userResult[0].id;
    const currentBalance = parseFloat(userResult[0].balance) || 0;
    const newBalance = currentBalance + amount;
    await db.update(users20).set({
      balance: newBalance.toString(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq40(users20.id, userId));
    try {
      await db.insert(transactions10).values({
        userId,
        type: "charge",
        amount: amount.toString(),
        balanceAfter: newBalance.toString(),
        description: `KISPG \uCE74\uB4DC \uACB0\uC81C (TID: ${tid})`,
        paymentMethod: "card"
      });
    } catch (txError) {
      console.error("[KISPG Callback] Failed to insert transaction record:", txError);
    }
    const successUrl = new URL(`${baseUrl}/billing`);
    successUrl.searchParams.set("success", "true");
    successUrl.searchParams.set("amount", amt);
    return res.redirect(302, successUrl.toString());
  } catch (error) {
    console.error("KISPG callback error:", error);
    const baseUrl = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || (process.env.REPLIT_DOMAINS?.split(",")[0] ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : null) || "http://localhost:5000";
    const errorUrl = new URL(`${baseUrl}/billing`);
    errorUrl.searchParams.set("error", "true");
    errorUrl.searchParams.set("message", "\uACB0\uC81C \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4");
    return res.redirect(302, errorUrl.toString());
  }
}

// src/handlers/maptics/geofences.ts
var geofences_exports = {};
__export(geofences_exports, {
  default: () => handler51
});
import { z } from "zod";

// src/handlers/bizchat/maptics.ts
import { createClient as createClient26 } from "@supabase/supabase-js";
import { createHmac as createHmac16 } from "crypto";
var BIZCHAT_DEV_URL14 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL14 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getSupabaseAdmin25() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient26(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken18(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac16("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
function verifyAdminToken19(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac16("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (!payload.adminId) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth23(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken18(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const admin = verifyAdminToken19(token);
  if (admin) {
    return { userId: `admin:${admin.adminId}`, email: "" };
  }
  try {
    const { data: { user }, error } = await getSupabaseAdmin25().auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid12() {
  return Date.now().toString();
}
function getBizChatApiUrl() {
  return process.env.BIZCHAT_USE_PROD === "true" ? BIZCHAT_PROD_URL14 : BIZCHAT_DEV_URL14;
}
function getBizChatApiKey3() {
  const key = process.env.BIZCHAT_USE_PROD === "true" ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!key) throw new Error("BizChat API key not configured");
  return key;
}
async function searchPOI(skey, type) {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey3();
  const tid = generateTid12();
  const response = await fetch(`${baseUrl}/api/v1/maptics/poi?tid=${tid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify({ skey, type })
  });
  if (!response.ok) {
    throw new Error(`BizChat POI API error: ${response.status}`);
  }
  const result = await response.json();
  if (result.code !== "S000001") {
    throw new Error(`BizChat POI API failed: ${result.msg}`);
  }
  return result.data?.list || [];
}
async function createGeofence(name, target) {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey3();
  const tid = generateTid12();
  const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/save?tid=${tid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify({ name, target })
  });
  if (!response.ok) {
    throw new Error(`BizChat Geofence create API error: ${response.status}`);
  }
  const result = await response.json();
  if (result.code !== "S000001") {
    throw new Error(`BizChat Geofence create failed: ${result.msg}`);
  }
  return result.data?.id;
}
async function updateGeofence(targetId, name, target) {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey3();
  const tid = generateTid12();
  const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/update?tid=${tid}&targetId=${targetId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify({ name, target })
  });
  if (!response.ok) {
    throw new Error(`BizChat Geofence update API error: ${response.status}`);
  }
  const result = await response.json();
  if (result.code !== "S000001") {
    throw new Error(`BizChat Geofence update failed: ${result.msg}`);
  }
}
async function deleteGeofence(targetId) {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey3();
  const tid = generateTid12();
  const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/delete?tid=${tid}&targetId=${targetId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  });
  if (!response.ok) {
    throw new Error(`BizChat Geofence delete API error: ${response.status}`);
  }
  const result = await response.json();
  if (result.code !== "S000001") {
    throw new Error(`BizChat Geofence delete failed: ${result.msg}`);
  }
}
async function listGeofences() {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey3();
  const tid = generateTid12();
  try {
    const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/list?tid=${tid}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      }
    });
    if (!response.ok) {
      console.error(`BizChat Geofence list API error: ${response.status}`);
      return [];
    }
    const result = await response.json();
    if (result.code !== "S000001") {
      console.error(`BizChat Geofence list failed: ${result.msg}`);
      return [];
    }
    return result.data?.list || [];
  } catch (error) {
    console.error("BizChat Geofence list error:", error);
    return [];
  }
}

// src/handlers/maptics/geofences.ts
import { neon as neon42 } from "@neondatabase/serverless";
import { drizzle as drizzle42 } from "drizzle-orm/neon-http";
import { eq as eq41, and as and10, desc as desc12 } from "drizzle-orm";
import { pgTable as pgTable41, text as text30, integer as integer22, timestamp as timestamp38, boolean as boolean24, numeric as numeric5 } from "drizzle-orm/pg-core";
var geofences3 = pgTable41("geofences", {
  id: text30("id").primaryKey(),
  userId: text30("user_id").notNull(),
  bizchatGeofenceId: text30("bizchat_geofence_id"),
  name: text30("name").notNull(),
  poiName: text30("poi_name"),
  latitude: numeric5("latitude"),
  longitude: numeric5("longitude"),
  radius: integer22("radius").default(500),
  isActive: boolean24("is_active").default(true),
  createdAt: timestamp38("created_at").defaultNow(),
  updatedAt: timestamp38("updated_at").defaultNow()
});
function getDb42() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle42(neon42(dbUrl));
}
var geofenceTargetSchema = z.object({
  gender: z.number().min(0).max(2),
  minAge: z.number().min(19).max(90),
  maxAge: z.number().min(19).max(90),
  stayMin: z.number().min(5).max(30),
  radius: z.number().min(50).max(2e3),
  address: z.string().min(1),
  lat: z.string().optional(),
  // POI 검색 결과의 위도
  lon: z.string().optional()
  // POI 검색 결과의 경도
});
var createGeofenceSchema = z.object({
  name: z.string().min(1),
  target: z.array(geofenceTargetSchema).min(1)
});
var updateGeofenceSchema = z.object({
  targetId: z.number(),
  name: z.string().min(1),
  target: z.array(geofenceTargetSchema).min(1)
});
var deleteGeofenceSchema = z.object({
  targetId: z.number()
});
async function handler51(req, res) {
  const auth = await verifyAuth23(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    if (req.method === "GET") {
      console.log(`[Geofence List] Fetching geofences for user: ${auth.userId}`);
      const bizchatGeofences = await listGeofences();
      console.log(`[Geofence List] BizChat returned ${bizchatGeofences.length} geofences`);
      const db = getDb42();
      const localGeofences = await db.select().from(geofences3).where(and10(
        eq41(geofences3.userId, auth.userId),
        eq41(geofences3.isActive, true)
      )).orderBy(desc12(geofences3.createdAt));
      console.log(`[Geofence List] Local DB has ${localGeofences.length} geofences`);
      const result = bizchatGeofences.map((bg) => {
        const local = localGeofences.find((lg) => lg.bizchatGeofenceId === String(bg.id));
        return {
          id: bg.id,
          name: bg.name,
          localId: local?.id || null,
          latitude: local?.latitude || null,
          longitude: local?.longitude || null,
          radius: local?.radius || bg.target?.[0]?.radius || 500,
          poiName: local?.poiName || bg.target?.[0]?.address || null,
          createdAt: bg.regDt || local?.createdAt,
          isLocal: !!local
        };
      });
      return res.status(200).json({ geofences: result });
    }
    if (req.method === "POST") {
      const parsed = createGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD", details: parsed.error.errors });
      }
      const { name, target } = parsed.data;
      console.log(`[Geofence Create] name=${name}, targets=${target.length}`);
      const geofenceId = await createGeofence(name, target);
      console.log(`[Geofence Create] Created geofence ID: ${geofenceId}`);
      return res.status(200).json({ id: geofenceId });
    }
    if (req.method === "PUT" || req.method === "PATCH") {
      const parsed = updateGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD", details: parsed.error.errors });
      }
      const { targetId, name, target } = parsed.data;
      console.log(`[Geofence Update] targetId=${targetId}, name=${name}`);
      await updateGeofence(targetId, name, target);
      console.log(`[Geofence Update] Updated geofence ID: ${targetId}`);
      return res.status(200).json({ success: true });
    }
    if (req.method === "DELETE") {
      const parsed = deleteGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD", details: parsed.error.errors });
      }
      const { targetId } = parsed.data;
      console.log(`[Geofence Delete] targetId=${targetId}`);
      await deleteGeofence(targetId);
      console.log(`[Geofence Delete] Deleted geofence ID: ${targetId}`);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("[Geofence] Error:", error);
    return res.status(500).json({ error: error.message || "\uC9C0\uC624\uD39C\uC2A4 \uCC98\uB9AC \uC2E4\uD328" });
  }
}

// src/handlers/maptics/poi.ts
var poi_exports = {};
__export(poi_exports, {
  default: () => handler52
});
async function handler52(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth23(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { skey, type } = req.body;
    if (!skey || typeof skey !== "string") {
      return res.status(400).json({ error: "\uAC80\uC0C9\uC5B4(skey)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" });
    }
    if (!type || type !== "poi" && type !== "addr") {
      return res.status(400).json({ error: "\uAC80\uC0C9 \uD0C0\uC785\uC740 'poi' \uB610\uB294 'addr'\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" });
    }
    console.log(`[POI Search] skey=${skey}, type=${type}`);
    const results = await searchPOI(skey, type);
    console.log(`[POI Search] Found ${results.length} results`);
    return res.status(200).json({ list: results });
  } catch (error) {
    console.error("[POI Search] Error:", error);
    return res.status(500).json({ error: error.message || "POI \uAC80\uC0C9 \uC2E4\uD328" });
  }
}

// src/handlers/profile/password.ts
var password_exports = {};
__export(password_exports, {
  default: () => handler53
});
import { createClient as createClient27 } from "@supabase/supabase-js";
import crypto26 from "crypto";
function getSupabaseAdmin26() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }
  return createClient27(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
function verifyImpersonateToken19(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto26.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth24(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken19(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "", isImpersonating: true };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const supabase = getSupabaseAdmin26();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email || ""
    };
  } catch (error) {
    return null;
  }
}
async function handler53(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Impersonate-Token, X-Impersonate-User-Id");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const auth = await verifyAuth24(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (auth.isImpersonating) {
      return res.status(403).json({ error: "\uB300\uB9AC \uB85C\uADF8\uC778 \uC911\uC5D0\uB294 \uBE44\uBC00\uBC88\uD638\uB97C \uBCC0\uACBD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "\uBE44\uBC00\uBC88\uD638\uB294 \uCD5C\uC18C 6\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" });
    }
    const supabase = getSupabaseAdmin26();
    const { error } = await supabase.auth.admin.updateUserById(auth.userId, {
      password: newPassword
    });
    if (error) {
      console.error("Password update error:", error);
      return res.status(400).json({ error: "\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4" });
    }
    return res.status(200).json({ success: true, message: "\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4" });
  } catch (error) {
    console.error("Password change error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// src/handlers/recommended-templates/[id].ts
var id_exports3 = {};
__export(id_exports3, {
  default: () => handler54
});
import { neon as neon43 } from "@neondatabase/serverless";
import { drizzle as drizzle43 } from "drizzle-orm/neon-http";
import { eq as eq42 } from "drizzle-orm";
import { sql as sql26 } from "drizzle-orm";
import { pgTable as pgTable42, text as text31, varchar as varchar27, timestamp as timestamp39, integer as integer23, boolean as boolean25, jsonb as jsonb15 } from "drizzle-orm/pg-core";
var recommendedTemplates2 = pgTable42("recommended_templates", {
  id: varchar27("id").primaryKey().default(sql26`gen_random_uuid()`),
  name: varchar27("name", { length: 200 }).notNull(),
  category: varchar27("category", { length: 50 }).notNull(),
  purpose: varchar27("purpose", { length: 50 }).notNull(),
  version: varchar27("version", { length: 20 }),
  titleTemplate: varchar27("title_template", { length: 60 }),
  lmsTitleTemplate: varchar27("lms_title_template", { length: 60 }),
  contentTemplate: text31("content_template").notNull(),
  lmsContentTemplate: text31("lms_content_template"),
  // RCS 메시지의 안드로이드용 LMS 대체 텍스트 템플릿
  variableSchema: jsonb15("variable_schema").$type(),
  defaultImageUrl: text31("default_image_url"),
  messageType: varchar27("message_type", { length: 10 }).default("RCS"),
  rcsType: integer23("rcs_type").default(4),
  urlLinks: jsonb15("url_links").$type(),
  buttons: jsonb15("buttons").$type(),
  isActive: boolean25("is_active").default(true),
  sortOrder: integer23("sort_order").default(0),
  targetingConfig: jsonb15("targeting_config"),
  sourceTemplateId: varchar27("source_template_id"),
  createdAt: timestamp39("created_at").defaultNow(),
  updatedAt: timestamp39("updated_at").defaultNow()
});
function getDb43() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = neon43(databaseUrl);
  return drizzle43(client);
}
function replaceVariables(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    let displayValue = value;
    if (value && typeof value === "object" && value.start && value.end) {
      displayValue = `${value.start} ~ ${value.end}`;
    }
    result = result.split(placeholder).join(displayValue ?? "");
  }
  return result;
}
async function handler54(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, DELETE, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid template ID" });
  }
  const db = getDb43();
  try {
    if (req.method === "GET") {
      const [template] = await db.select().from(recommendedTemplates2).where(eq42(recommendedTemplates2.id, id));
      if (!template) {
        return res.status(404).json({
          success: false,
          error: "Template not found"
        });
      }
      return res.status(200).json({
        success: true,
        template
      });
    }
    if (req.method === "POST") {
      const { variableValues } = req.body;
      const [template] = await db.select().from(recommendedTemplates2).where(eq42(recommendedTemplates2.id, id));
      if (!template) {
        return res.status(404).json({
          success: false,
          error: "Template not found"
        });
      }
      const title = template.titleTemplate ? replaceVariables(template.titleTemplate, variableValues || {}) : "";
      const lmsTitle = template.lmsTitleTemplate ? replaceVariables(template.lmsTitleTemplate, variableValues || {}) : "";
      const content = replaceVariables(template.contentTemplate, variableValues || {});
      const lmsContent = template.lmsContentTemplate ? replaceVariables(template.lmsContentTemplate, variableValues || {}) : "";
      return res.status(200).json({
        success: true,
        preview: {
          title,
          lmsTitle,
          content,
          lmsContent,
          estimatedLength: content.length,
          imageUrl: template.defaultImageUrl
        }
      });
    }
    if (req.method === "PATCH") {
      const updateData = req.body;
      delete updateData.id;
      delete updateData.createdAt;
      delete updateData.advancedTargetingState;
      delete updateData.basicTargetingState;
      updateData.updatedAt = /* @__PURE__ */ new Date();
      const [updated] = await db.update(recommendedTemplates2).set(updateData).where(eq42(recommendedTemplates2.id, id)).returning();
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "Template not found"
        });
      }
      return res.status(200).json({
        success: true,
        template: updated
      });
    }
    if (req.method === "DELETE") {
      const [deleted] = await db.delete(recommendedTemplates2).where(eq42(recommendedTemplates2.id, id)).returning();
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: "Template not found"
        });
      }
      return res.status(200).json({
        success: true,
        message: "Template deleted"
      });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("[Recommended Templates API] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

// src/handlers/recommended-templates/filters.ts
var filters_exports = {};
__export(filters_exports, {
  default: () => handler55
});
var RECOMMENDED_CATEGORIES = [
  { value: "commerce", label: "\uCEE4\uBA38\uC2A4/\uC1FC\uD551" },
  { value: "cafe_food", label: "\uCE74\uD398/\uC678\uC2DD/\uD504\uB79C\uCC28\uC774\uC988" },
  { value: "travel_culture", label: "\uC5EC\uD589/\uBB38\uD654" },
  { value: "sports_health", label: "\uC2A4\uD3EC\uCE20/\uAC74\uAC15" },
  { value: "education_life", label: "\uAD50\uC721/\uB77C\uC774\uD504" },
  { value: "medical", label: "\uBCD1\uC758\uC6D0" }
];
var RECOMMENDED_PURPOSES = [
  { value: "signup", label: "\uD68C\uC6D0\uAC00\uC785 \uC720\uB3C4" },
  { value: "review_event", label: "\uB9AC\uBDF0 \uC774\uBCA4\uD2B8" },
  { value: "holiday_discount", label: "\uBA85\uC808 \uD2B9\uBCC4 \uD560\uC778" },
  { value: "product_discount", label: "\uC0C1\uD488 \uD560\uC778 \uC548\uB0B4" },
  { value: "new_product", label: "\uC2E0\uADDC \uC0C1\uD488 \uC548\uB0B4" },
  { value: "new_product_discount", label: "\uC2E0\uC81C\uD488 \uD560\uC778 \uC548\uB0B4" },
  { value: "app_download", label: "\uC571 \uB2E4\uC6B4\uB85C\uB4DC \uC774\uBCA4\uD2B8" },
  { value: "offline_product_discount", label: "\uC624\uD504\uB77C\uC778 \uD589\uC0AC \uC0C1\uD488 \uD560\uC778 \uC548\uB0B4" },
  { value: "offline_event", label: "\uC624\uD504\uB77C\uC778 \uD589\uC0AC \uC548\uB0B4" },
  { value: "event", label: "\uC774\uBCA4\uD2B8 \uC548\uB0B4" },
  { value: "timedeal", label: "\uD0C0\uC784\uB51C \uC774\uBCA4\uD2B8" },
  { value: "special_product", label: "\uD2B9\uAC00\uC0C1\uD488 \uC548\uB0B4" },
  { value: "consultation", label: "\uC0C1\uB2F4\uC2E0\uCCAD\uC720\uB3C4" }
];
async function handler55(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({
    success: true,
    categories: RECOMMENDED_CATEGORIES,
    purposes: RECOMMENDED_PURPOSES
  });
}

// src/handlers/stripe/checkout.ts
var checkout_exports = {};
__export(checkout_exports, {
  default: () => handler56
});
import { createClient as createClient28 } from "@supabase/supabase-js";
import { neon as neon44, neonConfig as neonConfig16 } from "@neondatabase/serverless";
import { drizzle as drizzle44 } from "drizzle-orm/neon-http";
import { eq as eq43 } from "drizzle-orm";
import { pgTable as pgTable43, text as text32, timestamp as timestamp40 } from "drizzle-orm/pg-core";
import Stripe from "stripe";
neonConfig16.fetchConnectionCache = true;
var users21 = pgTable43("users", {
  id: text32("id").primaryKey(),
  email: text32("email"),
  balance: text32("balance").default("0").notNull(),
  stripeCustomerId: text32("stripe_customer_id"),
  updatedAt: timestamp40("updated_at").defaultNow()
});
function getDb44() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle44(neon44(dbUrl));
}
function getSupabaseAdmin27() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient28(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth25(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin27().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler56(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await verifyAuth25(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const db = getDb44();
    const userResult = await db.select().from(users21).where(eq43(users21.id, auth.userId));
    let user = userResult[0];
    if (!user) {
      const insertResult = await db.insert(users21).values({
        id: auth.userId,
        email: auth.email,
        balance: "0"
      }).returning();
      user = insertResult[0];
    }
    const { amount } = req.body;
    if (!amount || amount < 1e4) {
      return res.status(400).json({ error: "\uCD5C\uC18C \uCDA9\uC804 \uAE08\uC561\uC740 10,000\uC6D0\uC785\uB2C8\uB2E4" });
    }
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ error: "Stripe not configured" });
    }
    const stripe = new Stripe(stripeSecretKey);
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || void 0,
        metadata: { userId: user.id }
      });
      customerId = customer.id;
      await db.update(users21).set({
        stripeCustomerId: customerId,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq43(users21.id, user.id));
    }
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.REPLIT_DOMAINS?.split(",")[0] ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "krw",
            product_data: {
              name: "BizChat \uC794\uC561 \uCDA9\uC804",
              description: `${amount.toLocaleString()}\uC6D0 \uCDA9\uC804`
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${baseUrl}/billing?success=true&amount=${amount}`,
      cancel_url: `${baseUrl}/billing?canceled=true`,
      metadata: {
        userId: user.id,
        amount: amount.toString()
      }
    });
    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}

// src/handlers/stripe/config.ts
var config_exports = {};
__export(config_exports, {
  default: () => handler57
});
async function handler57(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      return res.status(500).json({ error: "Stripe not configured" });
    }
    return res.status(200).json({ publishableKey });
  } catch (error) {
    console.error("Error getting Stripe config:", error);
    return res.status(500).json({ error: "Failed to get Stripe config" });
  }
}

// src/handlers/stripe/webhook.ts
var webhook_exports = {};
__export(webhook_exports, {
  config: () => config,
  default: () => handler58
});
import { neon as neon45, neonConfig as neonConfig17 } from "@neondatabase/serverless";
import { drizzle as drizzle45 } from "drizzle-orm/neon-http";
import { eq as eq44 } from "drizzle-orm";
import { pgTable as pgTable44, text as text33, timestamp as timestamp41 } from "drizzle-orm/pg-core";
import Stripe2 from "stripe";
import { randomUUID } from "crypto";
neonConfig17.fetchConnectionCache = true;
var users22 = pgTable44("users", {
  id: text33("id").primaryKey(),
  balance: text33("balance").default("0").notNull()
});
var transactions11 = pgTable44("transactions", {
  id: text33("id").primaryKey(),
  userId: text33("user_id").notNull(),
  type: text33("type").notNull(),
  amount: text33("amount").notNull(),
  balanceAfter: text33("balance_after"),
  description: text33("description"),
  stripeSessionId: text33("stripe_session_id"),
  createdAt: timestamp41("created_at").defaultNow()
});
function getDb45() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle45(neon45(dbUrl));
}
var config = {
  api: {
    bodyParser: false
  }
};
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
async function handler58(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecretKey) {
      return res.status(500).json({ error: "Stripe not configured" });
    }
    const stripe = new Stripe2(stripeSecretKey);
    const buf = await buffer(req);
    const sig = req.headers["stripe-signature"];
    let event;
    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }
    } else {
      event = JSON.parse(buf.toString());
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const amount = parseInt(session.metadata?.amount || "0");
      if (userId && amount > 0) {
        const db = getDb45();
        const existingTx = await db.select().from(transactions11).where(eq44(transactions11.stripeSessionId, session.id));
        if (existingTx.length > 0) {
          console.log(`Session ${session.id} already processed, skipping`);
        } else {
          const userResult = await db.select().from(users22).where(eq44(users22.id, userId));
          const user = userResult[0];
          if (user) {
            const currentBalance = parseInt(user.balance) || 0;
            const newBalance = currentBalance + amount;
            await db.update(users22).set({ balance: newBalance.toString() }).where(eq44(users22.id, userId));
            await db.insert(transactions11).values({
              id: randomUUID(),
              userId,
              type: "charge",
              amount: amount.toString(),
              balanceAfter: newBalance.toString(),
              description: `\uC794\uC561 \uCDA9\uC804 (Stripe)`,
              stripeSessionId: session.id
            });
            console.log(`Successfully credited ${amount} to user ${userId}`);
          } else {
            console.error(`User ${userId} not found`);
          }
        }
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}

// src/handlers/targeting/estimate.ts
var estimate_exports = {};
__export(estimate_exports, {
  default: () => handler59
});
import { createClient as createClient29 } from "@supabase/supabase-js";
import { createHmac as createHmac17 } from "crypto";
var BIZCHAT_DEV_URL15 = "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL15 = "https://gw.bizchat1.co.kr";
function getBizChatUrl3() {
  return process.env.BIZCHAT_USE_PROD === "true" ? BIZCHAT_PROD_URL15 : BIZCHAT_DEV_URL15;
}
function getBizChatApiKey4() {
  return process.env.BIZCHAT_USE_PROD === "true" ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
}
var REGION_HCODE_MAP3 = {
  "\uC11C\uC6B8": "11",
  "\uACBD\uAE30": "41",
  "\uC778\uCC9C": "28",
  "\uBD80\uC0B0": "26",
  "\uB300\uAD6C": "27",
  "\uAD11\uC8FC": "29",
  "\uB300\uC804": "30",
  "\uC6B8\uC0B0": "31",
  "\uC138\uC885": "36",
  "\uAC15\uC6D0": "42",
  "\uCDA9\uBD81": "43",
  "\uCDA9\uB0A8": "44",
  "\uC804\uBD81": "45",
  "\uC804\uB0A8": "46",
  "\uACBD\uBD81": "47",
  "\uACBD\uB0A8": "48",
  "\uC81C\uC8FC": "50"
};
function getSupabaseAdmin28() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient29(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken20(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac17("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth26(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken20(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin28().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function generateTid13() {
  return Date.now().toString();
}
function buildATSMosuPayload2(params) {
  const conditions = [];
  const descParts = [];
  if (params.ageMin !== void 0 || params.ageMax !== void 0) {
    const min = params.ageMin ?? 0;
    const max = params.ageMax ?? 100;
    conditions.push({
      data: { gt: min, lt: max },
      dataType: "number",
      metaType: "svc",
      code: "cust_age_cd",
      desc: `\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`,
      not: false
    });
    descParts.push(`\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`);
  }
  if (params.gender && params.gender !== "all") {
    const genderValue = params.gender === "male" ? "1" : "2";
    const genderName = params.gender === "male" ? "\uB0A8\uC790" : "\uC5EC\uC790";
    conditions.push({
      data: [genderValue],
      dataType: "code",
      metaType: "svc",
      code: "sex_cd",
      desc: `\uC131\uBCC4: ${genderName}`,
      not: false
    });
    descParts.push(`\uC131\uBCC4: ${genderName}`);
  }
  if (params.regions && params.regions.length > 0) {
    const hcodes = [];
    const regionNames = [];
    for (const region of params.regions) {
      const hcode = REGION_HCODE_MAP3[region];
      if (hcode) {
        hcodes.push(hcode);
        regionNames.push(region);
      }
    }
    if (hcodes.length > 0) {
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "home_location",
        desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${regionNames.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9C0\uC5ED: ${regionNames.join(", ")}`);
    }
  }
  if (params.shopping11stCategories && params.shopping11stCategories.length > 0) {
    const categoryData = params.shopping11stCategories.map((cat) => ({
      cat1: cat.cat1Name || cat.cat1,
      // 카테고리 이름 (예: "가구/인테리어")
      ...cat.cat2 && { cat2: cat.cat2Name || cat.cat2 },
      // 카테고리 이름 (예: "침대/소파")
      ...cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }
      // 카테고리 이름 (예: "펠트")
    }));
    const categoryDesc = params.shopping11stCategories.map((cat) => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? cat.cat2Name || cat.cat2 : "";
      const cat3Display = cat.cat3 ? cat.cat3Name || cat.cat3 : "";
      return `${cat1Display}${cat2Display ? " > " + cat2Display : ""}${cat3Display ? " > " + cat3Display : ""}`;
    }).join(", ");
    conditions.push({
      data: categoryData,
      dataType: "cate",
      metaType: "STREET",
      // BizChat ATS mosu API 규격: 11번가는 'STREET'
      code: "",
      desc: `11\uBC88\uAC00: ${categoryDesc}`,
      not: false
    });
    descParts.push(`11\uBC88\uAC00: ${categoryDesc}`);
  }
  if (params.webappCategories && params.webappCategories.length > 0) {
    const categoryData = params.webappCategories.map((cat) => ({
      cat1: cat.cat1Name || cat.cat1,
      // 카테고리 이름 (예: "게임")
      ...cat.cat2 && { cat2: cat.cat2Name || cat.cat2 },
      // 카테고리 이름 (예: "VR/AR게임")
      ...cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }
      // 카테고리 이름 (예: "포켓몬 고")
    }));
    const categoryDesc = params.webappCategories.map((cat) => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? cat.cat2Name || cat.cat2 : "";
      const cat3Display = cat.cat3 ? cat.cat3Name || cat.cat3 : "";
      return `${cat1Display}${cat2Display ? " > " + cat2Display : ""}${cat3Display ? " > " + cat3Display : ""}`;
    }).join(", ");
    conditions.push({
      data: categoryData,
      dataType: "cate",
      metaType: "app",
      // BizChat ATS mosu API 규격: 웹앱은 'app' (소문자)
      code: "",
      desc: `\uC571/\uC6F9: ${categoryDesc}`,
      not: false
    });
    descParts.push(`\uC571/\uC6F9: ${categoryDesc}`);
  }
  if (params.callCategories && params.callCategories.length > 0) {
    const categoryData = params.callCategories.map((cat) => ({
      cat1: cat.cat1Name || cat.cat1,
      // 카테고리 이름
      ...cat.cat2 && { cat2: cat.cat2Name || cat.cat2 },
      ...cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }
    }));
    const categoryDesc = params.callCategories.map((cat) => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? cat.cat2Name || cat.cat2 : "";
      const cat3Display = cat.cat3 ? cat.cat3Name || cat.cat3 : "";
      return `${cat1Display}${cat2Display ? " > " + cat2Display : ""}${cat3Display ? " > " + cat3Display : ""}`;
    }).join(", ");
    conditions.push({
      data: categoryData,
      dataType: "cate",
      metaType: "TEL",
      // BizChat ATS mosu API 규격: 통화Usage는 'TEL' (대문자)
      code: "",
      desc: `\uD1B5\uD654: ${categoryDesc}`,
      not: false
    });
    descParts.push(`\uD1B5\uD654: ${categoryDesc}`);
  }
  if (params.locations && params.locations.length > 0) {
    const homeLocations = params.locations.filter((l) => l.type === "home");
    const workLocations = params.locations.filter((l) => l.type === "work");
    if (homeLocations.length > 0) {
      const hcodes = homeLocations.map((l) => l.code);
      const names = homeLocations.map((l) => l.name);
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "home_location",
        desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${names.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9D1\uC8FC\uC18C: ${names.join(", ")}`);
    }
    if (workLocations.length > 0) {
      const hcodes = workLocations.map((l) => l.code);
      const names = workLocations.map((l) => l.name);
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "work_location",
        desc: `\uCD94\uC815 \uC9C1\uC7A5\uC8FC\uC18C: ${names.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9C1\uC7A5\uC8FC\uC18C: ${names.join(", ")}`);
    }
  }
  if (params.profiling && params.profiling.length > 0) {
    for (const pro of params.profiling) {
      let processedValue = pro.value;
      let dataType = "number";
      if (typeof pro.value === "object" && pro.value !== null && "gt" in pro.value) {
        processedValue = {
          gt: typeof pro.value.gt === "string" ? parseFloat(pro.value.gt) : pro.value.gt,
          lt: typeof pro.value.lt === "string" ? parseFloat(pro.value.lt) : pro.value.lt
        };
        dataType = "number";
      } else if (typeof pro.value === "boolean") {
        dataType = "boolean";
      } else if (typeof pro.value === "string") {
        dataType = "code";
        processedValue = [pro.value];
      } else if (typeof pro.value === "number") {
        dataType = "number";
      }
      conditions.push({
        data: processedValue,
        dataType,
        metaType: "pro",
        code: pro.code,
        desc: pro.desc,
        not: false
      });
      descParts.push(pro.desc);
    }
  }
  return {
    payload: { "$and": conditions },
    desc: descParts.join(", ")
  };
}
async function callATSMosuAPI2(mosuQuery) {
  const tid = generateTid13();
  const apiKey = getBizChatApiKey4();
  if (!apiKey) {
    console.log("[Estimate] BizChat API key not configured, returning mock data");
    return { estimatedCount: 5e5 };
  }
  const url = `${getBizChatUrl3()}/api/v1/ats/mosu?tid=${tid}`;
  console.log("[Estimate] Calling ATS mosu API:", { url, payload: JSON.stringify(mosuQuery) });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify(mosuQuery)
    });
    if (!response.ok) {
      throw new Error(`ATS mosu API HTTP error: ${response.status}`);
    }
    const data = await response.json();
    console.log("[Estimate] ATS mosu response:", JSON.stringify(data).substring(0, 1e3));
    if (data.code === "S000001") {
      const estimatedCount = data.data?.sndMosu || data.data?.cnt || 0;
      const sndMosuQuery = data.data?.query || void 0;
      console.log("[Estimate] Extracted sndMosu:", estimatedCount, "sndMosuQuery:", sndMosuQuery?.substring(0, 200));
      return { estimatedCount, sndMosuQuery };
    } else {
      console.error("[Estimate] ATS mosu API error:", data.code, data.msg);
      return { estimatedCount: 5e5 };
    }
  } catch (error) {
    console.error("[Estimate] ATS mosu API call failed:", error);
    return { estimatedCount: 5e5 };
  }
}
async function handler59(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await verifyAuth26(req);
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const params = req.body;
    console.log("[Estimate] Request params:", JSON.stringify(params));
    if (params.targetingMode === "maptics") {
      console.log("[Estimate] Maptics mode - returning geofence-based estimate");
      const geofenceCount = params.geofences?.length ?? 0;
      const estimatedCount = geofenceCount > 0 ? geofenceCount * 5e4 : 0;
      return res.status(200).json({
        estimatedCount,
        minCount: Math.floor(estimatedCount * 0.8),
        maxCount: Math.ceil(estimatedCount * 1.2),
        reachRate: 85,
        sndMosuQuery: null,
        sndMosuDesc: `\uC9C0\uC624\uD39C\uC2A4 ${geofenceCount}\uAC1C \uD0C0\uAC9F`,
        mosuQuery: null,
        mosuDesc: `\uC9C0\uC624\uD39C\uC2A4 ${geofenceCount}\uAC1C \uD0C0\uAC9F`
      });
    }
    const { payload, desc: desc21 } = buildATSMosuPayload2(params);
    console.log("[Estimate] Built payload:", JSON.stringify(payload));
    const result = await callATSMosuAPI2(payload);
    return res.status(200).json({
      estimatedCount: result.estimatedCount,
      // BizChat API 규격: sndMosuQuery는 SQL 형식이어야 함
      sndMosuQuery: result.sndMosuQuery || JSON.stringify(payload),
      // SQL query 또는 fallback으로 JSON
      sndMosuDesc: desc21,
      // 기존 호환성 유지
      mosuQuery: payload,
      mosuDesc: desc21,
      // 추가 정보
      minCount: Math.floor(result.estimatedCount * 0.8),
      maxCount: Math.ceil(result.estimatedCount * 1.2),
      reachRate: 85
    });
  } catch (error) {
    console.error("[Estimate] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to estimate audience" });
  }
}

// src/handlers/templates/[id].ts
var id_exports4 = {};
__export(id_exports4, {
  default: () => handler60
});
import { createClient as createClient30 } from "@supabase/supabase-js";
import { neon as neon46 } from "@neondatabase/serverless";
import { drizzle as drizzle46 } from "drizzle-orm/neon-http";
import { eq as eq45 } from "drizzle-orm";
import { pgTable as pgTable45, text as text34, integer as integer24, timestamp as timestamp42, jsonb as jsonb16 } from "drizzle-orm/pg-core";
import { z as z2 } from "zod";
import { createHmac as createHmac18 } from "crypto";
var templates7 = pgTable45("templates", {
  id: text34("id").primaryKey(),
  userId: text34("user_id").notNull(),
  name: text34("name").notNull(),
  messageType: text34("message_type").notNull(),
  rcsType: integer24("rcs_type"),
  title: text34("title"),
  lmsTitle: text34("lms_title"),
  content: text34("content").notNull(),
  imageUrl: text34("image_url"),
  imageFileId: text34("image_file_id"),
  urlLinks: jsonb16("url_links"),
  buttons: jsonb16("buttons"),
  lmsContent: text34("lms_content"),
  lmsImageUrl: text34("lms_image_url"),
  lmsImageFileId: text34("lms_image_file_id"),
  lmsUrlLinks: jsonb16("lms_url_links"),
  status: text34("status").default("draft"),
  submittedAt: timestamp42("submitted_at"),
  reviewedAt: timestamp42("reviewed_at"),
  rejectionReason: text34("rejection_reason"),
  createdAt: timestamp42("created_at").defaultNow(),
  updatedAt: timestamp42("updated_at").defaultNow()
});
function getDb46() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle46(neon46(dbUrl));
}
function getSupabaseAdmin29() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient30(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken21(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac18("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth27(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken21(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin29().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
var updateTemplateSchema = z2.object({
  name: z2.string().min(1).max(200).optional(),
  messageType: z2.enum(["LMS", "MMS", "RCS"]).optional(),
  rcsType: z2.number().optional(),
  title: z2.string().max(60).optional(),
  lmsTitle: z2.string().max(60).optional().nullable(),
  content: z2.string().min(1).max(2e3).optional(),
  imageUrl: z2.string().optional(),
  imageFileId: z2.string().optional(),
  urlLinks: z2.object({
    list: z2.array(z2.string()),
    reward: z2.number().optional()
  }).optional(),
  buttons: z2.object({
    list: z2.array(z2.object({
      type: z2.string(),
      name: z2.string(),
      val1: z2.string(),
      val2: z2.string().optional()
    }))
  }).optional(),
  lmsContent: z2.string().max(2e3).optional().nullable(),
  lmsImageUrl: z2.string().optional().nullable(),
  lmsImageFileId: z2.string().optional().nullable(),
  lmsUrlLinks: z2.object({
    list: z2.array(z2.string()),
    reward: z2.number().optional()
  }).optional().nullable()
});
async function handler60(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  const auth = await verifyAuth27(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid template ID" });
  const db = getDb46();
  const userId = auth.userId;
  if (req.method === "GET") {
    try {
      const result = await db.select().from(templates7).where(eq45(templates7.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: "Template not found" });
      if (template.userId !== userId) return res.status(403).json({ error: "Access denied" });
      return res.status(200).json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      return res.status(500).json({ error: "Failed to fetch template" });
    }
  }
  if (req.method === "PATCH") {
    try {
      const result = await db.select().from(templates7).where(eq45(templates7.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: "Template not found" });
      if (template.userId !== userId) return res.status(403).json({ error: "Access denied" });
      if (template.status !== "draft" && template.status !== "rejected") {
        return res.status(400).json({ error: "Only draft or rejected templates can be edited" });
      }
      const data = updateTemplateSchema.parse(req.body);
      const messageType = data.messageType || template.messageType;
      const updateData = { ...data };
      if (messageType !== "RCS") {
        updateData.lmsTitle = null;
        updateData.lmsContent = null;
        updateData.lmsImageUrl = null;
        updateData.lmsImageFileId = null;
        updateData.lmsUrlLinks = null;
      }
      const updated = await db.update(templates7).set(updateData).where(eq45(templates7.id, id)).returning();
      return res.status(200).json(updated[0]);
    } catch (error) {
      if (error instanceof z2.ZodError) return res.status(400).json({ error: "Invalid template data", details: error.errors });
      console.error("Error updating template:", error);
      return res.status(500).json({ error: "Failed to update template" });
    }
  }
  if (req.method === "DELETE") {
    try {
      const result = await db.select().from(templates7).where(eq45(templates7.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: "Template not found" });
      if (template.userId !== userId) return res.status(403).json({ error: "Access denied" });
      if (template.status === "pending") return res.status(400).json({ error: "Cannot delete template under review" });
      await db.delete(templates7).where(eq45(templates7.id, id));
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      return res.status(500).json({ error: "Failed to delete template" });
    }
  }
  if (req.method === "POST") {
    const { action, reason } = req.body || {};
    try {
      const result = await db.select().from(templates7).where(eq45(templates7.id, id));
      const template = result[0];
      if (!template) return res.status(404).json({ error: "Template not found" });
      if (template.userId !== userId) return res.status(403).json({ error: "Access denied" });
      if (action === "submit") {
        if (template.status !== "draft" && template.status !== "rejected") {
          return res.status(400).json({ error: "Only draft or rejected templates can be submitted for review" });
        }
        const updated = await db.update(templates7).set({
          status: "pending",
          submittedAt: /* @__PURE__ */ new Date()
        }).where(eq45(templates7.id, id)).returning();
        return res.status(200).json(updated[0]);
      }
      if (action === "approve") {
        if (template.status !== "pending") {
          return res.status(400).json({ error: "Only pending templates can be approved" });
        }
        const updated = await db.update(templates7).set({
          status: "approved",
          reviewedAt: /* @__PURE__ */ new Date()
        }).where(eq45(templates7.id, id)).returning();
        return res.status(200).json(updated[0]);
      }
      if (action === "reject") {
        if (template.status !== "pending") {
          return res.status(400).json({ error: "Only pending templates can be rejected" });
        }
        const updated = await db.update(templates7).set({
          status: "rejected",
          rejectionReason: reason || "\uAC80\uC218 \uAE30\uC900\uC5D0 \uBD80\uD569\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
          reviewedAt: /* @__PURE__ */ new Date()
        }).where(eq45(templates7.id, id)).returning();
        return res.status(200).json(updated[0]);
      }
      return res.status(400).json({ error: "Invalid action. Use submit, approve, or reject" });
    } catch (error) {
      console.error("Error processing template action:", error);
      return res.status(500).json({ error: "Failed to process template action" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/templates/approved.ts
var approved_exports = {};
__export(approved_exports, {
  default: () => handler61
});
import { createClient as createClient31 } from "@supabase/supabase-js";
import { neon as neon47, neonConfig as neonConfig18 } from "@neondatabase/serverless";
import { drizzle as drizzle47 } from "drizzle-orm/neon-http";
import { eq as eq46, desc as desc13 } from "drizzle-orm";
import { pgTable as pgTable46, text as text35, timestamp as timestamp43 } from "drizzle-orm/pg-core";
neonConfig18.fetchConnectionCache = true;
var templates8 = pgTable46("templates", {
  id: text35("id").primaryKey(),
  userId: text35("user_id").notNull(),
  name: text35("name").notNull(),
  messageType: text35("message_type").notNull(),
  title: text35("title"),
  lmsTitle: text35("lms_title"),
  content: text35("content").notNull(),
  imageUrl: text35("image_url"),
  status: text35("status").default("draft"),
  createdAt: timestamp43("created_at").defaultNow()
});
function getDb47() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle47(neon47(dbUrl));
}
function getSupabaseAdmin30() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient31(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function verifyAuth28(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin30().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler61(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth28(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  try {
    const db = getDb47();
    const result = await db.select().from(templates8).where(eq46(templates8.userId, auth.userId)).orderBy(desc13(templates8.createdAt));
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching templates:", error);
    return res.status(500).json({ error: "Failed to fetch templates" });
  }
}

// src/handlers/transactions/charge.ts
var charge_exports = {};
__export(charge_exports, {
  default: () => handler62
});
import { createClient as createClient32 } from "@supabase/supabase-js";
import { neon as neon48, neonConfig as neonConfig19 } from "@neondatabase/serverless";
import { drizzle as drizzle48 } from "drizzle-orm/neon-http";
import { eq as eq47 } from "drizzle-orm";
import { pgTable as pgTable47, text as text36, timestamp as timestamp44 } from "drizzle-orm/pg-core";
import { randomUUID as randomUUID2, createHmac as createHmac19 } from "crypto";
neonConfig19.fetchConnectionCache = true;
var users23 = pgTable47("users", {
  id: text36("id").primaryKey(),
  email: text36("email"),
  balance: text36("balance").default("0").notNull()
});
var transactions12 = pgTable47("transactions", {
  id: text36("id").primaryKey(),
  userId: text36("user_id").notNull(),
  type: text36("type").notNull(),
  amount: text36("amount").notNull(),
  balanceAfter: text36("balance_after"),
  description: text36("description"),
  paymentMethod: text36("payment_method"),
  createdAt: timestamp44("created_at").defaultNow()
});
function getDb48() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle48(neon48(dbUrl));
}
function getSupabaseAdmin31() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient32(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken22(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac19("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth29(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken22(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin31().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler62(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth29(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  try {
    const db = getDb48();
    const userResult = await db.select().from(users23).where(eq47(users23.id, auth.userId));
    const user = userResult[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const { amount, paymentMethod } = req.body;
    if (!amount || amount < 1e4) {
      return res.status(400).json({ error: "Minimum charge amount is 10,000 KRW" });
    }
    const currentBalance = parseFloat(user.balance || "0");
    const newBalance = currentBalance + amount;
    const transaction = await db.insert(transactions12).values({
      id: randomUUID2(),
      userId: auth.userId,
      type: "charge",
      amount: amount.toString(),
      balanceAfter: newBalance.toString(),
      description: "\uC794\uC561 \uCDA9\uC804",
      paymentMethod: paymentMethod || "card"
    }).returning();
    await db.update(users23).set({ balance: newBalance.toString() }).where(eq47(users23.id, auth.userId));
    return res.status(201).json(transaction[0]);
  } catch (error) {
    console.error("Error processing charge:", error);
    return res.status(500).json({ error: "Failed to process charge" });
  }
}

// src/handlers/announcements/index.ts
var announcements_exports2 = {};
__export(announcements_exports2, {
  default: () => handler63
});
import { neon as neon49 } from "@neondatabase/serverless";
import { drizzle as drizzle49 } from "drizzle-orm/neon-http";
import { eq as eq48, sql as sql27, desc as desc14, lte as lte4, gte as gte7, or as or6, isNull, and as and11 } from "drizzle-orm";
import { pgTable as pgTable48, varchar as varchar28, text as text37, timestamp as timestamp45, boolean as boolean26 } from "drizzle-orm/pg-core";
var announcements4 = pgTable48("announcements", {
  id: varchar28("id").primaryKey().default(sql27`gen_random_uuid()`),
  title: varchar28("title", { length: 200 }).notNull(),
  content: text37("content").notNull(),
  category: varchar28("category", { length: 50 }).default("general").notNull(),
  isPublished: boolean26("is_published").default(true),
  isPinned: boolean26("is_pinned").default(false),
  publishedAt: timestamp45("published_at"),
  expiresAt: timestamp45("expires_at"),
  createdAt: timestamp45("created_at").defaultNow()
});
function getDb49() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  const sqlClient = neon49(databaseUrl);
  return drizzle49(sqlClient);
}
async function handler63(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const db = getDb49();
    const now = /* @__PURE__ */ new Date();
    const activeAnnouncements = await db.select().from(announcements4).where(
      and11(
        eq48(announcements4.isPublished, true),
        or6(isNull(announcements4.publishedAt), lte4(announcements4.publishedAt, now)),
        or6(isNull(announcements4.expiresAt), gte7(announcements4.expiresAt, now))
      )
    ).orderBy(desc14(announcements4.isPinned), desc14(announcements4.createdAt)).limit(5);
    return res.status(200).json(activeAnnouncements);
  } catch (error) {
    console.error("[Announcements] Error:", error);
    return res.status(500).json({ error: "\uACF5\uC9C0\uC0AC\uD56D \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
  }
}

// src/handlers/campaigns/index.ts
var campaigns_exports3 = {};
__export(campaigns_exports3, {
  default: () => handler64
});
import { createClient as createClient33 } from "@supabase/supabase-js";
import { neon as neon50 } from "@neondatabase/serverless";
import { drizzle as drizzle50 } from "drizzle-orm/neon-http";
import { eq as eq49, desc as desc15 } from "drizzle-orm";
import { pgTable as pgTable49, text as text38, integer as integer25, timestamp as timestamp46, numeric as numeric6, jsonb as jsonb17 } from "drizzle-orm/pg-core";
import { z as z3 } from "zod";
import { randomUUID as randomUUID3, createHmac as createHmac20 } from "crypto";
var BIZCHAT_DEV_URL16 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL16 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function generateTid14() {
  return Date.now().toString();
}
async function callATSMosuAPI3(filterPayload, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL16 : BIZCHAT_DEV_URL16;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  if (!apiKey) {
    return { success: false, query: "", filterStr: "", count: 0, error: "API key not configured" };
  }
  const tid = generateTid14();
  const url = `${baseUrl}/api/v1/ats/mosu?tid=${tid}`;
  console.log(`[ATS Mosu] POST ${url}`);
  console.log(`[ATS Mosu] Payload:`, JSON.stringify(filterPayload, null, 2));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify(filterPayload)
    });
    const responseText = await response.text();
    console.log(`[ATS Mosu] Response: ${response.status} - ${responseText.substring(0, 500)}`);
    const data = JSON.parse(responseText);
    if (data.code === "S000001" && data.data?.query) {
      console.log(`[ATS Mosu] Success - query: ${data.data.query.substring(0, 200)}...`);
      return {
        success: true,
        query: data.data.query,
        // SQL 형식의 query 문자열
        filterStr: data.data.filterStr || "",
        count: data.data.cnt || 0
      };
    }
    console.error(`[ATS Mosu] Failed - code: ${data.code}, msg: ${data.msg}`);
    return {
      success: false,
      query: "",
      filterStr: "",
      count: 0,
      error: `ATS API failed: ${data.code} - ${data.msg}`
    };
  } catch (error) {
    console.error(`[ATS Mosu] Error:`, error);
    return {
      success: false,
      query: "",
      filterStr: "",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
var CALLBACK_BASE_URL4 = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://wepickbizchat-new.vercel.app";
var users24 = pgTable49("users", {
  id: text38("id").primaryKey(),
  email: text38("email"),
  balance: numeric6("balance").default("0").notNull()
});
var campaigns19 = pgTable49("campaigns", {
  id: text38("id").primaryKey(),
  userId: text38("user_id").notNull(),
  name: text38("name").notNull(),
  tgtCompanyName: text38("tgt_company_name"),
  templateId: text38("template_id"),
  messageType: text38("message_type"),
  bizchatCampaignId: text38("bizchat_campaign_id"),
  sndNum: text38("snd_num"),
  statusCode: integer25("status_code").default(0),
  status: text38("status").default("temp_registered"),
  rcvType: integer25("rcv_type").default(0),
  billingType: integer25("billing_type").default(0),
  rcsType: integer25("rcs_type"),
  sndGoalCnt: integer25("snd_goal_cnt"),
  sndMosu: integer25("snd_mosu"),
  sndMosuQuery: text38("snd_mosu_query"),
  sndMosuDesc: text38("snd_mosu_desc"),
  settleCnt: integer25("settle_cnt").default(0),
  targetCount: integer25("target_count"),
  sentCount: integer25("sent_count"),
  successCount: integer25("success_count"),
  budget: numeric6("budget"),
  costPerMessage: numeric6("cost_per_message"),
  scheduledAt: timestamp46("scheduled_at"),
  // Maptics 지오펜스 발송 관련 필드
  atsSndStartDate: timestamp46("ats_snd_start_date"),
  collStartDate: timestamp46("coll_start_date"),
  collEndDate: timestamp46("coll_end_date"),
  collSndDate: timestamp46("coll_snd_date"),
  sndGeofenceId: integer25("snd_geofence_id"),
  rtStartHhmm: text38("rt_start_hhmm"),
  rtEndHhmm: text38("rt_end_hhmm"),
  sndDayDiv: integer25("snd_day_div"),
  createdAt: timestamp46("created_at").defaultNow(),
  updatedAt: timestamp46("updated_at").defaultNow()
});
var messages6 = pgTable49("messages", {
  id: text38("id").primaryKey(),
  campaignId: text38("campaign_id").notNull(),
  title: text38("title"),
  lmsTitle: text38("lms_title"),
  content: text38("content").notNull(),
  imageUrl: text38("image_url"),
  imageFileId: text38("image_file_id"),
  urlLinks: jsonb17("url_links"),
  // { list: string[], reward?: number }
  buttons: jsonb17("buttons"),
  // { list: [{ type, name, val1, val2? }] }
  lmsContent: text38("lms_content"),
  lmsImageUrl: text38("lms_image_url"),
  lmsImageFileId: text38("lms_image_file_id"),
  lmsUrlLinks: jsonb17("lms_url_links"),
  // { list: string[], reward?: number }
  createdAt: timestamp46("created_at").defaultNow()
});
var targeting4 = pgTable49("targeting", {
  id: text38("id").primaryKey(),
  campaignId: text38("campaign_id").notNull(),
  gender: text38("gender"),
  ageMin: integer25("age_min"),
  ageMax: integer25("age_max"),
  regions: text38("regions").array(),
  districts: text38("districts").array(),
  carrierTypes: text38("carrier_types").array(),
  deviceTypes: text38("device_types").array(),
  shopping11stCategories: text38("shopping_11st_categories").array(),
  webappCategories: text38("webapp_categories").array(),
  callUsageTypes: text38("call_usage_types").array(),
  locationTypes: text38("location_types").array(),
  mobilityPatterns: text38("mobility_patterns").array(),
  geofenceIds: text38("geofence_ids").array(),
  atsQuery: text38("ats_query"),
  estimatedCount: integer25("estimated_count"),
  createdAt: timestamp46("created_at").defaultNow()
});
var templates9 = pgTable49("templates", {
  id: text38("id").primaryKey(),
  userId: text38("user_id").notNull(),
  name: text38("name").notNull(),
  messageType: text38("message_type").notNull(),
  rcsType: integer25("rcs_type"),
  // 0=스탠다드, 1=LMS, 2=슬라이드, 3=이미지강조A, 4=이미지강조B, 5=상품소개세로
  title: text38("title"),
  lmsTitle: text38("lms_title"),
  content: text38("content").notNull(),
  imageUrl: text38("image_url"),
  imageFileId: text38("image_file_id"),
  urlLinks: jsonb17("url_links"),
  // { list: string[], reward?: number }
  buttons: jsonb17("buttons"),
  // { list: [{ type, name, val1, val2? }] }
  status: text38("status").default("draft"),
  lmsContent: text38("lms_content"),
  lmsImageUrl: text38("lms_image_url"),
  lmsImageFileId: text38("lms_image_file_id"),
  lmsUrlLinks: jsonb17("lms_url_links")
  // { list: string[], reward?: number }
});
function getDb50() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle50(neon50(dbUrl));
}
function getSupabaseAdmin32() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient33(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken23(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac20("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth30(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken23(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin32().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
function detectProductionEnvironment4(req) {
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== "true";
  if (forceDevMode) {
    console.log('[BizChat] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
    return false;
  }
  if (req.query.env === "prod" || req.body?.env === "prod") return true;
  if (req.query.env === "dev" || req.body?.env === "dev") return false;
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}
async function callBizChatAPI9(endpoint, method = "POST", body, useProduction = false) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL16 : BIZCHAT_DEV_URL16;
  const envKeyName = useProduction ? "BIZCHAT_PROD_API_KEY" : "BIZCHAT_DEV_API_KEY";
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  console.log(`[BizChat] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`[BizChat] Looking for env var: ${envKeyName}`);
  console.log(`[BizChat] API key exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  console.log(`[BizChat] VERCEL_ENV: ${process.env.VERCEL_ENV}, NODE_ENV: ${process.env.NODE_ENV}`);
  if (!apiKey) {
    console.error(`[BizChat] \u274C API key not configured: ${envKeyName}`);
    console.error(`[BizChat] Available keys - DEV: ${!!process.env.BIZCHAT_DEV_API_KEY}, PROD: ${!!process.env.BIZCHAT_PROD_API_KEY}`);
    throw new Error(`BizChat API \uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4 (${envKeyName}). Vercel \uD658\uACBD\uBCC0\uC218\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.`);
  }
  const tid = generateTid14();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;
  console.log(`[BizChat] ${method} ${url}`);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    }
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
    console.log(`[BizChat] Request body:`, JSON.stringify(body, null, 2));
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[BizChat] Response: ${response.status} - ${responseText.substring(0, 500)}`);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }
  return { status: response.status, data };
}
var REGION_HCODE_MAP4 = {
  "\uC11C\uC6B8": "11",
  "\uACBD\uAE30": "41",
  "\uC778\uCC9C": "28",
  "\uBD80\uC0B0": "26",
  "\uB300\uAD6C": "27",
  "\uAD11\uC8FC": "29",
  "\uB300\uC804": "30",
  "\uC6B8\uC0B0": "31",
  "\uC138\uC885": "36",
  "\uAC15\uC6D0": "42",
  "\uCDA9\uBD81": "43",
  "\uCDA9\uB0A8": "44",
  "\uC804\uBD81": "45",
  "\uC804\uB0A8": "46",
  "\uACBD\uBD81": "47",
  "\uACBD\uB0A8": "48",
  "\uC81C\uC8FC": "50"
};
function buildAtsQuery(targetingData) {
  const conditions = [];
  const descParts = [];
  if (targetingData.ageMin !== void 0 || targetingData.ageMax !== void 0) {
    const min = targetingData.ageMin ?? 0;
    const max = targetingData.ageMax ?? 100;
    conditions.push({
      data: { gt: min, lt: max },
      dataType: "number",
      metaType: "svc",
      code: "cust_age_cd",
      desc: `\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`,
      not: false
    });
    descParts.push(`\uC5F0\uB839: ${min}\uC138 ~ ${max}\uC138`);
  }
  if (targetingData.gender && targetingData.gender !== "all") {
    const genderValue = targetingData.gender === "male" ? "1" : "2";
    const genderName = targetingData.gender === "male" ? "\uB0A8\uC790" : "\uC5EC\uC790";
    conditions.push({
      data: [genderValue],
      dataType: "code",
      metaType: "svc",
      code: "sex_cd",
      desc: `\uC131\uBCC4: ${genderName}`,
      not: false
    });
    descParts.push(`\uC131\uBCC4: ${genderName}`);
  }
  if (targetingData.regions && targetingData.regions.length > 0) {
    const hcodes = [];
    const regionNames = [];
    for (const region of targetingData.regions) {
      const hcode = REGION_HCODE_MAP4[region];
      if (hcode) {
        hcodes.push(hcode);
        regionNames.push(region);
      }
    }
    if (hcodes.length > 0) {
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "home_location",
        desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${regionNames.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9C0\uC5ED: ${regionNames.join(", ")}`);
    }
  }
  if (targetingData.shopping11stCategories && targetingData.shopping11stCategories.length > 0) {
    const categoryData = targetingData.shopping11stCategories.map((cat) => ({
      cat1: cat.cat1Name || cat.cat1,
      // 카테고리 이름 (예: "가구/인테리어")
      ...cat.cat2 && { cat2: cat.cat2Name || cat.cat2 },
      // 카테고리 이름 (예: "침대/소파")
      ...cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }
      // 카테고리 이름 (예: "펠트")
    }));
    const categoryDesc = targetingData.shopping11stCategories.map((cat) => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? cat.cat2Name || cat.cat2 : "";
      const cat3Display = cat.cat3 ? cat.cat3Name || cat.cat3 : "";
      return `${cat1Display}${cat2Display ? " > " + cat2Display : ""}${cat3Display ? " > " + cat3Display : ""}`;
    }).join(", ");
    conditions.push({
      data: categoryData,
      dataType: "cate",
      metaType: "STREET",
      // BizChat ATS mosu API 규격: 11번가는 'STREET'
      code: "",
      desc: `11\uBC88\uAC00: ${categoryDesc}`,
      not: false
    });
    descParts.push(`11\uBC88\uAC00: ${categoryDesc}`);
  }
  if (targetingData.webappCategories && targetingData.webappCategories.length > 0) {
    const categoryData = targetingData.webappCategories.map((cat) => ({
      cat1: cat.cat1Name || cat.cat1,
      // 카테고리 이름 (예: "게임")
      ...cat.cat2 && { cat2: cat.cat2Name || cat.cat2 },
      // 카테고리 이름 (예: "VR/AR게임")
      ...cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }
      // 카테고리 이름 (예: "포켓몬 고")
    }));
    const categoryDesc = targetingData.webappCategories.map((cat) => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? cat.cat2Name || cat.cat2 : "";
      const cat3Display = cat.cat3 ? cat.cat3Name || cat.cat3 : "";
      return `${cat1Display}${cat2Display ? " > " + cat2Display : ""}${cat3Display ? " > " + cat3Display : ""}`;
    }).join(", ");
    conditions.push({
      data: categoryData,
      dataType: "cate",
      metaType: "app",
      // BizChat ATS mosu API 규격: 웹앱은 'app' (소문자)
      code: "",
      desc: `\uC571/\uC6F9: ${categoryDesc}`,
      not: false
    });
    descParts.push(`\uC571/\uC6F9: ${categoryDesc}`);
  }
  if (targetingData.callCategories && targetingData.callCategories.length > 0) {
    const categoryData = targetingData.callCategories.map((cat) => ({
      cat1: cat.cat1Name || cat.cat1,
      // 카테고리 이름
      ...cat.cat2 && { cat2: cat.cat2Name || cat.cat2 },
      ...cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }
    }));
    const categoryDesc = targetingData.callCategories.map((cat) => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? cat.cat2Name || cat.cat2 : "";
      const cat3Display = cat.cat3 ? cat.cat3Name || cat.cat3 : "";
      return `${cat1Display}${cat2Display ? " > " + cat2Display : ""}${cat3Display ? " > " + cat3Display : ""}`;
    }).join(", ");
    conditions.push({
      data: categoryData,
      dataType: "cate",
      metaType: "TEL",
      // BizChat ATS mosu API 규격: 통화Usage는 'TEL' (대문자)
      code: "",
      desc: `\uD1B5\uD654: ${categoryDesc}`,
      not: false
    });
    descParts.push(`\uD1B5\uD654: ${categoryDesc}`);
  }
  if (targetingData.locations && targetingData.locations.length > 0) {
    const homeLocations = targetingData.locations.filter((l) => l.type === "home");
    const workLocations = targetingData.locations.filter((l) => l.type === "work");
    if (homeLocations.length > 0) {
      const hcodes = homeLocations.map((l) => l.code);
      const names = homeLocations.map((l) => l.name);
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "home_location",
        desc: `\uCD94\uC815 \uC9D1\uC8FC\uC18C: ${names.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9D1\uC8FC\uC18C: ${names.join(", ")}`);
    }
    if (workLocations.length > 0) {
      const hcodes = workLocations.map((l) => l.code);
      const names = workLocations.map((l) => l.name);
      conditions.push({
        data: hcodes,
        dataType: "code",
        metaType: "loc",
        code: "work_location",
        desc: `\uCD94\uC815 \uC9C1\uC7A5\uC8FC\uC18C: ${names.join(", ")}`,
        not: false
      });
      descParts.push(`\uC9C1\uC7A5\uC8FC\uC18C: ${names.join(", ")}`);
    }
  }
  if (targetingData.profiling && targetingData.profiling.length > 0) {
    for (const pro of targetingData.profiling) {
      let processedValue = pro.value;
      let dataType = "number";
      if (typeof pro.value === "object" && pro.value !== null && "gt" in pro.value) {
        const rangeValue = pro.value;
        processedValue = {
          gt: typeof rangeValue.gt === "string" ? parseFloat(rangeValue.gt) : rangeValue.gt,
          lt: typeof rangeValue.lt === "string" ? parseFloat(rangeValue.lt) : rangeValue.lt
        };
        dataType = "number";
      } else if (typeof pro.value === "boolean") {
        dataType = "boolean";
      } else if (typeof pro.value === "string") {
        dataType = "code";
        processedValue = [pro.value];
      } else if (typeof pro.value === "number") {
        dataType = "number";
      }
      conditions.push({
        data: processedValue,
        dataType,
        metaType: "pro",
        code: pro.code,
        desc: pro.desc,
        not: false
      });
      descParts.push(pro.desc);
    }
  }
  const plainDescription = descParts.length > 0 ? descParts.join(", ") : "\uC804\uCCB4 \uB300\uC0C1";
  const htmlDescription = `<html><body><p>${plainDescription}</p></body></html>`;
  return {
    query: { "$and": conditions },
    description: plainDescription,
    htmlDescription
  };
}
function validateStringLengths2(data) {
  if (data.name && data.name.length > 40) {
    return { valid: false, error: `\uCEA0\uD398\uC778\uBA85\uC740 \uCD5C\uB300 40\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.name.length}\uC790)` };
  }
  if (data.tgtCompanyName && data.tgtCompanyName.length > 100) {
    return { valid: false, error: `\uACE0\uAC1D\uC0AC\uBA85\uC740 \uCD5C\uB300 100\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.tgtCompanyName.length}\uC790)` };
  }
  if (data.title && data.title.length > 30) {
    return { valid: false, error: `\uBA54\uC2DC\uC9C0 \uC81C\uBAA9\uC740 \uCD5C\uB300 30\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.title.length}\uC790)` };
  }
  if (data.msg && data.msg.length > 1e3) {
    return { valid: false, error: `\uBA54\uC2DC\uC9C0 \uBCF8\uBB38\uC740 \uCD5C\uB300 1000\uC790\uAE4C\uC9C0 \uC785\uB825 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uD604\uC7AC: ${data.msg.length}\uC790)` };
  }
  return { valid: true };
}
async function createCampaignInBizChat2(campaignData, messageData, useProduction = false) {
  let billingType = 0;
  if (campaignData.messageType === "RCS") {
    billingType = campaignData.rcsType === 2 ? 1 : 3;
  } else if (campaignData.messageType === "MMS") {
    billingType = 2;
  }
  const sndGoalCnt = campaignData.targetCount || 1e3;
  const sndMosu = Math.min(Math.ceil(sndGoalCnt * 1.5), 4e5);
  const rcvType = campaignData.rcvType ?? 0;
  const calculateValidSendDate = (requestedDate) => {
    const now = /* @__PURE__ */ new Date();
    const minStartTime = new Date(now.getTime() + 60 * 60 * 1e3);
    let targetDate = requestedDate ? new Date(requestedDate) : minStartTime;
    if (targetDate < minStartTime) {
      targetDate = minStartTime;
    }
    targetDate.setSeconds(0);
    targetDate.setMilliseconds(0);
    const minutes = targetDate.getMinutes();
    const remainder = minutes % 10;
    if (remainder > 0) {
      targetDate.setMinutes(minutes + (10 - remainder));
    }
    if (targetDate < minStartTime) {
      targetDate = new Date(minStartTime.getTime());
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);
      const mins = targetDate.getMinutes();
      const rem = mins % 10;
      if (rem > 0) {
        targetDate.setMinutes(mins + (10 - rem));
      }
    }
    return Math.floor(targetDate.getTime() / 1e3);
  };
  const payload = {
    tgtCompanyName: campaignData.tgtCompanyName || "\uC704\uD53D",
    name: campaignData.name,
    sndNum: campaignData.sndNum,
    rcvType,
    sndGoalCnt,
    billingType,
    isTmp: 0,
    // 임시저장 아님
    settleCnt: sndGoalCnt,
    sndMosu,
    sndMosuFlag: 0,
    adverDeny: "1504",
    // rcvType=0,10일 때 atsSndStartDate 필수 (10분 단위 올림, 현재+1시간 이후)
    atsSndStartDate: calculateValidSendDate(campaignData.atsSndStartDate),
    cb: {
      state: `${CALLBACK_BASE_URL4}/api/bizchat/callback/state`
    },
    // MMS 메시지 객체 (BizChat API 규격 v0.29.0)
    // - mms.title: 메시지 제목 (필수, 최대 30자) - 빈 문자열 불가, 실제 값 필요
    // - mms.msg: 메시지 본문 (최대 1000자)
    // - mms.fileInfo: 이미지 파일 정보 (파일이 없으면 empty object {})
    // - mms.urlLink: 마케팅 URL 정보 (링크가 없으면 empty object {})
    mms: {
      title: (campaignData.messageType === "RCS" ? messageData.lmsTitle?.trim() || messageData.title?.trim() : messageData.title?.trim()) || (messageData.content || "").split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0",
      msg: messageData.content || "",
      fileInfo: {},
      // 파일이 포함되지 않으면 empty object
      urlLink: {}
      // 링크가 없으면 empty object (규격 준수)
    }
    // rcs 필드는 RCS 캠페인일 때만 포함 (LMS/MMS일 때 제외)
  };
  if (campaignData.sndMosuDesc) {
    payload.sndMosuDesc = campaignData.sndMosuDesc;
  }
  if (campaignData.sndMosuQuery) {
    payload.sndMosuQuery = campaignData.sndMosuQuery;
  }
  if (campaignData.messageType === "MMS" && messageData.imageUrl) {
    payload.mms = {
      ...payload.mms,
      fileInfo: {
        list: [{ origId: messageData.imageUrl }]
      }
    };
  }
  if (campaignData.messageType === "RCS" && campaignData.rcsType !== void 0) {
    payload.rcsType = campaignData.rcsType;
    const rcsMmsTitle = messageData.title?.trim() || (messageData.content || "").split("\n")[0].trim().substring(0, 30) || "\uAD11\uACE0";
    payload.rcs = [{
      slideNum: 1,
      title: rcsMmsTitle,
      msg: messageData.content || "",
      urlFile: "",
      urlLink: {},
      buttons: {},
      opts: {}
    }];
  }
  if (rcvType === 1 || rcvType === 2) {
    if (campaignData.sndGeofenceId) {
      payload.sndGeofenceId = campaignData.sndGeofenceId;
    }
    if (campaignData.collStartDate) {
      payload.collStartDate = Math.floor(new Date(campaignData.collStartDate).getTime() / 1e3);
    }
    if (campaignData.collEndDate) {
      payload.collEndDate = Math.floor(new Date(campaignData.collEndDate).getTime() / 1e3);
    }
    if (rcvType === 2 && campaignData.collSndDate) {
      payload.collSndDate = Math.floor(new Date(campaignData.collSndDate).getTime() / 1e3);
    }
    if (rcvType === 1) {
      if (campaignData.rtStartHhmm) {
        payload.rtStartHhmm = campaignData.rtStartHhmm;
      }
      if (campaignData.rtEndHhmm) {
        payload.rtEndHhmm = campaignData.rtEndHhmm;
      }
      payload.sndDayDiv = campaignData.sndDayDiv ?? 0;
    }
    delete payload.atsSndStartDate;
    delete payload.sndMosu;
    delete payload.sndMosuFlag;
    delete payload.sndMosuDesc;
    delete payload.sndMosuQuery;
  }
  return callBizChatAPI9("/api/v1/cmpn/create", "POST", payload, useProduction);
}
var selectedLocationSchema = z3.object({
  code: z3.string(),
  type: z3.enum(["home", "work"]),
  name: z3.string()
});
var selectedCategorySchema = z3.object({
  cat1: z3.string(),
  cat1Name: z3.string().optional(),
  cat2: z3.string().optional(),
  cat2Name: z3.string().optional(),
  cat3: z3.string().optional(),
  cat3Name: z3.string().optional()
});
var profilingRangeSchema = z3.object({
  gt: z3.coerce.number().optional(),
  lt: z3.coerce.number().optional()
});
var selectedProfilingSchema = z3.object({
  code: z3.string(),
  value: z3.union([z3.string(), z3.number(), z3.boolean(), profilingRangeSchema]),
  desc: z3.string()
});
var createCampaignSchema = z3.object({
  name: z3.string().min(1).max(200),
  templateId: z3.string().min(1),
  messageType: z3.enum(["LMS", "MMS", "RCS"]),
  sndNum: z3.string().min(1),
  gender: z3.enum(["all", "male", "female"]).default("all"),
  ageMin: z3.number().min(10).max(100).default(20),
  ageMax: z3.number().min(10).max(100).default(60),
  regions: z3.array(z3.string()).default([]),
  districts: z3.array(z3.string()).optional(),
  carrierTypes: z3.array(z3.string()).optional(),
  deviceTypes: z3.array(z3.string()).optional(),
  // 카테고리 타겟팅: 객체 배열 형식 (BizChat 규격)
  shopping11stCategories: z3.array(selectedCategorySchema).optional(),
  webappCategories: z3.array(selectedCategorySchema).optional(),
  callCategories: z3.array(selectedCategorySchema).optional(),
  locations: z3.array(selectedLocationSchema).optional(),
  // 위치 타겟팅
  profiling: z3.array(selectedProfilingSchema).optional(),
  // 프로파일링 타겟팅
  callUsageTypes: z3.array(z3.string()).optional(),
  locationTypes: z3.array(z3.string()).optional(),
  mobilityPatterns: z3.array(z3.string()).optional(),
  geofenceIds: z3.array(z3.string()).optional(),
  geofences: z3.array(z3.object({
    id: z3.number(),
    name: z3.string(),
    targets: z3.array(z3.object({
      gender: z3.number(),
      minAge: z3.number(),
      maxAge: z3.number(),
      stayMin: z3.number(),
      radius: z3.number(),
      address: z3.string(),
      lat: z3.string().optional(),
      lon: z3.string().optional()
    }))
  })).optional(),
  // Maptics 발송 방식 (rcvType=1: realtime, rcvType=2: batch)
  mapticsSendType: z3.enum(["realtime", "batch"]).optional(),
  // Maptics 실시간 발송 시간대 (rcvType=1, HHMM 형식)
  rtStartHhmm: z3.string().regex(/^(0[9]|1[0-9])([0-5][0])$/).optional(),
  // 0900~1950
  rtEndHhmm: z3.string().regex(/^(0[9]|1[0-9]|20)([0-1][0])$/).optional(),
  // 0910~2000
  // Maptics 일 균등 분할 (rcvType=1, 0: 미분할, 1: 분할)
  sndDayDiv: z3.number().min(0).max(1).optional(),
  targetCount: z3.number().min(100).default(1e3),
  budget: z3.number().min(1e4),
  scheduledAt: z3.string().datetime().optional().or(z3.literal("")).transform((val) => val === "" ? void 0 : val)
});
async function handler64(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  const auth = await verifyAuth30(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const db = getDb50();
  const userId = auth.userId;
  const useProduction = detectProductionEnvironment4(req);
  console.log(`[Campaign] Environment: ${useProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  if (req.method === "GET") {
    try {
      const result = await db.select().from(campaigns19).where(eq49(campaigns19.userId, userId)).orderBy(desc15(campaigns19.createdAt));
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      return res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  }
  if (req.method === "POST") {
    try {
      const userResult = await db.select().from(users24).where(eq49(users24.id, userId));
      const user = userResult[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      const data = createCampaignSchema.parse(req.body);
      const templateResult = await db.select().from(templates9).where(eq49(templates9.id, data.templateId));
      const template = templateResult[0];
      if (!template) return res.status(404).json({ error: "Template not found" });
      const SYSTEM_USER_ID = "system";
      if (template.userId !== userId && template.userId !== SYSTEM_USER_ID) {
        return res.status(403).json({ error: "Access denied to template" });
      }
      const MESSAGE_PRICES2 = { LMS: 100, MMS: 120, RCS: 130 };
      const costPerMessage = MESSAGE_PRICES2[template.messageType] || 100;
      const userBalance = parseFloat(user.balance || "0");
      const estimatedCost = data.targetCount * costPerMessage;
      if (userBalance < estimatedCost) return res.status(400).json({ error: "\uC794\uC561\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4" });
      const geofenceIds = data.geofenceIds || (data.geofences?.map((g) => String(g.id)) ?? []);
      const hasGeofence = geofenceIds.length > 0;
      let rcvType = 0;
      if (hasGeofence) {
        rcvType = data.mapticsSendType === "realtime" ? 1 : 2;
      }
      if (rcvType === 1) {
        if (!data.rtStartHhmm || !data.rtEndHhmm) {
          return res.status(400).json({
            error: "\uC2E4\uC2DC\uAC04 \uBCF4\uB0B4\uAE30\uB294 \uBC1C\uC1A1 \uC2DC\uC791/\uC885\uB8CC \uC2DC\uAC04\uC774 \uD544\uC694\uD569\uB2C8\uB2E4",
            code: "MAPTICS_REALTIME_TIME_REQUIRED"
          });
        }
        const startTime = parseInt(data.rtStartHhmm, 10);
        const endTime = parseInt(data.rtEndHhmm, 10);
        if (startTime >= endTime) {
          return res.status(400).json({
            error: "\uBC1C\uC1A1 \uC2DC\uC791 \uC2DC\uAC04\uC740 \uC885\uB8CC \uC2DC\uAC04\uBCF4\uB2E4 \uC774\uC804\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4",
            code: "MAPTICS_REALTIME_INVALID_TIME_RANGE"
          });
        }
      }
      console.log(`[Campaign] rcvType=${rcvType}, hasGeofence=${hasGeofence}, mapticsSendType=${data.mapticsSendType}`);
      let sndMosuQuerySQL = "";
      let sndMosuDescHTML = "";
      let atsMosuCount = void 0;
      let atsResult = null;
      if (!hasGeofence) {
        atsResult = buildAtsQuery({
          gender: data.gender,
          ageMin: data.ageMin,
          ageMax: data.ageMax,
          regions: data.regions,
          districts: data.districts,
          carrierTypes: data.carrierTypes,
          deviceTypes: data.deviceTypes,
          shopping11stCategories: data.shopping11stCategories,
          webappCategories: data.webappCategories,
          callCategories: data.callCategories,
          locations: data.locations,
          profiling: data.profiling,
          callUsageTypes: data.callUsageTypes,
          locationTypes: data.locationTypes,
          mobilityPatterns: data.mobilityPatterns,
          geofenceIds: []
        });
        sndMosuDescHTML = atsResult.htmlDescription;
        console.log("[Campaign] Calling ATS mosu API to get SQL query...");
        const atsMosuResult = await callATSMosuAPI3(atsResult.query, useProduction);
        if (atsMosuResult.success) {
          sndMosuQuerySQL = atsMosuResult.query;
          atsMosuCount = atsMosuResult.count;
          if (atsMosuResult.filterStr) {
            sndMosuDescHTML = atsMosuResult.filterStr;
          }
          console.log(`[Campaign] ATS mosu API success - SQL query obtained, count: ${atsMosuCount}`);
        } else {
          console.error("[Campaign] ATS mosu API failed:", atsMosuResult.error);
          return res.status(503).json({
            error: "ATS \uD0C0\uAC9F\uD305 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.",
            code: "ATS_MOSU_UNAVAILABLE",
            details: atsMosuResult.error
          });
        }
      } else {
        console.log("[Campaign] Using Maptics geofence targeting, skipping ATS mosu API");
      }
      const campaignId = randomUUID3();
      const roundUpTo10Min = (date) => {
        const result = new Date(date);
        result.setSeconds(0);
        result.setMilliseconds(0);
        const minutes = result.getMinutes();
        const remainder = minutes % 10;
        if (remainder > 0) {
          result.setMinutes(minutes + (10 - remainder));
        }
        return result;
      };
      const now = /* @__PURE__ */ new Date();
      now.setSeconds(0);
      now.setMilliseconds(0);
      const minCollStartTime = roundUpTo10Min(new Date(now.getTime() + 60 * 60 * 1e3));
      let preCalcCollStartDate = null;
      let preCalcCollEndDate = null;
      let preCalcCollSndDate = null;
      const clampToKSTWindow2 = (date) => {
        const kstOffset = 9 * 60 * 60 * 1e3;
        const kstTime = new Date(date.getTime() + kstOffset);
        const kstHours = kstTime.getUTCHours();
        const kstMinutes = kstTime.getUTCMinutes();
        if (kstHours >= 9 && kstHours < 19) {
          return new Date(date);
        }
        const kstYear = kstTime.getUTCFullYear();
        const kstMonth = kstTime.getUTCMonth();
        const kstDay = kstTime.getUTCDate();
        let resultKST;
        if (kstHours < 9) {
          resultKST = new Date(Date.UTC(kstYear, kstMonth, kstDay, 9, 0, 0, 0));
        } else {
          resultKST = new Date(Date.UTC(kstYear, kstMonth, kstDay + 1, 9, 0, 0, 0));
        }
        return new Date(resultKST.getTime() - kstOffset);
      };
      if (hasGeofence) {
        const minCollSndTime = new Date(minCollStartTime.getTime() + 2 * 60 * 60 * 1e3);
        const userRequestedTime = data.scheduledAt ? new Date(data.scheduledAt) : minCollSndTime;
        preCalcCollSndDate = userRequestedTime > minCollSndTime ? userRequestedTime : minCollSndTime;
        preCalcCollSndDate = roundUpTo10Min(preCalcCollSndDate);
        preCalcCollSndDate = clampToKSTWindow2(preCalcCollSndDate);
        preCalcCollSndDate = roundUpTo10Min(preCalcCollSndDate);
        preCalcCollStartDate = new Date(preCalcCollSndDate.getTime() - 2 * 60 * 60 * 1e3);
        if (preCalcCollStartDate < minCollStartTime) {
          preCalcCollStartDate = new Date(minCollStartTime);
        }
        preCalcCollStartDate = roundUpTo10Min(preCalcCollStartDate);
        const endFromStart = new Date(preCalcCollStartDate.getTime() + 30 * 60 * 1e3);
        const endFromSnd = new Date(preCalcCollSndDate.getTime() - 30 * 60 * 1e3);
        preCalcCollEndDate = endFromStart > endFromSnd ? endFromStart : endFromSnd;
        preCalcCollEndDate = roundUpTo10Min(preCalcCollEndDate);
        if (preCalcCollEndDate <= preCalcCollStartDate) {
          preCalcCollEndDate = roundUpTo10Min(new Date(preCalcCollStartDate.getTime() + 30 * 60 * 1e3));
        }
        if (preCalcCollEndDate >= preCalcCollSndDate) {
          preCalcCollSndDate = roundUpTo10Min(new Date(preCalcCollEndDate.getTime() + 30 * 60 * 1e3));
          preCalcCollSndDate = clampToKSTWindow2(preCalcCollSndDate);
          preCalcCollSndDate = roundUpTo10Min(preCalcCollSndDate);
        }
        console.log(`[Campaign] Pre-calc Maptics dates - collStartDate: ${preCalcCollStartDate.toISOString()}, collEndDate: ${preCalcCollEndDate.toISOString()}, collSndDate: ${preCalcCollSndDate.toISOString()}`);
      }
      const templateRcsType = template.rcsType ?? null;
      console.log(`[Campaign] Template rcsType: ${templateRcsType} (messageType: ${data.messageType})`);
      const campaignResult = await db.insert(campaigns19).values({
        id: campaignId,
        userId,
        name: data.name,
        tgtCompanyName: "\uC704\uD53D",
        templateId: data.templateId,
        messageType: data.messageType,
        rcsType: templateRcsType,
        // 템플릿에서 RCS 타입 복사 (0=스탠다드, 1=LMS, 2=슬라이드, 3=이미지강조A, 4=이미지강조B, 5=상품소개세로)
        sndNum: data.sndNum,
        statusCode: 0,
        // temp_registered (BizChat 등록 시도)
        status: "temp_registered",
        rcvType,
        billingType: data.messageType === "MMS" ? 2 : data.messageType === "RCS" ? 3 : 0,
        sndGoalCnt: data.targetCount,
        // Maptics는 sndMosu 사용 안함
        sndMosu: hasGeofence ? null : atsMosuCount ?? Math.min(Math.ceil(data.targetCount * 1.5), 4e5),
        sndMosuQuery: hasGeofence ? null : sndMosuQuerySQL,
        sndMosuDesc: hasGeofence ? null : sndMosuDescHTML,
        settleCnt: data.targetCount,
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        costPerMessage: "50",
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        // Maptics 지오펜스 필드 저장 (rcvType=1,2) - 초기 INSERT 시점에 저장
        ...hasGeofence ? {
          sndGeofenceId: Number(geofenceIds[0]),
          collStartDate: preCalcCollStartDate,
          collEndDate: preCalcCollEndDate,
          collSndDate: rcvType === 2 ? preCalcCollSndDate : null
        } : {},
        // Maptics 실시간 보내기 필드 (rcvType=1)
        ...rcvType === 1 ? {
          rtStartHhmm: data.rtStartHhmm,
          rtEndHhmm: data.rtEndHhmm,
          sndDayDiv: data.sndDayDiv ?? 0
        } : {}
      }).returning();
      await db.insert(messages6).values({
        id: randomUUID3(),
        campaignId,
        title: template.title,
        lmsTitle: template.lmsTitle || null,
        content: template.content,
        imageUrl: template.imageUrl,
        imageFileId: template.imageFileId || null,
        urlLinks: template.urlLinks || null,
        buttons: template.buttons || null,
        lmsContent: template.lmsContent || null,
        lmsImageUrl: template.lmsImageUrl || null,
        lmsImageFileId: template.lmsImageFileId || null,
        lmsUrlLinks: template.lmsUrlLinks || null
      });
      await db.insert(targeting4).values({
        id: randomUUID3(),
        campaignId,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
        districts: data.districts || [],
        carrierTypes: data.carrierTypes || [],
        deviceTypes: data.deviceTypes || [],
        shopping11stCategories: [],
        webappCategories: [],
        callUsageTypes: data.callUsageTypes || [],
        locationTypes: data.locationTypes || [],
        mobilityPatterns: data.mobilityPatterns || [],
        geofenceIds,
        atsQuery: hasGeofence ? JSON.stringify({ geofenceIds, rcvType: 2 }) : JSON.stringify({
          jsonQuery: atsResult?.query,
          sqlQuery: sndMosuQuerySQL,
          estimatedCount: atsMosuCount
        })
      });
      const calculateValidSendDateForCampaign = (requestedDate) => {
        const now2 = /* @__PURE__ */ new Date();
        const minStartTime = new Date(now2.getTime() + 60 * 60 * 1e3);
        let targetDate = requestedDate ? new Date(requestedDate) : minStartTime;
        if (targetDate < minStartTime) {
          targetDate = minStartTime;
        }
        targetDate.setSeconds(0);
        targetDate.setMilliseconds(0);
        const minutes = targetDate.getMinutes();
        const remainder = minutes % 10;
        if (remainder > 0) {
          targetDate.setMinutes(minutes + (10 - remainder));
        }
        return targetDate;
      };
      const scheduledDate = data.scheduledAt ? new Date(data.scheduledAt) : null;
      let atsSndStartDate = calculateValidSendDateForCampaign(scheduledDate);
      try {
        const lengthValidation = validateStringLengths2({
          name: data.name,
          tgtCompanyName: "\uC704\uD53D",
          title: template.title || void 0,
          msg: template.content
        });
        if (!lengthValidation.valid) {
          return res.status(400).json({ error: lengthValidation.error });
        }
        const bizchatResult = await createCampaignInBizChat2(
          {
            name: data.name,
            tgtCompanyName: "\uC704\uD53D",
            messageType: data.messageType,
            sndNum: data.sndNum,
            targetCount: data.targetCount,
            rcvType,
            // ATS 일반 (rcvType=0)용
            atsSndStartDate,
            sndMosuQuery: sndMosuQuerySQL,
            sndMosuDesc: sndMosuDescHTML,
            // Maptics 지오펜스 (rcvType=1,2)용
            sndGeofenceId: hasGeofence ? Number(geofenceIds[0]) : void 0,
            collStartDate: hasGeofence ? preCalcCollStartDate : void 0,
            collEndDate: hasGeofence ? preCalcCollEndDate : void 0,
            collSndDate: rcvType === 2 ? preCalcCollSndDate : void 0,
            // Maptics 실시간 보내기 (rcvType=1)용
            rtStartHhmm: rcvType === 1 ? data.rtStartHhmm : void 0,
            rtEndHhmm: rcvType === 1 ? data.rtEndHhmm : void 0,
            sndDayDiv: rcvType === 1 ? data.sndDayDiv ?? 0 : void 0
          },
          {
            title: template.title || void 0,
            lmsTitle: template.lmsTitle || void 0,
            content: template.content,
            imageUrl: template.imageUrl
          },
          useProduction
        );
        if (bizchatResult.data.code === "S000001") {
          const responseData = bizchatResult.data.data;
          const bizchatCampaignId = responseData?.id;
          if (bizchatCampaignId) {
            await db.update(campaigns19).set({
              bizchatCampaignId,
              statusCode: 0,
              // 임시등록
              status: "temp_registered",
              // ATS 발송 시작일 저장 (rcvType=0)
              ...!hasGeofence ? {
                atsSndStartDate
              } : {},
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq49(campaigns19.id, campaignId));
            console.log(`[Campaign] Created in BizChat: ${bizchatCampaignId}`);
            return res.status(201).json({
              ...campaignResult[0],
              bizchatCampaignId,
              statusCode: 0,
              status: "temp_registered",
              bizchatRegistered: true
            });
          }
        }
        console.error("[Campaign] BizChat registration failed:", bizchatResult.data);
        return res.status(201).json({
          ...campaignResult[0],
          statusCode: 0,
          status: "temp_registered",
          bizchatRegistered: false,
          bizchatError: {
            code: bizchatResult.data.code,
            message: bizchatResult.data.msg || "BizChat \uB4F1\uB85D \uC2E4\uD328"
          },
          warning: "BizChat \uB4F1\uB85D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uCEA0\uD398\uC778 \uC0C1\uC138\uC5D0\uC11C \uB2E4\uC2DC \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."
        });
      } catch (bizchatError) {
        console.error("[Campaign] BizChat API error:", bizchatError);
        return res.status(201).json({
          ...campaignResult[0],
          statusCode: 0,
          status: "temp_registered",
          bizchatRegistered: false,
          bizchatError: {
            code: "API_ERROR",
            message: bizchatError instanceof Error ? bizchatError.message : "BizChat API \uC624\uB958"
          },
          warning: "BizChat \uC11C\uBC84 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uCEA0\uD398\uC778 \uC0C1\uC138\uC5D0\uC11C \uB2E4\uC2DC \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."
        });
      }
    } catch (error) {
      if (error instanceof z3.ZodError) return res.status(400).json({ error: error.errors });
      console.error("Error creating campaign:", error);
      return res.status(500).json({ error: "Failed to create campaign" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/profile/index.ts
var profile_exports = {};
__export(profile_exports, {
  default: () => handler65
});
import { createClient as createClient34 } from "@supabase/supabase-js";
import { neon as neon51 } from "@neondatabase/serverless";
import { drizzle as drizzle51 } from "drizzle-orm/neon-http";
import { eq as eq50 } from "drizzle-orm";
import { pgTable as pgTable50, text as text39, timestamp as timestamp47, boolean as boolean27 } from "drizzle-orm/pg-core";
import crypto27 from "crypto";
var users25 = pgTable50("users", {
  id: text39("id").primaryKey(),
  email: text39("email"),
  firstName: text39("first_name"),
  lastName: text39("last_name"),
  profileImageUrl: text39("profile_image_url"),
  companyName: text39("company_name"),
  businessNumber: text39("business_number"),
  representativeName: text39("representative_name"),
  phone: text39("phone"),
  balance: text39("balance").default("0").notNull(),
  stripeCustomerId: text39("stripe_customer_id"),
  isVerified: boolean27("is_verified").default(false),
  isMaster: boolean27("is_master").default(false),
  isAgency: boolean27("is_agency").default(false),
  createdAt: timestamp47("created_at").defaultNow(),
  updatedAt: timestamp47("updated_at").defaultNow()
});
function getDb51() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql31 = neon51(dbUrl);
  return drizzle51(sql31);
}
function getSupabaseAdmin33() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }
  return createClient34(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
function verifyImpersonateToken24(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = crypto27.createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth31(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken24(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "", isImpersonating: true };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const supabase = getSupabaseAdmin33();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email || ""
    };
  } catch (error) {
    return null;
  }
}
async function handler65(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Impersonate-Token, X-Impersonate-User-Id");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  try {
    const auth = await verifyAuth31(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const db = getDb51();
    if (req.method === "GET") {
      const result = await db.select().from(users25).where(eq50(users25.id, auth.userId));
      const user = result[0];
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(200).json(user);
    }
    if (req.method === "PUT") {
      const { firstName, lastName, phone, companyName, businessNumber, representativeName } = req.body;
      const updateData = {
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (firstName !== void 0) updateData.firstName = firstName;
      if (lastName !== void 0) updateData.lastName = lastName;
      if (phone !== void 0) updateData.phone = phone;
      if (companyName !== void 0) updateData.companyName = companyName;
      if (businessNumber !== void 0) updateData.businessNumber = businessNumber;
      if (representativeName !== void 0) updateData.representativeName = representativeName;
      const result = await db.update(users25).set(updateData).where(eq50(users25.id, auth.userId)).returning();
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(200).json({ success: true, user: result[0] });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Profile API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// src/handlers/recommended-templates/index.ts
var recommended_templates_exports = {};
__export(recommended_templates_exports, {
  default: () => handler66
});
import { neon as neon52 } from "@neondatabase/serverless";
import { drizzle as drizzle52 } from "drizzle-orm/neon-http";
import { eq as eq51, and as and12, asc, desc as desc16 } from "drizzle-orm";
import { sql as sql28 } from "drizzle-orm";
import { pgTable as pgTable51, text as text40, varchar as varchar30, timestamp as timestamp48, integer as integer26, boolean as boolean28, jsonb as jsonb18 } from "drizzle-orm/pg-core";
var recommendedTemplates3 = pgTable51("recommended_templates", {
  id: varchar30("id").primaryKey().default(sql28`gen_random_uuid()`),
  name: varchar30("name", { length: 200 }).notNull(),
  category: varchar30("category", { length: 50 }).notNull(),
  purpose: varchar30("purpose", { length: 50 }).notNull(),
  version: varchar30("version", { length: 20 }),
  titleTemplate: varchar30("title_template", { length: 60 }),
  lmsTitleTemplate: varchar30("lms_title_template", { length: 60 }),
  contentTemplate: text40("content_template").notNull(),
  lmsContentTemplate: text40("lms_content_template"),
  // RCS 메시지의 안드로이드용 LMS 대체 텍스트 템플릿
  variableSchema: jsonb18("variable_schema").$type(),
  defaultImageUrl: text40("default_image_url"),
  messageType: varchar30("message_type", { length: 10 }).default("RCS"),
  rcsType: integer26("rcs_type").default(4),
  urlLinks: jsonb18("url_links").$type(),
  buttons: jsonb18("buttons").$type(),
  isActive: boolean28("is_active").default(true),
  sortOrder: integer26("sort_order").default(0),
  targetingConfig: jsonb18("targeting_config"),
  sourceTemplateId: varchar30("source_template_id"),
  createdAt: timestamp48("created_at").defaultNow(),
  updatedAt: timestamp48("updated_at").defaultNow()
});
var RECOMMENDED_CATEGORIES2 = [
  { value: "commerce", label: "\uCEE4\uBA38\uC2A4/\uC1FC\uD551" },
  { value: "cafe_food", label: "\uCE74\uD398/\uC678\uC2DD/\uD504\uB79C\uCC28\uC774\uC988" },
  { value: "travel_culture", label: "\uC5EC\uD589/\uBB38\uD654" },
  { value: "sports_health", label: "\uC2A4\uD3EC\uCE20/\uAC74\uAC15" },
  { value: "education_life", label: "\uAD50\uC721/\uB77C\uC774\uD504" },
  { value: "medical", label: "\uBCD1\uC758\uC6D0" }
];
var RECOMMENDED_PURPOSES2 = [
  { value: "signup", label: "\uD68C\uC6D0\uAC00\uC785 \uC720\uB3C4" },
  { value: "review_event", label: "\uB9AC\uBDF0 \uC774\uBCA4\uD2B8" },
  { value: "holiday_discount", label: "\uBA85\uC808 \uD2B9\uBCC4 \uD560\uC778" },
  { value: "product_discount", label: "\uC0C1\uD488 \uD560\uC778 \uC548\uB0B4" },
  { value: "new_product", label: "\uC2E0\uADDC \uC0C1\uD488 \uC548\uB0B4" },
  { value: "new_product_discount", label: "\uC2E0\uC81C\uD488 \uD560\uC778 \uC548\uB0B4" },
  { value: "app_download", label: "\uC571 \uB2E4\uC6B4\uB85C\uB4DC \uC774\uBCA4\uD2B8" },
  { value: "offline_product_discount", label: "\uC624\uD504\uB77C\uC778 \uD589\uC0AC \uC0C1\uD488 \uD560\uC778 \uC548\uB0B4" },
  { value: "offline_event", label: "\uC624\uD504\uB77C\uC778 \uD589\uC0AC \uC548\uB0B4" },
  { value: "event", label: "\uC774\uBCA4\uD2B8 \uC548\uB0B4" },
  { value: "timedeal", label: "\uD0C0\uC784\uB51C \uC774\uBCA4\uD2B8" },
  { value: "special_product", label: "\uD2B9\uAC00\uC0C1\uD488 \uC548\uB0B4" },
  { value: "consultation", label: "\uC0C1\uB2F4\uC2E0\uCCAD\uC720\uB3C4" }
];
function getDb52() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = neon52(databaseUrl);
  return drizzle52(client);
}
async function handler66(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  const db = getDb52();
  try {
    if (req.method === "GET") {
      const { category, purpose, active } = req.query;
      let query = db.select().from(recommendedTemplates3);
      const conditions = [];
      if (category && category !== "all") {
        conditions.push(eq51(recommendedTemplates3.category, String(category)));
      }
      if (purpose && purpose !== "all") {
        conditions.push(eq51(recommendedTemplates3.purpose, String(purpose)));
      }
      if (active !== "false") {
        conditions.push(eq51(recommendedTemplates3.isActive, true));
      }
      const results = conditions.length > 0 ? await db.select().from(recommendedTemplates3).where(and12(...conditions)).orderBy(asc(recommendedTemplates3.sortOrder), desc16(recommendedTemplates3.createdAt)) : await db.select().from(recommendedTemplates3).orderBy(asc(recommendedTemplates3.sortOrder), desc16(recommendedTemplates3.createdAt));
      return res.status(200).json({
        success: true,
        templates: results,
        categories: RECOMMENDED_CATEGORIES2,
        purposes: RECOMMENDED_PURPOSES2
      });
    }
    if (req.method === "POST") {
      const {
        name,
        category,
        purpose,
        version,
        titleTemplate,
        lmsTitleTemplate,
        contentTemplate,
        lmsContentTemplate,
        variableSchema,
        defaultImageUrl,
        messageType,
        rcsType,
        urlLinks,
        buttons,
        isActive,
        sortOrder,
        sourceTemplateId,
        targetingConfig
      } = req.body;
      if (!name || !category || !purpose || !contentTemplate) {
        return res.status(400).json({
          success: false,
          error: "\uD544\uC218 \uD544\uB4DC\uAC00 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4 (name, category, purpose, contentTemplate)"
        });
      }
      const [newTemplate] = await db.insert(recommendedTemplates3).values({
        name,
        category,
        purpose,
        version,
        titleTemplate,
        lmsTitleTemplate,
        contentTemplate,
        lmsContentTemplate,
        variableSchema,
        defaultImageUrl,
        messageType: messageType || "RCS",
        rcsType: rcsType ?? 4,
        urlLinks,
        buttons,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
        sourceTemplateId,
        targetingConfig
      }).returning();
      return res.status(201).json({
        success: true,
        template: newTemplate
      });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("[Recommended Templates API] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

// src/handlers/refunds/index.ts
var refunds_exports2 = {};
__export(refunds_exports2, {
  default: () => handler67
});
import { neon as neon53 } from "@neondatabase/serverless";
import { drizzle as drizzle53 } from "drizzle-orm/neon-http";
import { sql as sql29, desc as desc17, eq as eq52, and as and13 } from "drizzle-orm";
import { pgTable as pgTable52, varchar as varchar31, timestamp as timestamp49, decimal as decimal17, text as text41 } from "drizzle-orm/pg-core";
import { createClient as createClient35 } from "@supabase/supabase-js";
var users26 = pgTable52("users", {
  id: varchar31("id").primaryKey().default(sql29`gen_random_uuid()`),
  email: varchar31("email").unique(),
  balance: decimal17("balance", { precision: 12, scale: 0 }).default("0")
});
var refunds4 = pgTable52("refunds", {
  id: varchar31("id").primaryKey().default(sql29`gen_random_uuid()`),
  userId: varchar31("user_id").notNull(),
  transactionId: varchar31("transaction_id"),
  amount: decimal17("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text41("reason").notNull(),
  status: varchar31("status", { length: 20 }).default("pending").notNull(),
  adminId: varchar31("admin_id"),
  adminNote: text41("admin_note"),
  bankName: varchar31("bank_name", { length: 50 }),
  accountNumber: varchar31("account_number", { length: 50 }),
  accountHolder: varchar31("account_holder", { length: 50 }),
  processedAt: timestamp49("processed_at"),
  createdAt: timestamp49("created_at").defaultNow(),
  updatedAt: timestamp49("updated_at").defaultNow()
});
function getDb53() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle53(neon53(databaseUrl));
}
async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient35(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}
async function handler67(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4" });
  }
  const db = getDb53();
  if (req.method === "GET") {
    try {
      const userRefunds = await db.select().from(refunds4).where(eq52(refunds4.userId, user.id)).orderBy(desc17(refunds4.createdAt));
      return res.status(200).json(userRefunds);
    } catch (error) {
      console.error("[Refunds GET] Error:", error);
      return res.status(500).json({ error: "\uD658\uBD88 \uB0B4\uC5ED \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
    }
  }
  if (req.method === "POST") {
    try {
      const { amount, reason, bankName, accountNumber, accountHolder } = req.body || {};
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 1e4) {
        return res.status(400).json({ error: "\uD658\uBD88 \uAE08\uC561\uC740 \uCD5C\uC18C 10,000\uC6D0 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" });
      }
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({ error: "\uD658\uBD88 \uC0AC\uC720\uB97C 5\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694" });
      }
      if (!bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ error: "\uACC4\uC88C \uC815\uBCF4\uB97C \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694" });
      }
      const [dbUser] = await db.select().from(users26).where(eq52(users26.id, user.id)).limit(1);
      if (!dbUser) {
        return res.status(404).json({ error: "\uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" });
      }
      const currentBalance = Number(dbUser.balance || 0);
      if (numAmount > currentBalance) {
        return res.status(400).json({ error: "\uD658\uBD88 \uAE08\uC561\uC774 \uD604\uC7AC \uC794\uC561\uBCF4\uB2E4 \uB9CE\uC2B5\uB2C8\uB2E4" });
      }
      const [pendingRefund] = await db.select().from(refunds4).where(and13(eq52(refunds4.userId, user.id), eq52(refunds4.status, "pending"))).limit(1);
      if (pendingRefund) {
        return res.status(400).json({ error: "\uC774\uBBF8 \uCC98\uB9AC \uC911\uC778 \uD658\uBD88 \uC2E0\uCCAD\uC774 \uC788\uC2B5\uB2C8\uB2E4" });
      }
      const [newRefund] = await db.insert(refunds4).values({
        userId: user.id,
        amount: String(numAmount),
        reason: reason.trim(),
        bankName,
        accountNumber,
        accountHolder,
        status: "pending"
      }).returning();
      return res.status(201).json({
        success: true,
        refund: newRefund,
        message: "\uD658\uBD88 \uC2E0\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC601\uC5C5\uC77C \uAE30\uC900 3-5\uC77C \uB0B4 \uCC98\uB9AC\uB429\uB2C8\uB2E4."
      });
    } catch (error) {
      console.error("[Refunds POST] Error:", error);
      return res.status(500).json({ error: "\uD658\uBD88 \uC2E0\uCCAD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/tax-invoices/index.ts
var tax_invoices_exports2 = {};
__export(tax_invoices_exports2, {
  default: () => handler68
});
import { neon as neon54 } from "@neondatabase/serverless";
import { drizzle as drizzle54 } from "drizzle-orm/neon-http";
import { sql as sql30, desc as desc18, eq as eq53 } from "drizzle-orm";
import { pgTable as pgTable53, varchar as varchar32, timestamp as timestamp50, decimal as decimal18, text as text42 } from "drizzle-orm/pg-core";
import { createClient as createClient36 } from "@supabase/supabase-js";
var users27 = pgTable53("users", {
  id: varchar32("id").primaryKey().default(sql30`gen_random_uuid()`),
  email: varchar32("email").unique(),
  companyName: varchar32("company_name"),
  businessNumber: varchar32("business_number")
});
var taxInvoices3 = pgTable53("tax_invoices", {
  id: varchar32("id").primaryKey().default(sql30`gen_random_uuid()`),
  userId: varchar32("user_id").notNull(),
  transactionId: varchar32("transaction_id"),
  invoiceNumber: varchar32("invoice_number", { length: 50 }).unique(),
  issueDate: timestamp50("issue_date").notNull(),
  amount: decimal18("amount", { precision: 12, scale: 0 }).notNull(),
  taxAmount: decimal18("tax_amount", { precision: 12, scale: 0 }).notNull(),
  totalAmount: decimal18("total_amount", { precision: 12, scale: 0 }).notNull(),
  buyerBusinessNumber: varchar32("buyer_business_number", { length: 20 }),
  buyerCompanyName: varchar32("buyer_company_name", { length: 100 }),
  buyerRepresentative: varchar32("buyer_representative", { length: 50 }),
  buyerEmail: varchar32("buyer_email", { length: 100 }),
  buyerAddress: text42("buyer_address"),
  status: varchar32("status", { length: 20 }).default("requested").notNull(),
  pdfUrl: text42("pdf_url"),
  createdAt: timestamp50("created_at").defaultNow(),
  updatedAt: timestamp50("updated_at").defaultNow()
});
function getDb54() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not configured");
  return drizzle54(neon54(databaseUrl));
}
async function getAuthenticatedUser2(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient36(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}
async function handler68(req, res) {
  const user = await getAuthenticatedUser2(req);
  if (!user) {
    return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4" });
  }
  const db = getDb54();
  if (req.method === "GET") {
    try {
      const userInvoices = await db.select().from(taxInvoices3).where(eq53(taxInvoices3.userId, user.id)).orderBy(desc18(taxInvoices3.createdAt));
      return res.status(200).json(userInvoices);
    } catch (error) {
      console.error("[TaxInvoices GET] Error:", error);
      return res.status(500).json({ error: "\uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
    }
  }
  if (req.method === "POST") {
    try {
      const {
        amount,
        buyerBusinessNumber,
        buyerCompanyName,
        buyerRepresentative,
        buyerEmail,
        buyerAddress
      } = req.body || {};
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 1e3) {
        return res.status(400).json({ error: "\uBC1C\uD589 \uAE08\uC561\uC740 \uCD5C\uC18C 1,000\uC6D0 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" });
      }
      if (!buyerBusinessNumber || buyerBusinessNumber.replace(/-/g, "").length !== 10) {
        return res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694 (10\uC790\uB9AC)" });
      }
      if (!buyerCompanyName || buyerCompanyName.trim().length < 2) {
        return res.status(400).json({ error: "\uC0C1\uD638\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694" });
      }
      if (!buyerEmail || !buyerEmail.includes("@")) {
        return res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC774\uBA54\uC77C \uC8FC\uC18C\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694" });
      }
      const taxAmount = Math.floor(numAmount * 0.1);
      const totalAmount = numAmount + taxAmount;
      const [newInvoice] = await db.insert(taxInvoices3).values({
        userId: user.id,
        issueDate: /* @__PURE__ */ new Date(),
        amount: String(numAmount),
        taxAmount: String(taxAmount),
        totalAmount: String(totalAmount),
        buyerBusinessNumber: buyerBusinessNumber.replace(/-/g, ""),
        buyerCompanyName: buyerCompanyName.trim(),
        buyerRepresentative: buyerRepresentative?.trim() || null,
        buyerEmail: buyerEmail.trim(),
        buyerAddress: buyerAddress?.trim() || null,
        status: "requested"
      }).returning();
      return res.status(201).json({
        success: true,
        taxInvoice: newInvoice,
        message: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC2E0\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC601\uC5C5\uC77C \uAE30\uC900 1-2\uC77C \uB0B4 \uBC1C\uD589\uB429\uB2C8\uB2E4."
      });
    } catch (error) {
      console.error("[TaxInvoices POST] Error:", error);
      return res.status(500).json({ error: "\uC138\uAE08\uACC4\uC0B0\uC11C \uC2E0\uCCAD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/templates/index.ts
var templates_exports = {};
__export(templates_exports, {
  default: () => handler69
});
import { createClient as createClient37 } from "@supabase/supabase-js";
import { neon as neon55 } from "@neondatabase/serverless";
import { drizzle as drizzle55 } from "drizzle-orm/neon-http";
import { eq as eq54, desc as desc19, and as and14, or as or7 } from "drizzle-orm";
import { pgTable as pgTable54, text as text43, integer as integer27, timestamp as timestamp51, jsonb as jsonb19 } from "drizzle-orm/pg-core";
import { z as z4 } from "zod";
import { randomUUID as randomUUID4, createHmac as createHmac21 } from "crypto";
var BIZCHAT_DEV_URL17 = process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443";
var BIZCHAT_PROD_URL17 = process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr";
function getBizChatConfig() {
  const useProduction = process.env.BIZCHAT_USE_PROD === "true";
  const baseUrl = useProduction ? BIZCHAT_PROD_URL17 : BIZCHAT_DEV_URL17;
  const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;
  return { baseUrl, apiKey, useProduction };
}
function bizChatStatusToLocal(bizChatStatus) {
  switch (bizChatStatus) {
    case 0:
      return "draft";
    case 10:
      return "pending";
    case 11:
      return "approved";
    case 17:
      return "rejected";
    default:
      return "draft";
  }
}
var templates10 = pgTable54("templates", {
  id: text43("id").primaryKey(),
  userId: text43("user_id").notNull(),
  name: text43("name").notNull(),
  messageType: text43("message_type").notNull(),
  rcsType: integer27("rcs_type"),
  title: text43("title"),
  lmsTitle: text43("lms_title"),
  content: text43("content").notNull(),
  imageUrl: text43("image_url"),
  imageFileId: text43("image_file_id"),
  urlLinks: jsonb19("url_links"),
  buttons: jsonb19("buttons"),
  lmsContent: text43("lms_content"),
  lmsImageUrl: text43("lms_image_url"),
  lmsImageFileId: text43("lms_image_file_id"),
  lmsUrlLinks: jsonb19("lms_url_links"),
  status: text43("status").default("draft"),
  submittedAt: timestamp51("submitted_at"),
  reviewedAt: timestamp51("reviewed_at"),
  rejectionReason: text43("rejection_reason"),
  createdAt: timestamp51("created_at").defaultNow(),
  updatedAt: timestamp51("updated_at").defaultNow()
});
var campaigns20 = pgTable54("campaigns", {
  id: text43("id").primaryKey(),
  userId: text43("user_id").notNull(),
  templateId: text43("template_id"),
  completedAt: timestamp51("completed_at")
});
var reports4 = pgTable54("reports", {
  id: text43("id").primaryKey(),
  campaignId: text43("campaign_id").notNull(),
  sentCount: integer27("sent_count").default(0),
  deliveredCount: integer27("delivered_count").default(0),
  successCount: integer27("success_count").default(0),
  failedCount: integer27("failed_count").default(0),
  clickCount: integer27("click_count").default(0)
});
function getDb55() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle55(neon55(dbUrl));
}
function getSupabaseAdmin34() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient37(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken25(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac21("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth32(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken25(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin34().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function syncBizChatTemplateStatuses(db, templateIds) {
  const statusMap = /* @__PURE__ */ new Map();
  try {
    const { baseUrl, apiKey } = getBizChatConfig();
    if (!apiKey) {
      console.log("[Templates] No BizChat API key configured, skipping sync");
      return statusMap;
    }
    const tid = Date.now().toString();
    const response = await fetch(`${baseUrl}/api/v1/cmpn/tpl/list?tid=${tid}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify({ pageNumber: 1, pageSize: 100 })
    });
    if (!response.ok) {
      console.log(`[Templates] BizChat API error: ${response.status}`);
      return statusMap;
    }
    const result = await response.json();
    if (result.code !== "S000001" || !result.data?.list) {
      console.log(`[Templates] BizChat API failed: ${result.msg}`);
      return statusMap;
    }
    const bizChatTemplates = result.data.list;
    console.log(`[Templates] Fetched ${bizChatTemplates.length} templates from BizChat for sync`);
    for (const bct of bizChatTemplates) {
      const localStatus = bizChatStatusToLocal(bct.status);
      statusMap.set(bct.id.toString(), localStatus);
      await db.update(templates10).set({
        status: localStatus,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq54(templates10.id, bct.id.toString()));
    }
    console.log(`[Templates] Synced ${statusMap.size} template statuses from BizChat`);
  } catch (error) {
    console.error("[Templates] Error syncing BizChat statuses:", error);
  }
  return statusMap;
}
var createTemplateSchema = z4.object({
  name: z4.string().min(1).max(200),
  messageType: z4.enum(["LMS", "MMS", "RCS"]),
  rcsType: z4.number().optional(),
  title: z4.string().max(60).optional(),
  lmsTitle: z4.string().max(60).optional(),
  content: z4.string().min(1).max(2e3),
  imageUrl: z4.string().optional(),
  imageFileId: z4.string().optional(),
  urlLinks: z4.object({
    list: z4.array(z4.string()),
    reward: z4.number().optional()
  }).optional(),
  buttons: z4.object({
    list: z4.array(z4.object({
      type: z4.string(),
      name: z4.string(),
      val1: z4.string(),
      val2: z4.string().optional()
    }))
  }).optional(),
  lmsContent: z4.string().max(2e3).optional(),
  lmsImageUrl: z4.string().optional(),
  lmsImageFileId: z4.string().optional(),
  lmsUrlLinks: z4.object({
    list: z4.array(z4.string()),
    reward: z4.number().optional()
  }).optional()
});
async function handler69(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  const auth = await verifyAuth32(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const db = getDb55();
  const userId = auth.userId;
  if (req.method === "GET") {
    try {
      const syncPromise = syncBizChatTemplateStatuses(db, []).catch((err) => {
        console.error("[Templates] Background sync error:", err);
      });
      const SYSTEM_USER_ID = "system";
      const templateList = await db.select().from(templates10).where(or7(eq54(templates10.userId, userId), eq54(templates10.userId, SYSTEM_USER_ID))).orderBy(desc19(templates10.createdAt));
      await Promise.race([syncPromise, new Promise((resolve) => setTimeout(resolve, 3e3))]);
      const updatedTemplateList = await db.select().from(templates10).where(or7(eq54(templates10.userId, userId), eq54(templates10.userId, SYSTEM_USER_ID))).orderBy(desc19(templates10.createdAt));
      const templatesWithStats = await Promise.all(
        updatedTemplateList.map(async (template) => {
          const templateCampaigns = await db.select().from(campaigns20).where(and14(eq54(campaigns20.templateId, template.id), eq54(campaigns20.userId, userId)));
          let totalSent = 0, totalDelivered = 0;
          let lastSentAt = null;
          for (const c of templateCampaigns) {
            const reportResult = await db.select().from(reports4).where(eq54(reports4.campaignId, c.id));
            const report = reportResult[0];
            if (report) {
              totalSent += report.sentCount || 0;
              totalDelivered += report.deliveredCount || 0;
            }
            if (c.completedAt && (!lastSentAt || c.completedAt > lastSentAt)) {
              lastSentAt = c.completedAt;
            }
          }
          return {
            ...template,
            isSystem: template.userId === SYSTEM_USER_ID,
            sendHistory: {
              campaignCount: templateCampaigns.length,
              totalSent,
              totalDelivered,
              lastSentAt
            }
          };
        })
      );
      return res.status(200).json(templatesWithStats);
    } catch (error) {
      console.error("Error fetching templates:", error);
      return res.status(500).json({ error: "Failed to fetch templates" });
    }
  }
  if (req.method === "POST") {
    try {
      const data = createTemplateSchema.parse(req.body);
      const result = await db.insert(templates10).values({
        id: randomUUID4(),
        userId,
        name: data.name,
        messageType: data.messageType,
        rcsType: data.messageType === "RCS" ? data.rcsType ?? 0 : null,
        title: data.title,
        lmsTitle: data.messageType === "RCS" ? data.lmsTitle || null : null,
        content: data.content,
        imageUrl: data.imageUrl,
        imageFileId: data.imageFileId,
        urlLinks: data.urlLinks,
        buttons: data.buttons,
        lmsContent: data.messageType === "RCS" ? data.lmsContent || null : null,
        lmsImageUrl: data.messageType === "RCS" ? data.lmsImageUrl || null : null,
        lmsImageFileId: data.messageType === "RCS" ? data.lmsImageFileId || null : null,
        lmsUrlLinks: data.messageType === "RCS" ? data.lmsUrlLinks || null : null,
        status: "draft"
      }).returning();
      return res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof z4.ZodError) return res.status(400).json({ error: "Invalid template data", details: error.errors });
      console.error("Error creating template:", error);
      return res.status(500).json({ error: "Failed to create template" });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// src/handlers/transactions/index.ts
var transactions_exports2 = {};
__export(transactions_exports2, {
  default: () => handler70
});
import { createClient as createClient38 } from "@supabase/supabase-js";
import { neon as neon56, neonConfig as neonConfig20 } from "@neondatabase/serverless";
import { createHmac as createHmac22 } from "crypto";
import { drizzle as drizzle56 } from "drizzle-orm/neon-http";
import { eq as eq55, desc as desc20 } from "drizzle-orm";
import { pgTable as pgTable55, text as text44, timestamp as timestamp52 } from "drizzle-orm/pg-core";
neonConfig20.fetchConnectionCache = true;
var transactions13 = pgTable55("transactions", {
  id: text44("id").primaryKey(),
  userId: text44("user_id").notNull(),
  type: text44("type").notNull(),
  amount: text44("amount").notNull(),
  balanceAfter: text44("balance_after"),
  description: text44("description"),
  paymentMethod: text44("payment_method"),
  stripeSessionId: text44("stripe_session_id"),
  createdAt: timestamp52("created_at").defaultNow()
});
function getDb56() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return drizzle56(neon56(dbUrl));
}
function getSupabaseAdmin35() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient38(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyImpersonateToken26(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const { data, signature } = decoded;
    const expectedSignature = createHmac22("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret").update(data).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== "impersonate") return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}
async function verifyAuth33(req) {
  const impersonateToken = req.headers["x-impersonate-token"];
  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken26(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: "" };
    }
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin35().auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || "" };
  } catch {
    return null;
  }
}
async function handler70(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await verifyAuth33(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  try {
    const db = getDb56();
    const result = await db.select().from(transactions13).where(eq55(transactions13.userId, auth.userId)).orderBy(desc20(transactions13.createdAt));
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

// src/api-router.ts
var routes = [
  { segments: ["admin", "refunds", ":id", "process"], handler: process_exports },
  { segments: ["admin", "users", ":userId", "agency"], handler: agency_exports },
  { segments: ["admin", "users", ":userId", "balance"], handler: balance_exports },
  { segments: ["admin", "users", ":userId", "impersonate"], handler: impersonate_exports },
  { segments: ["admin", "users", ":userId", "master"], handler: master_exports },
  { segments: ["admin", "users", ":userId", "reset-password"], handler: reset_password_exports },
  { segments: ["admin", "announcements", ":id"], handler: id_exports },
  { segments: ["admin", "reports", "analytics"], handler: analytics_exports },
  { segments: ["admin", "reports", "settlements"], handler: settlements_exports },
  { segments: ["ats", "meta", ":metaType"], handler: metaType_exports },
  { segments: ["bizchat", "callback", "state"], handler: state_exports },
  { segments: ["bizchat", "reports", "area"], handler: area_exports },
  { segments: ["bizchat", "reports", "gender-age"], handler: gender_age_exports },
  { segments: ["bizchat", "reports", "period"], handler: period_exports },
  { segments: ["campaigns", ":id", "cancel"], handler: cancel_exports },
  { segments: ["campaigns", ":id", "stop"], handler: stop_exports },
  { segments: ["campaigns", ":id", "submit"], handler: submit_exports },
  { segments: ["internal", "master", "reset-balance"], handler: reset_balance_exports },
  { segments: ["templates", ":id", "approve"], handler: approve_exports },
  { segments: ["templates", ":id", "reject"], handler: reject_exports },
  { segments: ["templates", ":id", "submit"], handler: submit_exports2 },
  { segments: ["admin", "agencies"], handler: agencies_exports },
  { segments: ["admin", "announcements"], handler: announcements_exports },
  { segments: ["admin", "campaigns"], handler: campaigns_exports },
  { segments: ["admin", "login"], handler: login_exports },
  { segments: ["admin", "logs"], handler: logs_exports },
  { segments: ["admin", "me"], handler: me_exports },
  { segments: ["admin", "refunds"], handler: refunds_exports },
  { segments: ["admin", "stats"], handler: stats_exports },
  { segments: ["admin", "tax-invoices"], handler: tax_invoices_exports },
  { segments: ["admin", "transactions"], handler: transactions_exports },
  { segments: ["admin", "users"], handler: users_exports },
  { segments: ["agencies", "list"], handler: list_exports },
  { segments: ["agency", "login"], handler: login_exports2 },
  { segments: ["agency", "stats"], handler: stats_exports2 },
  { segments: ["auth", "user"], handler: user_exports },
  { segments: ["bizchat", "ai"], handler: ai_exports },
  { segments: ["bizchat", "ats"], handler: ats_exports },
  { segments: ["bizchat", "campaigns"], handler: campaigns_exports2 },
  { segments: ["bizchat", "file"], handler: file_exports },
  { segments: ["bizchat", "mdn-upload"], handler: mdn_upload_exports },
  { segments: ["bizchat", "sender"], handler: sender_exports },
  { segments: ["bizchat", "stats"], handler: stats_exports3 },
  { segments: ["bizchat", "template"], handler: template_exports },
  { segments: ["bizchat", "test"], handler: test_exports },
  { segments: ["campaigns", ":id"], handler: id_exports2 },
  { segments: ["campaigns", "test-create"], handler: test_create_exports },
  { segments: ["dashboard", "stats"], handler: stats_exports4 },
  { segments: ["kispg", "auth"], handler: auth_exports },
  { segments: ["kispg", "callback"], handler: callback_exports },
  { segments: ["maptics", "geofences"], handler: geofences_exports },
  { segments: ["maptics", "poi"], handler: poi_exports },
  { segments: ["profile", "password"], handler: password_exports },
  { segments: ["recommended-templates", ":id"], handler: id_exports3 },
  { segments: ["recommended-templates", "filters"], handler: filters_exports },
  { segments: ["stripe", "checkout"], handler: checkout_exports },
  { segments: ["stripe", "config"], handler: config_exports },
  { segments: ["stripe", "webhook"], handler: webhook_exports },
  { segments: ["targeting", "estimate"], handler: estimate_exports },
  { segments: ["templates", ":id"], handler: id_exports4 },
  { segments: ["templates", "approved"], handler: approved_exports },
  { segments: ["transactions", "charge"], handler: charge_exports },
  { segments: ["announcements"], handler: announcements_exports2 },
  { segments: ["campaigns"], handler: campaigns_exports3 },
  { segments: ["profile"], handler: profile_exports },
  { segments: ["recommended-templates"], handler: recommended_templates_exports },
  { segments: ["refunds"], handler: refunds_exports2 },
  { segments: ["tax-invoices"], handler: tax_invoices_exports2 },
  { segments: ["templates"], handler: templates_exports },
  { segments: ["transactions"], handler: transactions_exports2 }
];
function matchRoute(ps) {
  for (const r of routes) {
    if (r.segments.length !== ps.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.segments.length; i++) {
      if (r.segments[i].startsWith(":")) params[r.segments[i].slice(1)] = ps[i];
      else if (r.segments[i] !== ps[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}
function getPath(req) {
  const rp = req.query.path;
  if (rp) return Array.isArray(rp) ? rp.filter(Boolean) : String(rp).split("/").filter(Boolean);
  const u = req.url || "", i = u.indexOf("/api/");
  if (i !== -1) return u.substring(i + 5).split("?")[0].split("/").filter(Boolean);
  return [];
}
async function handler71(req, res) {
  const ps = getPath(req);
  const m = matchRoute(ps);
  if (!m) return res.status(404).json({ error: "Not found", path: ps.join("/") });
  for (const [k, v] of Object.entries(m.params)) req.query[k] = v;
  try {
    const mod = m.route.handler;
    const fn = mod.default || mod.handler || mod;
    if (typeof fn !== "function") return res.status(500).json({ error: "No handler: " + ps.join("/") });
    return fn(req, res);
  } catch (e) {
    console.error("[Router]", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
export {
  handler71 as default
};

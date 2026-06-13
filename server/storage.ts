import {
  users,
  campaigns,
  messages,
  targeting,
  transactions,
  creditGrants,
  creditLedger,
  reports,
  templates,
  files,
  geofences,
  atsMetaCache,
  refunds,
  taxInvoices,
  agencies,
  CAMPAIGN_STATUS,
  type User,
  type UpsertUser,
  type Campaign,
  type InsertCampaign,
  type Message,
  type InsertMessage,
  type Targeting,
  type InsertTargeting,
  type Transaction,
  type InsertTransaction,
  type CreditGrant,
  type InsertCreditGrant,
  type CreditLedger,
  type InsertCreditLedger,
  type Report,
  type InsertReport,
  type Template,
  type InsertTemplate,
  type File,
  type InsertFile,
  type Geofence,
  type InsertGeofence,
  type AtsMetaCache,
  type InsertAtsMetaCache,
  type Refund,
  type InsertRefund,
  type TaxInvoice,
  type InsertTaxInvoice,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, gte, lt, lte, inArray } from "drizzle-orm";
import { CREDIT_PRODUCTS, type CreditProductType } from "@shared/credit-policy";
import { getKstMonthRange } from "./services/creditService";

function getCreditGrantRefundableAmountKrw(lot: Pick<CreditGrant, "productType" | "originalCredits" | "remainingCredits">) {
  const productType = lot.productType as CreditProductType | null;
  const originalCredits = Number(lot.originalCredits || 0);
  const remainingCredits = Number(lot.remainingCredits || 0);
  if (!productType || !(productType in CREDIT_PRODUCTS) || originalCredits <= 0 || remainingCredits <= 0) {
    return 0;
  }

  return Math.floor((CREDIT_PRODUCTS[productType].priceKrw / originalCredits) * remainingCredits);
}

export interface CreditBalanceResult {
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  transaction?: Transaction;
}

export interface CreditGrantResult {
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  grant?: CreditGrant;
  ledgerEntry?: CreditLedger;
}

export interface CampaignCreditUseResult {
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  campaign?: Campaign;
  ledgerEntry?: CreditLedger;
  balanceAfterCredits?: number;
}

export interface CampaignCreditReservationResult {
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  campaign?: Campaign;
  ledgerEntry?: CreditLedger;
  balanceAfterCredits?: number;
}

export interface CampaignCreditRestoreResult {
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  campaign?: Campaign;
  ledgerEntry?: CreditLedger;
  restoredCredits?: number;
  balanceAfterCredits?: number;
}

export interface CreditSummary {
  availableCredits: number;
  reservedCredits: number;
  expiringSoonCredits: number;
  totalGrantedCredits: number;
  totalUsedCredits: number;
  refundableCredits: number;
  refundableAmountKrw: number;
  hasLedger: boolean;
  legacyBalance: number;
  lots: CreditGrant[];
  recentLedger: CreditLedger[];
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserBalance(userId: string, amount: string): Promise<User | undefined>;
  updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | undefined>;
  creditBalanceAtomically(userId: string, amount: number, stripeSessionId: string): Promise<CreditBalanceResult>;

  // Templates
  getTemplates(userId: string): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  getApprovedTemplates(userId: string): Promise<Template[]>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;

  getCampaigns(userId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, campaign: Partial<Campaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<boolean>;

  getMessage(campaignId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;

  getTargeting(campaignId: string): Promise<Targeting | undefined>;
  createTargeting(targeting: InsertTargeting): Promise<Targeting>;
  updateTargeting(campaignId: string, targeting: Partial<InsertTargeting>): Promise<Targeting | undefined>;

  getTransactions(userId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactionByStripeSessionId(stripeSessionId: string): Promise<Transaction | undefined>;

  // Credits
  getCreditGrants(userId: string): Promise<CreditGrant[]>;
  getCreditLedger(userId: string, limit?: number): Promise<CreditLedger[]>;
  getCreditSummary(userId: string): Promise<CreditSummary>;
  hasPurchasedCreditProductInCurrentKstMonth(userId: string, productType: CreditProductType): Promise<boolean>;
  createCreditGrant(grant: InsertCreditGrant): Promise<CreditGrant>;
  createCreditLedgerEntry(entry: InsertCreditLedger): Promise<CreditLedger>;
  grantPurchasedCreditsAtomically(input: {
    userId: string;
    transactionId?: string | null;
    productType: CreditProductType;
    credits: number;
    expiresAt: Date;
    paymentReference: string;
    description: string;
  }): Promise<CreditGrantResult>;
  startCampaignWithCreditUseAtomically(input: {
    userId: string;
    campaignId: string;
    neededCredits: number;
    sentCount: number;
    successCount: number;
    description: string;
  }): Promise<CampaignCreditUseResult>;
  reserveCampaignCreditsAtomically(input: {
    userId: string;
    campaignId: string;
    neededCredits: number;
    description: string;
  }): Promise<CampaignCreditReservationResult>;
  releaseCampaignReservedCreditsAtomically(input: {
    userId: string;
    campaignId: string;
    description: string;
  }): Promise<CampaignCreditReservationResult>;
  restoreCampaignUsedCreditsAtomically(input: {
    userId: string;
    campaignId: string;
    reason: string;
    description: string;
    restoreCredits?: number;
    statusCode?: number;
    status?: string;
  }): Promise<CampaignCreditRestoreResult>;

  getReport(campaignId: string): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(campaignId: string, report: Partial<InsertReport>): Promise<Report | undefined>;

  getDashboardStats(userId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalClicks: number;
    successRate: number;
  }>;

  // Files
  getFiles(userId: string): Promise<File[]>;
  getFile(id: string): Promise<File | undefined>;
  createFile(file: InsertFile): Promise<File>;
  deleteFile(id: string): Promise<boolean>;

  // Template Stats (filtered by userId for security)
  getTemplateStats(templateId: string, userId: string): Promise<{
    campaignCount: number;
    totalSent: number;
    totalDelivered: number;
    lastSentAt: Date | null;
  }>;

  // Geofences (Maptics)
  getGeofences(userId: string): Promise<Geofence[]>;
  getGeofence(id: string): Promise<Geofence | undefined>;
  createGeofence(geofence: InsertGeofence): Promise<Geofence>;
  updateGeofence(id: string, geofence: Partial<InsertGeofence>): Promise<Geofence | undefined>;
  deleteGeofence(id: string): Promise<boolean>;

  // ATS Meta Cache
  getAtsMetaByType(metaType: string): Promise<AtsMetaCache[]>;
  upsertAtsMeta(data: InsertAtsMetaCache): Promise<AtsMetaCache>;
  clearAtsMetaByType(metaType: string): Promise<void>;

  // Refunds
  getRefunds(userId: string): Promise<Refund[]>;
  getRefund(id: string): Promise<Refund | undefined>;
  createRefund(refund: InsertRefund): Promise<Refund>;
  getPendingRefundByUser(userId: string): Promise<Refund | undefined>;

  // Tax Invoices
  getTaxInvoices(userId: string): Promise<TaxInvoice[]>;
  getTaxInvoice(id: string): Promise<TaxInvoice | undefined>;
  createTaxInvoice(invoice: InsertTaxInvoice): Promise<TaxInvoice>;

  // Agency Portal
  getActiveAgencies(): Promise<{ id: string; name: string }[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAgencyByUserId(userId: string): Promise<{ id: string; name: string; contactName: string | null; contactEmail: string | null; isActive: boolean } | undefined>;
  getAgencyStats(agencyId: string): Promise<{
    subAccountCount: number;
    totalSpendThisMonth: number;
    totalCampaigns: number;
    activeCampaigns: number;
    commissionRate: number;
    estimatedCommission: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserBalance(userId: string, amount: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        balance: amount,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async creditBalanceAtomically(userId: string, amount: number, stripeSessionId: string): Promise<CreditBalanceResult> {
    try {
      const result = await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!user) {
          throw new Error("User not found");
        }

        const currentBalance = parseFloat(user.balance as string || "0");
        const newBalance = currentBalance + amount;

        await tx
          .update(users)
          .set({
            balance: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        const [transaction] = await tx.insert(transactions).values({
          userId,
          type: "charge",
          amount: amount.toString(),
          balanceAfter: newBalance.toString(),
          description: "Stripe 카드 결제 충전",
          paymentMethod: "stripe",
          stripeSessionId,
        }).returning();

        return { success: true as const, transaction };
      });

      return result;
    } catch (error: any) {
      if (error?.code === '23505') {
        return { success: false, alreadyProcessed: true };
      }
      if (error?.message === "User not found") {
        return { success: false, error: "User not found" };
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  // Template methods
  async getTemplates(userId: string): Promise<Template[]> {
    return db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId))
      .orderBy(desc(templates.createdAt));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  async getApprovedTemplates(userId: string): Promise<Template[]> {
    const SYSTEM_USER_ID = "system";
    return db
      .select()
      .from(templates)
      .where(and(or(eq(templates.userId, userId), eq(templates.userId, SYSTEM_USER_ID)), eq(templates.status, "approved")))
      .orderBy(desc(templates.createdAt));
  }

  async createTemplate(templateData: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(templates).values(templateData as typeof templates.$inferInsert).returning();
    return template;
  }

  async updateTemplate(id: string, templateData: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [template] = await db
      .update(templates)
      .set({ ...templateData, updatedAt: new Date() } as Partial<typeof templates.$inferInsert>)
      .where(eq(templates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    await db.delete(templates).where(eq(templates.id, id));
    return true;
  }

  async getCampaigns(userId: string): Promise<Campaign[]> {
    return db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.createdAt));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign || undefined;
  }

  async createCampaign(campaignData: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(campaigns).values(campaignData).returning();
    return campaign;
  }

  async updateCampaign(id: string, campaignData: Partial<Campaign>): Promise<Campaign | undefined> {
    const [campaign] = await db
      .update(campaigns)
      .set({ ...campaignData, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return campaign || undefined;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    // 외래 키 제약 조건 때문에 관련 레코드를 먼저 삭제해야 함
    await db.delete(reports).where(eq(reports.campaignId, id));
    await db.delete(targeting).where(eq(targeting.campaignId, id));
    await db.delete(messages).where(eq(messages.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));
    return true;
  }

  async getMessage(campaignId: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.campaignId, campaignId));
    return message || undefined;
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(messageData).returning();
    return message;
  }

  async getTargeting(campaignId: string): Promise<Targeting | undefined> {
    const [target] = await db.select().from(targeting).where(eq(targeting.campaignId, campaignId));
    return target || undefined;
  }

  async createTargeting(targetingData: InsertTargeting): Promise<Targeting> {
    const [target] = await db.insert(targeting).values(targetingData).returning();
    return target;
  }

  async updateTargeting(campaignId: string, targetingData: Partial<InsertTargeting>): Promise<Targeting | undefined> {
    const [target] = await db
      .update(targeting)
      .set(targetingData)
      .where(eq(targeting.campaignId, campaignId))
      .returning();
    return target || undefined;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async createTransaction(transactionData: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(transactionData).returning();
    return transaction;
  }

  async getTransactionByStripeSessionId(stripeSessionId: string): Promise<Transaction | undefined> {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.stripeSessionId, stripeSessionId));
    return transaction || undefined;
  }

  async getCreditGrants(userId: string): Promise<CreditGrant[]> {
    return db
      .select()
      .from(creditGrants)
      .where(eq(creditGrants.userId, userId))
      .orderBy(creditGrants.expiresAt);
  }

  async getCreditLedger(userId: string, limit = 20): Promise<CreditLedger[]> {
    return db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(limit);
  }

  async getCreditSummary(userId: string): Promise<CreditSummary> {
    const [user, lots, recentLedger] = await Promise.all([
      this.getUser(userId),
      this.getCreditGrants(userId),
      this.getCreditLedger(userId, 20),
    ]);
    const ledgerEntries = await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId));
    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const activeLots = lots.filter((lot) => {
      const expiresAt = new Date(lot.expiresAt);
      return Number(lot.remainingCredits || 0) > 0 && expiresAt > now;
    });

    const availableCredits = activeLots.reduce(
      (sum, lot) => sum + Number(lot.remainingCredits || 0),
      0,
    );
    const expiringSoonCredits = activeLots
      .filter((lot) => new Date(lot.expiresAt) <= thirtyDaysLater)
      .reduce((sum, lot) => sum + Number(lot.remainingCredits || 0), 0);
    const totalGrantedCredits = lots.reduce(
      (sum, lot) => sum + Number(lot.originalCredits || 0),
      0,
    );
    const grossUsedCredits = ledgerEntries
      .filter((entry) => entry.type === "use")
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amountCredits || 0)), 0);
    const restoredUsedCredits = ledgerEntries
      .filter((entry) => entry.type === "adjustment" && (entry.metadata as any)?.useLedgerId)
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.amountCredits || 0)), 0);
    const totalUsedCredits = Math.max(0, grossUsedCredits - restoredUsedCredits);
    const refundableAmountKrw = activeLots.reduce(
      (sum, lot) => sum + getCreditGrantRefundableAmountKrw(lot),
      0,
    );

    const terminalReservationCampaignIds = new Set(
      ledgerEntries
        .filter((entry) => entry.type === "use" || entry.type === "release")
        .map((entry) => entry.campaignId)
        .filter(Boolean),
    );
    const reservedCredits = ledgerEntries
      .filter(
        (entry) =>
          entry.type === "reserve" &&
          entry.campaignId &&
          !terminalReservationCampaignIds.has(entry.campaignId),
      )
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amountCredits || 0)), 0);

    return {
      availableCredits,
      reservedCredits,
      expiringSoonCredits,
      totalGrantedCredits,
      totalUsedCredits,
      refundableCredits: availableCredits,
      refundableAmountKrw,
      hasLedger: lots.length > 0 || recentLedger.length > 0,
      legacyBalance: Number(user?.balance || 0),
      lots,
      recentLedger,
    };
  }

  async hasPurchasedCreditProductInCurrentKstMonth(
    userId: string,
    productType: CreditProductType,
  ): Promise<boolean> {
    const { start, end } = getKstMonthRange();
    const [grant] = await db
      .select({ id: creditGrants.id })
      .from(creditGrants)
      .where(
        and(
          eq(creditGrants.userId, userId),
          eq(creditGrants.productType, productType),
          gte(creditGrants.purchasedAt, start),
          lt(creditGrants.purchasedAt, end),
        ),
      )
      .limit(1);

    return Boolean(grant);
  }

  async createCreditGrant(grantData: InsertCreditGrant): Promise<CreditGrant> {
    const [grant] = await db.insert(creditGrants).values(grantData).returning();
    return grant;
  }

  async createCreditLedgerEntry(entryData: InsertCreditLedger): Promise<CreditLedger> {
    const [entry] = await db.insert(creditLedger).values(entryData).returning();
    return entry;
  }

  async grantPurchasedCreditsAtomically(input: {
    userId: string;
    transactionId?: string | null;
    productType: CreditProductType;
    credits: number;
    expiresAt: Date;
    paymentReference: string;
    description: string;
  }): Promise<CreditGrantResult> {
    const idempotencyKey = `credit-grant:${input.paymentReference}`;

    try {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existing) {
          return { success: false as const, alreadyProcessed: true };
        }

        if (input.productType === "light") {
          const { start, end } = getKstMonthRange();
          const [existingLightGrant] = await tx
            .select({ id: creditGrants.id })
            .from(creditGrants)
            .where(
              and(
                eq(creditGrants.userId, input.userId),
                eq(creditGrants.productType, "light"),
                gte(creditGrants.purchasedAt, start),
                lt(creditGrants.purchasedAt, end),
              ),
            )
            .limit(1);

          if (existingLightGrant) {
            return {
              success: false as const,
              error: "라이트 충전은 매월 1회만 구매할 수 있습니다",
            };
          }
        }

        const [grant] = await tx
          .insert(creditGrants)
          .values({
            userId: input.userId,
            transactionId: input.transactionId || null,
            productType: input.productType,
            originalCredits: input.credits,
            remainingCredits: input.credits,
            expiresAt: input.expiresAt,
          })
          .returning();

        const activeLots = await tx
          .select()
          .from(creditGrants)
          .where(eq(creditGrants.userId, input.userId));
        const now = new Date();
        const balanceAfterCredits = activeLots.reduce((sum, lot) => {
          if (new Date(lot.expiresAt) <= now) return sum;
          return sum + Number(lot.remainingCredits || 0);
        }, 0);

        const [ledgerEntry] = await tx
          .insert(creditLedger)
          .values({
            userId: input.userId,
            creditGrantId: grant.id,
            transactionId: input.transactionId || null,
            type: "grant",
            amountCredits: input.credits,
            balanceAfterCredits,
            productType: input.productType,
            idempotencyKey,
            description: input.description,
            metadata: {
              paymentReference: input.paymentReference,
            },
          })
          .returning();

        return { success: true as const, grant, ledgerEntry };
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        return { success: false, alreadyProcessed: true };
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  async startCampaignWithCreditUseAtomically(input: {
    userId: string;
    campaignId: string;
    neededCredits: number;
    sentCount: number;
    successCount: number;
    description: string;
  }): Promise<CampaignCreditUseResult> {
    const idempotencyKey = `campaign-start:${input.campaignId}`;

    try {
      return await db.transaction(async (tx) => {
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, input.campaignId))
          .for("update");

        if (!campaign) {
          return { success: false as const, error: "Campaign not found" };
        }

        if (campaign.userId !== input.userId) {
          return { success: false as const, error: "Access denied" };
        }

        if (
          campaign.statusCode === CAMPAIGN_STATUS.RUNNING.code ||
          campaign.statusCode === CAMPAIGN_STATUS.COMPLETED.code
        ) {
          return { success: true as const, alreadyProcessed: true, campaign };
        }

        if (campaign.statusCode !== CAMPAIGN_STATUS.APPROVED.code) {
          return { success: false as const, error: "Only approved campaigns can be started" };
        }

        const [existingLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingLedger) {
          return {
            success: true as const,
            alreadyProcessed: true,
            campaign,
            ledgerEntry: existingLedger,
            balanceAfterCredits: existingLedger.balanceAfterCredits ?? undefined,
          };
        }

        const reserveIdempotencyKey = `campaign-reserve:${input.campaignId}`;
        const [existingReserveLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, reserveIdempotencyKey))
          .limit(1);

        if (existingReserveLedger) {
          const reservedCredits = Math.abs(Number(existingReserveLedger.amountCredits || 0));

          if (reservedCredits !== input.neededCredits) {
            return {
              success: false as const,
              error: "예약된 크레딧과 필요한 크레딧이 일치하지 않습니다",
              balanceAfterCredits: existingReserveLedger.balanceAfterCredits ?? undefined,
            };
          }

          const activeLots = await tx
            .select()
            .from(creditGrants)
            .where(
              and(
                eq(creditGrants.userId, input.userId),
                sql`${creditGrants.remainingCredits} > 0`,
                sql`${creditGrants.expiresAt} > ${new Date()}`,
              ),
            );

          const balanceAfterCredits = activeLots.reduce(
            (sum, lot) => sum + Number(lot.remainingCredits || 0),
            0,
          );

          const [ledgerEntry] = await tx
            .insert(creditLedger)
            .values({
              userId: input.userId,
              campaignId: input.campaignId,
              creditGrantId: existingReserveLedger.creditGrantId,
              type: "use",
              amountCredits: -input.neededCredits,
              balanceAfterCredits,
              idempotencyKey,
              description: input.description,
              metadata: {
                reservedLedgerId: existingReserveLedger.id,
                reserveAllocations: (existingReserveLedger.metadata as any)?.allocations || [],
                targetCount: input.sentCount,
              },
            })
            .returning();

          const [updatedCampaign] = await tx
            .update(campaigns)
            .set({
              statusCode: CAMPAIGN_STATUS.RUNNING.code,
              status: CAMPAIGN_STATUS.RUNNING.status,
              sentCount: input.sentCount,
              successCount: input.successCount,
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, input.campaignId))
            .returning();

          return {
            success: true as const,
            campaign: updatedCampaign,
            ledgerEntry,
            balanceAfterCredits,
          };
        }

        const now = new Date();
        const lots = await tx
          .select()
          .from(creditGrants)
          .where(
            and(
              eq(creditGrants.userId, input.userId),
              sql`${creditGrants.remainingCredits} > 0`,
              sql`${creditGrants.expiresAt} > ${now}`,
            ),
          )
          .orderBy(creditGrants.expiresAt)
          .for("update");

        const availableCredits = lots.reduce(
          (sum, lot) => sum + Number(lot.remainingCredits || 0),
          0,
        );

        if (availableCredits < input.neededCredits) {
          return {
            success: false as const,
            error: "크레딧이 부족합니다",
            balanceAfterCredits: availableCredits,
          };
        }

        let remainingToUse = input.neededCredits;
        const allocations: Array<{
          creditGrantId: string;
          usedCredits: number;
          remainingCreditsAfter: number;
          expiresAt: Date;
        }> = [];

        for (const lot of lots) {
          if (remainingToUse <= 0) break;

          const currentRemaining = Number(lot.remainingCredits || 0);
          const usedCredits = Math.min(currentRemaining, remainingToUse);
          const remainingCreditsAfter = currentRemaining - usedCredits;

          await tx
            .update(creditGrants)
            .set({
              remainingCredits: remainingCreditsAfter,
              updatedAt: now,
            })
            .where(eq(creditGrants.id, lot.id));

          allocations.push({
            creditGrantId: lot.id,
            usedCredits,
            remainingCreditsAfter,
            expiresAt: lot.expiresAt,
          });

          remainingToUse -= usedCredits;
        }

        const balanceAfterCredits = availableCredits - input.neededCredits;

        const [ledgerEntry] = await tx
          .insert(creditLedger)
          .values({
            userId: input.userId,
            campaignId: input.campaignId,
            creditGrantId: allocations[0]?.creditGrantId || null,
            type: "use",
            amountCredits: -input.neededCredits,
            balanceAfterCredits,
            idempotencyKey,
            description: input.description,
            metadata: {
              allocations,
              targetCount: input.sentCount,
            },
          })
          .returning();

        const [updatedCampaign] = await tx
          .update(campaigns)
          .set({
            statusCode: CAMPAIGN_STATUS.RUNNING.code,
            status: CAMPAIGN_STATUS.RUNNING.status,
            sentCount: input.sentCount,
            successCount: input.successCount,
            scheduledAt: now,
            updatedAt: now,
          })
          .where(eq(campaigns.id, input.campaignId))
          .returning();

        return {
          success: true as const,
          campaign: updatedCampaign,
          ledgerEntry,
          balanceAfterCredits,
        };
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        const campaign = await this.getCampaign(input.campaignId);
        return { success: true, alreadyProcessed: true, campaign };
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  async reserveCampaignCreditsAtomically(input: {
    userId: string;
    campaignId: string;
    neededCredits: number;
    description: string;
  }): Promise<CampaignCreditReservationResult> {
    const idempotencyKey = `campaign-reserve:${input.campaignId}`;

    try {
      return await db.transaction(async (tx) => {
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, input.campaignId))
          .for("update");

        if (!campaign) {
          return { success: false as const, error: "Campaign not found" };
        }

        if (campaign.userId !== input.userId) {
          return { success: false as const, error: "Access denied" };
        }

        if (
          campaign.statusCode !== CAMPAIGN_STATUS.APPROVAL_REQUESTED.code &&
          campaign.statusCode !== CAMPAIGN_STATUS.APPROVED.code
        ) {
          return { success: false as const, error: "Only submitted or approved campaigns can reserve credits" };
        }

        const [existingLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingLedger) {
          return {
            success: true as const,
            alreadyProcessed: true,
            campaign,
            ledgerEntry: existingLedger,
            balanceAfterCredits: existingLedger.balanceAfterCredits ?? undefined,
          };
        }

        const now = new Date();
        const lots = await tx
          .select()
          .from(creditGrants)
          .where(
            and(
              eq(creditGrants.userId, input.userId),
              sql`${creditGrants.remainingCredits} > 0`,
              sql`${creditGrants.expiresAt} > ${now}`,
            ),
          )
          .orderBy(creditGrants.expiresAt)
          .for("update");

        const availableCredits = lots.reduce(
          (sum, lot) => sum + Number(lot.remainingCredits || 0),
          0,
        );

        if (availableCredits < input.neededCredits) {
          return {
            success: false as const,
            error: "크레딧이 부족합니다",
            balanceAfterCredits: availableCredits,
          };
        }

        let remainingToReserve = input.neededCredits;
        const allocations: Array<{
          creditGrantId: string;
          reservedCredits: number;
          remainingCreditsAfter: number;
          expiresAt: Date;
        }> = [];

        for (const lot of lots) {
          if (remainingToReserve <= 0) break;

          const currentRemaining = Number(lot.remainingCredits || 0);
          const reservedCredits = Math.min(currentRemaining, remainingToReserve);
          const remainingCreditsAfter = currentRemaining - reservedCredits;

          await tx
            .update(creditGrants)
            .set({
              remainingCredits: remainingCreditsAfter,
              updatedAt: now,
            })
            .where(eq(creditGrants.id, lot.id));

          allocations.push({
            creditGrantId: lot.id,
            reservedCredits,
            remainingCreditsAfter,
            expiresAt: lot.expiresAt,
          });

          remainingToReserve -= reservedCredits;
        }

        const balanceAfterCredits = availableCredits - input.neededCredits;

        const [ledgerEntry] = await tx
          .insert(creditLedger)
          .values({
            userId: input.userId,
            campaignId: input.campaignId,
            creditGrantId: allocations[0]?.creditGrantId || null,
            type: "reserve",
            amountCredits: -input.neededCredits,
            balanceAfterCredits,
            idempotencyKey,
            description: input.description,
            metadata: {
              allocations,
              scheduledAt: campaign.scheduledAt,
            },
          })
          .returning();

        return {
          success: true as const,
          campaign,
          ledgerEntry,
          balanceAfterCredits,
        };
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        const campaign = await this.getCampaign(input.campaignId);
        return { success: true, alreadyProcessed: true, campaign };
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  async releaseCampaignReservedCreditsAtomically(input: {
    userId: string;
    campaignId: string;
    description: string;
  }): Promise<CampaignCreditReservationResult> {
    const reserveIdempotencyKey = `campaign-reserve:${input.campaignId}`;
    const releaseIdempotencyKey = `campaign-release:${input.campaignId}`;
    const startIdempotencyKey = `campaign-start:${input.campaignId}`;

    try {
      return await db.transaction(async (tx) => {
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, input.campaignId))
          .for("update");

        if (!campaign) {
          return { success: false as const, error: "Campaign not found" };
        }

        if (campaign.userId !== input.userId) {
          return { success: false as const, error: "Access denied" };
        }

        const [existingReleaseLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, releaseIdempotencyKey))
          .limit(1);

        if (existingReleaseLedger) {
          const [updatedCampaign] = await tx
            .update(campaigns)
            .set({
              statusCode: CAMPAIGN_STATUS.CANCELLED.code,
              status: CAMPAIGN_STATUS.CANCELLED.status,
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, input.campaignId))
            .returning();

          return {
            success: true as const,
            alreadyProcessed: true,
            campaign: updatedCampaign,
            ledgerEntry: existingReleaseLedger,
            balanceAfterCredits: existingReleaseLedger.balanceAfterCredits ?? undefined,
          };
        }

        const [existingUseLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, startIdempotencyKey))
          .limit(1);

        if (existingUseLedger) {
          return {
            success: false as const,
            error: "이미 발송이 시작된 캠페인은 예약 크레딧을 해제할 수 없습니다",
          };
        }

        const [reserveLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, reserveIdempotencyKey))
          .limit(1);

        const now = new Date();
        let releasedCredits = 0;
        const allocations = ((reserveLedger?.metadata as any)?.allocations || []) as Array<{
          creditGrantId?: string;
          reservedCredits?: number;
        }>;

        for (const allocation of allocations) {
          const creditGrantId = allocation.creditGrantId;
          const reservedCredits = Number(allocation.reservedCredits || 0);
          if (!creditGrantId || reservedCredits <= 0) continue;

          await tx
            .update(creditGrants)
            .set({
              remainingCredits: sql`${creditGrants.remainingCredits} + ${reservedCredits}`,
              updatedAt: now,
            })
            .where(eq(creditGrants.id, creditGrantId));

          releasedCredits += reservedCredits;
        }

        const activeLots = await tx
          .select()
          .from(creditGrants)
          .where(
            and(
              eq(creditGrants.userId, input.userId),
              sql`${creditGrants.remainingCredits} > 0`,
              sql`${creditGrants.expiresAt} > ${now}`,
            ),
          );
        const balanceAfterCredits = activeLots.reduce(
          (sum, lot) => sum + Number(lot.remainingCredits || 0),
          0,
        );

        const [updatedCampaign] = await tx
          .update(campaigns)
          .set({
            statusCode: CAMPAIGN_STATUS.CANCELLED.code,
            status: CAMPAIGN_STATUS.CANCELLED.status,
            updatedAt: now,
          })
          .where(eq(campaigns.id, input.campaignId))
          .returning();

        if (!reserveLedger || releasedCredits <= 0) {
          return { success: true as const, campaign: updatedCampaign, balanceAfterCredits };
        }

        const [ledgerEntry] = await tx
          .insert(creditLedger)
          .values({
            userId: input.userId,
            campaignId: input.campaignId,
            creditGrantId: reserveLedger.creditGrantId,
            type: "release",
            amountCredits: releasedCredits,
            balanceAfterCredits,
            idempotencyKey: releaseIdempotencyKey,
            description: input.description,
            metadata: {
              reservedLedgerId: reserveLedger.id,
              allocations,
            },
          })
          .returning();

        return {
          success: true as const,
          campaign: updatedCampaign,
          ledgerEntry,
          balanceAfterCredits,
        };
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        const campaign = await this.getCampaign(input.campaignId);
        return { success: true, alreadyProcessed: true, campaign };
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  async restoreCampaignUsedCreditsAtomically(input: {
    userId: string;
    campaignId: string;
    reason: string;
    description: string;
    restoreCredits?: number;
    statusCode?: number;
    status?: string;
  }): Promise<CampaignCreditRestoreResult> {
    const startIdempotencyKey = `campaign-start:${input.campaignId}`;
    const restoreIdempotencyKey = `campaign-restore:${input.campaignId}:${input.reason}`;

    try {
      return await db.transaction(async (tx) => {
        const [campaign] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, input.campaignId))
          .for("update");

        if (!campaign) {
          return { success: false as const, error: "Campaign not found" };
        }

        if (campaign.userId !== input.userId) {
          return { success: false as const, error: "Access denied" };
        }

        const [existingRestoreLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, restoreIdempotencyKey))
          .limit(1);

        if (existingRestoreLedger) {
          return {
            success: true as const,
            alreadyProcessed: true,
            campaign,
            ledgerEntry: existingRestoreLedger,
            restoredCredits: Number(existingRestoreLedger.amountCredits || 0),
            balanceAfterCredits: existingRestoreLedger.balanceAfterCredits ?? undefined,
          };
        }

        const [useLedger] = await tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.idempotencyKey, startIdempotencyKey))
          .limit(1);

        if (!useLedger) {
          const [updatedCampaign] = await tx
            .update(campaigns)
            .set({
              statusCode: input.statusCode ?? CAMPAIGN_STATUS.STOPPED.code,
              status: input.status ?? CAMPAIGN_STATUS.STOPPED.status,
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, input.campaignId))
            .returning();

          return {
            success: true as const,
            alreadyProcessed: true,
            campaign: updatedCampaign,
            restoredCredits: 0,
          };
        }

        const metadata = (useLedger.metadata || {}) as {
          allocations?: Array<{ creditGrantId?: string; usedCredits?: number }>;
          reserveAllocations?: Array<{ creditGrantId?: string; reservedCredits?: number }>;
        };
        const originalAllocations = metadata.allocations?.length
          ? metadata.allocations.map((allocation) => ({
              creditGrantId: allocation.creditGrantId,
              restoredCredits: Number(allocation.usedCredits || 0),
            }))
          : (metadata.reserveAllocations || []).map((allocation) => ({
              creditGrantId: allocation.creditGrantId,
              restoredCredits: Number(allocation.reservedCredits || 0),
            }));
        const priorRestoreRows = await tx
          .select({
            amountCredits: creditLedger.amountCredits,
            metadata: creditLedger.metadata,
          })
          .from(creditLedger)
          .where(
            and(
              eq(creditLedger.campaignId, input.campaignId),
              eq(creditLedger.type, "adjustment"),
              sql`${creditLedger.idempotencyKey} like ${`campaign-restore:${input.campaignId}:%`}`,
            ),
          );
        const alreadyRestoredByGrant = new Map<string, number>();
        const alreadyRestoredCredits = priorRestoreRows.reduce(
          (sum, row) => {
            const restoredAmount = Math.max(0, Number(row.amountCredits || 0));
            const restoreAllocations = ((row.metadata as any)?.allocations || []) as Array<{
              creditGrantId?: string;
              restoredCredits?: number;
            }>;

            for (const allocation of restoreAllocations) {
              if (!allocation.creditGrantId) continue;
              alreadyRestoredByGrant.set(
                allocation.creditGrantId,
                (alreadyRestoredByGrant.get(allocation.creditGrantId) || 0) +
                  Math.max(0, Number(allocation.restoredCredits || 0)),
              );
            }

            return sum + restoredAmount;
          },
          0,
        );
        const restorableAllocations = originalAllocations.map((allocation) => ({
          creditGrantId: allocation.creditGrantId,
          restoredCredits: Math.max(
            0,
            Number(allocation.restoredCredits || 0) -
              (allocation.creditGrantId ? alreadyRestoredByGrant.get(allocation.creditGrantId) || 0 : 0),
          ),
        }));
        const totalUsedCredits = originalAllocations.reduce(
          (sum, allocation) => sum + Number(allocation.restoredCredits || 0),
          0,
        );
        const remainingRestorableCredits = Math.max(0, totalUsedCredits - alreadyRestoredCredits);
        const maxRestoreCredits =
          input.restoreCredits === undefined
            ? remainingRestorableCredits
            : Math.min(remainingRestorableCredits, Math.max(0, Math.floor(input.restoreCredits)));
        let remainingRestoreCredits = maxRestoreCredits;
        const allocations = restorableAllocations
          .map((allocation) => {
            const restoredCredits = Math.min(
              Number(allocation.restoredCredits || 0),
              remainingRestoreCredits,
            );
            remainingRestoreCredits -= restoredCredits;
            return {
              creditGrantId: allocation.creditGrantId,
              restoredCredits,
            };
          })
          .filter((allocation) => allocation.restoredCredits > 0);

        const now = new Date();
        let restoredCredits = 0;

        for (const allocation of allocations) {
          if (!allocation.creditGrantId || allocation.restoredCredits <= 0) continue;

          await tx
            .update(creditGrants)
            .set({
              remainingCredits: sql`${creditGrants.remainingCredits} + ${allocation.restoredCredits}`,
              updatedAt: now,
            })
            .where(eq(creditGrants.id, allocation.creditGrantId));

          restoredCredits += allocation.restoredCredits;
        }

        const activeLots = await tx
          .select()
          .from(creditGrants)
          .where(
            and(
              eq(creditGrants.userId, input.userId),
              sql`${creditGrants.remainingCredits} > 0`,
              sql`${creditGrants.expiresAt} > ${now}`,
            ),
          );
        const balanceAfterCredits = activeLots.reduce(
          (sum, lot) => sum + Number(lot.remainingCredits || 0),
          0,
        );

        const [ledgerEntry] = await tx
          .insert(creditLedger)
          .values({
            userId: input.userId,
            campaignId: input.campaignId,
            creditGrantId: useLedger.creditGrantId,
            type: "adjustment",
            amountCredits: restoredCredits,
            balanceAfterCredits,
            idempotencyKey: restoreIdempotencyKey,
            description: input.description,
            metadata: {
              reason: input.reason,
              useLedgerId: useLedger.id,
              allocations,
            },
          })
          .returning();

        const [updatedCampaign] = await tx
          .update(campaigns)
          .set({
            statusCode: input.statusCode ?? CAMPAIGN_STATUS.STOPPED.code,
            status: input.status ?? CAMPAIGN_STATUS.STOPPED.status,
            updatedAt: now,
          })
          .where(eq(campaigns.id, input.campaignId))
          .returning();

        return {
          success: true as const,
          campaign: updatedCampaign,
          ledgerEntry,
          restoredCredits,
          balanceAfterCredits,
        };
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        const campaign = await this.getCampaign(input.campaignId);
        return { success: true, alreadyProcessed: true, campaign };
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  async getReport(campaignId: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.campaignId, campaignId));
    return report || undefined;
  }

  async createReport(reportData: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(reportData).returning();
    return report;
  }

  async updateReport(campaignId: string, reportData: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db
      .update(reports)
      .set({ ...reportData, updatedAt: new Date() })
      .where(eq(reports.campaignId, campaignId))
      .returning();
    return report || undefined;
  }

  async getDashboardStats(userId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalClicks: number;
    successRate: number;
  }> {
    const userCampaigns = await this.getCampaigns(userId);

    const totalCampaigns = userCampaigns.length;
    const activeCampaigns = userCampaigns.filter(c => c.status === 'running').length;
    const totalSent = userCampaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const totalSuccess = userCampaigns.reduce((sum, c) => sum + (c.successCount || 0), 0);

    let totalClicks = 0;
    for (const campaign of userCampaigns) {
      const report = await this.getReport(campaign.id);
      if (report) {
        totalClicks += report.clickCount || 0;
      }
    }

    const successRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0;

    return {
      totalCampaigns,
      activeCampaigns,
      totalSent,
      totalSuccess,
      totalClicks,
      successRate,
    };
  }

  async getFiles(userId: string): Promise<File[]> {
    const userFiles = await db
      .select()
      .from(files)
      .where(eq(files.userId, userId))
      .orderBy(desc(files.createdAt));
    return userFiles;
  }

  async getFile(id: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file || undefined;
  }

  async createFile(fileData: InsertFile): Promise<File> {
    const [file] = await db.insert(files).values(fileData).returning();
    return file;
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await db.delete(files).where(eq(files.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getTemplateStats(templateId: string, userId: string): Promise<{
    campaignCount: number;
    totalSent: number;
    totalDelivered: number;
    lastSentAt: Date | null;
  }> {
    // Filter by both templateId and userId for security
    const campaignList = await db
      .select({
        sentCount: campaigns.sentCount,
        completedAt: campaigns.completedAt,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(and(
        eq(campaigns.templateId, templateId),
        eq(campaigns.userId, userId)
      ));

    const reportsList = await db
      .select({
        deliveredCount: reports.deliveredCount,
      })
      .from(reports)
      .innerJoin(campaigns, eq(reports.campaignId, campaigns.id))
      .where(and(
        eq(campaigns.templateId, templateId),
        eq(campaigns.userId, userId)
      ));

    const campaignCount = campaignList.length;
    const totalSent = campaignList.reduce((sum, c) => sum + (c.sentCount || 0), 0);
    const totalDelivered = reportsList.reduce((sum, r) => sum + (r.deliveredCount || 0), 0);

    const completedCampaigns = campaignList
      .filter(c => c.completedAt !== null)
      .map(c => c.completedAt as Date);

    const lastSentAt = completedCampaigns.length > 0
      ? new Date(Math.max(...completedCampaigns.map(d => d.getTime())))
      : null;

    return {
      campaignCount,
      totalSent,
      totalDelivered,
      lastSentAt,
    };
  }

  // Geofences (Maptics)
  async getGeofences(userId: string): Promise<Geofence[]> {
    const result = await db
      .select()
      .from(geofences)
      .where(eq(geofences.userId, userId))
      .orderBy(desc(geofences.createdAt));
    return result;
  }

  async getGeofence(id: string): Promise<Geofence | undefined> {
    const [geofence] = await db.select().from(geofences).where(eq(geofences.id, id));
    return geofence || undefined;
  }

  async createGeofence(geofenceData: InsertGeofence): Promise<Geofence> {
    const [geofence] = await db.insert(geofences).values(geofenceData).returning();
    return geofence;
  }

  async updateGeofence(id: string, geofenceData: Partial<InsertGeofence>): Promise<Geofence | undefined> {
    const [geofence] = await db
      .update(geofences)
      .set({ ...geofenceData, updatedAt: new Date() })
      .where(eq(geofences.id, id))
      .returning();
    return geofence || undefined;
  }

  async deleteGeofence(id: string): Promise<boolean> {
    const result = await db.delete(geofences).where(eq(geofences.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ATS Meta Cache
  async getAtsMetaByType(metaType: string): Promise<AtsMetaCache[]> {
    const result = await db
      .select()
      .from(atsMetaCache)
      .where(and(
        eq(atsMetaCache.metaType, metaType),
        eq(atsMetaCache.isActive, true)
      ))
      .orderBy(atsMetaCache.level, atsMetaCache.categoryName);
    return result;
  }

  async upsertAtsMeta(data: InsertAtsMetaCache): Promise<AtsMetaCache> {
    const [meta] = await db
      .insert(atsMetaCache)
      .values(data)
      .onConflictDoUpdate({
        target: [atsMetaCache.metaType, atsMetaCache.categoryCode],
        set: {
          categoryName: data.categoryName,
          parentCode: data.parentCode,
          level: data.level,
          metadata: data.metadata,
          isActive: data.isActive,
          lastSyncAt: new Date(),
        },
      })
      .returning();
    return meta;
  }

  async clearAtsMetaByType(metaType: string): Promise<void> {
    await db.delete(atsMetaCache).where(eq(atsMetaCache.metaType, metaType));
  }

  // Refunds
  async getRefunds(userId: string): Promise<Refund[]> {
    const result = await db
      .select()
      .from(refunds)
      .where(eq(refunds.userId, userId))
      .orderBy(desc(refunds.createdAt));
    return result;
  }

  async getRefund(id: string): Promise<Refund | undefined> {
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id));
    return refund || undefined;
  }

  async createRefund(refundData: InsertRefund): Promise<Refund> {
    const [refund] = await db.insert(refunds).values(refundData).returning();
    return refund;
  }

  async getPendingRefundByUser(userId: string): Promise<Refund | undefined> {
    const [refund] = await db
      .select()
      .from(refunds)
      .where(and(eq(refunds.userId, userId), eq(refunds.status, 'pending')));
    return refund || undefined;
  }

  // Tax Invoices
  async getTaxInvoices(userId: string): Promise<TaxInvoice[]> {
    const result = await db
      .select()
      .from(taxInvoices)
      .where(eq(taxInvoices.userId, userId))
      .orderBy(desc(taxInvoices.createdAt));
    return result;
  }

  async getTaxInvoice(id: string): Promise<TaxInvoice | undefined> {
    const [invoice] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, id));
    return invoice || undefined;
  }

  async createTaxInvoice(invoiceData: InsertTaxInvoice): Promise<TaxInvoice> {
    const [invoice] = await db.insert(taxInvoices).values(invoiceData).returning();
    return invoice;
  }

  // Agency Portal
  async getActiveAgencies(): Promise<{ id: string; name: string }[]> {
    const result = await db
      .select({
        id: agencies.id,
        name: agencies.name,
      })
      .from(agencies)
      .where(eq(agencies.isActive, true));
    return result;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getAgencyByUserId(userId: string): Promise<{ id: string; name: string; contactName: string | null; contactEmail: string | null; isActive: boolean } | undefined> {
    const [agency] = await db
      .select({
        id: agencies.id,
        name: agencies.name,
        contactName: agencies.contactName,
        contactEmail: agencies.contactEmail,
        isActive: agencies.isActive,
      })
      .from(agencies)
      .where(eq(agencies.userId, userId));
    return agency ? {
      ...agency,
      isActive: agency.isActive ?? true,
    } : undefined;
  }

  async getAgencyStats(agencyId: string): Promise<{
    subAccountCount: number;
    totalSpendThisMonth: number;
    totalCampaigns: number;
    activeCampaigns: number;
    commissionRate: number;
    estimatedCommission: number;
  }> {
    // Get sub-accounts under this agency
    const subAccounts = await db
      .select()
      .from(users)
      .where(eq(users.agencyId, agencyId));

    const subAccountIds = subAccounts.map(u => u.id);

    if (subAccountIds.length === 0) {
      return {
        subAccountCount: 0,
        totalSpendThisMonth: 0,
        totalCampaigns: 0,
        activeCampaigns: 0,
        commissionRate: 10,
        estimatedCommission: 0,
      };
    }

    // Calculate this month's spend
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const usageTransactions = await db
      .select()
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, subAccountIds),
          eq(transactions.type, 'usage'),
          gte(transactions.createdAt, startOfMonth),
          lte(transactions.createdAt, endOfMonth)
        )
      );

    const totalSpendThisMonth = usageTransactions.reduce((sum, t) => {
      return sum + Math.abs(Number(t.amount || 0));
    }, 0);

    // Get campaigns
    const allCampaigns = await db
      .select()
      .from(campaigns)
      .where(inArray(campaigns.userId, subAccountIds));

    const activeCampaigns = allCampaigns.filter(c =>
      c.statusCode === 30 || c.status === 'running'
    );

    // Calculate commission rate based on spend tier
    let commissionRate = 10;
    if (totalSpendThisMonth >= 100000000) commissionRate = 20;
    else if (totalSpendThisMonth >= 50000000) commissionRate = 15;

    const estimatedCommission = Math.floor(totalSpendThisMonth * (commissionRate / 100));

    return {
      subAccountCount: subAccounts.length,
      totalSpendThisMonth,
      totalCampaigns: allCampaigns.length,
      activeCampaigns: activeCampaigns.length,
      commissionRate,
      estimatedCommission,
    };
  }
}

export const storage = new DatabaseStorage();

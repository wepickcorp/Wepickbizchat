import {
  users,
  campaigns,
  messages,
  targeting,
  transactions,
  reports,
  templates,
  files,
  geofences,
  atsMetaCache,
  refunds,
  taxInvoices,
  agencies,
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
import { eq, desc, and, sql, gte, lte, inArray } from "drizzle-orm";

export interface CreditBalanceResult {
  success: boolean;
  alreadyProcessed?: boolean;
  error?: string;
  transaction?: Transaction;
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
    return db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId))
      .orderBy(desc(templates.createdAt));
  }

  async createTemplate(templateData: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(templates).values(templateData).returning();
    return template;
  }

  async updateTemplate(id: string, templateData: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [template] = await db
      .update(templates)
      .set({ ...templateData, updatedAt: new Date() })
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

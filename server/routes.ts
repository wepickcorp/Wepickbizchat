import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCampaignSchema, insertMessageSchema, insertTargetingSchema, insertTemplateSchema, CAMPAIGN_STATUS } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { calculateCampaignCredits } from "@shared/credit-policy";
import { featureFlags } from "./featureFlags";
import {
  estimateCampaignCreditAvailability,
  getCreditProductForCheckout,
  getCreditPolicySnapshot,
  getProductExpiryDate,
  isCreditProductType,
} from "./services/creditService";
import { registerDevAuthRoutes } from "./devAuth";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";

// BizChat Campaign Action 시뮬레이션 (API key 없을 때)
function simulateBizChatCampaignAction(action: string, campaignId?: string) {
  const baseStats = {
    sendCnt: Math.floor(Math.random() * 5000) + 1000,
    successCnt: Math.floor(Math.random() * 4500) + 900,
    failCnt: Math.floor(Math.random() * 200) + 50,
    waitCnt: Math.floor(Math.random() * 100),
    readCnt: Math.floor(Math.random() * 500) + 100,
    settleCnt: Math.floor(Math.random() * 4000) + 800,
  };

  switch (action) {
    case "stats":
      return {
        success: true,
        result: {
          code: "S000001",
          data: baseStats,
        },
        message: "Using simulated data (no API key)",
      };
    case "create":
      return {
        success: true,
        bizchatCampaignId: `SIM_${Date.now()}`,
        message: "Campaign created in simulation mode",
      };
    case "approve":
      return {
        success: true,
        message: "Approval requested in simulation mode",
      };
    case "cancel":
    case "stop":
      return {
        success: true,
        message: `Campaign ${action} simulated`,
      };
    default:
      return {
        success: true,
        message: `Action '${action}' simulated (development mode)`,
        campaignId,
      };
  }
}

function replaceTemplateVariables(template: string | null | undefined, variables: Record<string, any>) {
  if (!template) return template || null;
  return Object.entries(variables || {}).reduce((result, [key, value]) => {
    let displayValue = value;
    if (value && typeof value === "object" && "start" in value && "end" in value) {
      displayValue = `${value.start} ~ ${value.end}`;
    }
    return result
      .split(`{{${key}}}`)
      .join(displayValue == null ? "" : String(displayValue))
      .split(`{${key}}`)
      .join(displayValue == null ? "" : String(displayValue));
  }, template);
}

function isTemplateVariableMissing(value: any) {
  if (value && typeof value === "object" && ("start" in value || "end" in value)) {
    return !value.start || !value.end;
  }
  return value === undefined || value === null || String(value).trim() === "";
}

function getMissingRequiredTemplateVariables(variableSchema: unknown, variables: Record<string, any>) {
  if (!Array.isArray(variableSchema)) return [];
  return variableSchema.filter((variable: any) => {
    const key = typeof variable?.key === "string" ? variable.key : "";
    return Boolean(variable?.required && key && isTemplateVariableMissing(variables[key]));
  });
}

function hasUnresolvedTemplateVariables(...templates: Array<string | null | undefined>) {
  return templates.some((template) => /\{[^}]+\}/.test(template || ""));
}

// ATS 메타데이터 시뮬레이션 데이터
function getSimulatedAtsMeta(metaType: string) {
  switch (metaType) {
    case "11st":
      return [
        { categoryCode: "11ST_001", categoryName: "패션/의류", level: 1, parentCode: null },
        { categoryCode: "11ST_002", categoryName: "뷰티/화장품", level: 1, parentCode: null },
        { categoryCode: "11ST_003", categoryName: "디지털/가전", level: 1, parentCode: null },
        { categoryCode: "11ST_004", categoryName: "식품/건강", level: 1, parentCode: null },
        { categoryCode: "11ST_005", categoryName: "생활/주방", level: 1, parentCode: null },
        { categoryCode: "11ST_006", categoryName: "스포츠/레저", level: 1, parentCode: null },
        { categoryCode: "11ST_007", categoryName: "유아/출산", level: 1, parentCode: null },
        { categoryCode: "11ST_008", categoryName: "도서/문구", level: 1, parentCode: null },
      ];
    case "webapp":
      return [
        { categoryCode: "APP_001", categoryName: "금융/은행", level: 1, parentCode: null },
        { categoryCode: "APP_002", categoryName: "쇼핑", level: 1, parentCode: null },
        { categoryCode: "APP_003", categoryName: "게임", level: 1, parentCode: null },
        { categoryCode: "APP_004", categoryName: "음악/동영상", level: 1, parentCode: null },
        { categoryCode: "APP_005", categoryName: "소셜/커뮤니티", level: 1, parentCode: null },
        { categoryCode: "APP_006", categoryName: "여행/교통", level: 1, parentCode: null },
        { categoryCode: "APP_007", categoryName: "배달/음식", level: 1, parentCode: null },
        { categoryCode: "APP_008", categoryName: "건강/운동", level: 1, parentCode: null },
      ];
    case "call":
      return [
        { categoryCode: "CALL_001", categoryName: "고빈도 통화자 (월 100회+)", level: 1, parentCode: null },
        { categoryCode: "CALL_002", categoryName: "중빈도 통화자 (월 30-100회)", level: 1, parentCode: null },
        { categoryCode: "CALL_003", categoryName: "저빈도 통화자 (월 30회 미만)", level: 1, parentCode: null },
        { categoryCode: "CALL_004", categoryName: "장시간 통화자 (평균 5분+)", level: 1, parentCode: null },
        { categoryCode: "CALL_005", categoryName: "단시간 통화자 (평균 2분 미만)", level: 1, parentCode: null },
        { categoryCode: "CALL_006", categoryName: "비즈니스 통화 패턴", level: 1, parentCode: null },
      ];
    case "loc":
      return [
        { categoryCode: "LOC_001", categoryName: "출퇴근 패턴 (9-6)", level: 1, parentCode: null },
        { categoryCode: "LOC_002", categoryName: "야간 활동 (18-24시)", level: 1, parentCode: null },
        { categoryCode: "LOC_003", categoryName: "주말 활동 중심", level: 1, parentCode: null },
        { categoryCode: "LOC_004", categoryName: "상업지구 빈번 방문", level: 1, parentCode: null },
        { categoryCode: "LOC_005", categoryName: "주거지역 중심", level: 1, parentCode: null },
        { categoryCode: "LOC_006", categoryName: "대중교통 이용자", level: 1, parentCode: null },
        { categoryCode: "LOC_007", categoryName: "자가용 이용자", level: 1, parentCode: null },
      ];
    case "filter":
      return [
        { categoryCode: "DEVICE_ANDROID", categoryName: "Android 기기", level: 1, parentCode: null, metadata: { type: "device" } },
        { categoryCode: "DEVICE_IOS", categoryName: "iOS 기기", level: 1, parentCode: null, metadata: { type: "device" } },
        { categoryCode: "CARRIER_5G", categoryName: "5G 이용자", level: 1, parentCode: null, metadata: { type: "carrier" } },
        { categoryCode: "CARRIER_LTE", categoryName: "LTE 이용자", level: 1, parentCode: null, metadata: { type: "carrier" } },
        { categoryCode: "PLAN_UNLIMITED", categoryName: "무제한 요금제", level: 1, parentCode: null, metadata: { type: "plan" } },
        { categoryCode: "PLAN_DATA", categoryName: "데이터 요금제", level: 1, parentCode: null, metadata: { type: "plan" } },
      ];
    default:
      return [];
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerDevAuthRoutes(app);

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      let user = await storage.getUser(userId);
      if (!user) {
        const email = (req as any).userEmail || '';
        console.log('User not found in local DB, creating:', userId, email);
        user = await storage.upsertUser({ id: userId, email });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Template routes
  app.get("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const templates = await storage.getTemplates(userId);

      // Add send history stats for each template (filtered by userId for security)
      const templatesWithStats = await Promise.all(
        templates.map(async (template) => {
          const stats = await storage.getTemplateStats(template.id, userId);
          return {
            ...template,
            sendHistory: {
              campaignCount: stats.campaignCount,
              totalSent: stats.totalSent,
              totalDelivered: stats.totalDelivered,
              lastSentAt: stats.lastSentAt,
            },
          };
        })
      );

      res.json(templatesWithStats);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/approved", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;

      // 1. 로컬 DB 승인 템플릿 조회
      const localTemplates = await storage.getApprovedTemplates(userId);

      // 2. BizChat 템플릿 조회 (선택적)
      let bizchatTemplates: any[] = [];
      let bizchatError: string | null = null;
      try {
        const bizchatApiUrl = process.env.BIZCHAT_USE_PROD === 'true'
          ? (process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr')
          : (process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443');
        const bizchatApiKey = process.env.BIZCHAT_USE_PROD === 'true'
          ? process.env.BIZCHAT_PROD_API_KEY
          : process.env.BIZCHAT_DEV_API_KEY;

        if (bizchatApiKey) {
          const tid = Date.now().toString();
          const response = await fetch(`${bizchatApiUrl}/api/v1/cmpn/tpl/list?tid=${tid}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': bizchatApiKey,
            },
            body: JSON.stringify({ pageNumber: 1, pageSize: 100 }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.code === 'S000001' && data.data?.list) {
              // BizChat 템플릿을 로컬 형식으로 변환 (승인된 것만)
              bizchatTemplates = data.data.list
                .filter((tpl: any) => tpl.state === 2) // state 2 = 승인완료
                .map((tpl: any) => ({
                  id: `bizchat_${tpl.id}`,
                  bizchatTemplateId: tpl.id,
                  userId: userId,
                  name: tpl.name || '(이름 없음)',
                  messageType: tpl.msgType === 'RCS' ? 'RCS' : (tpl.msgType === 'MMS' ? 'MMS' : 'LMS'),
                  rcsType: tpl.rcsType,
                  title: tpl.title || '',
                  content: tpl.msg || '',
                  imageUrl: tpl.mms?.[0]?.origId || null,
                  status: 'approved',
                  source: 'bizchat',
                  createdAt: tpl.regDate ? new Date(tpl.regDate * 1000) : new Date(),
                  updatedAt: tpl.updDate ? new Date(tpl.updDate * 1000) : new Date(),
                }));
              console.log(`[Templates] Fetched ${bizchatTemplates.length} approved templates from BizChat`);
            }
          }
        }
      } catch (err) {
        console.error('[Templates] BizChat API error (non-blocking):', err);
        bizchatError = err instanceof Error ? err.message : 'BizChat 템플릿 조회 실패';
        // BizChat 오류는 무시하고 로컬 템플릿만 반환
      }

      // 3. 로컬 + BizChat 템플릿 병합 (중복 제거)
      const allTemplates = [...localTemplates];
      for (const bzTpl of bizchatTemplates) {
        // 로컬에 같은 bizchatTemplateId가 없는 경우만 추가
        const exists = localTemplates.some(
          (lt: any) => lt.bizchatTemplateId === bzTpl.bizchatTemplateId
        );
        if (!exists) {
          allTemplates.push(bzTpl);
        }
      }

      // 배열 형태로 반환 (프론트엔드 호환성)
      console.log(`[Templates/approved] 반환: 로컬 승인 ${localTemplates.length}개, BizChat 승인 ${bizchatTemplates.length}개, 총 ${allTemplates.length}개`);
      if (bizchatError) {
        console.warn(`[Templates/approved] BizChat 오류: ${bizchatError}`);
      }
      res.json(allTemplates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  const baseTemplateSchema = z.object({
    name: z.string().min(1).max(200),
    messageType: z.enum(["LMS", "MMS", "RCS"]),
    rcsType: z.number().optional(),
    title: z.string().max(30).optional(),
    lmsTitle: z.string().max(30).optional(),
    content: z.string().max(2000),
    lmsContent: z.string().max(2000).optional(),
    imageUrl: z.string().optional(),
    imageFileId: z.string().optional(),
    lmsImageUrl: z.string().optional(),
    lmsImageFileId: z.string().optional(),
    urlLinks: z.object({
      list: z.array(z.string()),
      reward: z.number().optional(),
    }).optional(),
    lmsUrlLinks: z.object({
      list: z.array(z.string()),
      reward: z.number().optional(),
    }).optional(),
    buttons: z.object({
      list: z.array(z.object({
        type: z.enum(["0", "1", "2"]),
        name: z.string(),
        val1: z.string(),
        val2: z.string().optional(),
      })),
    }).optional(),
  });

  const createTemplateSchema = baseTemplateSchema.refine((data) => {
    // RCS 이외의 유형에서는 content 필수
    if (data.messageType !== "RCS") {
      return data.content && data.content.trim().length > 0;
    }
    return true;
  }, {
    message: "메시지 내용을 입력해주세요",
    path: ["content"],
  }).refine((data) => {
    // RCS 유형에서는 lmsContent 필수
    if (data.messageType === "RCS") {
      return data.lmsContent && data.lmsContent.trim().length > 0;
    }
    return true;
  }, {
    message: "RCS 메시지의 경우 일반(LMS) 메시지도 필수로 입력해주세요",
    path: ["lmsContent"],
  }).refine((data) => {
    // RCS 유형에서는 content(RCS 메시지)도 필수
    if (data.messageType === "RCS") {
      return data.content && data.content.trim().length > 0;
    }
    return true;
  }, {
    message: "RCS 메시지의 경우 RCS 메시지도 필수로 입력해주세요",
    path: ["content"],
  });

  const updateTemplateSchema = baseTemplateSchema.partial();

  app.post("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const data = createTemplateSchema.parse(req.body);

      const template = await storage.createTemplate({
        userId,
        name: data.name,
        messageType: data.messageType,
        rcsType: data.rcsType,
        title: data.title,
        lmsTitle: data.lmsTitle,
        content: data.content,
        lmsContent: data.lmsContent,
        imageUrl: data.imageUrl,
        imageFileId: data.imageFileId,
        lmsImageUrl: data.lmsImageUrl,
        lmsImageFileId: data.lmsImageFileId,
        urlLinks: data.urlLinks,
        lmsUrlLinks: data.lmsUrlLinks,
        buttons: data.buttons,
        status: "draft",
      });

      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid template data", details: error.errors });
      }
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const data = updateTemplateSchema.parse(req.body);

      // RCS 메시지 업데이트 시 lmsContent 검증 (기존 템플릿과 병합하여 확인)
      const mergedData = { ...template, ...data };
      if (mergedData.messageType === "RCS" && (!mergedData.lmsContent || mergedData.lmsContent.trim().length === 0)) {
        return res.status(400).json({
          error: "Invalid template data",
          details: [{ path: ["lmsContent"], message: "RCS 메시지의 경우 일반(LMS) 메시지도 필수로 입력해주세요" }]
        });
      }

      const updatedTemplate = await storage.updateTemplate(req.params.id, data);
      res.json(updatedTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid template data", details: error.errors });
      }
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const template = await storage.getTemplate(req.params.id);

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (template.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  app.get("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaigns = await storage.getCampaigns(userId);
      const campaignsWithTargetingSummary = await Promise.all(
        campaigns.map(async (campaign) => {
          const campaignTargeting = await storage.getTargeting(campaign.id);
          const locationCount = campaignTargeting?.locationTypes?.length || 0;
          const regionCount = campaignTargeting?.regions?.length || 0;
          const interestCount =
            (campaignTargeting?.shopping11stCategories?.length || 0) +
            (campaignTargeting?.webappCategories?.length || 0) +
            (campaignTargeting?.callUsageTypes?.length || 0);
          const geofenceCount = campaignTargeting?.geofenceIds?.length || 0;

          const modeLabel =
            campaign.rcvType === 1
              ? "방문 위치 · 바로"
              : campaign.rcvType === 2
                ? "방문 위치 · 모아서"
                : locationCount > 0
                  ? `위치 ${locationCount}개`
                  : interestCount > 0
                    ? `관심사 ${interestCount}개`
                    : regionCount > 0
                      ? `${regionCount}개 지역`
                      : geofenceCount > 0
                        ? `방문 위치 ${geofenceCount}개`
                        : "기본 조건";

          return {
            ...campaign,
            targetingSummary: {
              modeLabel,
              locationCount,
              regionCount,
              interestCount,
              geofenceCount,
            },
          };
        }),
      );
      res.json(campaignsWithTargetingSummary);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      let campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const message = await storage.getMessage(campaign.id);
      const targeting = await storage.getTargeting(campaign.id);
      const report = await storage.getReport(campaign.id);

      res.json({
        ...campaign,
        message,
        targeting,
        report,
      });
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  const createCampaignSchema = z.object({
    name: z.string().min(1).max(200),
    templateId: z.string().min(1),
    messageType: z.enum(["LMS", "MMS", "RCS"]),
    sndNum: z.string().min(1),
    gender: z.enum(["all", "male", "female"]).default("all"),
    ageMin: z.number().min(10).max(100).default(20),
    ageMax: z.number().min(10).max(100).default(60),
    regions: z.array(z.string()).default([]),
    targetCount: z.number().min(1000).default(1000),
    budget: z.number().min(10000),
    scheduledAt: z.string().optional(),
    creationMode: z.enum(["recommended", "self"]).optional(),
    recommendedTemplateId: z.string().optional(),
    variableValues: z.record(z.any()).optional(),
    shopping11stCategories: z.array(z.any()).optional(),
    webappCategories: z.array(z.any()).optional(),
    callCategories: z.array(z.any()).optional(),
    locations: z.array(z.any()).optional(),
    profiling: z.array(z.any()).optional(),
    geofenceIds: z.array(z.string()).optional(),
    geofences: z.array(z.any()).optional(),
    mapticsSendType: z.enum(["realtime", "batch"]).optional(),
    rtStartHhmm: z.string().optional(),
    rtEndHhmm: z.string().optional(),
    sndDayDiv: z.number().optional(),
  });

  app.post("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const data = createCampaignSchema.parse(req.body);

      const template = await storage.getTemplate(data.templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // 시스템 템플릿(추천 템플릿)은 모든 사용자가 사용 가능
      const SYSTEM_USER_ID = 'system';
      if (template.userId !== userId && template.userId !== SYSTEM_USER_ID) {
        return res.status(403).json({ error: "Access denied to template" });
      }

      if (template.status !== "approved") {
        return res.status(400).json({ error: "Template must be approved before creating campaign" });
      }

      const resolvedVariableValues = data.variableValues || {};
      const missingVariables = getMissingRequiredTemplateVariables(template.variableSchema, resolvedVariableValues);
      if (missingVariables.length > 0) {
        return res.status(400).json({
          error: `${missingVariables.map((variable: any) => variable.label || variable.key).join(", ")} 항목을 입력해주세요`,
          code: "TEMPLATE_VARIABLES_REQUIRED",
        });
      }

      const resolvedTitle = replaceTemplateVariables(template.title, resolvedVariableValues);
      const resolvedContent = replaceTemplateVariables(template.content, resolvedVariableValues) || template.content;
      const resolvedLmsContent = replaceTemplateVariables(template.lmsContent, resolvedVariableValues);
      if (hasUnresolvedTemplateVariables(resolvedTitle, resolvedContent, resolvedLmsContent)) {
        return res.status(400).json({
          error: "템플릿에 아직 입력되지 않은 정보가 남아 있습니다",
          code: "TEMPLATE_VARIABLES_UNRESOLVED",
        });
      }

      const userBalance = parseFloat(user.balance as string || "0");
      const estimatedCost = data.targetCount * 50;
      const creditEstimate = calculateCampaignCredits(
        { targetCount: data.targetCount, templateCount: 1 },
        userBalance,
      );

      if (featureFlags.creditShadowLogEnabled) {
        console.info("[Credit shadow] campaign create estimate", {
          creditModeEnabled: featureFlags.creditModeEnabled,
          targetCount: data.targetCount,
          legacyEstimatedCost: estimatedCost,
          neededCredits: creditEstimate.neededCredits,
          isBelowMinimum: creditEstimate.isBelowMinimum,
          shortageCredits: creditEstimate.shortageCredits,
        });
      }

      if (featureFlags.creditModeEnabled) {
        if (creditEstimate.isBelowMinimum) {
          return res.status(400).json({
            error: `템플릿 1개는 최소 ${creditEstimate.minTargetCount.toLocaleString("ko-KR")}건부터 발송할 수 있습니다`,
          });
        }

        const creditSummary = await storage.getCreditSummary(userId);
        const effectiveAvailableCredits = creditSummary.hasLedger
          ? creditSummary.availableCredits
          : creditSummary.legacyBalance;

        if (effectiveAvailableCredits < creditEstimate.neededCredits) {
          return res.status(400).json({
            error: `크레딧이 부족합니다. ${creditEstimate.neededCredits.toLocaleString("ko-KR")}C가 필요합니다`,
          });
        }
      } else if (userBalance < estimatedCost) {
        return res.status(400).json({ error: "잔액이 부족합니다" });
      }

      const geofenceIds = data.geofenceIds?.length
        ? data.geofenceIds
        : (data.geofences || []).map((geofence: any) => String(geofence.id)).filter(Boolean);
      const hasGeofence = geofenceIds.length > 0;
      const rcvType = hasGeofence ? (data.mapticsSendType === "batch" ? 2 : 1) : 0;
      const mapticsStartDate = data.scheduledAt ? new Date(data.scheduledAt) : new Date();
      const mapticsEndDate = new Date(mapticsStartDate);
      mapticsEndDate.setDate(mapticsEndDate.getDate() + 7);

      const campaign = await storage.createCampaign({
        userId,
        name: data.name,
        templateId: data.templateId,
        messageType: data.messageType,
        sndNum: data.sndNum,
        statusCode: CAMPAIGN_STATUS.DRAFT.code,
        status: CAMPAIGN_STATUS.DRAFT.status,
        rcvType,
        sndGoalCnt: data.targetCount,
        sndGeofenceId: hasGeofence ? Number(geofenceIds[0]) : undefined,
        collStartDate: hasGeofence ? mapticsStartDate : undefined,
        collEndDate: hasGeofence ? mapticsEndDate : undefined,
        collSndDate: rcvType === 2 ? mapticsStartDate : undefined,
        rtStartHhmm: rcvType === 1 ? data.rtStartHhmm || "0900" : undefined,
        rtEndHhmm: rcvType === 1 ? data.rtEndHhmm || "2000" : undefined,
        sndDayDiv: rcvType === 1 ? data.sndDayDiv ?? 0 : undefined,
        targetCount: data.targetCount,
        budget: data.budget.toString(),
        creationMode: data.creationMode,
        recommendedTemplateId: data.recommendedTemplateId,
        variableValues: data.variableValues,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      });

      await storage.createMessage({
        campaignId: campaign.id,
        title: resolvedTitle,
        content: resolvedContent,
        imageUrl: template.imageUrl,
        imageFileId: template.imageFileId || null,
        urlLinks: template.urlLinks || null,
        buttons: template.buttons || null,
        lmsContent: resolvedLmsContent,
        lmsImageUrl: template.lmsImageUrl || null,
        lmsImageFileId: template.lmsImageFileId || null,
        lmsUrlLinks: template.lmsUrlLinks || null,
      });

      await storage.createTargeting({
        campaignId: campaign.id,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
        shopping11stCategories: data.shopping11stCategories?.map((category: any) => JSON.stringify(category)) || [],
        webappCategories: data.webappCategories?.map((category: any) => JSON.stringify(category)) || [],
        callUsageTypes: data.callCategories?.map((category: any) => JSON.stringify(category)) || [],
        locationTypes: data.locations?.map((location: any) => JSON.stringify(location)) || [],
        geofenceIds,
        atsQuery: hasGeofence ? JSON.stringify({ geofenceIds, rcvType }) : null,
      });

      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.patch("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      let campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updatedCampaign = await storage.updateCampaign(req.params.id, req.body);
      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (campaign.statusCode !== CAMPAIGN_STATUS.DRAFT.code) {
        return res.status(400).json({ error: "Only draft campaigns can be deleted" });
      }

      await storage.deleteCampaign(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  app.get("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const transactions = await storage.getTransactions(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/credits/policy", isAuthenticated, async (_req, res) => {
    res.json({
      enabled: featureFlags.creditModeEnabled,
      ...getCreditPolicySnapshot(),
    });
  });

  app.get("/api/credits/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const summary = await storage.getCreditSummary(userId);
      const effectiveAvailableCredits = summary.hasLedger
        ? summary.availableCredits
        : summary.legacyBalance;

      res.json({
        enabled: featureFlags.creditModeEnabled,
        effectiveAvailableCredits,
        ...summary,
      });
    } catch (error) {
      console.error("Error fetching credit summary:", error);
      res.status(500).json({ error: "Failed to fetch credit summary" });
    }
  });

  const devCreditGrantSchema = z.object({
    productType: z.string().refine(isCreditProductType, {
      message: "Invalid credit product type",
    }),
  });

  app.post("/api/credits/dev-grant", isAuthenticated, async (req, res) => {
    const allowDevCreditGrant = process.env.NODE_ENV !== "production" && featureFlags.creditModeEnabled;
    if (!allowDevCreditGrant) {
      return res.status(403).json({
        error: "Development credit grant API is disabled.",
      });
    }

    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { productType } = devCreditGrantSchema.parse(req.body);
      const product = getCreditProductForCheckout(productType);

      if (product.productType === "light") {
        const alreadyPurchased = await storage.hasPurchasedCreditProductInCurrentKstMonth(userId, "light");
        if (alreadyPurchased) {
          return res.status(400).json({
            error: "라이트 충전은 매월 1회만 지급할 수 있습니다",
          });
        }
      }

      const currentBalance = Number(user.balance || 0);
      const newBalance = currentBalance + product.priceKrw;
      const paymentReference = `dev-credit:${userId}:${product.productType}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2)}`;

      const transaction = await storage.createTransaction({
        userId,
        type: "charge",
        amount: product.priceKrw.toString(),
        balanceAfter: newBalance.toString(),
        description: `[로컬 테스트] ${product.name} 지급`,
        paymentMethod: "dev_credit_seed",
      });

      await storage.updateUserBalance(userId, newBalance.toString());

      const creditResult = await storage.grantPurchasedCreditsAtomically({
        userId,
        transactionId: transaction.id,
        productType: product.productType,
        credits: product.credits,
        expiresAt: getProductExpiryDate(new Date()),
        paymentReference,
        description: `[로컬 테스트] ${product.name} 크레딧 지급`,
      });

      if (!creditResult.success) {
        return res.status(400).json({
          error: creditResult.error || "크레딧 지급 중 오류가 발생했습니다",
        });
      }

      const summary = await storage.getCreditSummary(userId);

      res.status(201).json({
        success: true,
        product,
        transaction,
        grant: creditResult.grant,
        ledgerEntry: creditResult.ledgerEntry,
        summary,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error granting development credits:", error);
      res.status(500).json({ error: "Failed to grant development credits" });
    }
  });

  const creditEstimateSchema = z.object({
    targetCount: z.number().int().min(0),
    templateCount: z.number().int().min(1).default(1),
  });

  app.post("/api/credits/estimate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const data = creditEstimateSchema.parse(req.body);
      const availableCredits = Number(user.balance || 0);

      res.json({
        enabled: featureFlags.creditModeEnabled,
        estimate: estimateCampaignCreditAvailability({
          availableCredits,
          targetCount: data.targetCount,
          templateCount: data.templateCount,
        }),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error estimating credits:", error);
      res.status(500).json({ error: "Failed to estimate credits" });
    }
  });

  app.post("/api/transactions/charge", isAuthenticated, async (req, res) => {
    const allowDirectCharge = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DIRECT_CHARGE === 'true';
    if (!allowDirectCharge) {
      return res.status(403).json({
        error: 'Direct charge API is disabled. Please use payment checkout.',
      });
    }

    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { amount, paymentMethod } = req.body;

      if (!amount || amount < 10000) {
        return res.status(400).json({ error: "Minimum charge amount is 10,000 KRW" });
      }

      const currentBalance = parseFloat(user.balance as string || "0");
      const newBalance = currentBalance + amount;

      const transaction = await storage.createTransaction({
        userId,
        type: "charge",
        amount: amount.toString(),
        balanceAfter: newBalance.toString(),
        description: "잔액 충전",
        paymentMethod: paymentMethod || "card",
      });

      await storage.updateUserBalance(userId, newBalance.toString());

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error processing charge:", error);
      res.status(500).json({ error: "Failed to process charge" });
    }
  });

  // ============================================================
  // Refunds API - 환불 신청
  // ============================================================
  app.get("/api/refunds", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const refundList = await storage.getRefunds(userId);
      res.json(refundList);
    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ error: "환불 내역 조회 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/refunds", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
      }

      const { amount, reason, bankName, accountNumber, accountHolder } = req.body;

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 10000) {
        return res.status(400).json({ error: "환불 금액은 최소 10,000원 이상이어야 합니다" });
      }
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({ error: "환불 사유를 5자 이상 입력해주세요" });
      }
      if (!bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ error: "계좌 정보를 모두 입력해주세요" });
      }

      if (featureFlags.creditModeEnabled) {
        const creditSummary = await storage.getCreditSummary(userId);
        if (creditSummary.refundableCredits <= 0) {
          return res.status(400).json({
            error: "환불 가능한 크레딧이 없습니다. 예약 중이거나 이미 사용된 크레딧은 환불 신청에서 제외됩니다",
          });
        }

        if (numAmount > creditSummary.refundableAmountKrw) {
          return res.status(400).json({
            error: `환불 가능 금액은 최대 ${creditSummary.refundableAmountKrw.toLocaleString("ko-KR")}원입니다. 예약·사용된 크레딧은 제외됩니다`,
          });
        }
      } else {
        const currentBalance = Number(user.balance || 0);
        if (numAmount > currentBalance) {
          return res.status(400).json({ error: "환불 금액이 현재 잔액보다 많습니다" });
        }
      }

      const pendingRefund = await storage.getPendingRefundByUser(userId);
      if (pendingRefund) {
        return res.status(400).json({ error: "이미 처리 중인 환불 신청이 있습니다" });
      }

      const newRefund = await storage.createRefund({
        userId,
        amount: String(numAmount),
        reason: reason.trim(),
        bankName,
        accountNumber,
        accountHolder,
        status: "pending",
      });

      res.status(201).json({
        success: true,
        refund: newRefund,
        message: "환불 신청이 접수되었습니다. 영업일 기준 3-5일 내 처리됩니다.",
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ error: "환불 신청 중 오류가 발생했습니다" });
    }
  });

  // ============================================================
  // Tax Invoices API - 세금계산서 신청
  // ============================================================
  app.get("/api/tax-invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const invoiceList = await storage.getTaxInvoices(userId);
      res.json(invoiceList);
    } catch (error) {
      console.error("Error fetching tax invoices:", error);
      res.status(500).json({ error: "세금계산서 내역 조회 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/tax-invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { amount, buyerBusinessNumber, buyerCompanyName, buyerEmail } = req.body;

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 1000) {
        return res.status(400).json({ error: "발행 금액은 최소 1,000원 이상이어야 합니다" });
      }
      if (!buyerBusinessNumber || buyerBusinessNumber.replace(/-/g, '').length !== 10) {
        return res.status(400).json({ error: "올바른 사업자등록번호를 입력해주세요 (10자리)" });
      }
      if (!buyerCompanyName || buyerCompanyName.trim().length < 2) {
        return res.status(400).json({ error: "상호명을 입력해주세요" });
      }
      if (!buyerEmail || !buyerEmail.includes('@')) {
        return res.status(400).json({ error: "올바른 이메일 주소를 입력해주세요" });
      }

      const taxAmount = Math.floor(numAmount * 0.1);
      const totalAmount = numAmount + taxAmount;

      const newInvoice = await storage.createTaxInvoice({
        userId,
        issueDate: new Date(),
        amount: String(numAmount),
        taxAmount: String(taxAmount),
        totalAmount: String(totalAmount),
        buyerBusinessNumber: buyerBusinessNumber.replace(/-/g, ''),
        buyerCompanyName: buyerCompanyName.trim(),
        buyerEmail: buyerEmail.trim(),
        status: "requested",
      });

      res.status(201).json({
        success: true,
        taxInvoice: newInvoice,
        message: "세금계산서 발행 신청이 접수되었습니다. 영업일 기준 1-2일 내 발행됩니다.",
      });
    } catch (error) {
      console.error("Error creating tax invoice:", error);
      res.status(500).json({ error: "세금계산서 신청 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/targeting/estimate", isAuthenticated, async (req, res) => {
    try {
      const { gender, ageMin: rawAgeMin, ageMax: rawAgeMax, regions } = req.body;

      const ageMin = typeof rawAgeMin === 'number' ? rawAgeMin : 20;
      const ageMax = typeof rawAgeMax === 'number' ? rawAgeMax : 60;

      if (ageMin < 0 || ageMax < 0 || ageMin > 100 || ageMax > 100) {
        return res.status(400).json({ error: "나이는 0~100 사이여야 합니다" });
      }

      if (ageMin > ageMax) {
        return res.status(400).json({ error: "최소 나이가 최대 나이보다 클 수 없습니다" });
      }

      if (gender && !["all", "male", "female"].includes(gender)) {
        return res.status(400).json({ error: "성별은 all, male, female 중 하나여야 합니다" });
      }

      let baseAudience = 500000;

      if (gender === "male") {
        baseAudience = baseAudience * 0.52;
      } else if (gender === "female") {
        baseAudience = baseAudience * 0.48;
      }

      const ageRange = ageMax - ageMin;
      const ageMultiplier = Math.max(0.1, ageRange / 60);
      baseAudience = baseAudience * ageMultiplier;

      const regionPopulationShare: Record<string, number> = {
        "서울": 0.19, "경기": 0.26, "인천": 0.06, "부산": 0.07, "대구": 0.05,
        "광주": 0.03, "대전": 0.03, "울산": 0.02, "세종": 0.01,
        "강원": 0.03, "충북": 0.03, "충남": 0.04, "전북": 0.04, "전남": 0.04,
        "경북": 0.05, "경남": 0.07, "제주": 0.01
      };

      if (regions && Array.isArray(regions) && regions.length > 0) {
        let regionMultiplier = 0;
        for (const region of regions) {
          regionMultiplier += regionPopulationShare[region] || 0.03;
        }
        baseAudience = baseAudience * regionMultiplier;
      }

      const estimatedCount = Math.round(baseAudience);
      const minCount = Math.round(estimatedCount * 0.85);
      const maxCount = Math.round(estimatedCount * 1.15);

      res.json({
        estimatedCount: Math.max(1000, estimatedCount),
        minCount: Math.max(850, minCount),
        maxCount: Math.max(1150, maxCount),
        reachRate: 85 + Math.floor(Math.random() * 10),
      });
    } catch (error) {
      console.error("Error estimating targeting:", error);
      res.status(500).json({ error: "Failed to estimate targeting" });
    }
  });

  // ============================================================
  // ATS Meta API - BizChat API 연동용 메타데이터 조회
  // ============================================================

  // ATS 메타데이터 조회 (11st, webapp, call, loc, filter)
  app.get("/api/ats/meta/:metaType", isAuthenticated, async (req, res) => {
    try {
      const { metaType } = req.params;
      const validTypes = ["11st", "webapp", "call", "loc", "filter"];

      if (!validTypes.includes(metaType)) {
        return res.status(400).json({ error: "Invalid meta type" });
      }

      // 캐시된 메타데이터 조회
      const cachedMeta = await storage.getAtsMetaByType(metaType);

      // 캐시가 없으면 시뮬레이션 데이터 반환
      if (cachedMeta.length === 0) {
        const simulatedMeta = getSimulatedAtsMeta(metaType);
        res.json(simulatedMeta);
      } else {
        res.json(cachedMeta);
      }
    } catch (error) {
      console.error("Error fetching ATS meta:", error);
      res.status(500).json({ error: "Failed to fetch ATS meta" });
    }
  });

  // ATS 발송 모수 조회 (고도화된 타겟팅 기반)
  app.post("/api/ats/mosu", isAuthenticated, async (req, res) => {
    try {
      const {
        gender, ageMin, ageMax, regions, districts,
        carrierTypes, deviceTypes,
        shopping11stCategories, webappCategories, callUsageTypes,
        locationTypes, mobilityPatterns, geofenceIds
      } = req.body;

      let baseAudience = 16000000; // SK 광고 동의 고객 1,600만

      // 성별 필터
      if (gender === "male") baseAudience *= 0.52;
      else if (gender === "female") baseAudience *= 0.48;

      // 나이 필터
      const ageRange = (ageMax || 60) - (ageMin || 20);
      baseAudience *= Math.max(0.1, ageRange / 60);

      // 지역 필터
      if (regions?.length > 0) {
        const regionShare: Record<string, number> = {
          "서울": 0.19, "경기": 0.26, "인천": 0.06, "부산": 0.07, "대구": 0.05,
          "광주": 0.03, "대전": 0.03, "울산": 0.02, "세종": 0.01,
          "강원": 0.03, "충북": 0.03, "충남": 0.04, "전북": 0.04, "전남": 0.04,
          "경북": 0.05, "경남": 0.07, "제주": 0.01
        };
        const regionMultiplier = regions.reduce((sum: number, r: string) => sum + (regionShare[r] || 0.03), 0);
        baseAudience *= regionMultiplier;
      }

      // 시/군/구 필터 (추가 감소)
      if (districts?.length > 0) {
        baseAudience *= 0.3 * (districts.length / 5);
      }

      // 회선/기기 필터
      if (carrierTypes?.length > 0) baseAudience *= 0.6;
      if (deviceTypes?.length > 0) baseAudience *= 0.5;

      // 행동 데이터 필터 (각각 적용시 감소)
      if (shopping11stCategories?.length > 0) baseAudience *= 0.15;
      if (webappCategories?.length > 0) baseAudience *= 0.2;
      if (callUsageTypes?.length > 0) baseAudience *= 0.25;
      if (locationTypes?.length > 0) baseAudience *= 0.3;
      if (mobilityPatterns?.length > 0) baseAudience *= 0.35;

      // 지오펜스 필터 (가장 specific)
      if (geofenceIds?.length > 0) baseAudience *= 0.05 * geofenceIds.length;

      const estimatedCount = Math.round(Math.max(100, baseAudience));

      res.json({
        estimatedCount,
        minCount: Math.round(estimatedCount * 0.85),
        maxCount: Math.round(estimatedCount * 1.15),
        reachRate: 85 + Math.floor(Math.random() * 10),
        filterSummary: {
          demographics: !!(gender !== "all" || ageMin || ageMax || regions?.length),
          behavior: !!(shopping11stCategories?.length || webappCategories?.length || callUsageTypes?.length),
          location: !!(locationTypes?.length || mobilityPatterns?.length || geofenceIds?.length),
        }
      });
    } catch (error) {
      console.error("Error calculating ATS mosu:", error);
      res.status(500).json({ error: "Failed to calculate targeting audience" });
    }
  });

  // ============================================================
  // Maptics API - 지오펜스 관리
  // ============================================================

  // POI 검색 (시뮬레이션)
  app.post("/api/maptics/poi", isAuthenticated, async (req, res) => {
    try {
      const { keyword, latitude, longitude, radius } = req.body;

      // 시뮬레이션 POI 데이터
      const simulatedPois = [
        { id: "poi_001", name: `${keyword} 강남점`, category: "매장", lat: 37.4979, lng: 127.0276, distance: 120 },
        { id: "poi_002", name: `${keyword} 홍대점`, category: "매장", lat: 37.5563, lng: 126.9220, distance: 350 },
        { id: "poi_003", name: `${keyword} 명동점`, category: "매장", lat: 37.5636, lng: 126.9869, distance: 480 },
        { id: "poi_004", name: `${keyword} 판교점`, category: "매장", lat: 37.3947, lng: 127.1114, distance: 890 },
        { id: "poi_005", name: `${keyword} 잠실점`, category: "매장", lat: 37.5133, lng: 127.1001, distance: 1200 },
      ];

      res.json({
        pois: simulatedPois,
        totalCount: simulatedPois.length,
      });
    } catch (error) {
      console.error("Error searching POI:", error);
      res.status(500).json({ error: "Failed to search POI" });
    }
  });

  // 지오펜스 목록 조회
  app.get("/api/geofences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const geofenceList = await storage.getGeofences(userId);
      res.json(geofenceList);
    } catch (error) {
      console.error("Error fetching geofences:", error);
      res.status(500).json({ error: "Failed to fetch geofences" });
    }
  });

  // 지오펜스 생성
  const geofenceSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    latitude: z.string().or(z.number()),
    longitude: z.string().or(z.number()),
    radius: z.number().min(100).max(5000).default(500),
    poiId: z.string().optional(),
    poiName: z.string().optional(),
    poiCategory: z.string().optional(),
  });

  app.post("/api/geofences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const data = geofenceSchema.parse(req.body);

      const geofence = await storage.createGeofence({
        userId,
        name: data.name,
        description: data.description,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        radius: data.radius,
        poiId: data.poiId,
        poiName: data.poiName,
        poiCategory: data.poiCategory,
        bizchatGeofenceId: `GF${Date.now()}`,
      });

      res.json(geofence);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid geofence data", details: error.errors });
      }
      console.error("Error creating geofence:", error);
      res.status(500).json({ error: "Failed to create geofence" });
    }
  });

  // 지오펜스 수정
  app.patch("/api/geofences/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const geofence = await storage.getGeofence(req.params.id);

      if (!geofence) {
        return res.status(404).json({ error: "Geofence not found" });
      }

      if (geofence.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updateSchema = geofenceSchema.partial();
      const data = updateSchema.parse(req.body);

      const updated = await storage.updateGeofence(req.params.id, {
        ...data,
        latitude: data.latitude ? String(data.latitude) : undefined,
        longitude: data.longitude ? String(data.longitude) : undefined,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid geofence data", details: error.errors });
      }
      console.error("Error updating geofence:", error);
      res.status(500).json({ error: "Failed to update geofence" });
    }
  });

  // 지오펜스 삭제
  app.delete("/api/geofences/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const geofence = await storage.getGeofence(req.params.id);

      if (!geofence) {
        return res.status(404).json({ error: "Geofence not found" });
      }

      if (geofence.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteGeofence(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting geofence:", error);
      res.status(500).json({ error: "Failed to delete geofence" });
    }
  });

  const testSendSchema = z.object({
    templateId: z.string().min(1),
    phoneNumber: z.string().min(1),
  });

  app.post("/api/test-send", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const data = testSendSchema.parse(req.body);

      const cleanPhone = data.phoneNumber.replace(/-/g, '');
      if (!/^01[0-9]{8,9}$/.test(cleanPhone)) {
        return res.status(400).json({ error: "올바른 휴대폰 번호 형식이 아니에요 (예: 010-1234-5678)" });
      }

      const template = await storage.getTemplate(data.templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const SYSTEM_USER_ID = 'system';
      if (template.userId !== userId && template.userId !== SYSTEM_USER_ID) {
        return res.status(403).json({ error: "Access denied to template" });
      }

      if (template.status !== "approved") {
        return res.status(400).json({ error: "Template must be approved before sending test message" });
      }

      console.log(`Test send requested: Template ${template.name} to ${data.phoneNumber}`);

      res.json({
        success: true,
        message: "테스트 메시지를 발송했어요",
        templateId: data.templateId,
        phoneNumber: data.phoneNumber,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error sending test message:", error);
      res.status(500).json({ error: "Failed to send test message" });
    }
  });

  app.post("/api/campaigns/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!campaign.sndNum) {
        return res.status(400).json({ error: "발신번호를 선택한 캠페인만 검수 요청할 수 있어요" });
      }

      if (campaign.statusCode === CAMPAIGN_STATUS.APPROVAL_REQUESTED.code) {
        if (featureFlags.creditModeEnabled) {
          const creditEstimate = calculateCampaignCredits({
            targetCount: campaign.targetCount || 0,
            templateCount: 1,
          });

          if (creditEstimate.isBelowMinimum) {
            return res.status(400).json({
              error: `템플릿 1개는 최소 ${creditEstimate.minTargetCount.toLocaleString("ko-KR")}건부터 검수 요청할 수 있어요`,
            });
          }

          const reserveResult = await storage.reserveCampaignCreditsAtomically({
            userId,
            campaignId: req.params.id,
            neededCredits: creditEstimate.neededCredits,
            description: `캠페인 승인요청 예약: ${campaign.name}`,
          });

          if (!reserveResult.success) {
            return res.status(400).json({
              error: reserveResult.error || "크레딧 예약 중 문제가 생겼어요. 보유 크레딧을 확인해주세요.",
            });
          }
        }

        return res.json(campaign);
      }

      if (campaign.statusCode !== CAMPAIGN_STATUS.DRAFT.code) {
        return res.status(400).json({ error: "임시 저장 또는 반려 상태의 캠페인만 검수 요청할 수 있어요" });
      }

      let creditEstimate: ReturnType<typeof calculateCampaignCredits> | null = null;

      if (featureFlags.creditModeEnabled) {
        creditEstimate = calculateCampaignCredits({
          targetCount: campaign.targetCount || 0,
          templateCount: 1,
        });

        if (creditEstimate.isBelowMinimum) {
          return res.status(400).json({
            error: `템플릿 1개는 최소 ${creditEstimate.minTargetCount.toLocaleString("ko-KR")}건부터 검수 요청할 수 있어요`,
          });
        }
      }

      const bizchatCampaignId = `BZ${Date.now()}${Math.random().toString(36).substring(7).toUpperCase()}`;

      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
        status: CAMPAIGN_STATUS.APPROVAL_REQUESTED.status,
        bizchatCampaignId,
        scheduledAt: req.body?.scheduledAt ? new Date(req.body.scheduledAt) : campaign.scheduledAt,
      });

      if (featureFlags.creditModeEnabled && creditEstimate) {
        const reserveResult = await storage.reserveCampaignCreditsAtomically({
          userId,
          campaignId: req.params.id,
          neededCredits: creditEstimate.neededCredits,
          description: `캠페인 승인요청 예약: ${campaign.name}`,
        });

        if (!reserveResult.success) {
          await storage.updateCampaign(req.params.id, {
            statusCode: CAMPAIGN_STATUS.DRAFT.code,
            status: CAMPAIGN_STATUS.DRAFT.status,
          });

          return res.status(400).json({
            error: reserveResult.error || "크레딧 예약 중 문제가 생겼어요. 보유 크레딧을 확인해주세요.",
          });
        }
      }

      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error submitting campaign:", error);
      res.status(500).json({ error: "Failed to submit campaign" });
    }
  });

  app.post("/api/campaigns/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const statusCode = campaign.statusCode;
      if (statusCode === CAMPAIGN_STATUS.APPROVED.code ||
          statusCode === CAMPAIGN_STATUS.RUNNING.code ||
          statusCode === CAMPAIGN_STATUS.COMPLETED.code) {
        return res.json(campaign);
      }

      if (statusCode !== CAMPAIGN_STATUS.APPROVAL_REQUESTED.code) {
        return res.status(400).json({ error: "Only pending campaigns can be approved" });
      }

      let creditEstimate: ReturnType<typeof calculateCampaignCredits> | null = null;

      if (featureFlags.creditModeEnabled) {
        creditEstimate = calculateCampaignCredits({
          targetCount: campaign.targetCount || 0,
          templateCount: 1,
        });

        if (creditEstimate.isBelowMinimum) {
          return res.status(400).json({
            error: `템플릿 1개는 최소 ${creditEstimate.minTargetCount.toLocaleString("ko-KR")}건부터 예약할 수 있습니다`,
          });
        }

        if (campaign.scheduledAt) {
          const creditSummary = await storage.getCreditSummary(userId);
          const effectiveAvailableCredits = creditSummary.hasLedger
            ? creditSummary.availableCredits
            : creditSummary.legacyBalance;

          if (effectiveAvailableCredits < creditEstimate.neededCredits) {
            return res.status(400).json({
              error: `크레딧이 부족합니다. ${creditEstimate.neededCredits.toLocaleString("ko-KR")}C가 필요합니다`,
            });
          }
        }
      }

      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.APPROVED.code,
        status: CAMPAIGN_STATUS.APPROVED.status,
      });

      if (featureFlags.creditModeEnabled && updatedCampaign?.scheduledAt && creditEstimate) {
        const reserveResult = await storage.reserveCampaignCreditsAtomically({
          userId,
          campaignId: req.params.id,
          neededCredits: creditEstimate.neededCredits,
          description: `캠페인 예약: ${updatedCampaign.name}`,
        });

        if (!reserveResult.success) {
          await storage.updateCampaign(req.params.id, {
            statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
            status: CAMPAIGN_STATUS.APPROVAL_REQUESTED.status,
          });

          return res.status(400).json({
            error: reserveResult.error || "예약 크레딧 처리 중 오류가 발생했습니다",
          });
        }
      }

      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error approving campaign:", error);
      res.status(500).json({ error: "Failed to approve campaign" });
    }
  });

  app.post("/api/campaigns/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (
        campaign.statusCode === CAMPAIGN_STATUS.RUNNING.code ||
        campaign.statusCode === CAMPAIGN_STATUS.COMPLETED.code
      ) {
        return res.status(400).json({ error: "이미 발송이 시작된 캠페인은 취소할 수 없습니다" });
      }

      if (featureFlags.creditModeEnabled) {
        const releaseResult = await storage.releaseCampaignReservedCreditsAtomically({
          userId,
          campaignId: req.params.id,
          description: `캠페인 예약 취소: ${campaign.name}`,
        });

        if (!releaseResult.success || !releaseResult.campaign) {
          return res.status(400).json({
            error: releaseResult.error || "예약 크레딧 해제 중 오류가 발생했습니다",
          });
        }

        return res.json(releaseResult.campaign);
      }

      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.CANCELLED.code,
        status: CAMPAIGN_STATUS.CANCELLED.status,
      });

      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error cancelling campaign:", error);
      res.status(500).json({ error: "Failed to cancel campaign" });
    }
  });

  app.post("/api/campaigns/:id/start", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      let campaign = await storage.getCampaign(req.params.id);

      if (!campaign || !user) {
        return res.status(404).json({ error: "Campaign or user not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const statusCode = campaign.statusCode;
      if (statusCode === CAMPAIGN_STATUS.RUNNING.code || statusCode === CAMPAIGN_STATUS.COMPLETED.code) {
        return res.json(campaign);
      }

      const autoStartableStatusCodes = new Set<number>([
        CAMPAIGN_STATUS.DRAFT.code,
        CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
        CAMPAIGN_STATUS.APPROVED.code,
      ]);
      if (!autoStartableStatusCodes.has(statusCode ?? CAMPAIGN_STATUS.DRAFT.code)) {
        return res.status(400).json({ error: "발송 가능한 상태의 캠페인만 시작할 수 있어요" });
      }

      if (!campaign.sndNum) {
        return res.status(400).json({ error: "발신번호를 선택하면 발송할 수 있어요" });
      }

      if (statusCode !== CAMPAIGN_STATUS.APPROVED.code) {
        const approvedCampaign = await storage.updateCampaign(req.params.id, {
          statusCode: CAMPAIGN_STATUS.APPROVED.code,
          status: CAMPAIGN_STATUS.APPROVED.status,
        });
        if (!approvedCampaign) {
          return res.status(400).json({ error: "캠페인 상태를 다시 확인해요" });
        }
        campaign = approvedCampaign;
      }

      const creditEstimate = calculateCampaignCredits({
        targetCount: campaign.targetCount || 0,
        templateCount: 1,
      });
      const estimatedCost = campaign.targetCount * parseFloat(campaign.costPerMessage || "50");
      const userBalance = parseFloat(user.balance as string || "0");

      if (featureFlags.creditModeEnabled) {
        if (creditEstimate.isBelowMinimum) {
          return res.status(400).json({
            error: `템플릿 1개는 최소 ${creditEstimate.minTargetCount.toLocaleString("ko-KR")}건부터 발송할 수 있어요`,
          });
        }

      } else if (userBalance < estimatedCost) {
        return res.status(400).json({ error: "잔액이 부족합니다" });
      }

      const sentCount = campaign.targetCount;
      const successCount = Math.floor(sentCount * (0.85 + Math.random() * 0.12));

      let updatedCampaign;

      if (featureFlags.creditModeEnabled) {
        const creditUseResult = await storage.startCampaignWithCreditUseAtomically({
          userId,
          campaignId: req.params.id,
          neededCredits: creditEstimate.neededCredits,
          sentCount,
          successCount,
          description: `캠페인 발송: ${campaign.name}`,
        });

        if (!creditUseResult.success || !creditUseResult.campaign) {
          return res.status(400).json({
            error: creditUseResult.error || "크레딧 차감 중 오류가 발생했습니다",
          });
        }

        updatedCampaign = creditUseResult.campaign;
      } else {
        updatedCampaign = await storage.updateCampaign(req.params.id, {
          statusCode: CAMPAIGN_STATUS.RUNNING.code,
          status: CAMPAIGN_STATUS.RUNNING.status,
          sentCount,
          successCount,
          scheduledAt: new Date(),
        });

        await storage.updateUserBalance(userId, (userBalance - estimatedCost).toString());

        await storage.createTransaction({
          userId,
          type: "usage",
          amount: (-estimatedCost).toString(),
          balanceAfter: (userBalance - estimatedCost).toString(),
          description: `캠페인 발송: ${campaign.name}`,
        });
      }

      await storage.createReport({
        campaignId: req.params.id,
        sentCount,
        deliveredCount: successCount,
        failedCount: sentCount - successCount,
        clickCount: Math.floor(successCount * (0.02 + Math.random() * 0.05)),
        optOutCount: Math.floor(successCount * Math.random() * 0.005),
      });

      setTimeout(async () => {
        try {
          const currentCampaign = await storage.getCampaign(req.params.id);
          if (currentCampaign?.statusCode === CAMPAIGN_STATUS.RUNNING.code) {
            await storage.updateCampaign(req.params.id, {
              statusCode: CAMPAIGN_STATUS.COMPLETED.code,
              status: CAMPAIGN_STATUS.COMPLETED.status,
              completedAt: new Date(),
            });
          }
        } catch (err) {
          console.error("Failed to complete campaign:", err);
        }
      }, 10000);

      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error starting campaign:", error);
      res.status(500).json({ error: "Failed to start campaign" });
    }
  });

  app.post("/api/campaigns/:id/stop", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (campaign.statusCode === CAMPAIGN_STATUS.COMPLETED.code) {
        return res.status(400).json({ error: "이미 완료된 캠페인은 중단할 수 없습니다" });
      }

      const updatedCampaign = await storage.updateCampaign(req.params.id, {
        statusCode: CAMPAIGN_STATUS.STOPPED.code,
        status: CAMPAIGN_STATUS.STOPPED.status,
      });

      res.json(updatedCampaign);
    } catch (error) {
      console.error("Error stopping campaign:", error);
      res.status(500).json({ error: "Failed to stop campaign" });
    }
  });

  app.post("/api/campaigns/:id/fail", isAuthenticated, async (req, res) => {
    try {
      const internalSecret = req.headers["x-internal-secret"];
      const isAllowedInternalCall =
        process.env.NODE_ENV !== "production" ||
        (
          typeof internalSecret === "string" &&
          Boolean(process.env.CRON_SECRET) &&
          internalSecret === process.env.CRON_SECRET
        );

      if (!isAllowedInternalCall) {
        return res.status(403).json({ error: "Internal recovery endpoint only" });
      }

      const userId = (req as any).userId;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const reason = typeof req.body?.reason === "string"
        ? req.body.reason
        : "internal_failure";
      const allowedReasons = new Set(["internal_failure", "skt_receipt_failure", "partial_delivery_failure"]);

      if (!allowedReasons.has(reason)) {
        return res.status(400).json({ error: "지원하지 않는 실패 사유입니다" });
      }
      const chargeableCount =
        req.body?.chargeableCount ??
        req.body?.acceptedCount ??
        req.body?.processedCount;
      const restoreCredits =
        reason === "partial_delivery_failure"
          ? calculateCampaignCredits({
              targetCount: Math.max(0, (campaign.targetCount || 0) - Number(chargeableCount || 0)),
              templateCount: 1,
            }).neededCredits
          : undefined;

      if (reason === "partial_delivery_failure") {
        const numericChargeableCount = Number(chargeableCount);
        if (
          !Number.isFinite(numericChargeableCount) ||
          numericChargeableCount < 0 ||
          numericChargeableCount > (campaign.targetCount || 0)
        ) {
          return res.status(400).json({
            error: "부분 복구에는 0 이상 발송 목표 이하의 chargeableCount가 필요합니다",
          });
        }
      }

      if (!featureFlags.creditModeEnabled) {
        const updatedCampaign = await storage.updateCampaign(req.params.id, {
          statusCode: CAMPAIGN_STATUS.STOPPED.code,
          status: CAMPAIGN_STATUS.STOPPED.status,
        });
        return res.json(updatedCampaign);
      }

      const restoreResult = await storage.restoreCampaignUsedCreditsAtomically({
        userId,
        campaignId: req.params.id,
        reason,
        description: reason === "skt_receipt_failure"
          ? `SKT 접수 실패 복구: ${campaign.name}`
          : reason === "partial_delivery_failure"
            ? `잔여 발송분 복구: ${campaign.name}`
            : `내부 오류 발송 복구: ${campaign.name}`,
        restoreCredits,
        statusCode: CAMPAIGN_STATUS.STOPPED.code,
        status: CAMPAIGN_STATUS.STOPPED.status,
      });

      if (!restoreResult.success || !restoreResult.campaign) {
        return res.status(400).json({
          error: restoreResult.error || "크레딧 복구 중 오류가 발생했습니다",
        });
      }

      res.json({
        ...restoreResult.campaign,
        restoredCredits: restoreResult.restoredCredits || 0,
      });
    } catch (error) {
      console.error("Error failing campaign:", error);
      res.status(500).json({ error: "Failed to restore failed campaign" });
    }
  });

  app.post("/api/campaigns/:id/test-send", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { phoneNumber } = req.body;
      const campaign = await storage.getCampaign(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!phoneNumber) {
        return res.status(400).json({ error: "휴대폰 번호를 입력해주세요" });
      }

      res.json({
        success: true,
        message: `${phoneNumber}로 테스트 메시지를 발송했어요`,
        testId: `TEST${Date.now()}`,
      });
    } catch (error) {
      console.error("Error sending test message:", error);
      res.status(500).json({ error: "Failed to send test message" });
    }
  });

  // Template-based test send (before campaign creation)
  app.post("/api/test-send", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { templateId, phoneNumber } = req.body;

      if (!templateId) {
        return res.status(400).json({ error: "템플릿을 선택해주세요" });
      }

      if (!phoneNumber) {
        return res.status(400).json({ error: "휴대폰 번호를 입력해주세요" });
      }

      // Validate phone number format (Korean mobile: 010-XXXX-XXXX or 01XXXXXXXXX)
      const cleanPhone = phoneNumber.replace(/-/g, '');
      if (!/^01[0-9]{8,9}$/.test(cleanPhone)) {
        return res.status(400).json({ error: "올바른 휴대폰 번호 형식이 아니에요 (예: 010-1234-5678)" });
      }

      const template = await storage.getTemplate(templateId);

      if (!template) {
        return res.status(404).json({ error: "템플릿을 찾을 수 없어요" });
      }

      const SYSTEM_USER_ID = 'system';
      if (template.userId !== userId && template.userId !== SYSTEM_USER_ID) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (template.status !== "approved") {
        return res.status(400).json({ error: "승인된 템플릿만 테스트 발송이 가능해요" });
      }

      // Mock test send - in production, this would call BizChat API
      res.json({
        success: true,
        message: `${phoneNumber}로 테스트 메시지를 발송했어요`,
        testId: `TEST${Date.now()}`,
        template: {
          name: template.name,
          messageType: template.messageType,
        },
      });
    } catch (error) {
      console.error("Error sending test message:", error);
      res.status(500).json({ error: "테스트 발송에 실패했어요" });
    }
  });

  app.get("/api/reports/export", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const campaigns = await storage.getCampaigns(userId);

      const completedCampaigns = campaigns.filter(c =>
        c.status === 'completed' || c.status === 'running'
      );

      if (completedCampaigns.length === 0) {
        return res.status(404).json({ error: "내보낼 리포트 데이터가 없습니다" });
      }

      let csvContent = "캠페인ID,캠페인명,상태,메시지유형,발송대상수,발송수,성공수,실패수,클릭수,필요크레딧,생성일,완료일\n";

      for (const campaign of completedCampaigns) {
        const report = await storage.getReport(campaign.id);
        const neededCredits = calculateCampaignCredits({
          targetCount: campaign.targetCount || 0,
        }).neededCredits;
        csvContent += [
          campaign.id,
          `"${campaign.name.replace(/"/g, '""')}"`,
          campaign.status,
          campaign.messageType,
          campaign.targetCount,
          campaign.sentCount || 0,
          campaign.successCount || 0,
          report?.failedCount || 0,
          report?.clickCount || 0,
          neededCredits,
          campaign.createdAt?.toISOString() || '',
          campaign.completedAt?.toISOString() || '',
        ].join(",") + "\n";
      }

      const bom = '\ufeff';

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=campaign-report-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(bom + csvContent);
    } catch (error) {
      console.error("Error exporting reports:", error);
      res.status(500).json({ error: "Failed to export reports" });
    }
  });

  // File Upload routes
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const allowedDocTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];

      if (allowedImageTypes.includes(file.mimetype) || allowedDocTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('지원하지 않는 파일 형식입니다'));
      }
    },
  });

  app.post("/api/files/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const file = req.file;
      const fileType = req.body.fileType || 'image';

      if (!file) {
        return res.status(400).json({ error: "파일이 없습니다" });
      }

      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(',') || [];
      const publicDir = publicPaths[0];

      if (!privateDir || !publicDir) {
        return res.status(500).json({ error: "Object Storage가 설정되지 않았습니다" });
      }

      const ext = path.extname(file.originalname);
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;

      const isImage = fileType === 'image';
      const targetDir = isImage ? publicDir : privateDir;
      const storagePath = path.join(targetDir, filename);

      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.writeFile(storagePath, file.buffer);

      const fileRecord = await storage.createFile({
        userId,
        fileType,
        originalName: file.originalname,
        storagePath,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      res.json(fileRecord);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "파일 업로드에 실패했습니다" });
    }
  });

  app.get("/api/files", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const files = await storage.getFiles(userId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.get("/api/files/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const file = await storage.getFile(req.params.id);

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      if (file.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(file);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  app.delete("/api/files/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const file = await storage.getFile(req.params.id);

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      if (file.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      try {
        await fs.unlink(file.storagePath);
      } catch (fsError) {
        console.warn("Failed to delete file from storage:", fsError);
      }

      await storage.deleteFile(file.id);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/stripe/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error getting Stripe config:", error);
      res.status(500).json({ error: "Failed to get Stripe config" });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      const { amount, productType } = req.body;

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!amount || amount < 10000) {
        return res.status(400).json({ error: "최소 충전 금액은 10,000원입니다" });
      }

      const creditProduct = typeof productType === "string" && isCreditProductType(productType)
        ? getCreditProductForCheckout(productType)
        : null;

      if (featureFlags.creditModeEnabled && !creditProduct) {
        return res.status(400).json({ error: "크레딧 상품을 선택해주세요" });
      }

      if (creditProduct && creditProduct.priceKrw !== amount) {
        return res.status(400).json({ error: "상품 금액이 올바르지 않습니다" });
      }

      if (
        featureFlags.creditModeEnabled &&
        creditProduct?.productType === "light" &&
        await storage.hasPurchasedCreditProductInCurrentKstMonth(userId, "light")
      ) {
        return res.status(400).json({
          error: "라이트 충전은 매월 1회만 구매할 수 있습니다",
        });
      }

      const stripe = await getUncachableStripeClient();

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserStripeCustomerId(userId, customerId);
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'krw',
              product_data: {
                name: creditProduct ? `BizChat ${creditProduct.name}` : 'BizChat 잔액 충전',
                description: creditProduct
                  ? `${creditProduct.credits.toLocaleString()}C · ${amount.toLocaleString()}원`
                  : `${amount.toLocaleString()}원 충전`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/billing?success=true&amount=${amount}`,
        cancel_url: `${baseUrl}/billing?canceled=true`,
        metadata: {
          userId,
          amount: amount.toString(),
          type: 'balance_charge',
          ...(creditProduct ? {
            productType: creditProduct.productType,
            credits: creditProduct.credits.toString(),
          } : {}),
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // ============================================================
  // BizChat Sender API - BizChat 발신번호 조회 (읽기 전용)
  // ============================================================
  app.post("/api/bizchat/sender", isAuthenticated, async (req, res) => {
    try {
      const action = req.body.action || "list";
      const useProduction = req.body.env === "prod" || req.query.env === "prod";

      const baseUrl = useProduction
        ? (process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr")
        : (process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443");

      const apiKey = useProduction
        ? process.env.BIZCHAT_PROD_API_KEY
        : process.env.BIZCHAT_DEV_API_KEY;

      // 실제 BizChat 발신번호 코드 매핑 (API 문서 기준)
      // 캠페인 생성 시 sndNum에 id(발신번호코드)를 사용해야 함
      const BIZCHAT_SENDER_NUMBERS = [
        { id: "001001", num: "16700823", name: "SK텔레콤 혜택 알림", state: 1 },
        { id: "001005", num: "16702305", name: "SK텔레콤 우리 동네 혜택 알림", state: 1 },
      ];

      if (!apiKey) {
        console.log("[BizChat Sender] No API key configured, returning simulated data");
        return res.status(200).json({
          success: true,
          action: "list",
          senderNumbers: BIZCHAT_SENDER_NUMBERS,
          message: "Using simulated data (no API key configured)",
        });
      }

      const FALLBACK_SENDER_NUMBERS = BIZCHAT_SENDER_NUMBERS;

      if (action === "list") {
        const tid = Date.now().toString();
        const url = `${baseUrl}/api/v1/sndnum/list?tid=${tid}`;

        console.log(`[BizChat Sender] POST ${url}`);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: apiKey,
            },
            body: JSON.stringify({}),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const data = await response.json();
          console.log(`[BizChat Sender] Response:`, JSON.stringify(data).substring(0, 300));

          if (data.code === "S000001" && data.data?.list?.length > 0) {
            return res.status(200).json({
              success: true,
              action: "list",
              senderNumbers: data.data.list,
              rawResponse: data,
            });
          } else {
            console.log("[BizChat Sender] No data from API, returning fallback");
            return res.status(200).json({
              success: true,
              action: "list",
              senderNumbers: FALLBACK_SENDER_NUMBERS,
              message: "Using fallback data (API returned empty list)",
            });
          }
        } catch (fetchError) {
          console.log("[BizChat Sender] API timeout/error, returning fallback:", fetchError);
          return res.status(200).json({
            success: true,
            action: "list",
            senderNumbers: FALLBACK_SENDER_NUMBERS,
            message: "Using fallback data (API connection failed)",
          });
        }
      }

      res.status(400).json({ error: "Invalid action. Only 'list' is supported." });
    } catch (error) {
      console.error("[BizChat Sender] Error:", error);
      // 에러 발생 시에도 실제 BizChat 발신번호 코드 반환
      return res.status(200).json({
        success: true,
        action: "list",
        senderNumbers: [
          { id: "001001", num: "16700823", name: "SK텔레콤 혜택 알림", state: 1 },
          { id: "001005", num: "16702305", name: "SK텔레콤 우리 동네 혜택 알림", state: 1 },
        ],
        message: "Using fallback data (error occurred)",
      });
    }
  });

  // ============================================================
  // BizChat Campaign API - 캠페인 생성/승인/통계 조회
  // ============================================================
  app.post("/api/bizchat/campaigns", isAuthenticated, async (req, res) => {
    try {
      const { action, campaignId, ...params } = req.body;
      const useProduction = req.body.env === "prod" || req.query.env === "prod";

      const baseUrl = useProduction
        ? (process.env.BIZCHAT_PROD_API_URL || "https://gw.bizchat1.co.kr")
        : (process.env.BIZCHAT_DEV_API_URL || "https://gw-dev.bizchat1.co.kr:8443");

      const apiKey = useProduction
        ? process.env.BIZCHAT_PROD_API_KEY
        : process.env.BIZCHAT_DEV_API_KEY;

      // Simulation mode if no API key
      if (!apiKey) {
        console.log("[BizChat Campaigns] No API key, returning simulation response");
        return res.json(simulateBizChatCampaignAction(action, campaignId));
      }

      const tid = Date.now().toString();

      switch (action) {
        case "stats": {
          const campaign = campaignId ? await storage.getCampaign(campaignId) : null;
          if (!campaign?.bizchatCampaignId) {
            return res.json({
              success: true,
              result: {
                code: "S000001",
                data: {
                  sendCnt: campaign?.sentCount || 0,
                  successCnt: campaign?.successCount || 0,
                  failCnt: (campaign?.sentCount || 0) - (campaign?.successCount || 0),
                  waitCnt: 0,
                  readCnt: Math.floor((campaign?.successCount || 0) * 0.1),
                  settleCnt: campaign?.successCount || 0,
                },
              },
              message: "Using local data (no BizChat campaign ID)",
            });
          }

          const url = `${baseUrl}/api/v1/cmpn/stat/read?id=${campaign.bizchatCampaignId}&tid=${tid}`;
          console.log(`[BizChat Stats] GET ${url}`);

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
              method: "GET",
              headers: { Authorization: apiKey },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log(`[BizChat Stats] Response:`, JSON.stringify(data).substring(0, 300));

            return res.json({
              success: data.code === "S000001",
              result: data,
            });
          } catch (fetchError) {
            console.log("[BizChat Stats] API error, using local data:", fetchError);
            return res.json({
              success: true,
              result: {
                code: "S000001",
                data: {
                  sendCnt: campaign.sentCount || 0,
                  successCnt: campaign.successCount || 0,
                  failCnt: (campaign.sentCount || 0) - (campaign.successCount || 0),
                  waitCnt: 0,
                  readCnt: Math.floor((campaign.successCount || 0) * 0.1),
                  settleCnt: campaign.successCount || 0,
                },
              },
              message: "Using local data (API connection failed)",
            });
          }
        }

        case "create": {
          // BizChat 캠페인 생성 - 실제 API 호출
          const url = `${baseUrl}/api/v1/cmpn/cud?tid=${tid}`;
          console.log(`[BizChat Create] POST ${url}`);

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Authorization": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(params),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log(`[BizChat Create] Response:`, JSON.stringify(data).substring(0, 300));

            return res.json({
              success: data.code === "S000001",
              bizchatCampaignId: data.data?.id,
              result: data,
            });
          } catch (fetchError) {
            console.log("[BizChat Create] API error, using simulation:", fetchError);
            return res.json(simulateBizChatCampaignAction("create", campaignId));
          }
        }

        case "approve": {
          // BizChat 캠페인 승인 요청
          const campaign = campaignId ? await storage.getCampaign(campaignId) : null;
          if (!campaign?.bizchatCampaignId) {
            return res.json(simulateBizChatCampaignAction("approve", campaignId));
          }

          const url = `${baseUrl}/api/v1/cmpn/approve?id=${campaign.bizchatCampaignId}&tid=${tid}`;
          console.log(`[BizChat Approve] POST ${url}`);

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
              method: "POST",
              headers: { Authorization: apiKey },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log(`[BizChat Approve] Response:`, JSON.stringify(data).substring(0, 300));

            return res.json({
              success: data.code === "S000001",
              result: data,
            });
          } catch (fetchError) {
            console.log("[BizChat Approve] API error, using simulation:", fetchError);
            return res.json(simulateBizChatCampaignAction("approve", campaignId));
          }
        }

        case "cancel":
        case "stop": {
          // BizChat 캠페인 취소/중단
          const campaign = campaignId ? await storage.getCampaign(campaignId) : null;
          if (!campaign?.bizchatCampaignId) {
            return res.json(simulateBizChatCampaignAction(action, campaignId));
          }

          const url = `${baseUrl}/api/v1/cmpn/${action}?id=${campaign.bizchatCampaignId}&tid=${tid}`;
          console.log(`[BizChat ${action}] POST ${url}`);

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
              method: "POST",
              headers: { Authorization: apiKey },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log(`[BizChat ${action}] Response:`, JSON.stringify(data).substring(0, 300));

            return res.json({
              success: data.code === "S000001",
              result: data,
            });
          } catch (fetchError) {
            console.log(`[BizChat ${action}] API error, using simulation:`, fetchError);
            return res.json(simulateBizChatCampaignAction(action, campaignId));
          }
        }

        default:
          return res.json(simulateBizChatCampaignAction(action, campaignId));
      }
    } catch (error) {
      console.error("[BizChat Campaigns] Error:", error);
      res.status(500).json({ error: "Failed to process BizChat campaign action" });
    }
  });

  // ============================================
  // Agency Portal Routes (Development)
  // ============================================

  // Get list of active agencies (for signup dropdown)
  app.get("/api/agencies/list", async (req, res) => {
    try {
      const agencies = await storage.getActiveAgencies();
      res.json({ agencies });
    } catch (error) {
      console.error("[Agencies List] Error:", error);
      res.status(500).json({ error: "대행사 목록 조회 중 오류가 발생했습니다" });
    }
  });

  // Agency login
  app.post("/api/agency/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "이메일과 비밀번호를 입력해주세요" });
      }

      // For development, simulate Supabase auth and check agency status
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
      }

      if (!user.isAgency) {
        return res.status(403).json({ error: "대행사 계정이 아닙니다. 일반 로그인을 이용해주세요." });
      }

      const agency = await storage.getAgencyByUserId(user.id);
      if (!agency || !agency.isActive) {
        return res.status(403).json({ error: "비활성화된 대행사 계정입니다" });
      }

      // Create simple dev token
      const token = Buffer.from(JSON.stringify({
        agencyId: agency.id,
        userId: user.id,
        email: user.email,
        agencyName: agency.name,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      })).toString("base64");

      res.json({
        success: true,
        token,
        agency: {
          id: agency.id,
          name: agency.name,
          contactName: agency.contactName,
          contactEmail: agency.contactEmail,
        },
        user: {
          id: user.id,
          email: user.email,
          companyName: user.companyName,
        },
      });
    } catch (error) {
      console.error("[Agency Login] Error:", error);
      res.status(500).json({ error: "로그인 중 오류가 발생했습니다" });
    }
  });

  // Agency stats
  app.get("/api/agency/stats", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = authHeader.replace("Bearer ", "");
      let payload;
      try {
        payload = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
        if (payload.exp < Date.now()) {
          return res.status(401).json({ error: "Token expired" });
        }
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const stats = await storage.getAgencyStats(payload.agencyId);
      res.json(stats);
    } catch (error) {
      console.error("[Agency Stats] Error:", error);
      res.status(500).json({ error: "통계 조회 중 오류가 발생했습니다" });
    }
  });

  return httpServer;
}

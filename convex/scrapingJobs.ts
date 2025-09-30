import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { seoReportSchema } from "@/lib/seo-schema"

export const createScrapingJob = mutation({
    args: {
      originalPrompt: v.string(),
      userId: v.optional(v.string()),
    },
    returns: v.id("scrapingJobs"),
    handler: async (ctx, args) => {
        if (!args.userId) {
            throw new Error("User ID is required");
        }
        const jobId = await ctx.db.insert("scrapingJobs", {
            userId: args.userId,
            originalPrompt: args.originalPrompt,
            status: "pending",
            createdAt: Date.now(),
        });
        return jobId;
    },
});

export const updateJobWithSnapshotId = mutation({
    args: {
        jobId: v.id("scrapingJobs"),
        snapshotId: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            snapshotId: args.snapshotId,
            status: "running",
            error: undefined
        });
        return null;
    }
});

export const setJobToAnalyzing = mutation({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            status: "analyzing",
            error: undefined
        });
        return null;
    }
});


export const saveRawScrapingData = internalMutation({
    args: {
        jobId: v.id("scrapingJobs"),
        rawData: v.array(v.any()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            results: args.rawData,
            status: "analyzing",
            error: undefined
        });
        return null;
    }
});


export const saveSeoReport = internalMutation({
    args: {
        jobId: v.id("scrapingJobs"),
        seoReport: v.any(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const parsed = seoReportSchema.parse(args.seoReport);
        await ctx.db.patch(args.jobId, {
            seoReport: parsed,
        });
        return null;
    }
});

export const saveOriginalPrompt = internalMutation({
    args: {
        jobId: v.id("scrapingJobs"),
        prompt: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            analysisPrompt: args.prompt,
        });
        return null;
    }
});

export const getJobById = query({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.union(
        v.object({
            _id: v.id("scrapingJobs"),
            _creationTime: v.number(),
            userId: v.string(),
            originalPrompt: v.string(),
            analysisPrompt: v.optional(v.string()),
            snapshotId: v.optional(v.string()),
            status: v.union(
              v.literal("pending"),
              v.literal("running"),
              v.literal("analyzing"),
              v.literal("completed"),
              v.literal("failed")
            ),
            results: v.optional(v.array(v.any())),
            seoReport: v.optional(v.any()),
            error: v.optional(v.string()),
            createdAt: v.number(),
            completedAt: v.optional(v.number()),
        }),
        v.null()
    ),
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId);
        if (job && job.seoReport !== undefined) {
            // Validate on read to protect across Convex calls
            const result = seoReportSchema.safeParse(job.seoReport);
            if (!result.success) {
                throw new Error("Stored seoReport failed validation");
            }
        }
        return job;
    }
})

export const completeJob = internalMutation({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            status: "completed",
            completedAt: Date.now(),
            error: undefined,
        });
        return null;
    }
});

export const failJob = mutation({
    args: {
        jobId: v.id("scrapingJobs"),
        error: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            status: "failed",
            completedAt: Date.now(),
            error: args.error,
        });
        return null;
    }
});

export const retryJob = mutation({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            status: "pending",
            error: undefined,
            completedAt: undefined,
            results: undefined,
            seoReport: undefined,
            snapshotId: undefined,
        });
        return null;
    }
});

export const canUseSmartRetry = query({
    args: {
        jobId: v.id("scrapingJobs"),
        userId: v.string(),
    },
    returns: v.object({
        canRetryAnalysisOnly: v.boolean(),
        hasScrapingData: v.boolean(),
        hasAnalysisPrompt: v.boolean(),
    }),
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId);

        if (!job || job.userId !== args.userId) {
            return {
                canRetryAnalysisOnly: false,
                hasScrapingData: false,
                hasAnalysisPrompt: false,
            };
        }

        const hasScrapingData = !!(job.results && job.results.length > 0);
        const hasAnalysisPrompt = !!job.analysisPrompt;
        const canRetryAnalysisOnly = hasScrapingData && hasAnalysisPrompt;

        return {
            canRetryAnalysisOnly,
            hasScrapingData,
            hasAnalysisPrompt,
        };
    }
});

export const resetJobForAnalysisRetry = internalMutation({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            status: "analyzing",
            error: undefined,
            completedAt: undefined,
            seoReport: undefined,
        });

        return null;
    }
});

export const getJobBySnapshotId = query({
    args: {
        snapshotId: v.string(),
        userId: v.string(),
    },
    returns: v.union(
        v.object({
            _id: v.id("scrapingJobs"),
            _creationTime: v.number(),
            userId: v.string(),
            originalPrompt: v.string(),
            analysisPrompt: v.optional(v.string()),
            snapshotId: v.optional(v.string()),
            status: v.union(
                v.literal("pending"),
                v.literal("running"),
                v.literal("analyzing"),
                v.literal("completed"),
                v.literal("failed")
            ),
            results: v.optional(v.array(v.any())),
            seoReport: v.optional(v.any()),
            error: v.optional(v.string()),
            createdAt: v.number(),
            completedAt: v.optional(v.number()),
        }),
        v.null()
    ),
    handler: async (ctx, args) => {
        const job = await ctx.db
            .query("scrapingJobs")
            .filter((q) =>
            q.and(
                q.eq(q.field("snapshotId"), args.snapshotId),
                q.eq(q.field("userId"), args.userId)
            )
            )
            .first();

        if (job && job.seoReport !== undefined) {
            const result = seoReportSchema.safeParse(job.seoReport);
            if (!result.success) {
                throw new Error("Stored seoReport failed validation");
            }
        }

        return job;
    }
})


export const getUserJobs = query({
    args: {},
    returns: v.array(
        v.object({
          _id: v.id("scrapingJobs"),
          _creationTime: v.number(),
          userId: v.string(),
          originalPrompt: v.string(),
          analysisPrompt: v.optional(v.string()),
          snapshotId: v.optional(v.string()),
          status: v.union(
            v.literal("pending"),
            v.literal("running"),
            v.literal("analyzing"),
            v.literal("completed"),
            v.literal("failed")
          ),
          results: v.optional(v.array(v.any())),
          seoReport: v.optional(v.any()),
          error: v.optional(v.string()),
          createdAt: v.number(),
          completedAt: v.optional(v.number()),
        })
    ),
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("User not authenticated");

        const jobs = await ctx.db
            .query("scrapingJobs")
            .withIndex("by_user_and_created_at", (q) => q.eq("userId", identity.subject))
            .order("desc")
            .collect();

        for (const job of jobs) {
            if (job.seoReport !== undefined) {
                const result = seoReportSchema.safeParse(job.seoReport);
                if (!result.success) {
                    throw new Error("Stored seoReport failed validation");
                }
            }
        }

        return jobs;
    }
})

export const deleteJob = mutation({
    args: {
      jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      await ctx.db.delete(args.jobId);
      return null;
    },
});
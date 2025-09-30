"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { buildAnalysisPrompt, systemPrompt } from "@/prompts/gpt";
import { seoReportSchema } from "@/lib/seo-schema";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

export const runAnalysis = internalAction({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        console.log("Starting AI analysis for job:", args.jobId);

        try {
            const job = await ctx.runQuery(api.scrapingJobs.getJobById, {
                jobId: args.jobId,
            });

            if (!job) {
                console.error("Job not found:", args.jobId);
                return null;
            }

            if (!job.results || job.results.length === 0) {
                console.error("No results found for job:", args.jobId);
                await ctx.runMutation(api.scrapingJobs.failJob, {
                    jobId: args.jobId,
                    error: "No results found for job",
                });
                return null;
            }

            await ctx.runMutation(api.scrapingJobs.setJobToAnalyzing, {
                jobId: args.jobId,
            });

            const scrapingData = Array.isArray(job.results) ? job.results : [job.results];
            const analysisPrompt = buildAnalysisPrompt(scrapingData);

            console.log("Generating SEO report for job:", args.jobId);

            await ctx.runMutation(internal.scrapingJobs.saveOriginalPrompt, {
                jobId: args.jobId,
                prompt: analysisPrompt
            });

            console.log("Prompt saved for job:", args.jobId);

            const { object: seoReport } = await generateObject({
                model: openai("gpt-4o"),
                system: systemPrompt(),
                prompt: analysisPrompt,
                schema: seoReportSchema
            });

            console.log("SEO report generated successfully:", {
                entity_name: seoReport.meta.entity_name,
                entity_type: seoReport.meta.entity_type,
                confidence_score: seoReport.meta.confidence_score,
                total_sources: seoReport.inventory.total_sources,
                recommendations_count: seoReport.recommendations?.length || 0,
                summary_score: seoReport.summary?.overall_score || 0,
            });

            await ctx.runMutation(internal.scrapingJobs.saveSeoReport, {
                jobId: args.jobId,
                seoReport: seoReport
            });

            console.log("SEO report saved for job:", args.jobId);

            await ctx.runMutation(internal.scrapingJobs.completeJob, {
                jobId: args.jobId,
            });

            console.log("Job completed successfully:", args.jobId);

            return null;
        } catch (error) {
            console.error("Analysis error for job:", args.jobId);

            try {
                await ctx.runMutation(api.scrapingJobs.failJob, {
                  jobId: args.jobId,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unknown error occurred during analysis",
                });
                console.log(`Job ${args.jobId} marked as failed due to analysis error`);
            } catch (failError) {
                console.error("Failed to update job status to failed:", failError);
            }
        
              // If it's a schema validation error, provide more specific feedback
            if (error instanceof Error && error.message.includes("schema")) {
                console.error("Schema validation failed - AI response incomplete");
                console.error("Error details:", error.message);
            }
        
            return null;
        }
    }
})

export const retryAnalysisOnly = action({
    args: {
        jobId: v.id("scrapingJobs"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        console.log("Retrying analysis for job:", args.jobId);

        await ctx.runMutation(internal.scrapingJobs.resetJobForAnalysisRetry, {
            jobId: args.jobId,
        });

        await ctx.runAction(internal.analysis.runAnalysis, {
            jobId: args.jobId,
        });

        return null;
    }
})
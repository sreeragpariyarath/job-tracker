import { z } from "zod";

// Drafts are deliberately separate from submitted applications. Both model
// output and job descriptions are untrusted until reviewed by the owner.
const text = (max: number) => z.string().trim().min(1).max(max);

export const tailoringInputSchema = z.object({
  company: text(200),
  role: text(200),
  jobDescription: text(30000),
}).strict();

export const tailoredContentSchema = z.object({
  fitSummary: text(3000),
  matchingQualifications: z.array(text(1000)).max(30),
  missingQualifications: z.array(text(1000)).max(30),
  resume: text(30000),
  emailSubject: text(300),
  emailBody: text(12000),
}).strict();

export type TailoringInput = z.infer<typeof tailoringInputSchema>;
export type TailoredContent = z.infer<typeof tailoredContentSchema>;

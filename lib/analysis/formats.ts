/** Shared scheduling allowlist; a supported format can still exceed reading bounds. */
export const ANALYSIS_FORMATS = ['application/vnd.ms-outlook','text/plain','message/rfc822','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/csv','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','image/webp'] as const;
export const supportsAnalysis = (type:string) => (ANALYSIS_FORMATS as readonly string[]).includes(type.split(';')[0].trim().toLowerCase());

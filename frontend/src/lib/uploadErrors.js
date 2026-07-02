// FE-10: Classify file-upload errors returned by the backend so the UI can
// show a specific, actionable message instead of a generic "error occurred".
//
// Contract note: unsupported-type and extraction-failure cases are both
// surfaced as plain 400s, differentiated only by `detail` text (see
// backend/app/services/text_extraction.py). Oversized files are a 413.
// This is client-side categorization only — no new API contract.

/**
 * @param {{ status?: number, detail?: string }} err
 * @returns {{ title: string, description: string }}
 */
export function classifyUploadError(err) {
  const detail = err?.detail || "";
  const lower = detail.toLowerCase();

  if (err?.status === 413 || lower.includes("exceeds the 5mb size limit")) {
    return {
      title: "File too large",
      description: detail || "This file is larger than the 5MB limit. Try a smaller file or paste the text instead.",
    };
  }

  if (lower.includes("unsupported file type")) {
    return {
      title: "Unsupported file type",
      description: detail || "Supported formats: .txt, .pdf, .docx. Choose a different file or paste the text instead.",
    };
  }

  if (
    lower.includes("could not read pdf") ||
    lower.includes("could not read docx") ||
    lower.includes("no extractable text") ||
    lower.includes("could not decode text file") ||
    lower.includes("no readable text") ||
    lower.includes("is empty") ||
    lower.includes("extraction is not available")
  ) {
    return {
      title: "Could not read file",
      description: detail || "We couldn't extract any text from this file. It may be corrupted, scanned/image-only, or empty — try a different file or paste the text instead.",
    };
  }

  return {
    title: "Could not upload file",
    description: detail || "Something went wrong while uploading this file.",
  };
}

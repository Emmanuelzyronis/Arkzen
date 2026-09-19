import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";

/** Outcome of one acquisition attempt. An empty result is never an error. */
export type RunStatus =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "ACCESS_RESTRICTED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "NORMALIZATION_ERROR";

export interface SourceHealth {
  providerId: string;
  available: boolean;
  detail: string;
  checkedAt: string;
}

export interface SourceCapabilities {
  /** Can this adapter return data right now without credentials? */
  requiresCredentials: boolean;
  live: boolean;
  notes: string;
}

export interface SearchResult {
  status: RunStatus;
  detail: string;
  signals: CandidateSignal[];
}

/**
 * Every source implements this. Downstream code only ever sees CandidateSignal,
 * so adding a source never changes scoring, qualification or the UI.
 */
export interface SourceAdapter {
  id: string;
  name: string;
  kind: CandidateSignal["sourceKind"];
  capabilities(): SourceCapabilities;
  health(): Promise<SourceHealth>;
  search(profile: ServiceProfile, limit: number): Promise<SearchResult>;
}

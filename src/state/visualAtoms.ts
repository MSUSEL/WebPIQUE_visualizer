import { atomWithReset } from "jotai/utils";

export type SecTabName = "PF" | "VULN_OR_DIAG";

/** High-level view state */
export const aspectAtom = atomWithReset<string | null>(null);
export const securityTabAtom = atomWithReset<SecTabName>("PF"); // PF ≈ CWE

/** Detail/controls inside tabs */
export const measureAtom = atomWithReset<string | null>(null);
export const openPlotsAtom = atomWithReset<Record<string, boolean>>({});

export const packageFilterAtom = atomWithReset<string>("ALL");
export const cweBucketAtom = atomWithReset<
  "all" | "critical" | "severe" | "moderate"
>("all");
export const fixedFilterAtom = atomWithReset<"all" | "fixed" | "notfixed">(
  "all"
);

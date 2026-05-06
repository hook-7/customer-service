export type ProductStatusFilter = "all" | "failed" | "pending" | "synced";
export type ProductSyncStatus = "FAILED" | "PENDING" | "SYNCED";

export function parseProductStatusFilter(value: string | null): ProductStatusFilter {
  if (value === "failed" || value === "pending" || value === "synced") return value;
  return "all";
}

export function productSyncStatusFilter(
  status: ProductStatusFilter,
): ProductSyncStatus | undefined {
  if (status === "failed") return "FAILED";
  if (status === "pending") return "PENDING";
  if (status === "synced") return "SYNCED";
  return undefined;
}

export function productSyncStatusLabel(status: string) {
  if (status === "SYNCED") return "已同步";
  if (status === "FAILED") return "同步失败";
  return "等待同步";
}

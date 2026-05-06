import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeTagLabel,
  parseAiFilter,
  parseConversationStatus,
} from "./admin-conversations.server.ts";
import {
  parseProductStatusFilter,
  productSyncStatusFilter,
  productSyncStatusLabel,
} from "./admin-products.ts";

test("conversation admin filters normalize invalid values to safe defaults", () => {
  assert.equal(parseConversationStatus("PENDING"), "PENDING");
  assert.equal(parseConversationStatus("HANDLED"), "HANDLED");
  assert.equal(parseConversationStatus("UNKNOWN"), "ALL");
  assert.equal(parseConversationStatus(null), "ALL");

  assert.equal(parseAiFilter("on"), "on");
  assert.equal(parseAiFilter("off"), "off");
  assert.equal(parseAiFilter("paused"), "all");
  assert.equal(parseAiFilter(null), "all");
});

test("conversation tag input is compact and length limited", () => {
  assert.equal(normalizeTagLabel("  VIP   售后  "), "VIP 售后");
  assert.equal(normalizeTagLabel("x".repeat(80)), "x".repeat(32));
});

test("product admin filters map URL values to Hermes sync statuses", () => {
  assert.equal(parseProductStatusFilter("failed"), "failed");
  assert.equal(parseProductStatusFilter("pending"), "pending");
  assert.equal(parseProductStatusFilter("synced"), "synced");
  assert.equal(parseProductStatusFilter("other"), "all");
  assert.equal(parseProductStatusFilter(null), "all");

  assert.equal(productSyncStatusFilter("failed"), "FAILED");
  assert.equal(productSyncStatusFilter("pending"), "PENDING");
  assert.equal(productSyncStatusFilter("synced"), "SYNCED");
  assert.equal(productSyncStatusFilter("all"), undefined);

  assert.equal(productSyncStatusLabel("FAILED"), "同步失败");
  assert.equal(productSyncStatusLabel("PENDING"), "等待同步");
  assert.equal(productSyncStatusLabel("SYNCED"), "已同步");
});

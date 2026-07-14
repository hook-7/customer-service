import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeTagLabel,
  parseAiFilter,
  parseConversationStatus,
} from "./admin-conversations.server.ts";

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

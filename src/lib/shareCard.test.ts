import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMatrix, QUIET_ZONE } from "./qr.ts";
import { CARD, cardQrLayout } from "./shareCard.ts";

test("cardQrLayout: whole-pixel modules, quiet zone included, inside the card's bottom-right corner", () => {
  for (const text of ["https://example.com", `https://example.com/${"x".repeat(400)}`]) {
    const m = generateMatrix(text), q = cardQrLayout(m.size);
    assert.ok(Number.isInteger(q.pitch) && q.pitch >= 2);
    assert.equal(q.side, (m.size + 2 * QUIET_ZONE) * q.pitch);
    assert.ok(q.side <= CARD.qrBox);
    assert.equal(q.x + q.side, CARD.width - CARD.margin);
    assert.equal(q.y + q.side, CARD.height - CARD.margin);
  }
});

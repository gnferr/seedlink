import test from "node:test";
import assert from "node:assert/strict";
import { viewForKey } from "./hotkeys.ts";

const base = { ctrlKey: false, metaKey: false, altKey: false, target: null };
const k = (key: string, o: object = {}) => viewForKey({ ...base, key, ...o });

test("maps 1/2/3 to views", () => {
  assert.equal(k("1"), "EXPLORE");
  assert.equal(k("2"), "REVEAL");
  assert.equal(k("3"), "SCAN");
  assert.equal(k("1", { shiftKey: true }), "EXPLORE");
});

test("other keys -> null", () => {
  for (const key of ["0", "4", "a", ""]) assert.equal(k(key), null);
});

test("ignored in typing targets", () => {
  for (const tagName of ["INPUT", "SELECT", "TEXTAREA", "input"]) assert.equal(k("1", { target: { tagName } }), null);
  assert.equal(k("1", { target: { tagName: "DIV", isContentEditable: true } }), null);
  assert.equal(k("1", { target: { tagName: "BUTTON" } }), "EXPLORE");
});

test("ignored with modifiers", () => {
  for (const m of ["ctrlKey", "metaKey", "altKey"]) assert.equal(k("1", { [m]: true }), null);
});

import { describe, it, expect } from "vitest";
import { listLibrary } from "./index.js";

/**
 * The library root was probed by existence alone. In the normal build this
 * module lives at dist/library/index.js, so the first candidate,
 * `<here>/../library`, resolved to dist/library: the module's own directory.
 * It existed, so it won, and it holds compiled JS rather than .polystyle files.
 *
 * listLibrary() therefore returned an empty list in every layout except the
 * bundled one that candidate was written for, and returning [] rather than
 * throwing meant a library browser simply came up empty with no error.
 */
describe("library discovery", () => {
  it("finds the shipped library items", () => {
    expect(listLibrary().length).toBeGreaterThan(0);
  });

  it("returns items that look like library entries", () => {
    const [first] = listLibrary();
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("category");
    expect(first.css).toBeTruthy();
  });
});

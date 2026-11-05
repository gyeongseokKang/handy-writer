import { describe, expect, it } from "vitest";

import { placeSplit } from "./split";

describe("placeSplit", () => {
  it("adds at the given place, or at the end", () => {
    expect(placeSplit([], "a")).toEqual(["a"]);
    expect(placeSplit(["a"], "b")).toEqual(["a", "b"]);
    expect(placeSplit(["a"], "b", 0)).toEqual(["b", "a"]);
  });
  it("moves a note that is already open instead of opening it twice", () => {
    expect(placeSplit(["a", "b"], "a", 1)).toEqual(["b", "a"]);
  });
  it("replaces the note at that place when three panes are already open", () => {
    expect(placeSplit(["a", "b"], "c", 0)).toEqual(["c", "b"]);
    expect(placeSplit(["a", "b"], "c")).toEqual(["a", "c"]);
  });
});

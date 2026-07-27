import { describe, expect, it } from "vitest";
import { jarvisPagePath } from "./jarvisPaths.js";

describe("Jarvis plugin paths", () => {
  it("builds an application-relative path with encoded machine and workspace values", () => {
    expect(jarvisPagePath("remote one", "/srv/repo one")).toBe("jarvis?embedded=1&machineId=remote+one&cwd=%2Fsrv%2Frepo+one");
    expect(jarvisPagePath("local", "/repo")).not.toMatch(/^\//u);
  });
});

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { createNpmFreshnessBypassArgs, createNpmProjectInstallEnv } from "./npm-install-env.js";

const FROZEN_NOW = new Date("2026-05-18T19:55:00.000Z");

function isolatedNpmEnv(base: string): NodeJS.ProcessEnv {
  return {
    HOME: base,
    NPM_CONFIG_GLOBALCONFIG: path.join(base, "missing-global-npmrc"),
    NPM_CONFIG_USERCONFIG: path.join(base, "missing-user-npmrc"),
  };
}

describe("npm install env", () => {
  it("bypasses npm release-age filters for OpenClaw-managed installs", async () => {
    await withTempDir({ prefix: "openclaw-npm-env-" }, async (base) => {
      const env = createNpmProjectInstallEnv(
        {
          ...isolatedNpmEnv(base),
          NPM_CONFIG_BEFORE: "2026-01-01T00:00:00.000Z",
          NPM_CONFIG_MIN_RELEASE_AGE: "7",
          "npm_config_min-release-age": "7",
          npm_config_before: "2026-01-01T00:00:00.000Z",
          npm_config_min_release_age: "7",
        },
        { npmConfigCwd: base },
        FROZEN_NOW,
      );

      expect(env.NPM_CONFIG_BEFORE).toBe("");
      expect(env.npm_config_before).toBe("");
      expect(env.NPM_CONFIG_MIN_RELEASE_AGE).toBe("");
      expect(env["npm_config_min-release-age"]).toBe("");
      expect(env.npm_config_min_release_age).toBe("0");
      expect(env.npm_config_global).toBe("false");
      expect(env.npm_config_location).toBe("project");
    });
  });

  it("uses a current before override when the scoped npmrc has before policy", async () => {
    await withTempDir({ prefix: "openclaw-npm-before-" }, async (base) => {
      await fs.writeFile(path.join(base, ".npmrc"), "before=2026-01-01T00:00:00.000Z\n");

      expect(
        createNpmFreshnessBypassArgs(isolatedNpmEnv(base), FROZEN_NOW, { npmConfigCwd: base }),
      ).toEqual([`--before=${FROZEN_NOW.toISOString()}`]);

      const env = createNpmProjectInstallEnv(
        isolatedNpmEnv(base),
        { npmConfigCwd: base },
        FROZEN_NOW,
      );
      expect(env.npm_config_min_release_age).toBe("");
      expect(env.npm_config_before).toBe(FROZEN_NOW.toISOString());
    });
  });
});

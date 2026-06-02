import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectOverrideViolations,
  collectPnpmLockViolations,
  disableShrinkwrappedOverrideConflictSources,
  exactOverrideRulesFromOverrides,
  exactVersionFromOverrideSpec,
  normalizeNpmVersionDrift,
  parsePnpmPackageKey,
  parseLockPackagePath,
  shrinkwrapPackageDirsForChangedPaths,
} from "../../scripts/generate-npm-shrinkwrap.mjs";

function firstPublishablePluginPath() {
  const extensionsDir = path.join(process.cwd(), "extensions");
  const pluginName = fs
    .readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
    .find((name) => {
      const packageJsonPath = path.join(extensionsDir, name, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        return false;
      }
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      return packageJson.openclaw?.release?.publishToNpm === true;
    });
  if (!pluginName) {
    throw new Error("expected at least one publishable plugin fixture");
  }
  return `extensions/${pluginName}`;
}

describe("generate-npm-shrinkwrap", () => {
  it("extracts exact versions from npm override specs", () => {
    expect(exactVersionFromOverrideSpec("8.4.0")).toBe("8.4.0");
    expect(exactVersionFromOverrideSpec("npm:@nolyfill/domexception@1.0.28")).toBe("1.0.28");
    expect(exactVersionFromOverrideSpec("^8.4.0")).toBeNull();
  });

  it("parses nested scoped package paths", () => {
    expect(
      parseLockPackagePath(
        "node_modules/@earendil-works/pi-coding-agent/node_modules/@anthropic-ai/sdk",
      ),
    ).toEqual([
      {
        name: "@earendil-works/pi-coding-agent",
        path: "node_modules/@earendil-works/pi-coding-agent",
      },
      {
        name: "@anthropic-ai/sdk",
        path: "node_modules/@earendil-works/pi-coding-agent/node_modules/@anthropic-ai/sdk",
      },
    ]);
  });

  it("parses pnpm lock package keys", () => {
    expect(parsePnpmPackageKey("@aws-sdk/core@3.974.12")).toEqual({
      name: "@aws-sdk/core",
      version: "3.974.12",
    });
    expect(parsePnpmPackageKey("react-dom@19.2.4(react@19.2.4)")).toEqual({
      name: "react-dom",
      version: "19.2.4",
    });
    expect(parsePnpmPackageKey("invalid")).toBeNull();
  });

  it("disables embedded shrinkwraps that hide workspace overrides", () => {
    const lockfile = {
      packages: {
        "": {},
        "node_modules/@earendil-works/pi-coding-agent": {
          version: "0.75.4",
          hasShrinkwrap: true,
        },
        "node_modules/@earendil-works/pi-coding-agent/node_modules/protobufjs": {
          version: "7.5.9",
        },
        "node_modules/@earendil-works/pi-coding-agent/node_modules/fetch-blob": {
          version: "4.0.0",
        },
        "node_modules/@earendil-works/pi-coding-agent/node_modules/fetch-blob/node_modules/node-domexception":
          {
            version: "1.0.0",
          },
      },
    };
    const overrideRules = exactOverrideRulesFromOverrides({
      protobufjs: "8.4.0",
      "node-domexception": "npm:@nolyfill/domexception@1.0.28",
    });

    expect(collectOverrideViolations(lockfile, overrideRules)).toHaveLength(2);
    expect(disableShrinkwrappedOverrideConflictSources(lockfile, overrideRules)).toEqual([
      "node_modules/@earendil-works/pi-coding-agent",
    ]);
    expect(lockfile.packages["node_modules/@earendil-works/pi-coding-agent"]).not.toHaveProperty(
      "hasShrinkwrap",
    );
    expect(
      lockfile.packages["node_modules/@earendil-works/pi-coding-agent/node_modules/protobufjs"],
    ).toBeUndefined();
  });

  it("detects shrinkwrap packages that bypass the pnpm lock", () => {
    const lockfile = {
      packages: {
        "": {},
        "node_modules/react": {
          version: "19.2.6",
        },
        "node_modules/@nolyfill/domexception": {
          version: "1.0.28",
        },
      },
    };
    const pnpmPackages = new Set(["react@19.2.4", "@nolyfill/domexception@1.0.28"]);

    expect(collectPnpmLockViolations(lockfile, pnpmPackages)).toEqual([
      {
        packageKey: "react@19.2.6",
        path: "node_modules/react",
      },
    ]);
  });

  it("normalizes npm patch-version metadata drift", () => {
    expect(
      normalizeNpmVersionDrift({
        packages: {
          "node_modules/@rollup/rollup-linux-x64-gnu": {
            version: "4.53.5",
            cpu: ["x64"],
            libc: ["glibc"],
            optional: true,
            os: ["linux"],
          },
          "node_modules/zod": {
            version: "4.4.3",
            peer: true,
          },
          "node_modules/keeps-peer-false": {
            version: "1.0.0",
            peer: false,
          },
        },
      }),
    ).toEqual({
      packages: {
        "node_modules/@rollup/rollup-linux-x64-gnu": {
          version: "4.53.5",
          cpu: ["x64"],
          optional: true,
          os: ["linux"],
        },
        "node_modules/zod": {
          version: "4.4.3",
        },
        "node_modules/keeps-peer-false": {
          version: "1.0.0",
          peer: false,
        },
      },
    });
  });

  it("targets changed publishable plugin shrinkwraps", () => {
    const pluginPath = firstPublishablePluginPath();

    expect(
      shrinkwrapPackageDirsForChangedPaths([
        `${pluginPath}/package.json`,
        `${pluginPath}/npm-shrinkwrap.json`,
      ]).map((packageDir) => path.relative(process.cwd(), packageDir)),
    ).toEqual([pluginPath]);
  });

  it("falls back to every shrinkwrap when lockfile ownership is ambiguous", () => {
    const pluginPath = firstPublishablePluginPath();
    const packageDirs = shrinkwrapPackageDirsForChangedPaths(["pnpm-lock.yaml"]).map((packageDir) =>
      path.relative(process.cwd(), packageDir),
    );

    expect(packageDirs).toContain("");
    expect(packageDirs).toContain(pluginPath);
  });

  it("falls back to every shrinkwrap when mixed lockfile changes do not map to packages", () => {
    const pluginPath = firstPublishablePluginPath();
    const packageDirs = shrinkwrapPackageDirsForChangedPaths([
      `${pluginPath}/package.json`,
      "pnpm-lock.yaml",
    ]).map((packageDir) => path.relative(process.cwd(), packageDir));

    expect(packageDirs).toContain("");
    expect(packageDirs).toContain(pluginPath);
    expect(packageDirs.length).toBeGreaterThan(1);
  });
});

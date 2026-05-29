import { afterEach, describe, expect, it, vi } from "vitest";

const isQaLabCliAvailable = vi.hoisted(() => vi.fn(() => true));

vi.mock("../../plugin-sdk/qa-lab.js", () => ({
  isQaLabCliAvailable,
}));

async function importSubCliDescriptors() {
  vi.resetModules();
  return import("./subcli-descriptors.js");
}

function descriptorNames(descriptors: ReadonlyArray<{ name: string }>): string[] {
  return descriptors.map((descriptor) => descriptor.name);
}

describe("sub-cli descriptors", () => {
  afterEach(() => {
    isQaLabCliAvailable.mockReset().mockReturnValue(true);
    vi.resetModules();
  });

  it("keeps the exported descriptor list aligned with QA visibility when unavailable", async () => {
    isQaLabCliAvailable.mockReturnValue(false);

    const { SUB_CLI_DESCRIPTORS, getSubCliEntries } = await importSubCliDescriptors();
    const exportedNames = descriptorNames(SUB_CLI_DESCRIPTORS);

    expect(exportedNames).toEqual(descriptorNames(getSubCliEntries()));
    expect(exportedNames).not.toContain("qa");
  });

  it("keeps command filter surfaces aligned when QA is unavailable", async () => {
    isQaLabCliAvailable.mockReturnValue(false);

    const { SUB_CLI_DESCRIPTORS, getSubCliCommandsWithSubcommands } =
      await importSubCliDescriptors();
    const exportedNames = descriptorNames(SUB_CLI_DESCRIPTORS);

    expect(exportedNames).not.toContain("qa");
    expect(getSubCliCommandsWithSubcommands()).not.toContain("qa");
  });

  it("includes qa in the exported descriptor list when QA is available", async () => {
    isQaLabCliAvailable.mockReturnValue(true);

    const { SUB_CLI_DESCRIPTORS, getSubCliCommandsWithSubcommands, getSubCliEntries } =
      await importSubCliDescriptors();
    const exportedNames = descriptorNames(SUB_CLI_DESCRIPTORS);

    expect(exportedNames).toEqual(descriptorNames(getSubCliEntries()));
    expect(exportedNames).toContain("qa");
    expect(getSubCliCommandsWithSubcommands()).toContain("qa");
  });
});

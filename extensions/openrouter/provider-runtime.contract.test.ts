import { describe, expect, it, vi } from "vitest";
import entry from "./index.js";

describe("openrouter provider runtime contract", () => {
  it("registers text and multimedia provider capabilities", () => {
    const api = {
      registerProvider: vi.fn(),
      registerMediaUnderstandingProvider: vi.fn(),
      registerImageGenerationProvider: vi.fn(),
      registerMusicGenerationProvider: vi.fn(),
      registerVideoGenerationProvider: vi.fn(),
      registerSpeechProvider: vi.fn(),
    } as unknown as Parameters<typeof entry.register>[0];

    entry.register(api);

    expect(api.registerProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openrouter" }),
    );
    expect(api.registerMediaUnderstandingProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openrouter" }),
    );
    expect(api.registerImageGenerationProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openrouter" }),
    );
    expect(api.registerMusicGenerationProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openrouter" }),
    );
    expect(api.registerVideoGenerationProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openrouter" }),
    );
    expect(api.registerSpeechProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openrouter" }),
    );
  });
});

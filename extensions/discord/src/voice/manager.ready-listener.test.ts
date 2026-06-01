import { describe, expect, it, vi } from "vitest";
import { DiscordVoiceReadyListener, DiscordVoiceStateUpdateListener } from "./manager.js";

describe("DiscordVoiceReadyListener", () => {
  it("starts auto-join without blocking the ready listener", async () => {
    let resolveJoin: (() => void) | undefined;
    const autoJoin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveJoin = resolve;
        }),
    );
    const listener = new DiscordVoiceReadyListener({
      autoJoin,
    } as unknown as ConstructorParameters<typeof DiscordVoiceReadyListener>[0]);

    const result = listener.handle({} as never, {} as never);

    await expect(result).resolves.toBeUndefined();
    expect(autoJoin).toHaveBeenCalledTimes(1);

    resolveJoin?.();
  });
});

describe("DiscordVoiceStateUpdateListener", () => {
  it("forwards voice state events to the voice manager", async () => {
    const handleVoiceStateUpdate = vi.fn().mockResolvedValue(undefined);
    const listener = new DiscordVoiceStateUpdateListener({
      handleVoiceStateUpdate,
    } as unknown as ConstructorParameters<typeof DiscordVoiceStateUpdateListener>[0]);

    await listener.handle(
      {
        guildId: "guild-1",
        channelId: "channel-1",
        userId: "user-1",
      } as never,
      {} as never,
    );

    expect(handleVoiceStateUpdate).toHaveBeenCalledWith({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
    });
  });
});

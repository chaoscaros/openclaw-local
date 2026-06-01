import {
  DiscordVoiceManager as DiscordVoiceManagerImpl,
  DiscordVoiceReadyListener as DiscordVoiceReadyListenerImpl,
  DiscordVoiceStateUpdateListener as DiscordVoiceStateUpdateListenerImpl,
} from "./manager.js";

export class DiscordVoiceManager extends DiscordVoiceManagerImpl {}

export class DiscordVoiceReadyListener extends DiscordVoiceReadyListenerImpl {}

export class DiscordVoiceStateUpdateListener extends DiscordVoiceStateUpdateListenerImpl {}

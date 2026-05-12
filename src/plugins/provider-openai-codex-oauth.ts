import { loginOpenAICodex, type OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import { ensureGlobalUndiciEnvProxyDispatcher } from "../infra/net/undici-global-dispatcher.js";
import { hasEnvHttpProxyConfigured } from "../infra/net/proxy-env.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createVpsAwareOAuthHandlers } from "./provider-oauth-flow.js";
import {
  formatOpenAIOAuthTlsPreflightFix,
  runOpenAIOAuthTlsPreflight,
} from "./provider-openai-codex-oauth-tls.js";

const manualInputPromptMessage = "Paste the authorization code (or full redirect URL):";
const openAICodexOAuthOriginator = "openclaw";

function isOpenAICodexTokenExchangeFailure(error: unknown): boolean {
  const message = String(error ?? "");
  return /token exchange failed/i.test(message) || /unsupported_country_region_territory/i.test(message);
}

function formatOpenAICodexTokenExchangeHint(env: NodeJS.ProcessEnv = process.env): string {
  const lines = [
    "OpenAI Codex OAuth reached the browser callback, but the token exchange failed.",
    "This is often caused by proxy/network handling during the backend /oauth/token request rather than a real account-region restriction.",
  ];
  if (!hasEnvHttpProxyConfigured("https", env)) {
    lines.push(
      "If this machine needs a proxy, retry with NODE_USE_ENV_PROXY=1 plus HTTP_PROXY/HTTPS_PROXY set in the shell before running the login command.",
    );
  }
  lines.push(
    "If the official Codex CLI can log in on this machine, OpenClaw can import ~/.codex/auth.json as a fallback on the next login attempt.",
  );
  return lines.join("\n");
}

export async function loginOpenAICodexOAuth(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  localBrowserMessage?: string;
}): Promise<OAuthCredentials | null> {
  const { prompter, runtime, isRemote, openUrl, localBrowserMessage } = params;

  ensureGlobalUndiciEnvProxyDispatcher();

  const preflight = await runOpenAIOAuthTlsPreflight();
  if (!preflight.ok && preflight.kind === "tls-cert") {
    const hint = formatOpenAIOAuthTlsPreflightFix(preflight);
    runtime.error(hint);
    await prompter.note(hint, "OAuth prerequisites");
    throw new Error(preflight.message);
  }

  await prompter.note(
    isRemote
      ? [
          "You are running in a remote/VPS environment.",
          "A URL will be shown for you to open in your LOCAL browser.",
          "After signing in, paste the redirect URL back here.",
        ].join("\n")
      : [
          "Browser will open for OpenAI authentication.",
          "If the callback doesn't auto-complete, paste the redirect URL.",
          "OpenAI OAuth uses localhost:1455 for the callback.",
        ].join("\n"),
    "OpenAI Codex OAuth",
  );

  const spin = prompter.progress("Starting OAuth flow…");
  try {
    const { onAuth: baseOnAuth, onPrompt } = createVpsAwareOAuthHandlers({
      isRemote,
      prompter,
      runtime,
      spin,
      openUrl,
      localBrowserMessage: localBrowserMessage ?? "Complete sign-in in browser…",
      manualPromptMessage: manualInputPromptMessage,
    });

    const creds = await loginOpenAICodex({
      onAuth: baseOnAuth,
      onPrompt,
      originator: openAICodexOAuthOriginator,
      onManualCodeInput: isRemote
        ? async () =>
            await onPrompt({
              message: manualInputPromptMessage,
            })
        : undefined,
      onProgress: (msg: string) => spin.update(msg),
    });
    spin.stop("OpenAI OAuth complete");
    return creds ?? null;
  } catch (err) {
    spin.stop("OpenAI OAuth failed");
    runtime.error(String(err));
    if (isOpenAICodexTokenExchangeFailure(err)) {
      const hint = formatOpenAICodexTokenExchangeHint(process.env);
      runtime.error(hint);
      await prompter.note(hint, "OAuth token exchange");
    }
    await prompter.note("Trouble with OAuth? See https://docs.openclaw.ai/start/faq", "OAuth help");
    throw err;
  }
}

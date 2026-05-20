import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { icons } from "../icons.ts";

export type ChatRunControlsProps = {
  canAbort: boolean;
  canSend: boolean;
  draft: string;
  hasMessages: boolean;
  isBusy: boolean;
  newSessionBusy?: boolean;
  resetSessionBusy?: boolean;
  sending: boolean;
  onAbort?: () => void;
  onExport: () => void;
  onNewSession: () => void;
  onResetSession?: () => void;
  onSend: () => void;
  onStoreDraft: (draft: string) => void;
};

function storeDraftIfNeeded(props: ChatRunControlsProps) {
  if (props.draft.trim()) {
    props.onStoreDraft(props.draft);
  }
}

export function renderChatRunControls(props: ChatRunControlsProps) {
  const newSessionLabel = props.newSessionBusy ? "Creating..." : t("chatUi.newSession");
  const resetSessionLabel = props.resetSessionBusy ? "Resetting..." : t("chatUi.resetSession");
  const sessionActionBusy = Boolean(props.newSessionBusy || props.resetSessionBusy);
  return html`
    <div class="agent-chat__toolbar-right">
      ${props.canAbort
        ? nothing
        : html`
            <button
              class="btn btn--ghost"
              @click=${props.onNewSession}
              title=${t("chatUi.newSession")}
              aria-label=${t("chatUi.newSession")}
              ?disabled=${props.isBusy || sessionActionBusy}
            >
              ${icons.plus}
              <span class="agent-chat__control-label">${newSessionLabel}</span>
            </button>
            ${props.onResetSession
              ? html`
                  <button
                    class="btn btn--ghost"
                    data-chat-reset-session-button="true"
                    @click=${props.onResetSession}
                    title=${t("chatUi.resetSession")}
                    aria-label=${t("chatUi.resetSession")}
                    ?disabled=${props.isBusy || sessionActionBusy}
                  >
                    ${icons.refresh}
                    <span class="agent-chat__control-label">${resetSessionLabel}</span>
                  </button>
                `
              : nothing}
          `}
      <button
        class="btn btn--ghost"
        @click=${props.onExport}
        title=${t("chatUi.export")}
        aria-label=${t("chatUi.exportChat")}
        ?disabled=${!props.hasMessages}
      >
        ${icons.download}
        <span class="agent-chat__control-label">${t("chatUi.export")}</span>
      </button>

      ${props.canAbort
        ? html`
            <button
              class="chat-send-btn"
              @click=${() => {
                storeDraftIfNeeded(props);
                props.onSend();
              }}
              ?disabled=${!props.canSend || props.sending}
              title=${t("chatUi.send")}
              aria-label=${t("chatUi.sendMessage")}
            >
              ${icons.send}
              <span class="agent-chat__control-label">${t("chatUi.send")}</span>
            </button>
            <button
              class="chat-send-btn chat-send-btn--stop"
              @click=${props.onAbort}
              title=${t("chatUi.stop")}
              aria-label=${t("chatUi.stopGenerating")}
            >
              ${icons.stop}
              <span class="agent-chat__control-label">${t("chatUi.stop")}</span>
            </button>
          `
        : html`
            <button
              class="chat-send-btn"
              @click=${() => {
                storeDraftIfNeeded(props);
                props.onSend();
              }}
              ?disabled=${!props.canSend || props.sending}
              title=${t("chatUi.send")}
              aria-label=${t("chatUi.sendMessage")}
            >
              ${icons.send}
              <span class="agent-chat__control-label">${t("chatUi.send")}</span>
            </button>
          `}
    </div>
  `;
}

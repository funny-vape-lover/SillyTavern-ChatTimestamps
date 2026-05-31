import { eventSource, event_types } from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";
import { timestampToMoment } from "../../../utils.js";

const extensionName = 'SillyTavern-ChatTimestamps';
const extensionPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false,
    max_messages: 20,
    instruction_enabled: true,
};

let settings;

const timestampInstruction = 'Timestamp lines like [Timestamp: ...] are metadata about previous chat messages. Use them only to understand timing and sequence. Do not include, imitate, or invent timestamp headers in your own reply unless the user explicitly asks you to write a timestamp.';

function saveSettings() {
    getContext().saveSettingsDebounced();
}

function loadSettings() {
    settings = extension_settings[extensionName] ?? {};
    for (const key in defaultSettings) {
        if (settings[key] === undefined) {
            settings[key] = defaultSettings[key];
        }
    }
    extension_settings[extensionName] = settings;
}

function formatMessageTimestamp(message) {
    const momentDate = timestampToMoment(message?.send_date);
    if (!momentDate?.isValid()) return "";
    return momentDate.format('LL LT');
}

function getTimestampPrefix(message) {
    const timestamp = formatMessageTimestamp(message);
    return timestamp ? `[Timestamp: ${timestamp}]\n` : "";
}

function getSourceMessages() {
    const context = getContext();
    const messages = context.chat
        .filter(message => message && !message.is_system && typeof message.mes === 'string' && message.mes.trim().length);

    const maxMessages = Number(settings.max_messages);
    if (!Number.isFinite(maxMessages) || maxMessages <= 0) {
        return messages;
    }

    return messages.slice(-maxMessages);
}

function normalizeContent(content) {
    return String(content ?? '')
        .replace(/^\[Timestamp: .+?\]\n/, '')
        .replace(/\r/gm, '')
        .trim();
}

function messageMatchesContent(message, content) {
    const messageText = normalizeContent(message?.mes);
    const promptText = normalizeContent(content);
    if (!messageText || !promptText) return false;
    return promptText.includes(messageText) || messageText.includes(promptText);
}

function shouldInject() {
    return Boolean(settings?.enabled);
}

function shouldInjectInstruction() {
    return shouldInject() && Boolean(settings?.instruction_enabled);
}

function prefixPromptText(content, sourceMessage) {
    const prefix = getTimestampPrefix(sourceMessage);
    if (!prefix || String(content ?? '').startsWith('[Timestamp: ')) {
        return content;
    }
    return `${prefix}${content}`;
}

function injectIntoPromptItems(items, getContent, setContent) {
    if (!shouldInject() || !Array.isArray(items) || !items.length) {
        return;
    }

    const sourceMessages = getSourceMessages();
    if (!sourceMessages.length) {
        return;
    }

    let searchFrom = items.length - 1;
    for (let sourceIndex = sourceMessages.length - 1; sourceIndex >= 0; sourceIndex--) {
        const sourceMessage = sourceMessages[sourceIndex];
        for (let itemIndex = searchFrom; itemIndex >= 0; itemIndex--) {
            const item = items[itemIndex];
            const content = getContent(item);
            if (typeof content !== 'string' || content.startsWith('[Timestamp: ')) {
                continue;
            }
            if (!messageMatchesContent(sourceMessage, content)) {
                continue;
            }

            setContent(item, prefixPromptText(content, sourceMessage));
            searchFrom = itemIndex - 1;
            break;
        }
    }
}

function injectTextCompletionInstruction(data) {
    if (!shouldInjectInstruction() || !Array.isArray(data?.finalMesSend) || !data.finalMesSend.length) {
        return;
    }

    const target = data.finalMesSend[data.finalMesSend.length - 1];
    if (!Array.isArray(target.extensionPrompts)) {
        target.extensionPrompts = [];
    }
    if (!target.extensionPrompts.includes(`${timestampInstruction}\n`)) {
        target.extensionPrompts.unshift(`${timestampInstruction}\n`);
    }
}

function injectChatCompletionInstruction(data) {
    if (!shouldInjectInstruction() || !Array.isArray(data?.chat) || !data.chat.length) {
        return;
    }

    const systemMessage = data.chat.find(message => message?.role === 'system' && typeof message.content === 'string');
    if (systemMessage) {
        if (!systemMessage.content.includes(timestampInstruction)) {
            systemMessage.content = `${systemMessage.content}\n\n${timestampInstruction}`;
        }
        return;
    }

    data.chat.unshift({
        role: 'system',
        content: timestampInstruction,
    });
}

function injectTextCompletionTimestamps(data) {
    if (data?.api === 'openai') {
        return;
    }
    injectTextCompletionInstruction(data);
    injectIntoPromptItems(
        data?.finalMesSend,
        item => item?.message,
        (item, value) => { item.message = value; },
    );
}

function injectChatCompletionTimestamps(data) {
    injectChatCompletionInstruction(data);
    injectIntoPromptItems(
        data?.chat,
        item => typeof item?.content === 'string' ? item.content : null,
        (item, value) => { item.content = value; },
    );
}

async function loadSettingsUi() {
    const settingsHtml = await $.get(`${extensionPath}/templates/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    $('#chat_timestamps_enabled')
        .prop('checked', settings.enabled)
        .on('click', (event) => {
            settings.enabled = event.target.checked;
            saveSettings();
        });

    $('#chat_timestamps_instruction_enabled')
        .prop('checked', settings.instruction_enabled)
        .on('click', (event) => {
            settings.instruction_enabled = event.target.checked;
            saveSettings();
        });

    $('#chat_timestamps_max_messages')
        .val(settings.max_messages)
        .on('change', (event) => {
            let value = Number(event.target.value);
            if (!Number.isFinite(value)) {
                value = defaultSettings.max_messages;
            }
            value = Math.max(0, Math.min(999, Math.trunc(value)));
            settings.max_messages = value;
            event.target.value = value;
            saveSettings();
        });
}

jQuery(() => {
    eventSource.on(event_types.APP_READY, async () => {
        loadSettings();
        await loadSettingsUi();
    });
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, injectTextCompletionTimestamps);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, injectChatCompletionTimestamps);
});

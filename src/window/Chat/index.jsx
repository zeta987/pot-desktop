import { Button, Tooltip } from '@nextui-org/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { AiOutlinePushpin } from 'react-icons/ai';
import { IoClose } from 'react-icons/io5';
import { MdDeleteSweep } from 'react-icons/md';

import { useConfig } from '../../hooks';
import { osType } from '../../utils/env';
import {
    buildLegacySystemPrompt,
    buildSystemPrompt,
    hasImageContent,
    normalizeInitialMessages,
    replaceTextInContent,
    resolveLanguageName,
    toApiMessages,
} from './chatContext';
import { chatStream } from './chatApi';
import MessageList from './MessageList';
import InputArea from './InputArea';

let messageSequence = 0;

function createMessage(role, content, extra = {}) {
    messageSequence += 1;
    return { id: `chat-message-${messageSequence}`, role, content, ...extra };
}

function redactErrorDetails(value, apiKey) {
    let text = String(value ?? '');
    text = text.replace(/(https?:\/\/)[^@\s/:]+:[^@\s/]+@/gi, '$1[credentials omitted]@');
    text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=_-]+/g, '[image data omitted]');
    if (typeof apiKey === 'string' && apiKey !== '') {
        text = text.split(apiKey).join('[credential omitted]');
    }
    return text.replace(/([?&](?:api[-_]?key|key|token|access_token)=)[^\s&#)]+/gi, '$1[credential omitted]');
}

function displayEndpoint(requestPath) {
    try {
        const endpoint = new URL(requestPath);
        endpoint.username = '';
        endpoint.password = '';
        endpoint.search = '';
        endpoint.hash = '';
        return endpoint.href;
    } catch {
        return 'Invalid endpoint';
    }
}

function formatErrorMessage(t, config, errorMessage, withImage) {
    const details = [];
    if (config?.requestPath) {
        details.push(
            `${t('chat.error_endpoint', { defaultValue: 'Endpoint' })}: \`${displayEndpoint(config.requestPath)}\``
        );
    }
    if (config?.model) {
        details.push(`${t('chat.error_model', { defaultValue: 'Model' })}: \`${config.model}\``);
    }

    const label = t('chat.error', { defaultValue: 'Error' });
    let message = `**${label}:** ${redactErrorDetails(errorMessage, config?.apiKey)}`;
    if (details.length > 0) message += `\n\n${details.join(' · ')}`;
    if (withImage) {
        message += `\n\n${t('chat.image_error_hint', {
            defaultValue:
                'This conversation contains an image. The configured endpoint or model may not accept image input, or may reject this image size. Choose a service that supports image input and try again.',
        })}`;
    }
    return message;
}

export default function Chat() {
    const [transparent] = useConfig('transparent', true);
    const [appLanguage] = useConfig('app_language', 'en');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pinned, setPinned] = useState(true);
    const inputRef = useRef(null);
    const abortRef = useRef(null);
    const apiConfigRef = useRef(null);
    const requestIdRef = useRef(0);
    const mountedRef = useRef(false);
    const contextAppliedRef = useRef(false);
    const initialRequestStartedRef = useRef(false);
    const { t } = useTranslation();

    useEffect(() => {
        let cancelled = false;
        const openWindow = async () => {
            try {
                await appWindow.show();
                if (cancelled) return;
                await appWindow.setFocus();
                if (!cancelled) inputRef.current?.focus({ preventScroll: true });
            } catch (error) {
                console.error('Failed to activate chat window', error);
            }
        };
        void openWindow();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runRequest = useCallback(
        (config, messagesToSend) => {
            if (!config) return;

            abortRef.current?.();
            const requestId = requestIdRef.current + 1;
            requestIdRef.current = requestId;
            const placeholder = createMessage('assistant', '');
            const outgoingMessages = toApiMessages(messagesToSend);
            const withImage = hasImageContent(outgoingMessages);

            setIsLoading(true);
            setMessages([...messagesToSend, placeholder]);

            const isCurrentRequest = () => mountedRef.current && requestIdRef.current === requestId;
            const updatePlaceholder = (content, localOnly = false) => {
                setMessages((currentMessages) => {
                    const index = currentMessages.findIndex((message) => message.id === placeholder.id);
                    if (index === -1) return currentMessages;
                    const updated = [...currentMessages];
                    updated[index] = { ...updated[index], content, localOnly };
                    return updated;
                });
            };

            abortRef.current = chatStream({
                apiConfig: config,
                messages: outgoingMessages,
                onChunk: (accumulated) => {
                    if (isCurrentRequest()) updatePlaceholder(accumulated);
                },
                onComplete: (finalText) => {
                    if (!isCurrentRequest()) return;
                    abortRef.current = null;
                    updatePlaceholder(finalText);
                    setIsLoading(false);
                },
                onError: (errorMessage) => {
                    if (!isCurrentRequest()) return;
                    abortRef.current = null;
                    updatePlaceholder(formatErrorMessage(t, config, errorMessage, withImage), true);
                    setIsLoading(false);
                },
            });
        },
        [t]
    );

    useEffect(() => {
        if (appLanguage === null || contextAppliedRef.current) return;
        contextAppliedRef.current = true;

        invoke('get_chat_context', { label: appWindow.label })
            .then((contextJson) => {
                if (!mountedRef.current || !contextJson) return;

                let context;
                try {
                    context = JSON.parse(contextJson);
                } catch {
                    return;
                }
                if (!context || typeof context !== 'object') return;

                const config = context.apiConfig || null;
                apiConfigRef.current = config;
                const languageName = resolveLanguageName(appLanguage);
                const initialMessages = normalizeInitialMessages(context.initialMessages).map((message) =>
                    createMessage(message.role, message.content)
                );
                const systemPrompt = context.version
                    ? buildSystemPrompt({ kind: context.kind, languageName })
                    : buildLegacySystemPrompt(languageName, context.resultText);
                const initialHistory = [createMessage('system', systemPrompt), ...initialMessages];

                if (!config) {
                    setMessages([
                        ...initialHistory,
                        createMessage(
                            'assistant',
                            `**${t('chat.error', { defaultValue: 'Error' })}:** ${t('chat.no_service_config', {
                                defaultValue:
                                    'No chat service configuration was passed to this window. Configure a chat service and open the chat again.',
                            })}`,
                            { localOnly: true }
                        ),
                    ]);
                    return;
                }

                setMessages(initialHistory);
                if (context.autoSubmit === true && initialMessages.length > 0 && !initialRequestStartedRef.current) {
                    initialRequestStartedRef.current = true;
                    runRequest(config, initialHistory);
                }
            })
            .catch(() => {});
    }, [appLanguage, runRequest, t]);

    const handlePin = async () => {
        const next = !pinned;
        try {
            await appWindow.setAlwaysOnTop(next);
            setPinned(next);
        } catch (error) {
            console.error('Failed to change chat window pin state', error);
        }
    };

    const handleClear = () => {
        abortRef.current?.();
        abortRef.current = null;
        requestIdRef.current += 1;
        setIsLoading(false);
        setMessages((currentMessages) => currentMessages.filter((message) => message.role === 'system'));
    };

    const sendMessage = (text) => {
        const config = apiConfigRef.current;
        if (!config || isLoading) return;
        runRequest(config, [...messages, createMessage('user', text)]);
    };

    const handleEditConfirm = (index, newContent, shouldRegenerate) => {
        const target = messages[index];
        if (!target) return;

        const updated = [...messages];
        updated[index] = { ...target, content: replaceTextInContent(target.content, newContent) };
        if (!shouldRegenerate) {
            setMessages(updated);
            return;
        }

        const truncated = updated.slice(0, index + 1);
        const config = apiConfigRef.current;
        if (truncated[index].role === 'user' && config) {
            runRequest(config, truncated);
            return;
        }

        abortRef.current?.();
        abortRef.current = null;
        requestIdRef.current += 1;
        setIsLoading(false);
        setMessages(truncated);
    };

    const handleRegenerate = () => {
        const lastIndex = messages.length - 1;
        if (messages[lastIndex]?.role !== 'assistant') return;
        const config = apiConfigRef.current;
        if (config) runRequest(config, messages.slice(0, lastIndex));
    };

    const handleSystemPromptChange = (newContent) => {
        setMessages((currentMessages) => {
            if (currentMessages[0]?.role !== 'system') return currentMessages;
            const updated = [...currentMessages];
            updated[0] = { ...updated[0], content: newContent };
            return updated;
        });
    };

    return (
        <div
            className={`${transparent ? 'bg-background/90' : 'bg-background'} h-screen flex flex-col ${
                osType === 'Linux' && 'rounded-[10px] border-1 border-default-100'
            }`}
        >
            <div className='flex items-center justify-between px-2 h-[35px] select-none shrink-0'>
                <div
                    data-tauri-drag-region='true'
                    className='flex-1 h-full flex items-center'
                >
                    <img
                        src='icon.png'
                        className='h-[20px] w-[20px] mr-2'
                        draggable={false}
                    />
                    <span className='text-sm font-medium'>{t('chat.title')}</span>
                </div>
                <div className='flex items-center gap-0.5'>
                    <Tooltip content={t('chat.clear')}>
                        <Button
                            isIconOnly
                            size='sm'
                            variant='light'
                            onPress={handleClear}
                        >
                            <MdDeleteSweep className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={pinned ? 'Unpin' : 'Pin'}>
                        <Button
                            isIconOnly
                            size='sm'
                            variant='light'
                            className={pinned ? 'text-primary' : ''}
                            aria-label={pinned ? 'Unpin' : 'Pin'}
                            aria-pressed={pinned}
                            onPress={handlePin}
                        >
                            <AiOutlinePushpin className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='light'
                        onPress={() => appWindow.close()}
                    >
                        <IoClose className='text-[16px]' />
                    </Button>
                </div>
            </div>

            <MessageList
                messages={messages}
                isLoading={isLoading}
                onEditConfirm={handleEditConfirm}
                onRegenerate={handleRegenerate}
                onSystemPromptChange={handleSystemPromptChange}
            />

            <InputArea
                ref={inputRef}
                onSend={sendMessage}
                isLoading={isLoading}
            />
        </div>
    );
}

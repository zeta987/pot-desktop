import { Button, Tooltip } from '@nextui-org/react';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import { AiOutlinePushpin } from 'react-icons/ai';
import { IoClose } from 'react-icons/io5';
import { MdDeleteSweep } from 'react-icons/md';

import { useConfig } from '../../hooks';
import { osType } from '../../utils/env';
import { chatStream } from './chatApi';
import MessageList from './MessageList';
import InputArea from './InputArea';

const APP_LANGUAGE_TO_NATURAL = {
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    ru: 'Russian',
    de: 'German',
    it: 'Italian',
    tr: 'Turkish',
    pt_pt: 'Portuguese',
    pt_br: 'Brazilian Portuguese',
    vi: 'Vietnamese',
    id: 'Indonesian',
    th: 'Thai',
    ms: 'Malay',
    ar: 'Arabic',
    hi: 'Hindi',
    nb_no: 'Norwegian Bokmål',
    nn_no: 'Norwegian Nynorsk',
    fa: 'Persian',
    sv: 'Swedish',
    pl: 'Polish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    he: 'Hebrew',
};

export default function Chat() {
    const [transparent] = useConfig('transparent', true);
    const [appLanguage] = useConfig('app_language', 'en');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [apiConfig, setApiConfig] = useState(null);
    const abortRef = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        appWindow.show();
    }, []);

    useEffect(() => {
        if (messages.length > 0) return;
        if (appLanguage === null) return;

        invoke('get_chat_context', { label: appWindow.label }).then((contextJson) => {
            if (!contextJson) return;
            try {
                const context = JSON.parse(contextJson);
                setApiConfig(context.apiConfig);
                if (context.initialMessages) {
                    const nonSystemMessages = context.initialMessages.filter((msg) => msg.role !== 'system');
                    const userLanguage = APP_LANGUAGE_TO_NATURAL[appLanguage] || 'English';
                    const resultText = context.resultText || '';

                    let systemContent;
                    if (resultText) {
                        systemContent = `Reply in ${userLanguage}. Analyze the following content carefully and provide a concise answer or opinion with a short explanation:\n\n'''\n${resultText}\n'''`;
                    } else {
                        systemContent = `Reply in ${userLanguage}. You are a helpful assistant.`;
                    }

                    setMessages([{ role: 'system', content: systemContent }, ...nonSystemMessages]);
                }
            } catch {
                // Ignore parse errors
            }
        });
    }, [appLanguage]);

    const callApi = useCallback(
        (messagesToSend) => {
            if (!apiConfig) return;

            abortRef.current?.();
            setIsLoading(true);

            const assistantIdx = messagesToSend.length;
            setMessages([...messagesToSend, { role: 'assistant', content: '' }]);

            abortRef.current = chatStream({
                apiConfig,
                messages: messagesToSend,
                onChunk: (accumulated) => {
                    setMessages((prev) => {
                        const next = [...prev];
                        next[assistantIdx] = { role: 'assistant', content: accumulated };
                        return next;
                    });
                },
                onComplete: (finalText) => {
                    setMessages((prev) => {
                        const next = [...prev];
                        next[assistantIdx] = { role: 'assistant', content: finalText };
                        return next;
                    });
                    setIsLoading(false);
                },
                onError: (errMsg) => {
                    setMessages((prev) => {
                        const next = [...prev];
                        next[assistantIdx] = { role: 'assistant', content: `**Error:** ${errMsg}` };
                        return next;
                    });
                    setIsLoading(false);
                },
            });
        },
        [apiConfig]
    );

    const handlePin = async () => {
        const next = !pinned;
        setPinned(next);
        await appWindow.setAlwaysOnTop(next);
    };

    const handleClear = () => {
        setMessages((prev) => prev.filter((msg) => msg.role === 'system'));
    };

    const sendMessage = (text) => {
        if (!apiConfig) return;
        const userMessage = { role: 'user', content: text };
        callApi([...messages, userMessage]);
    };

    const handleEditConfirm = (index, newContent, shouldRegenerate) => {
        const updated = [...messages];
        updated[index] = { ...updated[index], content: newContent };

        if (shouldRegenerate) {
            const truncated = updated.slice(0, index + 1);
            if (truncated[index].role === 'user') {
                callApi(truncated);
            } else {
                // Assistant message edited — truncate and wait for user input
                setMessages(truncated);
            }
        } else {
            setMessages(updated);
        }
    };

    const handleRegenerate = () => {
        const lastIdx = messages.length - 1;
        if (messages[lastIdx]?.role !== 'assistant') return;
        callApi(messages.slice(0, lastIdx));
    };

    const handleSystemPromptChange = (newContent) => {
        setMessages((prev) => {
            if (prev.length === 0 || prev[0].role !== 'system') return prev;
            const next = [...prev];
            next[0] = { ...next[0], content: newContent };
            return next;
        });
    };

    return (
        <div
            className={`${transparent ? 'bg-background/90' : 'bg-background'} h-screen flex flex-col ${
                osType === 'Linux' && 'rounded-[10px] border-1 border-default-100'
            }`}
        >
            {/* Title bar */}
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

            {/* Messages */}
            <MessageList
                messages={messages}
                isLoading={isLoading}
                onEditConfirm={handleEditConfirm}
                onRegenerate={handleRegenerate}
                onSystemPromptChange={handleSystemPromptChange}
            />

            {/* Input */}
            <InputArea
                onSend={sendMessage}
                isLoading={isLoading}
            />
        </div>
    );
}

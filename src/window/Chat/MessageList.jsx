import { Popover, PopoverTrigger, PopoverContent, Button } from '@nextui-org/react';
import { MdEdit, MdCheck, MdClose } from 'react-icons/md';
import PulseLoader from 'react-spinners/PulseLoader';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoReload } from 'react-icons/io5';

import MarkdownRenderer from '../../components/MarkdownRenderer';

export default function MessageList({ messages, isLoading, onEditConfirm, onRegenerate, onSystemPromptChange }) {
    const bottomRef = useRef(null);
    const editTextareaRef = useRef(null);
    const [systemPromptOpen, setSystemPromptOpen] = useState(false);
    const [localEditingIdx, setLocalEditingIdx] = useState(null);
    const [editText, setEditText] = useState('');
    const [showConfirmPopover, setShowConfirmPopover] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        if (localEditingIdx !== null) {
            editTextareaRef.current?.focus();
        }
    }, [localEditingIdx]);

    const startEditing = (idx, content) => {
        setLocalEditingIdx(idx);
        setEditText(content);
        setShowConfirmPopover(false);
    };

    const cancelEditing = () => {
        setLocalEditingIdx(null);
        setEditText('');
        setShowConfirmPopover(false);
    };

    const confirmEdit = (shouldRegenerate) => {
        onEditConfirm(localEditingIdx, editText, shouldRegenerate);
        setLocalEditingIdx(null);
        setEditText('');
        setShowConfirmPopover(false);
    };

    const systemMessage = messages.length > 0 && messages[0].role === 'system' ? messages[0] : null;

    // Preserve original indices while filtering out system messages
    const displayMessages = messages.map((msg, idx) => ({ msg, idx })).filter(({ msg }) => msg.role !== 'system');

    const lastAssistantEntry = [...displayMessages].reverse().find(({ msg }) => msg.role === 'assistant');

    return (
        <div className='flex-1 overflow-y-auto p-3 space-y-3'>
            {/* System Prompt — collapsed by default */}
            {systemMessage && (
                <div className='mb-2'>
                    <button
                        className='text-xs text-default-400 hover:text-default-600 transition-colors'
                        onClick={() => setSystemPromptOpen(!systemPromptOpen)}
                    >
                        {systemPromptOpen ? '▼' : '▶'} {t('chat.system_prompt')}
                    </button>
                    {systemPromptOpen && (
                        <textarea
                            className='w-full mt-1 p-2 text-xs bg-default-50 border border-default-200 rounded-lg resize-none focus:outline-none focus:border-primary min-h-[80px]'
                            value={systemMessage.content}
                            onChange={(e) => onSystemPromptChange(e.target.value)}
                        />
                    )}
                </div>
            )}

            {/* Message bubbles */}
            {displayMessages.map(({ msg, idx }) => {
                const isUser = msg.role === 'user';
                const isEditing = localEditingIdx === idx;
                const isLastAssistant = lastAssistantEntry && lastAssistantEntry.idx === idx;

                return (
                    <div key={idx}>
                        <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            {/* Edit button — user messages, left side */}
                            {isUser && !isLoading && !isEditing && (
                                <button
                                    className='self-center mr-1 opacity-0 group-hover:opacity-100 transition-opacity text-default-300 hover:text-default-500'
                                    onClick={() => startEditing(idx, msg.content)}
                                >
                                    <MdEdit className='text-[14px]' />
                                </button>
                            )}

                            <div
                                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                    isUser ? 'bg-primary/20 text-foreground' : 'bg-default-100 text-foreground'
                                }`}
                            >
                                {isEditing ? (
                                    <div className='space-y-2'>
                                        <textarea
                                            ref={editTextareaRef}
                                            className='w-full min-h-[60px] p-1 text-sm bg-transparent border border-default-300 rounded resize-none focus:outline-none focus:border-primary'
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                        />
                                        <div className='flex gap-1 justify-end'>
                                            <Popover
                                                isOpen={showConfirmPopover}
                                                onOpenChange={setShowConfirmPopover}
                                                placement='top'
                                            >
                                                <PopoverTrigger>
                                                    <Button
                                                        size='sm'
                                                        variant='flat'
                                                        color='primary'
                                                        isIconOnly
                                                        onPress={() => setShowConfirmPopover(true)}
                                                    >
                                                        <MdCheck className='text-[14px]' />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent>
                                                    <div className='p-2 space-y-2'>
                                                        <p className='text-sm'>{t('chat.regenerate_prompt')}</p>
                                                        <div className='flex gap-2 justify-end'>
                                                            <Button
                                                                size='sm'
                                                                variant='flat'
                                                                onPress={() => confirmEdit(false)}
                                                            >
                                                                {t('chat.no')}
                                                            </Button>
                                                            <Button
                                                                size='sm'
                                                                color='primary'
                                                                onPress={() => confirmEdit(true)}
                                                            >
                                                                {t('chat.yes')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                            <Button
                                                size='sm'
                                                variant='flat'
                                                isIconOnly
                                                onPress={cancelEditing}
                                            >
                                                <MdClose className='text-[14px]' />
                                            </Button>
                                        </div>
                                    </div>
                                ) : msg.role === 'assistant' ? (
                                    <MarkdownRenderer>{msg.content}</MarkdownRenderer>
                                ) : (
                                    <p className='whitespace-pre-wrap text-sm'>{msg.content}</p>
                                )}
                            </div>

                            {/* Edit button — assistant messages, right side */}
                            {!isUser && !isLoading && !isEditing && (
                                <button
                                    className='self-center ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-default-300 hover:text-default-500'
                                    onClick={() => startEditing(idx, msg.content)}
                                >
                                    <MdEdit className='text-[14px]' />
                                </button>
                            )}
                        </div>

                        {/* Regenerate button — only on the last assistant message */}
                        {isLastAssistant && !isLoading && !isEditing && (
                            <div className='flex justify-start mt-1 ml-1'>
                                <button
                                    className='text-default-300 hover:text-default-500 transition-colors'
                                    onClick={onRegenerate}
                                    title={t('chat.regenerate')}
                                >
                                    <IoReload className='text-[14px]' />
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Loading spinner — visible only before the first chunk arrives */}
            {isLoading && messages[messages.length - 1]?.content === '' && (
                <div className='flex justify-start'>
                    <div className='bg-default-100 rounded-lg px-3 py-2'>
                        <PulseLoader
                            size={6}
                            color='var(--nextui-colors-default-500)'
                        />
                    </div>
                </div>
            )}
            <div ref={bottomRef} />
        </div>
    );
}

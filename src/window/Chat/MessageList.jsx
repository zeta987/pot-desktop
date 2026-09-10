import { Popover, PopoverTrigger, PopoverContent, Button } from '@nextui-org/react';
import { MdEdit, MdCheck, MdClose } from 'react-icons/md';
import PulseLoader from 'react-spinners/PulseLoader';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoReload } from 'react-icons/io5';

import MarkdownRenderer from '../../components/MarkdownRenderer';
import { getImageParts, getTextFromContent } from './chatContext';

function ImageAttachment({ url, alt, failedText }) {
    const [failed, setFailed] = useState(false);
    if (failed) return <p className='text-xs text-danger'>{failedText}</p>;

    return (
        <img
            src={url}
            alt={alt}
            className='max-h-[200px] max-w-full rounded-md border-1 border-default-200 object-contain'
            draggable={false}
            onError={() => setFailed(true)}
        />
    );
}

function MessageBody({ role, content, t }) {
    const images = getImageParts(content);
    const text = getTextFromContent(content);

    return (
        <div className='space-y-2'>
            {images.map((part, index) => (
                <ImageAttachment
                    key={`image-${index}`}
                    url={part.image_url.url}
                    alt={t('chat.attached_image', { defaultValue: 'Attached image' })}
                    failedText={t('chat.image_preview_failed', {
                        defaultValue: 'The attached image could not be displayed.',
                    })}
                />
            ))}
            {text !== '' &&
                (role === 'assistant' ? (
                    <MarkdownRenderer>{text}</MarkdownRenderer>
                ) : (
                    <p className='whitespace-pre-wrap text-sm'>{text}</p>
                ))}
        </div>
    );
}

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
        if (localEditingIdx !== null) editTextareaRef.current?.focus();
    }, [localEditingIdx]);

    useEffect(() => {
        if (localEditingIdx !== null && !messages[localEditingIdx]) {
            setLocalEditingIdx(null);
            setEditText('');
            setShowConfirmPopover(false);
        }
    }, [messages, localEditingIdx]);

    const startEditing = (index, content) => {
        setLocalEditingIdx(index);
        setEditText(getTextFromContent(content));
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

    const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
    const displayMessages = messages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => message.role !== 'system');
    const lastAssistantEntry = [...displayMessages].reverse().find(({ message }) => message.role === 'assistant');
    const lastMessage = messages.at(-1);

    return (
        <div className='flex-1 overflow-y-auto p-3 space-y-3'>
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
                            value={getTextFromContent(systemMessage.content)}
                            onChange={(event) => onSystemPromptChange(event.target.value)}
                        />
                    )}
                </div>
            )}

            {displayMessages.map(({ message, index }) => {
                const isUser = message.role === 'user';
                const isEditing = localEditingIdx === index;
                const isLastAssistant = lastAssistantEntry?.index === index;

                return (
                    <div key={message.id || index}>
                        <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            {isUser && !isLoading && !isEditing && (
                                <button
                                    className='self-center mr-1 opacity-0 group-hover:opacity-100 transition-opacity text-default-300 hover:text-default-500'
                                    aria-label={t('chat.edit_message', { defaultValue: 'Edit message' })}
                                    onClick={() => startEditing(index, message.content)}
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
                                        {getImageParts(message.content).length > 0 && (
                                            <p className='text-xs text-default-400'>
                                                {t('chat.image_kept_on_edit', {
                                                    defaultValue: 'The attached image is kept when you edit this text.',
                                                })}
                                            </p>
                                        )}
                                        <textarea
                                            ref={editTextareaRef}
                                            className='w-full min-h-[60px] p-1 text-sm bg-transparent border border-default-300 rounded resize-none focus:outline-none focus:border-primary'
                                            value={editText}
                                            onChange={(event) => setEditText(event.target.value)}
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
                                                        aria-label={t('chat.confirm_edit', {
                                                            defaultValue: 'Confirm edit',
                                                        })}
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
                                                aria-label={t('chat.cancel_edit', { defaultValue: 'Cancel edit' })}
                                                onPress={cancelEditing}
                                            >
                                                <MdClose className='text-[14px]' />
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <MessageBody
                                        role={message.role}
                                        content={message.content}
                                        t={t}
                                    />
                                )}
                            </div>

                            {!isUser && !isLoading && !isEditing && (
                                <button
                                    className='self-center ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-default-300 hover:text-default-500'
                                    aria-label={t('chat.edit_message', { defaultValue: 'Edit message' })}
                                    onClick={() => startEditing(index, message.content)}
                                >
                                    <MdEdit className='text-[14px]' />
                                </button>
                            )}
                        </div>

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

            {isLoading && lastMessage?.role === 'assistant' && getTextFromContent(lastMessage.content) === '' && (
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

import { Button } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { IoMdSend } from 'react-icons/io';
import React, { useRef } from 'react';

export default function InputArea({ onSend, isLoading }) {
    const inputRef = useRef(null);
    const { t } = useTranslation();

    const handleSend = () => {
        const text = inputRef.current?.value?.trim();
        if (!text || isLoading) return;
        onSend(text);
        inputRef.current.value = '';
        inputRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInput = () => {
        const el = inputRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        }
    };

    return (
        <div className='flex items-end gap-2 p-3 border-t border-default-200'>
            <textarea
                ref={inputRef}
                rows={1}
                className='flex-1 resize-none bg-default-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary'
                placeholder={t('chat.placeholder')}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
            />
            <Button
                isIconOnly
                size='sm'
                color='primary'
                isDisabled={isLoading}
                onPress={handleSend}
            >
                <IoMdSend className='text-[16px]' />
            </Button>
        </div>
    );
}

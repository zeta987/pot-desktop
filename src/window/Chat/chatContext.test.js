import { describe, expect, it } from 'vitest';

import {
    buildRecognitionChatContext,
    buildTranslationChatContext,
    getImageParts,
    getTextFromContent,
    replaceTextInContent,
    toApiMessages,
} from './chatContext';

const IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';

describe('chat launch contexts', () => {
    it('builds one multimodal OCR message with the image and recognized text', () => {
        const apiConfig = { service: 'openai', model: 'vision-model' };
        const context = buildRecognitionChatContext({
            text: 'recognized words',
            imageBase64: IMAGE_BASE64,
            apiConfig,
        });

        expect(context).toMatchObject({ version: 1, kind: 'recognize', autoSubmit: false, apiConfig });
        expect(context.initialMessages).toHaveLength(1);
        expect(context.initialMessages[0].role).toBe('user');
        expect(getImageParts(context.initialMessages[0].content)).toEqual([
            {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${IMAGE_BASE64}` },
            },
        ]);
        expect(getTextFromContent(context.initialMessages[0].content)).toContain('recognized words');
    });

    it('supports image-only and text-only OCR launch contexts', () => {
        const imageOnly = buildRecognitionChatContext({ imageBase64: IMAGE_BASE64 });
        expect(getImageParts(imageOnly.initialMessages[0].content)).toHaveLength(1);
        expect(getTextFromContent(imageOnly.initialMessages[0].content)).toBe('');

        const textOnly = buildRecognitionChatContext({ text: 'recognized words' });
        expect(textOnly.initialMessages).toEqual([{ role: 'user', content: 'recognized words' }]);
    });

    it('asks once to explain the original and selected translation', () => {
        const apiConfig = { service: 'openai', model: 'selected-instance-model' };
        const context = buildTranslationChatContext({
            sourceText: 'Guten Morgen',
            resultText: 'Good morning',
            apiConfig,
        });

        expect(context).toMatchObject({ version: 1, kind: 'translate', autoSubmit: true, apiConfig });
        expect(context.initialMessages).toHaveLength(1);
        expect(context.initialMessages[0].role).toBe('user');
        expect(context.initialMessages[0].content.match(/Guten Morgen/g)).toHaveLength(1);
        expect(context.initialMessages[0].content.match(/Good morning/g)).toHaveLength(1);
        expect(context.initialMessages[0].content.match(/Explain this translation\./g)).toHaveLength(1);
    });
});

describe('multimodal history helpers', () => {
    const content = [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${IMAGE_BASE64}` } },
        { type: 'text', text: 'recognized words' },
    ];

    it('keeps the image while editing multimodal message text', () => {
        const edited = replaceTextInContent(content, 'corrected words');

        expect(getImageParts(edited)).toHaveLength(1);
        expect(getTextFromContent(edited)).toBe('corrected words');
    });

    it('excludes local error messages from provider history', () => {
        expect(
            toApiMessages([
                { id: '1', role: 'user', content },
                { id: '2', role: 'assistant', content: '**Error:** rejected', localOnly: true },
                { id: '3', role: 'user', content: 'What does the heading say?' },
            ])
        ).toEqual([
            { role: 'user', content },
            { role: 'user', content: 'What does the heading say?' },
        ]);
    });
});

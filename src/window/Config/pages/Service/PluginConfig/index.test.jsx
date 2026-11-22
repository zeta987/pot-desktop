import { NextUIProvider } from '@nextui-org/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock('../../../../../hooks', async () => {
    const { useState } = await import('react');
    return {
        useConfig: () => {
            const [value, setValue] = useState({});
            return [
                value,
                (next, save) => {
                    setValue(next);
                    if (save) config.save(next);
                },
            ];
        },
    };
});

import { PluginConfig } from './index';
import '../../../../../i18n';

it('shows the plugin switch default for an existing instance and saves an explicit false', async () => {
    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin_ocr@first'
                name='plugin_ocr'
                onClose={() => {}}
                pluginList={{
                    plugin_ocr: {
                        display: 'OCR',
                        needs: [{ key: 'stream', display: 'Stream output', type: 'switch', default: true }],
                    },
                }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    const streaming = screen.getByRole('switch', { name: 'Stream output' });
    expect(streaming).toBeChecked();
    await userEvent.click(streaming);
    expect(streaming).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(config.save).toHaveBeenCalledExactlyOnceWith({ stream: false });
});

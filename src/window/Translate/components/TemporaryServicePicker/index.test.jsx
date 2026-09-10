import { NextUIProvider } from '@nextui-org/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';

import TemporaryServicePicker from './index';

const candidates = [
    { key: 'openai@first', label: 'First OpenAI' },
    { key: 'openai@second', label: 'Second OpenAI' },
    { key: 'openai@third', label: 'Third OpenAI' },
];

const picker = (props = {}) => (
    <NextUIProvider>
        <TemporaryServicePicker
            label='Temporary services'
            hint='This window only'
            candidates={candidates}
            value={['openai@first']}
            isDragging={false}
            onChange={() => {}}
            {...props}
        />
    </NextUIProvider>
);

function ControlledPicker({ onChange }) {
    const [value, setValue] = useState([]);
    return picker({
        value,
        onChange: (keys) => {
            setValue(keys);
            onChange(keys);
        },
    });
}

describe('TemporaryServicePicker', () => {
    it('reports controlled instance selection and blocks membership changes during a drag', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const view = render(picker({ onChange }));
        const trigger = screen.getByRole('button', { name: /Temporary services/ });

        await user.click(trigger);
        await user.click(await screen.findByRole('option', { name: 'Second OpenAI' }));

        expect(onChange).toHaveBeenLastCalledWith(['openai@first', 'openai@second']);

        onChange.mockClear();
        view.rerender(picker({ isDragging: true, onChange }));

        expect(trigger).toHaveAttribute('data-disabled', 'true');
        expect(screen.getByRole('option', { name: 'Second OpenAI' })).toHaveAttribute('aria-disabled', 'true');
        await user.keyboard('{Enter}');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('closes on Escape without clearing the temporary selection', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onDocumentKeyDown = vi.fn();
        document.addEventListener('keydown', onDocumentKeyDown);
        render(<ControlledPicker onChange={onChange} />);
        const trigger = screen.getByRole('button', { name: /Temporary services/ });

        await user.click(trigger);
        await user.click(await screen.findByRole('option', { name: 'Second OpenAI' }));
        await user.click(screen.getByRole('option', { name: 'Third OpenAI' }));

        expect(screen.getByRole('option', { name: 'Second OpenAI' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: 'Third OpenAI' })).toHaveAttribute('aria-selected', 'true');

        onChange.mockClear();
        await user.keyboard('{Escape}');

        expect.soft(trigger).toHaveAttribute('aria-expanded', 'false');
        expect.soft(onChange).not.toHaveBeenCalled();
        expect.soft(trigger).toHaveTextContent('Second OpenAI');
        expect.soft(trigger).toHaveTextContent('Third OpenAI');
        expect(onDocumentKeyDown).not.toHaveBeenCalled();

        act(() => trigger.focus());
        expect(trigger).toHaveFocus();
        await user.keyboard('{Escape}');

        expect(onDocumentKeyDown).toHaveBeenCalledTimes(1);
        expect(onDocumentKeyDown.mock.calls[0][0].key).toBe('Escape');
        expect(onChange).not.toHaveBeenCalled();
        expect(trigger).toHaveTextContent('Second OpenAI');
        expect(trigger).toHaveTextContent('Third OpenAI');
        document.removeEventListener('keydown', onDocumentKeyDown);
    });
});

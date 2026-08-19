import { NextUIProvider } from '@nextui-org/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import PausedRunGroup from './index';
import '../../../../i18n';

const renderGroup = (props) =>
    render(
        <NextUIProvider>
            <PausedRunGroup
                count={5}
                isExpanded={false}
                onToggle={() => {}}
                {...props}
            />
        </NextUIProvider>
    );

describe('PausedRunGroup', () => {
    it('states how many paused services the run stands for', () => {
        renderGroup({ count: 12 });
        expect(screen.getByText('12 paused services')).toBeInTheDocument();
    });

    it('reports the count for the smallest run that gets collapsed', () => {
        renderGroup({ count: 2 });
        expect(screen.getByText('2 paused services')).toBeInTheDocument();
    });

    it('toggles when the arrow is pressed', async () => {
        const onToggle = vi.fn();
        renderGroup({ onToggle });

        await userEvent.click(screen.getByRole('button'));

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('offers exactly one control, so the rest of the header stays a drag handle', () => {
        renderGroup({});
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('passes drag handle props through to the header', () => {
        renderGroup({ 'data-testid': 'drag-handle' });
        expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
    });

    it('keeps the same count label when expanded', () => {
        renderGroup({ isExpanded: true, count: 6 });
        expect(screen.getByText('6 paused services')).toBeInTheDocument();
    });
});

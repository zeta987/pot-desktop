import { describe, expect, it, vi } from 'vitest';

import { createTargetAreaReveal } from './target_area_reveal';

describe('createTargetAreaReveal', () => {
    it('opens the Target Area so a run has somewhere to show what it produced', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.open();

        expect(setHide).toHaveBeenCalledWith(false);
    });

    it('opens once however many streamed chunks a run pushes through it', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.open();
        reveal.open();
        reveal.open();

        expect(setHide).toHaveBeenCalledTimes(1);
    });

    it('collapses the Target Area while a run is in flight', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.collapse();

        expect(setHide).toHaveBeenCalledWith(true);
    });

    it('opens the Target Area when a run settles with a result', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.collapse();
        reveal.settle('hola');

        expect(setHide).toHaveBeenLastCalledWith(false);
    });

    it('leaves the Target Area collapsed when a run settles with nothing to show', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.collapse();
        reveal.settle('');

        expect(setHide).not.toHaveBeenCalledWith(false);
    });

    it('opens again for the next run, because collapsing arms the handle afresh', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.collapse();
        reveal.open();
        reveal.collapse();
        reveal.open();

        expect(setHide.mock.calls).toEqual([[true], [false], [true], [false]]);
    });

    it('opens the Target Area a failed run had collapsed, so the error is readable', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.collapse();
        reveal.open();

        expect(setHide.mock.calls).toEqual([[true], [false]]);
    });

    it('lets a failure that lands after a streamed chunk leave the open panel alone', () => {
        const setHide = vi.fn();
        const reveal = createTargetAreaReveal(setHide);

        reveal.collapse();
        reveal.open();
        reveal.open();

        expect(setHide.mock.calls).toEqual([[true], [false]]);
    });
});

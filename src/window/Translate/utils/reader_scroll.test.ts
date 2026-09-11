import { describe, expect, it, vi } from 'vitest';

import { preserveReaderScroll } from './reader_scroll';

describe('preserveReaderScroll', () => {
    it('keeps the reader at the same position while streamed content grows', () => {
        const viewport = document.createElement('div');
        viewport.scrollTop = 127;
        const resize = vi.fn(() => {
            viewport.scrollTop = 480;
        });

        preserveReaderScroll(viewport, resize);

        expect(resize).toHaveBeenCalledTimes(1);
        expect(viewport.scrollTop).toBe(127);
    });

    it('uses the latest manually selected position for the next streamed update', () => {
        const viewport = document.createElement('div');
        viewport.scrollTop = 64;

        preserveReaderScroll(viewport, () => {
            viewport.scrollTop = 900;
        });

        expect(viewport.scrollTop).toBe(64);
    });

    it('still applies the content update when there is no scroll viewport', () => {
        const resize = vi.fn();

        preserveReaderScroll(null, resize);

        expect(resize).toHaveBeenCalledTimes(1);
    });
});

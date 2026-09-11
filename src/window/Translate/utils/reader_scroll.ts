export interface ReaderScrollViewport {
    scrollTop: number;
}

/**
 * Apply a layout-changing result update while retaining the reader's current position.
 * The next update captures scrollTop again, so manual scrolling between chunks wins.
 */
export const preserveReaderScroll = <T>(viewport: ReaderScrollViewport | null | undefined, resize: () => T): T => {
    if (!viewport) return resize();

    const capturedScrollTop = viewport.scrollTop;
    try {
        return resize();
    } finally {
        if (viewport.scrollTop !== capturedScrollTop) {
            viewport.scrollTop = capturedScrollTop;
        }
    }
};

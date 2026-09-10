import { describe, expect, it } from 'vitest';
import { getAutoRecognitionServices } from './recognition_selection';

describe('automatic OCR selection', () => {
    it('keeps the legacy first service when no selection has been saved', () => {
        expect(getAutoRecognitionServices(['system', 'tesseract'], undefined)).toEqual(['system']);
    });

    it('preserves an explicitly empty selection', () => {
        expect(getAutoRecognitionServices(['system', 'tesseract'], [])).toEqual([]);
    });

    it('does not enable another provider after all saved selections were deleted', () => {
        expect(getAutoRecognitionServices(['system', 'tesseract'], ['removed'])).toEqual([]);
    });

    it('does not invent a default when the configured list is empty', () => {
        expect(getAutoRecognitionServices([], undefined)).toEqual([]);
    });

    it('keeps configured ordering and distinct instances, ignoring deleted and duplicate keys', () => {
        expect(
            getAutoRecognitionServices(
                ['system', 'plugin_a@first', 'plugin_a@second'],
                ['plugin_a@second', 'deleted', 'plugin_a@first', 'plugin_a@second']
            )
        ).toEqual(['plugin_a@first', 'plugin_a@second']);
    });
});

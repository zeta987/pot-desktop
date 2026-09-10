import { Chip, Select, SelectItem } from '@nextui-org/react';
import React, { useState } from 'react';

/**
 * Controlled picker for this window's temporary Service Instance activation. It owns
 * no selection state and reads no persisted configuration. Dragging disables both its
 * trigger and its change handler because Paused Run membership must stay fixed during a drag.
 */
export default function TemporaryServicePicker({
    label,
    hint,
    candidates = [],
    value = [],
    isDragging = false,
    onChange,
}) {
    const [isOpen, setIsOpen] = useState(false);

    if (candidates.length === 0) return null;

    const labelOf = (key) => candidates.find((candidate) => candidate.key === key)?.label ?? key;

    const readSelection = (keys) => {
        if (keys === 'all') return candidates.map((candidate) => candidate.key);
        const picked = new Set(keys);
        return candidates.map((candidate) => candidate.key).filter((key) => picked.has(key));
    };

    const closeOnEscape = (event) => {
        if (!isOpen || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
    };

    return (
        <div
            className='mb-[8px]'
            onKeyDownCapture={closeOnEscape}
        >
            <Select
                size='sm'
                variant='bordered'
                selectionMode='multiple'
                label={label}
                description={hint}
                aria-label={label}
                isDisabled={isDragging}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                selectedKeys={new Set(value)}
                items={candidates}
                classNames={{ description: 'text-[11px]' }}
                renderValue={(items) => (
                    <div className='flex flex-wrap gap-[4px]'>
                        {items.map((item) => (
                            <Chip
                                key={item.key}
                                size='sm'
                                variant='flat'
                            >
                                {labelOf(item.key)}
                            </Chip>
                        ))}
                    </div>
                )}
                onSelectionChange={(keys) => {
                    if (isDragging) return;
                    onChange(readSelection(keys));
                }}
            >
                {(candidate) => (
                    <SelectItem
                        key={candidate.key}
                        textValue={candidate.label}
                    >
                        {candidate.label}
                    </SelectItem>
                )}
            </Select>
        </div>
    );
}

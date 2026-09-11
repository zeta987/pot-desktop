export function createServiceListReorder(renderedList, result) {
    const { destination, draggableId, source } = result;
    if (!destination || source.index === destination.index || renderedList[source.index] !== draggableId) {
        return (currentList) => currentList;
    }

    const anchorKey = renderedList[destination.index];
    const insertAfterAnchor = destination.index > source.index;

    return (currentList) => {
        const movingIndex = currentList.indexOf(draggableId);
        const anchorIndex = currentList.indexOf(anchorKey);
        if (movingIndex === -1 || anchorIndex === -1 || draggableId === anchorKey) {
            return currentList;
        }

        const reordered = [...currentList];
        reordered.splice(movingIndex, 1);
        const currentAnchorIndex = reordered.indexOf(anchorKey);
        reordered.splice(currentAnchorIndex + (insertAfterAnchor ? 1 : 0), 0, draggableId);
        return reordered;
    };
}

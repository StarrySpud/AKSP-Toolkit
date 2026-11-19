function sameComposition(before, after) {
  return before.length === after.length && before.every(({ name }, index) => name === after[index].name);
}

export function recordTargetLineupChange(before, after, removedIndex) {
  if (sameComposition(before, after)) return null;
  const indexesByName = new Map();
  after.forEach(({ name }, index) => {
    if (!indexesByName.has(name)) indexesByName.set(name, []);
    indexesByName.get(name).push(index);
  });
  const retainedIndexes = before.map(({ name }, index) =>
    index === removedIndex ? undefined : indexesByName.get(name)?.shift());
  return { before, after, retainedIndexes };
}

export function canUndoTargetLineup(change, lineup) {
  return Boolean(change && sameComposition(change.after, lineup));
}

export function undoTargetLineupChange(change, lineup) {
  return change.before.map((piece, index) => {
    const retainedIndex = change.retainedIndexes[index];
    if (retainedIndex === undefined) return piece;
    const current = lineup[retainedIndex];
    // Promotion edits after the roster change are independent of the undo step.
    return current.promoted === change.after[retainedIndex].promoted
      ? piece : { ...piece, promoted: current.promoted };
  });
}

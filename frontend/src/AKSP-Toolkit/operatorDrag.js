const OPERATOR_TYPE = "application/x-aksp-operator";

export function startOperatorDrag(event, name) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(OPERATOR_TYPE, name);
}

export function allowOperatorDrop(event, enabled = true) {
  if (!event.dataTransfer?.types.includes(OPERATOR_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = enabled ? "copy" : "none";
}

export function dropOperator(event, add, enabled = true) {
  if (!event.dataTransfer?.types.includes(OPERATOR_TYPE)) return;
  event.preventDefault();
  event.stopPropagation();
  const name = event.dataTransfer.getData(OPERATOR_TYPE);
  if (enabled && name) add(name);
}

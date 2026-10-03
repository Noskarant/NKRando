export function computeSheetSnaps(containerHeight, collapsedHeight = 92, midRatio = .36, maxRatio = .72) {
  const container = Math.max(240, Number(containerHeight) || 0)
  const min = Math.min(collapsedHeight, Math.max(78, container * .22))
  const mid = Math.max(min + 70, Math.min(container * midRatio, container - 150))
  const max = Math.max(mid + 70, Math.min(container * maxRatio, container - 12))
  return [Math.round(min), Math.round(mid), Math.round(max)]
}

export function clampSheetHeight(height, snaps) {
  return Math.max(snaps[0], Math.min(snaps[2], height))
}

export function draggedSheetHeight(startHeight, startY, currentY, snaps) {
  return clampSheetHeight(startHeight + (startY - currentY), snaps)
}

export function nearestSheetSnap(height, snaps) {
  let nearest = 0
  snaps.forEach((value, index) => {
    if (Math.abs(value - height) < Math.abs(snaps[nearest] - height)) nearest = index
  })
  return nearest
}

export function nextSheetSnap(index) {
  return index === 0 ? 1 : index === 1 ? 2 : 0
}

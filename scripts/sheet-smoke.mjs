import {
  computeSheetSnaps,
  draggedSheetHeight,
  nearestSheetSnap,
  nextSheetSnap
} from '../src/lib/sheet.js'

const snaps = computeSheetSnaps(760, 100, .36, .72)
if (!(snaps[0] < snaps[1] && snaps[1] < snaps[2])) {
  throw new Error('Sheet snaps are not strictly increasing: ' + JSON.stringify(snaps))
}

const up = draggedSheetHeight(snaps[1], 500, 300, snaps)
const down = draggedSheetHeight(snaps[1], 300, 520, snaps)
if (!(up > snaps[1] && down < snaps[1])) {
  throw new Error('Drag direction is incorrect')
}

if (nearestSheetSnap(snaps[2] - 5, snaps) !== 2) throw new Error('Expanded snap failed')
if (nearestSheetSnap(snaps[0] + 5, snaps) !== 0) throw new Error('Collapsed snap failed')
if (nextSheetSnap(0) !== 1 || nextSheetSnap(1) !== 2 || nextSheetSnap(2) !== 0) {
  throw new Error('Tap snap cycle failed')
}

console.log('Bottom sheet interaction logic OK:', { snaps, up, down })

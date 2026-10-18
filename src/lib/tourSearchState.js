// An explicitly selected place outranks the device location.
export function chooseTourCenter(...candidates) {
  return candidates.find(p => p != null &&
    Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) &&
    Number(p.lat) >= -90 && Number(p.lat) <= 90 &&
    Number(p.lon) >= -180 && Number(p.lon) <= 180
  ) || null
}

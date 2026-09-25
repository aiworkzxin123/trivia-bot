/** 2100 → "2.1" */
export function seconds(ms: number) {
  return (ms / 1000).toFixed(1)
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

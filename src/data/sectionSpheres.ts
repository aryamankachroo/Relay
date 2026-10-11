export type SectionSphere = 'sky' | 'mint' | 'turquoise' | 'aqua' | 'leaf'

export function sphereClass(sphere: SectionSphere) {
  return `sphere-${sphere}`
}

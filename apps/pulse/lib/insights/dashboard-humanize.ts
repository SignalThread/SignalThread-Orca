/**
 * Same transforms as the event dashboard — used when persisting insights server-side
 * so titles stay aligned with the Key Insights UI.
 */
export function dashboardHumanizeAction(text: string): string {
  return text
    .replace(/^Implement\s+/i, 'Set up ')
    .replace(/^Evaluate\s+/i, 'Look into ')
    .replace(/^Explore\s+/i, 'Consider ')
    .replace(/^Optimize\s+/i, 'Improve ')
    .replace(/^Conduct\s+/i, 'Do ')
    .replace(/^Ensure\s+/i, 'Make sure ')
    .replace(/quality control/gi, 'quality checks')
    .replace(/infrastructure/gi, 'system')
    .replace(/capacity/gi, 'space')
}

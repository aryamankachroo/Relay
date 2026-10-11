/** Shared badge tone for loan and handoff status chips. */
export function statusTone(kind: 'loan' | 'handoff', status: string) {
  if (kind === 'loan') {
    if (status === 'Returned') return 'done' as const
    if (status === 'Requested') return 'pending' as const
    return 'active' as const
  }
  if (status === 'Received') return 'done' as const
  if (status === 'Pending confirmation') return 'pending' as const
  return 'active' as const
}

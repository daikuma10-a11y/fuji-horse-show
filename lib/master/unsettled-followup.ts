export type UnsettledFollowup = {reason: string; contact: '' | '未連絡' | '連絡済み'}
export const emptyFollowup: UnsettledFollowup = {reason: '', contact: ''}

export function readFollowup(storage: Storage, key: string, id: string): UnsettledFollowup {
  const raw = storage.getItem(`${key}:${id}`)
  if (raw === null) return emptyFollowup
  const value = JSON.parse(raw)
  if (typeof value?.reason !== 'string' || !['', '未連絡', '連絡済み'].includes(value.contact))
    throw new Error('保存済みの備考を読み込めません。')
  return {reason: value.reason, contact: value.contact}
}

export function writeFollowup(storage: Storage, key: string, id: string, expected: UnsettledFollowup, next: UnsettledFollowup) {
  const current = readFollowup(storage, key, id)
  if (current.reason !== expected.reason || current.contact !== expected.contact)
    throw new Error('別の画面で備考が更新されています。入力内容を控えてから「保存内容を読み直す」を押してください。')
  if (next.reason || next.contact) storage.setItem(`${key}:${id}`, JSON.stringify(next))
  else storage.removeItem(`${key}:${id}`)
}

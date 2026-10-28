export type ReadingListRow = {
  id: string
  name: string
  reading: string
  organizations: string[]
  number: string
}
export type ReadingList = { riders: ReadingListRow[]; horses: ReadingListRow[] }

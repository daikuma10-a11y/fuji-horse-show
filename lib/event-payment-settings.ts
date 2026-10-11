// Bank instructions belong to the event, not to individual organizations.
// Add the organizer-confirmed destination for each future event here.
const eventBankDetails: Record<string, string> = {
  '2af66251-66a2-4c51-8180-a5badf0584d4': '静岡銀行 御殿場支店 普通 0903214',
}
export function bankDetailsForEvent(eventId: string): string {
  return eventBankDetails[eventId] ?? ''
}

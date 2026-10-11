// Autumn原本で同一団体と確認済みの表記差。人馬IDやDB行は統合しない。
const confirmedAliases: Record<string, string> = {
  "org-2": "org-4",
  "org-6": "org-8",
  "org-23": "org-17",
  "org-24": "org-25",
}

export const canonicalOrgId = (id: string) => confirmedAliases[id] ?? id

import { MasterReceptionHome } from "@/components/master/reception-home"
import { ReceptionDraftLink } from "@/components/reception-draft-link"

export default function HomePage() {
  return <MasterReceptionHome drafts={<ReceptionDraftLink />} />
}

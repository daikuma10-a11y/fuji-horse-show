import {validateWinterSettlementRecord,type WinterSettlementRecord} from './winter-checkout'
import {winterMasterSavedSettlement} from './winter-master-settlement'
import {masterCheckoutPrintHtml} from './master/settlement-print'
export function winterCheckoutPrintHtml(record:WinterSettlementRecord){
 const saved=validateWinterSettlementRecord(record,record.organization_key)
 return masterCheckoutPrintHtml(winterMasterSavedSettlement(saved,saved.organization_key))
}

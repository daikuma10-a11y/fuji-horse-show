import type {SettlementReceipt} from '../settlement-receipts'
/** Rendering contract only; issuing/recording receipts remains in event adapters. */
export type MasterReceiptPrintRecord=Pick<SettlementReceipt,'id'|'issue_date'|'recipient'|'amount'|'purpose'|'payment_method'|'tax_amount'|'issuer_name'|'issuer_address'|'registration_number'|'document_items'|'selected_items'>

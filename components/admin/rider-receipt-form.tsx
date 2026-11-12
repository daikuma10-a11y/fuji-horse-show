'use client'
import {useScopedReceiptForm, type ReceiptFormProps} from '@/components/master/scoped-receipt-form'
import {createSettlementReceipt} from '@/lib/settlement-receipts'
export function RiderReceiptForm(props:Omit<ReceiptFormProps,'defaultPurpose'|'saveReceipt'>) {
  return useScopedReceiptForm({...props,defaultPurpose:'2026 Fuji Horse Show Autumn Grand Prix エントリー代として',saveReceipt:createSettlementReceipt})
}

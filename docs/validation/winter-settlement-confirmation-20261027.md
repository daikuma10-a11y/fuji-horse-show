# Settlement acknowledgement and blocking guidance — 2026-10-27

The iPad screenshot shows an unconfirmed advance-payment warning. The shared checkout disabled its statement acknowledgement checkbox whenever any warning existed, making an intentional settlement block appear to be an unresponsive checkbox.

The statement acknowledgement now remains usable while the account has warnings. Saving remains blocked in both the view and the Winter controller until the account warnings are resolved; the Autumn controller now applies the same explicit warning guard. Busy and uncertain-save locks still disable the checkbox. This does not mark an advance payment as verified, create a payment, or treat an unknown payment as zero paid.

A shared notice explains that settlement is awaiting headquarters confirmation, displays the original warning, and, for advance-payment warnings, gives the existing staff workflow: open the club's settlement account, record the actually verified advance payment, and use zero only when nonpayment has been verified. A read-only reload button refreshes the account. The disabled final button explicitly says that settlement is not confirmed. Reload resets the visitor's acknowledgement and inputs so the refreshed amounts must be checked again.

## Validation

- Eight targeted test modules passed: Winter and Autumn checkout controllers/UI, shared layout and print equivalence, saved statement restoration, settlement calculations/API guards, Winter print behavior, and admin settlement layout.
- Synthetic Winter flow: unknown advance payment → checkbox can be selected → confirmation remains blocked, including a direct callback → reload alone cannot clear the warning → synthetic staff-side zero-paid record → fresh read clears the warning but requires renewed acknowledgement → ordinary confirmation/retry/reprint flow.
- Synthetic Autumn flow also keeps unresolved requests from being submitted despite checkbox selection; the shared reload does not write.
- Existing no-warning Autumn markup and print template remain identical to the validated baseline.
- Standalone TypeScript validation passed.
- Optimized Next.js webpack build passed; all 26 routes generated. Webpack handles the local checkout's shared dependency symlink.

No live account, advance-payment record, settlement, or receipt was changed. This verifies React/controller behavior with synthetic services; an actual iPad tap or printer output was not exercised.

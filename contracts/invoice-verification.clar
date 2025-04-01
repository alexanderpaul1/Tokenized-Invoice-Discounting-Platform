;; Invoice Verification Contract
;; This contract validates the legitimacy of business receivables

(define-data-var admin principal tx-sender)

;; Invoice structure
(define-map invoices
  { invoice-id: (string-ascii 32) }
  {
    issuer: principal,
    recipient: principal,
    amount: uint,
    due-date: uint,
    status: (string-ascii 20),
    verified: bool,
    timestamp: uint
  }
)

;; Verification records
(define-map verification-records
  { invoice-id: (string-ascii 32) }
  {
    verifier: principal,
    timestamp: uint,
    verification-method: (string-ascii 20),
    verification-data: (string-ascii 256)
  }
)

;; Error codes
(define-constant ERR_UNAUTHORIZED u1)
(define-constant ERR_ALREADY_VERIFIED u2)
(define-constant ERR_INVOICE_NOT_FOUND u3)
(define-constant ERR_INVALID_DATA u4)

;; Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Register a new invoice
(define-public (register-invoice
    (invoice-id (string-ascii 32))
    (recipient principal)
    (amount uint)
    (due-date uint)
    (status (string-ascii 20))
  )
  (begin
    (asserts! (> (len invoice-id) u0) (err ERR_INVALID_DATA))
    (asserts! (> amount u0) (err ERR_INVALID_DATA))
    (asserts! (> due-date block-height) (err ERR_INVALID_DATA))

    (map-insert invoices
      { invoice-id: invoice-id }
      {
        issuer: tx-sender,
        recipient: recipient,
        amount: amount,
        due-date: due-date,
        status: status,
        verified: false,
        timestamp: block-height
      }
    )
    (ok true)
  )
)

;; Verify an invoice
(define-public (verify-invoice
    (invoice-id (string-ascii 32))
    (verification-method (string-ascii 20))
    (verification-data (string-ascii 256))
  )
  (let (
    (invoice (unwrap! (map-get? invoices { invoice-id: invoice-id }) (err ERR_INVOICE_NOT_FOUND)))
  )
    (asserts! (or (is-admin) (is-eq tx-sender (get issuer invoice))) (err ERR_UNAUTHORIZED))
    (asserts! (not (get verified invoice)) (err ERR_ALREADY_VERIFIED))

    (map-set invoices
      { invoice-id: invoice-id }
      (merge invoice { verified: true })
    )

    (map-insert verification-records
      { invoice-id: invoice-id }
      {
        verifier: tx-sender,
        timestamp: block-height,
        verification-method: verification-method,
        verification-data: verification-data
      }
    )
    (ok true)
  )
)

;; Get invoice details
(define-read-only (get-invoice (invoice-id (string-ascii 32)))
  (map-get? invoices { invoice-id: invoice-id })
)

;; Get verification details
(define-read-only (get-verification (invoice-id (string-ascii 32)))
  (map-get? verification-records { invoice-id: invoice-id })
)

;; Set admin
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR_UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

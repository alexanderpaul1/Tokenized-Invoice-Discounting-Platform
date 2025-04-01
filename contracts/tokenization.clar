;; Tokenization Contract
;; This contract converts receivables into tradable digital assets

(define-data-var admin principal tx-sender)
(define-data-var token-counter uint u0)

;; Token structure
(define-map invoice-tokens
  { token-id: uint }
  {
    invoice-id: (string-ascii 32),
    owner: principal,
    face-value: uint,
    discount-rate: uint,
    maturity-date: uint,
    status: (string-ascii 20),
    created-at: uint
  }
)

;; Invoice to token mapping
(define-map invoice-to-token
  { invoice-id: (string-ascii 32) }
  { token-id: uint }
)

;; Token transfers
(define-map token-transfers
  { transfer-id: uint }
  {
    token-id: uint,
    from: principal,
    to: principal,
    amount: uint,
    timestamp: uint
  }
)

;; Error codes
(define-constant ERR_UNAUTHORIZED u1)
(define-constant ERR_INVALID_DATA u2)
(define-constant ERR_NOT_FOUND u3)
(define-constant ERR_ALREADY_TOKENIZED u4)
(define-constant ERR_NOT_OWNER u5)

;; Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Tokenize an invoice
(define-public (tokenize-invoice
    (invoice-id (string-ascii 32))
    (face-value uint)
    (discount-rate uint)
    (maturity-date uint)
  )
  (let (
    (token-id (var-get token-counter))
  )
    (asserts! (> (len invoice-id) u0) (err ERR_INVALID_DATA))
    (asserts! (> face-value u0) (err ERR_INVALID_DATA))
    (asserts! (<= discount-rate u100) (err ERR_INVALID_DATA))
    (asserts! (> maturity-date block-height) (err ERR_INVALID_DATA))
    (asserts! (is-none (map-get? invoice-to-token { invoice-id: invoice-id })) (err ERR_ALREADY_TOKENIZED))

    ;; Increment token counter
    (var-set token-counter (+ token-id u1))

    ;; Create token
    (map-insert invoice-tokens
      { token-id: token-id }
      {
        invoice-id: invoice-id,
        owner: tx-sender,
        face-value: face-value,
        discount-rate: discount-rate,
        maturity-date: maturity-date,
        status: "active",
        created-at: block-height
      }
    )

    ;; Map invoice to token
    (map-insert invoice-to-token
      { invoice-id: invoice-id }
      { token-id: token-id }
    )

    (ok token-id)
  )
)

;; Transfer token ownership
(define-public (transfer-token
    (token-id uint)
    (recipient principal)
  )
  (let (
    (token (unwrap! (map-get? invoice-tokens { token-id: token-id }) (err ERR_NOT_FOUND)))
  )
    (asserts! (is-eq tx-sender (get owner token)) (err ERR_NOT_OWNER))

    ;; Update token ownership
    (map-set invoice-tokens
      { token-id: token-id }
      (merge token { owner: recipient })
    )

    ;; Record transfer
    (map-insert token-transfers
      { transfer-id: (var-get token-counter) }
      {
        token-id: token-id,
        from: tx-sender,
        to: recipient,
        amount: (get face-value token),
        timestamp: block-height
      }
    )

    ;; Increment token counter for transfer ID
    (var-set token-counter (+ (var-get token-counter) u1))

    (ok true)
  )
)

;; Get token details
(define-read-only (get-token (token-id uint))
  (map-get? invoice-tokens { token-id: token-id })
)

;; Get token ID for an invoice
(define-read-only (get-token-for-invoice (invoice-id (string-ascii 32)))
  (map-get? invoice-to-token { invoice-id: invoice-id })
)

;; Calculate current token value based on time to maturity
(define-read-only (calculate-current-value (token-id uint))
  (let (
    (token (unwrap-panic (map-get? invoice-tokens { token-id: token-id })))
    (face-value (get face-value token))
    (discount-rate (get discount-rate token))
    (maturity-date (get maturity-date token))
    (time-to-maturity (if (> maturity-date block-height)
                         (- maturity-date block-height)
                         u0))
  )
    (if (is-eq time-to-maturity u0)
      face-value
      (- face-value (/ (* face-value discount-rate time-to-maturity) u10000))
    )
  )
)

;; Set token status
(define-public (set-token-status
    (token-id uint)
    (new-status (string-ascii 20))
  )
  (let (
    (token (unwrap! (map-get? invoice-tokens { token-id: token-id }) (err ERR_NOT_FOUND)))
  )
    (asserts! (or (is-admin) (is-eq tx-sender (get owner token))) (err ERR_UNAUTHORIZED))

    (map-set invoice-tokens
      { token-id: token-id }
      (merge token { status: new-status })
    )

    (ok true)
  )
)

;; Set admin
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR_UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

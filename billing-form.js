(async () => {
  const ms = window.$memberstackDom
  const member = await ms.getCurrentMember()
  const memberstackId = member?.data?.id
  const stripeCustomerId = member?.data?.stripeCustomerId

  // ── NEU: Token holen ────────────────────────────────────────────────────────
  const { data: tokenData } = await ms.getMemberJSON()
  const token = tokenData?._token

  const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/get-user-billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberstackId })
  })
  const { data: user } = await res.json()
  if (user) {
    setValue('billing-salutation', user.salutation)
    setValue('billing-firstname', user.firstname)
    setValue('billing-lastname', user.lastname)
    setValue('billing-company', user.billing_company)
    setValue('billing-vat', user.billing_vat_id)
    setValue('billing-street', user.billing_street)
    setValue('billing-zip', user.billing_zip)
    setValue('billing-city', user.billing_city)
    setValue('billing-country', user.billing_country)
  }

  function setValue(id, value) {
    const el = document.getElementById(id)
    if (el && value) el.value = value
  }

  document.getElementById('billing-save').addEventListener('click', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('billing-save')
    const originalText = btn.textContent
    btn.textContent = 'Wird gespeichert...'
    btn.style.opacity = '0.6'
    btn.style.pointerEvents = 'none'

    const saveRes = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/update-billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`  // ── NEU
      },
      body: JSON.stringify({
        // memberstackId raus — kommt jetzt aus dem Token
        stripeCustomerId,
        salutation: document.getElementById('billing-salutation')?.value,
        firstname:  document.getElementById('billing-firstname')?.value,
        lastname:   document.getElementById('billing-lastname')?.value,
        company:    document.getElementById('billing-company')?.value,
        vat_id:     document.getElementById('billing-vat')?.value,
        street:     document.getElementById('billing-street')?.value,
        zip:        document.getElementById('billing-zip')?.value,
        city:       document.getElementById('billing-city')?.value,
        country:    document.getElementById('billing-country')?.value,
      })
    })

    const data = await saveRes.json()
    if (data.success) {
      btn.textContent = 'Gespeichert ✓'
      btn.style.opacity = '1'
      setTimeout(() => {
        btn.textContent = originalText
        btn.style.pointerEvents = 'auto'
      }, 2000)
    } else {
      btn.textContent = 'Fehler – nochmal versuchen'
      btn.style.opacity = '1'
      btn.style.pointerEvents = 'auto'
    }
  })
})()

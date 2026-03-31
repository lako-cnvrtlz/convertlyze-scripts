(async () => {
  const ms = window.$memberstackDom
  const member = await ms.getCurrentMember()
  const memberstackId = member?.data?.id

  // Präferenzen aus Supabase laden
  const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/get-user-billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberstackId })
  })
  const { data: user } = await res.json()

  // Checkboxen befüllen
  if (user?.email_preferences) {
    setCheckbox('pref-product-updates', user.email_preferences.product_updates)
    setCheckbox('pref-marketing-tips', user.email_preferences.marketing_tips)
  }

  function setCheckbox(id, value) {
    const el = document.getElementById(id)
    if (el) el.checked = !!value
  }

  // Speichern
  document.getElementById('pref-save').addEventListener('click', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('pref-save')
    const originalText = btn.textContent
    btn.textContent = 'Wird gespeichert...'
    btn.style.opacity = '0.6'
    btn.style.pointerEvents = 'none'

    const saveRes = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/update-email-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberstackId,
        product_updates: document.getElementById('pref-product-updates')?.checked,
        marketing_tips: document.getElementById('pref-marketing-tips')?.checked,
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

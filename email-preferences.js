(async () => {
  // Erfolgsmeldung initial verstecken
  const msg = document.getElementById('pref-success')
  if (msg) msg.style.display = 'none'

  const ms = window.$memberstackDom
  const member = await ms.getCurrentMember()
  const memberstackId = member?.data?.id

  const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/get-user-billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberstackId })
  })
  const { data: user } = await res.json()

  if (user?.email_preferences) {
    setCheckbox('pref-product-updates', user.email_preferences.product_updates)
    setCheckbox('pref-marketing-tips', user.email_preferences.marketing_tips)
  }

  function setCheckbox(id, value) {
    const el = document.getElementById(id)
    if (el) el.checked = !!value
  }

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
      btn.textContent = originalText
      btn.style.opacity = '1'
      btn.style.pointerEvents = 'auto'

      if (msg) {
        msg.style.display = 'block'
        setTimeout(() => msg.style.display = 'none', 3000)
      }
    } else {
      btn.textContent = 'Fehler – nochmal versuchen'
      btn.style.opacity = '1'
      btn.style.pointerEvents = 'auto'
    }
  })
})()

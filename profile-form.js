(async () => {
  const ms = window.$memberstackDom
  const member = await ms.getCurrentMember()
  const memberstackId = member?.data?.id
  const email = member?.data?.auth?.email

  // Felder befüllen
  setValue('profile-salutation', member?.data?.customFields?.salutation)
  setValue('profile-firstname', member?.data?.customFields?.['first-name'])
  setValue('profile-lastname', member?.data?.customFields?.['last-name'])

  // E-Mail readonly setzen
  const emailField = document.getElementById('profile-email')
  if (emailField) {
    emailField.value = email || ''
    emailField.setAttribute('disabled', 'true')
  }

  function setValue(id, value) {
    const el = document.getElementById(id)
    if (el && value) el.value = value
  }

  // Speichern
  document.getElementById('profile-save').addEventListener('click', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('profile-save')
    const originalText = btn.textContent
    btn.textContent = 'Wird gespeichert...'
    btn.style.opacity = '0.6'
    btn.style.pointerEvents = 'none'

    const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberstackId,
        salutation: document.getElementById('profile-salutation')?.value,
        firstname: document.getElementById('profile-firstname')?.value,
        lastname: document.getElementById('profile-lastname')?.value,
      })
    })

    const data = await res.json()

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

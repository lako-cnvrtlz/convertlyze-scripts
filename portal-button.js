document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('portal-btn')
  if (!btn) return

  btn.addEventListener('click', async (e) => {
    e.preventDefault()

    const ms = window.$memberstackDom
    const member = await ms.getCurrentMember()
    const memberstackId = member?.data?.id
    const stripeCustomerId = member?.data?.stripeCustomerId

    if (!memberstackId || !stripeCustomerId) {
      console.error('Kein User oder Stripe ID')
      return
    }

    btn.textContent = 'Wird geladen...'
    btn.style.opacity = '0.6'
    btn.style.pointerEvents = 'none'

    const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/stripe-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberstackId, stripeCustomerId })
    })

    const data = await res.json()

    if (data.url) {
      window.location.href = data.url
    } else {
      btn.textContent = 'Fehler – nochmal versuchen'
      btn.style.opacity = '1'
      btn.style.pointerEvents = 'auto'
    }
  })
})

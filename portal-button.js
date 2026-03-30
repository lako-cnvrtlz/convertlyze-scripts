<script>
document.getElementById('portal-btn').addEventListener('click', async (e) => {
  e.preventDefault()

  // Sofortiges Feedback
  const btn = e.currentTarget
  btn.textContent = 'Wird geladen...'
  btn.style.opacity = '0.6'
  btn.style.pointerEvents = 'none'

  const ms = window.$memberstackDom
  const member = await ms.getCurrentMember()
  const memberstackId = member?.data?.id

  if (!memberstackId) {
    btn.textContent = 'Rechnungsdaten ändern'
    btn.style.opacity = '1'
    btn.style.pointerEvents = 'auto'
    return
  }

  const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/stripe-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberstackId })
  })

  const data = await res.json()
  if (data.url) window.location.href = data.url
})
</script>

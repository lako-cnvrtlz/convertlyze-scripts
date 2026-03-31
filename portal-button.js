<script>
document.getElementById('portal-btn').addEventListener('click', async (e) => {
  e.preventDefault()

  const ms = window.$memberstackDom
  const member = await ms.getCurrentMember()
  const token = member?.data?.tokens?.accessToken

  if (!token) return

  const btn = e.currentTarget
  btn.textContent = 'Wird geladen...'
  btn.style.opacity = '0.6'
  btn.style.pointerEvents = 'none'

  const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/stripe-portal', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  })

  const data = await res.json()
  if (data.url) window.location.href = data.url
})
</script>

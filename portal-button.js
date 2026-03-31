<script>
document.getElementById('portal-btn').addEventListener('click', async (e) => {
  e.preventDefault()
  console.log('Geklickt')

  // _ms-mid Cookie auslesen
  const token = document.cookie
    .split('; ')
    .find(row => row.startsWith('_ms-mid='))
    ?.split('=')[1]

  console.log('Cookie Token:', token)

  if (!token) {
    console.error('Kein Token gefunden')
    return
  }

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
  console.log('Response:', data)
  if (data.url) window.location.href = data.url
})
</script>

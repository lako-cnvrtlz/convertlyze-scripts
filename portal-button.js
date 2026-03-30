document.getElementById('portal-btn').addEventListener('click', async (e) => {
  e.preventDefault()
  console.log('Button geklickt')

  const ms = window.$memberstackDom
  const member = await ms.getMemberJSON()
  console.log('Member:', member)
  
  const token = member?.data?.auth?.tokens?.accessToken
  console.log('Token:', token)

  const res = await fetch('https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/stripe-portal', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  })

  console.log('Response Status:', res.status)
  const data = await res.json()
  console.log('Response Data:', data)

  if (data.url) window.location.href = data.url
})

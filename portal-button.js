import Stripe from 'https://esm.sh/stripe@13.3.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.convertlyze.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Token aus Header lesen
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    const token = authHeader.replace('Bearer ', '')

    // 2. Token bei Memberstack verifizieren
    const msRes = await fetch('https://admin.memberstack.com/members/verify-token', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('MEMBERSTACK_SECRET_KEY')!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    })

    if (!msRes.ok) return new Response('Ungültiger Token', { status: 401, headers: corsHeaders })

    const msData = await msRes.json()
    const memberstackId = msData.data.id  // ✅ verifiziert, nicht fälschbar

    // 3. User aus Supabase holen
    const { data: user, error } = await supabase
      .from('users')
      .select('id, stripe_customer_id, team_role')
      .eq('memberstack_id', memberstackId)
      .single()

    if (error || !user) return new Response('User nicht gefunden', { status: 404, headers: corsHeaders })

    // 4. Rollen-Check
    if (!['owner', 'admin'].includes(user.team_role)) {
      return new Response('Kein Zugriff', { status: 403, headers: corsHeaders })
    }

    if (!user.stripe_customer_id) {
      return new Response('Keine Stripe ID gefunden', { status: 404, headers: corsHeaders })
    }

    // 5. Stripe Portal Session erstellen
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: 'https://app.convertlyze.de/dashboard',
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    })
  }
})

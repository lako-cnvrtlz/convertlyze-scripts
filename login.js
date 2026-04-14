document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.querySelector('[data-ms-form="login"]');

  if (loginForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const email   = urlParams.get('email');
    const plan    = urlParams.get('plan');
    const billing = urlParams.get('billing') || 'monthly';

    // E-Mail aus URL-Parameter ausfüllen
    if (email) {
      const emailInput = loginForm.querySelector('input[type="email"]');
      if (emailInput) {
        emailInput.value = decodeURIComponent(email);
      }
    }

    // Plan-Parameter in localStorage schreiben damit post-login-checkout.js sie findet
    if (plan) {
      localStorage.setItem('selected_plan', plan);
      localStorage.setItem('selected_billing', billing);
      console.log('[CVZ] Login: localStorage gesetzt | plan:', plan, '| billing:', billing);
    }

    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const emailInput = loginForm.querySelector('input[type="email"]');
      const emailValue = emailInput.value;

      const oldMessage = document.querySelector('.memberstack-custom-message');
      if (oldMessage) oldMessage.remove();

      try {
        await $memberstackDOM.sendMagicLink({ email: emailValue });
        showMagicLinkSentMessage(loginForm);
      } catch (error) {
        if (error.code === 'MEMBER_NOT_FOUND' || error.message.includes('not found')) {
          showNotRegisteredMessage(emailValue, loginForm);
        } else {
          showErrorMessage(loginForm, error.message);
        }
      }
    });
  }
});

function showNotRegisteredMessage(email, formElement) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'memberstack-custom-message';
  messageDiv.style.cssText = `
    margin-top: 20px;
    padding: 20px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    text-align: center;
  `;

  messageDiv.innerHTML = `
    <p style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">
      Diese E-Mail-Adresse ist noch nicht registriert.
    </p>
    <p style="margin: 0 0 20px 0; color: #6c757d; font-size: 14px;">
      Möchten Sie ein Konto erstellen?
    </p>
    <a href="/signup?email=${encodeURIComponent(email)}" 
       style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #0066FF 0%, #00CC88 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
      Jetzt registrieren
    </a>
  `;

  formElement.parentElement.appendChild(messageDiv);
}

function showMagicLinkSentMessage(formElement) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'memberstack-custom-message';
  messageDiv.style.cssText = `
    margin-top: 20px;
    padding: 20px;
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 8px;
    text-align: center;
  `;

  messageDiv.innerHTML = `
    <p style="margin: 0; color: #155724; font-size: 16px;">
      ✓ Magic Link wurde versendet! Bitte prüfen Sie Ihr E-Mail-Postfach.
    </p>
  `;

  formElement.parentElement.appendChild(messageDiv);
}

function showErrorMessage(formElement, errorMsg) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'memberstack-custom-message';
  messageDiv.style.cssText = `
    margin-top: 20px;
    padding: 20px;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 8px;
    text-align: center;
  `;

  messageDiv.innerHTML = `
    <p style="margin: 0; color: #721c24; font-size: 16px;">
      Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
    </p>
  `;

  formElement.parentElement.appendChild(messageDiv);
}

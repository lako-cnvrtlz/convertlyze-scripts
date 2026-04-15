(function() {

  // ==================== PRICING TOGGLE ====================
  (function() {
    function initPricingToggle() {
      var switcher = document.querySelector('.switcher');
      var leftBtn = document.querySelector('.switch .left');
      var rightBtn = document.querySelector('.switch .right');
      var monthly = document.querySelector('.monthly');
      var annually = document.querySelector('.annually');

      if (!switcher || !monthly || !annually) return;

      function showMonthly() {
        monthly.style.display = 'block';
        annually.style.display = 'none';
        if (leftBtn) leftBtn.classList.add('active');
        if (rightBtn) rightBtn.classList.remove('active');
        switcher.style.transform = 'translateX(0px)';
        switcher.classList.remove('is-annual');
      }

      function showAnnually() {
        monthly.style.display = 'none';
        annually.style.display = 'block';
        if (leftBtn) leftBtn.classList.remove('active');
        if (rightBtn) rightBtn.classList.add('active');
        var switchWidth = document.querySelector('.switch').offsetWidth;
        var switcherWidth = switcher.offsetWidth;
        switcher.style.transform = 'translateX(' + (switchWidth - switcherWidth - 2) + 'px)';
        switcher.classList.add('is-annual');
      }

      switcher.style.position = 'absolute';
      switcher.style.top = '2px';
      switcher.style.left = '2px';
      switcher.style.width = 'calc(50% - 3px)';
      switcher.style.height = 'calc(100% - 4px)';
      switcher.style.transition = 'transform 0.3s ease';
      switcher.style.zIndex = '1';
      switcher.style.borderRadius = 'inherit';

      var switchContainer = document.querySelector('.switch');
      if (switchContainer) {
        switchContainer.style.position = 'relative';
        switchContainer.style.overflow = 'hidden';
      }

      if (leftBtn) {
        leftBtn.style.position = 'relative';
        leftBtn.style.zIndex = '2';
        leftBtn.style.cursor = 'pointer';
      }
      if (rightBtn) {
        rightBtn.style.position = 'relative';
        rightBtn.style.zIndex = '2';
        rightBtn.style.cursor = 'pointer';
      }

      showMonthly();
      if (leftBtn) leftBtn.addEventListener('click', showMonthly);
      if (rightBtn) rightBtn.addEventListener('click', showAnnually);
      if (switcher) switcher.addEventListener('click', function() {
        if (switcher.classList.contains('is-annual')) showMonthly();
        else showAnnually();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPricingToggle);
    } else {
      initPricingToggle();
    }
  })();

  // ==================== PLAN BUTTONS ====================
  const ENDPOINT = "https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/billing-redirect";
  let isLoading = false;

  async function handlePlanClick(btn, plan, billing) {
    if (isLoading) return;
    isLoading = true;
    const originalText = btn.textContent;
    try {
      btn.textContent = "Wird geladen...";
      const member = await window.$memberstackDom.getCurrentMember();
      const memberstackId = member?.data?.id;
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billing, memberstackId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No URL returned");
    } catch (err) {
      console.error("[CVZ] Billing error:", err);
      btn.textContent = "Fehler – erneut versuchen";
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    } finally {
      isLoading = false;
    }
  }

  function initPlanButtons() {
    document.querySelectorAll('a[href*="/register?plan="]').forEach(btn => {
      btn.addEventListener("click", function(e) {
        e.preventDefault();
        const url = new URL(btn.href);
        const plan = url.searchParams.get("plan");
        const billing = url.searchParams.get("billing") || "monthly";
        handlePlanClick(btn, plan, billing);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlanButtons);
  } else {
    initPlanButtons();
  }

})();

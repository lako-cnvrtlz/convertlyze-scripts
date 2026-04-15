(function() {
  const ENDPOINT =
    "https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/billing-redirect";

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          billing,
          memberstackId
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("No URL returned");

    } catch (err) {
      console.error("[CVZ] Billing error:", err);
      btn.textContent = "Fehler – erneut versuchen";

      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);

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

(function() {
  async function handlePlanClick(btn, plan, billing) {
    try {
      btn.textContent = "Wird geladen…";

      const res = await fetch(
        "https://zpkifipmyeunorhtepzq.supabase.co/functions/v1/billing-redirect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            plan,
            billing
          })
        }
      );

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("No URL returned");

    } catch (err) {
      console.error(err);
      btn.textContent = "Fehler – erneut versuchen";
    }
  }

  function initPlanButtons() {
    document.querySelectorAll('a[href*="/register?plan="]').forEach(btn => {
      btn.addEventListener("click", async function(e) {
        e.preventDefault();

        const url = new URL(btn.href);
        const plan = url.searchParams.get("plan");
        const billing = url.searchParams.get("billing") || "monthly";

        await handlePlanClick(btn, plan, billing);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlanButtons);
  } else {
    initPlanButtons();
  }
})();
